import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import {
  Account,
  Transaction,
  Session,
  CreateTransactionData,
  SessionStep,
} from "../types";
import { log } from "./logger";
import * as path from "path";
import * as fs from "fs";

// Initialize Firebase Admin (only once)
if (!admin.apps.length) {
  // For local CLI scripts, try to use serviceAccountKey.json if available
  const serviceAccountPath = path.join(__dirname, "../../serviceAccountKey.json");

  if (fs.existsSync(serviceAccountPath)) {
    // Local development with service account key
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountPath),
    });
  } else {
    // Cloud Functions or Application Default Credentials
    admin.initializeApp();
  }
}

const db = admin.firestore();

// Collection references
const accountsRef = db.collection("accounts");
const transactionsRef = db.collection("transactions");
const sessionsRef = db.collection("sessions");

// ============ ACCOUNTS ============

/**
 * Get all accounts
 */
export async function getAccounts(): Promise<Account[]> {
  const snapshot = await accountsRef.get();
  return snapshot.docs.map((doc) => doc.data() as Account);
}

/**
 * Get account by slug
 */
export async function getAccountBySlug(slug: string): Promise<Account | null> {
  const snapshot = await accountsRef.where("slug", "==", slug).limit(1).get();

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0].data() as Account;
}

/**
 * Update account balance by delta
 */
export async function updateAccountBalance(
  slug: string,
  delta: number
): Promise<void> {
  const snapshot = await accountsRef.where("slug", "==", slug).limit(1).get();

  if (snapshot.empty) {
    throw new Error(`Account not found: ${slug}`);
  }

  const docRef = snapshot.docs[0].ref;
  await docRef.update({
    balance: admin.firestore.FieldValue.increment(delta),
  });

  log.info("Account balance updated", { accountSlug: slug, delta });
}

/**
 * Create new account
 * @throws Error if account with slug already exists
 */
export async function createAccount(account: Account): Promise<string> {
  // 1. Verify slug uniqueness (defensive check)
  const existing = await getAccountBySlug(account.slug);
  if (existing) {
    throw new Error(`Account with slug '${account.slug}' already exists`);
  }

  // 2. Create account document (auto-generated ID)
  const docRef = accountsRef.doc();
  await docRef.set({
    name: account.name,
    slug: account.slug,
    currency: account.currency,
    balance: account.balance,
  });

  log.info("Account created", { slug: account.slug, id: docRef.id });

  return docRef.id;
}

// ============ TRANSACTIONS ============

/**
 * Create transaction and update balance atomically.
 * Ensures data consistency by using Firestore transaction.
 * Returns transaction ID.
 */
export async function createTransactionAndUpdateBalance(
  data: CreateTransactionData
): Promise<string> {
  const result = await db.runTransaction(async (firestoreTransaction) => {
    // 1. Get current account
    const accountSnapshot = await firestoreTransaction.get(
      accountsRef.where("slug", "==", data.accountSlug).limit(1)
    );

    if (accountSnapshot.empty) {
      throw new Error(`Account not found: ${data.accountSlug}`);
    }

    const accountDoc = accountSnapshot.docs[0];
    const account = accountDoc.data() as Account;

    // 2. Calculate new balance
    const balanceAfter = account.balance + data.amount;

    // 3. Create transaction document with balanceAfter
    const txnData: Transaction = {
      accountSlug: data.accountSlug,
      amount: data.amount,
      currency: data.currency,
      ...(data.description && { description: data.description }),
      type: data.amount >= 0 ? "add" : "subtract",
      source: data.source,
      createdAt: Timestamp.now(),
      createdById: data.createdById,
      createdByName: data.createdByName,
      balanceAfter,
    };

    const newTxnRef = transactionsRef.doc();
    firestoreTransaction.set(newTxnRef, txnData);

    // 4. Update account balance
    firestoreTransaction.update(accountDoc.ref, { balance: balanceAfter });

    return newTxnRef.id;
  });

  log.info("Transaction created with balance update", {
    transactionId: result,
    accountSlug: data.accountSlug,
    amount: data.amount,
    createdById: data.createdById,
  });

  return result;
}

/**
 * Get transactions (with optional account filter)
 */
export async function getTransactions(
  limit: number = 5,
  accountSlug?: string
): Promise<(Transaction & { id: string })[]> {
  let query: admin.firestore.Query = transactionsRef
    .orderBy("createdAt", "desc")
    .limit(limit);

  if (accountSlug) {
    query = query.where("accountSlug", "==", accountSlug);
  }

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Transaction),
  }));
}

// ============ SESSIONS ============

/**
 * Generate session key for a user in a chat
 * Uses chatId:userId to support multiple users in group chats
 */
export function getSessionKey(chatId: string, userId: string): string {
  return `${chatId}:${userId}`;
}

/**
 * Get active session for a user in a chat
 */
export async function getSession(sessionKey: string): Promise<Session | null> {
  const doc = await sessionsRef.doc(sessionKey).get();

  if (!doc.exists) {
    return null;
  }

  return doc.data() as Session;
}

/**
 * Create or update a session
 */
export async function setSession(
  sessionKey: string,
  data: {
    step: SessionStep;
    accountSlug: string;
    amount?: number;
    createdById: string;
    messageIds?: number[];
    messageThreadId?: number;
  }
): Promise<void> {
  const session: Session = {
    step: data.step,
    accountSlug: data.accountSlug,
    createdAt: Timestamp.now(),
    createdById: data.createdById,
    ...(data.amount !== undefined && { amount: data.amount }),
    ...(data.messageIds && { messageIds: data.messageIds }),
    ...(data.messageThreadId !== undefined && { messageThreadId: data.messageThreadId }),
  };

  await sessionsRef.doc(sessionKey).set(session);
}

/**
 * Add message ID to session for later cleanup
 */
export async function addMessageIdToSession(
  sessionKey: string,
  messageId: number
): Promise<void> {
  await sessionsRef.doc(sessionKey).update({
    messageIds: admin.firestore.FieldValue.arrayUnion(messageId),
  });
}

/**
 * Delete a session
 */
export async function deleteSession(sessionKey: string): Promise<void> {
  await sessionsRef.doc(sessionKey).delete();
}

// ============ DATA INTEGRITY ============

/**
 * Verify account data integrity by checking:
 * 1. Each transaction's balanceAfter matches running total
 * 2. Final balance matches account balance
 *
 * Returns true if all checks pass, false otherwise.
 */
export async function verifyAccountIntegrity(slug: string): Promise<boolean> {
  const account = await getAccountBySlug(slug);
  if (!account) {
    log.error("Account not found for integrity check", undefined, { slug });
    return false;
  }

  const snapshot = await transactionsRef
    .where("accountSlug", "==", slug)
    .orderBy("createdAt", "asc")
    .get();

  let calculatedBalance = 0;

  for (const doc of snapshot.docs) {
    const txn = doc.data() as Transaction;
    calculatedBalance += txn.amount;

    if (txn.balanceAfter !== calculatedBalance) {
      log.error("Integrity mismatch: balanceAfter does not match", undefined, {
        transactionId: doc.id,
        expected: calculatedBalance,
        actual: txn.balanceAfter,
      });
      return false;
    }
  }

  // Verify final balance matches account balance
  if (calculatedBalance !== account.balance) {
    log.error("Integrity mismatch: account balance does not match sum", undefined, {
      slug,
      accountBalance: account.balance,
      calculatedBalance,
    });
    return false;
  }

  log.info("Account integrity verified", {
    slug,
    transactionCount: snapshot.docs.length,
  });

  return true;
}
