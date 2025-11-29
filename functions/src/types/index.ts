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
 * Note: balance is stored in minor units (cents/kopiykas)
 */
export interface Account {
  name: string;
  slug: string;
  currency: CurrencyCode;
  /** Balance in minor units (cents for USD/EUR, kopiykas for UAH) */
  balance: number;
  telegramUserId: string;
}

/**
 * Transaction document in Firestore
 * Note: amount is stored in minor units (cents/kopiykas)
 */
export interface Transaction {
  accountSlug: string;
  /** Amount in minor units (cents for USD/EUR, kopiykas for UAH) */
  amount: number;
  currency: CurrencyCode;
  description: string;
  type: TransactionType;
  timestamp: Timestamp;
  reverted: boolean;
  telegramUserId: string;
}

/**
 * Session document for interactive /add flow
 * Note: amount is stored in minor units (cents/kopiykas)
 */
export interface Session {
  step: SessionStep;
  accountSlug: string;
  /** Amount in minor units (cents for USD/EUR, kopiykas for UAH) */
  amount?: number;
  timestamp: Timestamp;
  telegramUserId: string;
}

/**
 * Data for creating a new transaction
 * Note: amount should be in minor units (cents/kopiykas)
 */
export interface CreateTransactionData {
  accountSlug: string;
  /** Amount in minor units (cents for USD/EUR, kopiykas for UAH) */
  amount: number;
  currency: CurrencyCode;
  description: string;
  telegramUserId: string;
}
