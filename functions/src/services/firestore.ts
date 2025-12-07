import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import {
  Account,
  Transaction,
  Session,
  CreateTransactionData,
  CreateTransferData,
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
    accountSlug?: string;
    amount?: number;
    createdById: string;
    messageIds?: number[];
    messageThreadId?: number;
    fromAccountSlug?: string;
    toAccountSlug?: string;
    receivedAmount?: number;
    exchangeRate?: number;
  }
): Promise<void> {
  const session: Session = {
    step: data.step,
    createdAt: Timestamp.now(),
    createdById: data.createdById,
    ...(data.accountSlug !== undefined && { accountSlug: data.accountSlug }),
    ...(data.amount !== undefined && { amount: data.amount }),
    ...(data.messageIds && { messageIds: data.messageIds }),
    ...(data.messageThreadId !== undefined && { messageThreadId: data.messageThreadId }),
    ...(data.fromAccountSlug !== undefined && { fromAccountSlug: data.fromAccountSlug }),
    ...(data.toAccountSlug !== undefined && { toAccountSlug: data.toAccountSlug }),
    ...(data.receivedAmount !== undefined && { receivedAmount: data.receivedAmount }),
    ...(data.exchangeRate !== undefined && { exchangeRate: data.exchangeRate }),
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

// ============ TRANSFERS ============

/**
 * Create transfer between two accounts atomically.
 * Creates two linked transactions and updates both account balances.
 * Returns [sourceTransactionId, destTransactionId].
 */
export async function createTransferAndUpdateBalances(
  data: CreateTransferData
): Promise<[string, string]> {
  const result = await db.runTransaction(async (firestoreTransaction) => {
    // 1. Get both accounts
    const [fromSnapshot, toSnapshot] = await Promise.all([
      firestoreTransaction.get(
        accountsRef.where("slug", "==", data.fromAccountSlug).limit(1)
      ),
      firestoreTransaction.get(
        accountsRef.where("slug", "==", data.toAccountSlug).limit(1)
      ),
    ]);

    if (fromSnapshot.empty) {
      throw new Error(`Source account not found: ${data.fromAccountSlug}`);
    }
    if (toSnapshot.empty) {
      throw new Error(`Destination account not found: ${data.toAccountSlug}`);
    }

    const fromDoc = fromSnapshot.docs[0];
    const toDoc = toSnapshot.docs[0];
    const fromAccount = fromDoc.data() as Account;
    const toAccount = toDoc.data() as Account;

    // 2. Calculate new balances
    const fromBalanceAfter = fromAccount.balance - Math.abs(data.fromAmount);
    const toBalanceAfter = toAccount.balance + Math.abs(data.toAmount);

    // 3. Create both transaction documents
    const fromTxnRef = transactionsRef.doc();
    const toTxnRef = transactionsRef.doc();
    const now = Timestamp.now();

    const baseTxn = {
      source: "transfer" as const,
      createdAt: now,
      createdById: data.createdById,
      createdByName: data.createdByName,
      ...(data.description && { description: data.description }),
    };

    // Source transaction (outgoing - negative)
    const fromTxn: Transaction = {
      ...baseTxn,
      accountSlug: data.fromAccountSlug,
      amount: -Math.abs(data.fromAmount),
      currency: data.fromCurrency,
      balanceAfter: fromBalanceAfter,
      linkedTransactionId: toTxnRef.id,
      transferType: "outgoing",
    };

    // Destination transaction (incoming - positive)
    const toTxn: Transaction = {
      ...baseTxn,
      accountSlug: data.toAccountSlug,
      amount: Math.abs(data.toAmount),
      currency: data.toCurrency,
      balanceAfter: toBalanceAfter,
      linkedTransactionId: fromTxnRef.id,
      transferType: "incoming",
    };

    // 4. Write all in transaction
    firestoreTransaction.set(fromTxnRef, fromTxn);
    firestoreTransaction.set(toTxnRef, toTxn);
    firestoreTransaction.update(fromDoc.ref, { balance: fromBalanceAfter });
    firestoreTransaction.update(toDoc.ref, { balance: toBalanceAfter });

    return [fromTxnRef.id, toTxnRef.id] as [string, string];
  });

  log.info("Transfer created", {
    sourceTransactionId: result[0],
    destTransactionId: result[1],
    fromAccount: data.fromAccountSlug,
    toAccount: data.toAccountSlug,
    fromAmount: data.fromAmount,
    toAmount: data.toAmount,
  });

  return result;
}

// ============ CANCELLATIONS ============

/**
 * Get a single transaction by ID
 */
export async function getTransactionById(
  id: string
): Promise<(Transaction & { id: string }) | null> {
  const doc = await transactionsRef.doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...(doc.data() as Transaction) };
}

/**
 * Get recent transactions created by a specific user
 */
export async function getUserTransactions(
  userId: string,
  limit: number = 10
): Promise<(Transaction & { id: string })[]> {
  const snapshot = await transactionsRef
    .where("createdById", "==", userId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Transaction),
  }));
}

/**
 * Create cancellation transaction and update balance atomically.
 * Marks original transaction as cancelled.
 * Returns cancellation transaction ID.
 */
export async function createCancellationAndUpdateBalance(
  originalTxnId: string,
  createdById: string,
  createdByName: string
): Promise<string> {
  const result = await db.runTransaction(async (firestoreTransaction) => {
    // 1. Get original transaction
    const originalRef = transactionsRef.doc(originalTxnId);
    const originalDoc = await firestoreTransaction.get(originalRef);

    if (!originalDoc.exists) {
      throw new Error(`Transaction not found: ${originalTxnId}`);
    }

    const original = originalDoc.data() as Transaction;

    // 2. Validate
    if (original.source === "cancellation") {
      throw new Error("Cannot cancel a cancellation transaction");
    }
    if (original.cancelledAt) {
      throw new Error("Transaction already cancelled");
    }

    // 3. Get account
    const accountSnapshot = await firestoreTransaction.get(
      accountsRef.where("slug", "==", original.accountSlug).limit(1)
    );
    if (accountSnapshot.empty) {
      throw new Error(`Account not found: ${original.accountSlug}`);
    }
    const accountDoc = accountSnapshot.docs[0];
    const account = accountDoc.data() as Account;

    // 4. Calculate reversal amount and new balance
    const reversalAmount = -original.amount;
    const newBalance = account.balance + reversalAmount;

    // 5. Create cancellation transaction
    const cancelRef = transactionsRef.doc();
    const now = Timestamp.now();

    const cancelTxn: Transaction = {
      accountSlug: original.accountSlug,
      amount: reversalAmount,
      currency: original.currency,
      source: "cancellation",
      createdAt: now,
      createdById,
      createdByName,
      balanceAfter: newBalance,
      cancelledTransactionId: originalTxnId,
    };

    // 6. Write cancellation, update original, update balance
    firestoreTransaction.set(cancelRef, cancelTxn);
    firestoreTransaction.update(originalRef, {
      cancelledAt: now,
      cancelledByTxnId: cancelRef.id,
    });
    firestoreTransaction.update(accountDoc.ref, { balance: newBalance });

    return cancelRef.id;
  });

  log.info("Transaction cancelled", {
    originalTxnId,
    cancellationTxnId: result,
    createdById,
  });

  return result;
}

/**
 * Cancel a transfer transaction (both legs) atomically.
 * Returns [sourceCancelId, destCancelId].
 */
export async function createTransferCancellation(
  originalTxnId: string,
  createdById: string,
  createdByName: string
): Promise<[string, string]> {
  const result = await db.runTransaction(async (firestoreTransaction) => {
    // 1. Get original transaction
    const originalRef = transactionsRef.doc(originalTxnId);
    const originalDoc = await firestoreTransaction.get(originalRef);

    if (!originalDoc.exists) {
      throw new Error(`Transaction not found: ${originalTxnId}`);
    }

    const original = originalDoc.data() as Transaction;

    // Must be a transfer
    if (original.source !== "transfer" || !original.linkedTransactionId) {
      throw new Error("Not a transfer transaction");
    }

    // 2. Get linked transaction
    const linkedRef = transactionsRef.doc(original.linkedTransactionId);
    const linkedDoc = await firestoreTransaction.get(linkedRef);

    if (!linkedDoc.exists) {
      throw new Error(`Linked transaction not found: ${original.linkedTransactionId}`);
    }

    const linked = linkedDoc.data() as Transaction;

    // 3. Validate neither is cancelled
    if (original.cancelledAt || linked.cancelledAt) {
      throw new Error("Transfer already cancelled");
    }

    // 4. Get both accounts
    const [fromSnapshot, toSnapshot] = await Promise.all([
      firestoreTransaction.get(
        accountsRef.where("slug", "==", original.accountSlug).limit(1)
      ),
      firestoreTransaction.get(
        accountsRef.where("slug", "==", linked.accountSlug).limit(1)
      ),
    ]);

    if (fromSnapshot.empty || toSnapshot.empty) {
      throw new Error("One or both accounts not found");
    }

    const fromDoc = fromSnapshot.docs[0];
    const toDoc = toSnapshot.docs[0];
    const fromAccount = fromDoc.data() as Account;
    const toAccount = toDoc.data() as Account;

    // 5. Calculate new balances (reverse both amounts)
    const fromNewBalance = fromAccount.balance - original.amount;
    const toNewBalance = toAccount.balance - linked.amount;

    // 6. Create both cancellation transactions
    const fromCancelRef = transactionsRef.doc();
    const toCancelRef = transactionsRef.doc();
    const now = Timestamp.now();

    const fromCancelTxn: Transaction = {
      accountSlug: original.accountSlug,
      amount: -original.amount,
      currency: original.currency,
      source: "cancellation",
      createdAt: now,
      createdById,
      createdByName,
      balanceAfter: fromNewBalance,
      cancelledTransactionId: originalTxnId,
      linkedTransactionId: toCancelRef.id,
    };

    const toCancelTxn: Transaction = {
      accountSlug: linked.accountSlug,
      amount: -linked.amount,
      currency: linked.currency,
      source: "cancellation",
      createdAt: now,
      createdById,
      createdByName,
      balanceAfter: toNewBalance,
      cancelledTransactionId: original.linkedTransactionId,
      linkedTransactionId: fromCancelRef.id,
    };

    // 7. Write everything
    firestoreTransaction.set(fromCancelRef, fromCancelTxn);
    firestoreTransaction.set(toCancelRef, toCancelTxn);
    firestoreTransaction.update(originalRef, {
      cancelledAt: now,
      cancelledByTxnId: fromCancelRef.id,
    });
    firestoreTransaction.update(linkedRef, {
      cancelledAt: now,
      cancelledByTxnId: toCancelRef.id,
    });
    firestoreTransaction.update(fromDoc.ref, { balance: fromNewBalance });
    firestoreTransaction.update(toDoc.ref, { balance: toNewBalance });

    return [fromCancelRef.id, toCancelRef.id] as [string, string];
  });

  log.info("Transfer cancelled", {
    originalTxnId,
    cancellationIds: result,
    createdById,
  });

  return result;
}
