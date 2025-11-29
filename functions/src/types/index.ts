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
 * Transaction source
 */
export type TransactionSource = "manual" | "sync";

/**
 * Session step for interactive flows
 */
export type SessionStep = "amount" | "description" | "sync_amount";

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
  /** Optional for sync transactions */
  description?: string;
  type: TransactionType;
  /** Source of transaction: manual (/add) or sync (/sync) */
  source: TransactionSource;
  createdAt: Timestamp;
  reverted: boolean;
  /** Telegram user ID who created this transaction */
  createdBy: string;
  /** Display name of user who created this transaction */
  createdByName: string;
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
  createdAt: Timestamp;
  /** Telegram user ID who started this session */
  createdBy: string;
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
  /** Optional for sync transactions */
  description?: string;
  /** Source of transaction: manual (/add) or sync (/sync) */
  source: TransactionSource;
  /** Telegram user ID who created this transaction */
  createdBy: string;
  /** Display name of user who created this transaction */
  createdByName: string;
}
