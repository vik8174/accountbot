import { Timestamp } from "firebase-admin/firestore";

/**
 * ISO 4217 currency codes
 */
export type CurrencyCode = "EUR" | "USD" | "UAH";

/**
 * Transaction type
 */
export type TransactionType = "add" | "subtract";

/**
 * Session step for interactive /add flow
 */
export type SessionStep = "amount" | "description";

/**
 * Account document in Firestore
 */
export interface Account {
  name: string;
  slug: string;
  currency: CurrencyCode;
  balance: number;
  ownerId: string;
}

/**
 * Transaction document in Firestore
 */
export interface Transaction {
  account: string;
  amount: number;
  currency: CurrencyCode;
  description: string;
  type: TransactionType;
  timestamp: Timestamp;
  reverted: boolean;
  userId: string;
}

/**
 * Session document for interactive /add flow
 */
export interface Session {
  step: SessionStep;
  account: string;
  amount?: number;
  timestamp: Timestamp;
  userId: string;
}

/**
 * Data for creating a new transaction
 */
export interface CreateTransactionData {
  account: string;
  amount: number;
  currency: CurrencyCode;
  description: string;
  userId: string;
}
