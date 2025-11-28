import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import {
  Account,
  Transaction,
  Session,
  CreateTransactionData,
  SessionStep,
} from "../types";

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
 * Get all accounts (optionally filtered by owner)
 */
export async function getAccounts(telegramUserId?: string): Promise<Account[]> {
  let query: admin.firestore.Query = accountsRef;

  if (telegramUserId) {
    query = query.where("telegramUserId", "==", telegramUserId);
  }

  const snapshot = await query.get();
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
}

// ============ TRANSACTIONS ============

/**
 * Create a new transaction
 */
export async function createTransaction(
  data: CreateTransactionData
): Promise<string> {
  const transaction: Transaction = {
    account: data.account,
    amount: data.amount,
    currency: data.currency,
    description: data.description,
    type: data.amount >= 0 ? "add" : "subtract",
    timestamp: Timestamp.now(),
    reverted: false,
    telegramUserId: data.telegramUserId,
  };

  const docRef = await transactionsRef.add(transaction);
  return docRef.id;
}

/**
 * Get transactions (with optional filters)
 */
export async function getTransactions(
  limit: number = 5,
  accountSlug?: string,
  telegramUserId?: string
): Promise<(Transaction & { id: string })[]> {
  let query: admin.firestore.Query = transactionsRef
    .where("reverted", "==", false)
    .orderBy("timestamp", "desc")
    .limit(limit);

  if (accountSlug) {
    query = query.where("account", "==", accountSlug);
  }

  if (telegramUserId) {
    query = query.where("telegramUserId", "==", telegramUserId);
  }

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Transaction),
  }));
}

/**
 * Get the last non-reverted transaction for a user
 */
export async function getLastTransaction(
  telegramUserId: string
): Promise<(Transaction & { id: string }) | null> {
  const snapshot = await transactionsRef
    .where("telegramUserId", "==", telegramUserId)
    .where("reverted", "==", false)
    .orderBy("timestamp", "desc")
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    ...(doc.data() as Transaction),
  };
}

/**
 * Mark a transaction as reverted
 */
export async function markTransactionReverted(txId: string): Promise<void> {
  await transactionsRef.doc(txId).update({
    reverted: true,
  });
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
    account: string;
    amount?: number;
    telegramUserId: string;
  }
): Promise<void> {
  const session: Session = {
    step: data.step,
    account: data.account,
    amount: data.amount,
    timestamp: Timestamp.now(),
    telegramUserId: data.telegramUserId,
  };

  await sessionsRef.doc(chatId).set(session);
}

/**
 * Delete a session
 */
export async function deleteSession(chatId: string): Promise<void> {
  await sessionsRef.doc(chatId).delete();
}
