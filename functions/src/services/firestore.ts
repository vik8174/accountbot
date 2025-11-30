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

// Initialize Firebase Admin (only once)
if (!admin.apps.length) {
  admin.initializeApp();
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

// ============ TRANSACTIONS ============

/**
 * Create a new transaction
 */
export async function createTransaction(
  data: CreateTransactionData
): Promise<string> {
  const transaction: Transaction = {
    accountSlug: data.accountSlug,
    amount: data.amount,
    currency: data.currency,
    ...(data.description && { description: data.description }),
    type: data.amount >= 0 ? "add" : "subtract",
    source: data.source,
    createdAt: Timestamp.now(),
    createdById: data.createdById,
    createdByName: data.createdByName,
  };

  const docRef = await transactionsRef.add(transaction);

  log.info("Transaction created", {
    transactionId: docRef.id,
    accountSlug: data.accountSlug,
    amount: data.amount,
    createdById: data.createdById,
  });

  return docRef.id;
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
 * Get active session for a chat
 */
export async function getSession(chatId: string): Promise<Session | null> {
  const doc = await sessionsRef.doc(chatId).get();

  if (!doc.exists) {
    return null;
  }

  return doc.data() as Session;
}

/**
 * Create or update a session
 */
export async function setSession(
  chatId: string,
  data: {
    step: SessionStep;
    accountSlug: string;
    amount?: number;
    createdById: string;
    messageIds?: number[];
  }
): Promise<void> {
  const session: Session = {
    step: data.step,
    accountSlug: data.accountSlug,
    createdAt: Timestamp.now(),
    createdById: data.createdById,
    ...(data.amount !== undefined && { amount: data.amount }),
    ...(data.messageIds && { messageIds: data.messageIds }),
  };

  await sessionsRef.doc(chatId).set(session);
}

/**
 * Add message ID to session for later cleanup
 */
export async function addMessageIdToSession(
  chatId: string,
  messageId: number
): Promise<void> {
  await sessionsRef.doc(chatId).update({
    messageIds: admin.firestore.FieldValue.arrayUnion(messageId),
  });
}

/**
 * Delete a session
 */
export async function deleteSession(chatId: string): Promise<void> {
  await sessionsRef.doc(chatId).delete();
}
