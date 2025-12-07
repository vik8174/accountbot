import { Timestamp } from "firebase-admin/firestore";

/**
 * ISO 4217 currency codes
 */
export type CurrencyCode = "EUR" | "USD" | "UAH";

/**
 * Transaction source
 */
export type TransactionSource = "manual" | "sync" | "transfer" | "cancellation";

/**
 * Session step for interactive flows
 */
export type SessionStep =
  | "amount"
  | "description"
  | "sync_amount"
  | "transfer_to"
  | "transfer_amount"
  | "transfer_received"
  | "transfer_description";

/**
 * Account document in Firestore
 * Note: balance is stored in minor units (cents/kopiykas)
 */
export interface Account {
  /** Display name shown to users */
  name: string;
  /** Unique identifier used in code and URLs */
  slug: string;
  /** ISO 4217 currency code */
  currency: CurrencyCode;
  /** Balance in minor units (cents for USD/EUR, kopiykas for UAH) */
  balance: number;
}

/**
 * Transaction document in Firestore
 * Note: amount is stored in minor units (cents/kopiykas)
 */
export interface Transaction {
  /** Account slug this transaction belongs to */
  accountSlug: string;
  /** Amount in minor units (cents for USD/EUR, kopiykas for UAH). Positive = income, negative = expense */
  amount: number;
  /** ISO 4217 currency code */
  currency: CurrencyCode;
  /** Transaction description (optional for sync transactions) */
  description?: string;
  /** Source of transaction: manual, sync, transfer, or cancellation */
  source: TransactionSource;
  /** When the transaction was created */
  createdAt: Timestamp;
  /** Telegram user ID who created this transaction */
  createdById: string;
  /** Display name of user who created this transaction */
  createdByName: string;
  /** Account balance after this transaction (in minor units) */
  balanceAfter: number;
  /** For transfers: links to the other leg of the transfer */
  linkedTransactionId?: string;
  /** For transfers: indicates if this is the outgoing or incoming leg */
  transferType?: "outgoing" | "incoming";
  /** For cancellations: ID of the original transaction being cancelled */
  cancelledTransactionId?: string;
  /** For cancelled transactions: when it was cancelled */
  cancelledAt?: Timestamp;
  /** For cancelled transactions: ID of the cancellation transaction */
  cancelledByTxnId?: string;
}

/**
 * Session document for interactive flows
 * Note: amounts are stored in minor units (cents/kopiykas)
 */
export interface Session {
  /** Current step in the interactive flow */
  step: SessionStep;
  /** Account slug for /add and /sync flows */
  accountSlug?: string;
  /** Amount in minor units (cents for USD/EUR, kopiykas for UAH) */
  amount?: number;
  /** When the session was created */
  createdAt: Timestamp;
  /** Telegram user ID who started this session */
  createdById: string;
  /** Message IDs to delete after completing the flow */
  messageIds?: number[];
  /** Message thread ID for forum/topic support */
  messageThreadId?: number;
  /** For transfers: source account slug */
  fromAccountSlug?: string;
  /** For transfers: destination account slug */
  toAccountSlug?: string;
  /** For cross-currency transfers: amount to receive (in minor units) */
  receivedAmount?: number;
  /** For cross-currency transfers: exchange rate used */
  exchangeRate?: number;
}

/**
 * Data for creating a new transaction
 * Note: amount should be in minor units (cents/kopiykas)
 */
export interface CreateTransactionData {
  /** Account slug to add transaction to */
  accountSlug: string;
  /** Amount in minor units (cents for USD/EUR, kopiykas for UAH) */
  amount: number;
  /** ISO 4217 currency code */
  currency: CurrencyCode;
  /** Optional for sync transactions */
  description?: string;
  /** Source of transaction: manual, sync, transfer, or cancellation */
  source: TransactionSource;
  /** Telegram user ID who created this transaction */
  createdById: string;
  /** Display name of user who created this transaction */
  createdByName: string;
}

/**
 * Data for creating a transfer between accounts
 * Note: amounts should be in minor units (cents/kopiykas)
 */
export interface CreateTransferData {
  /** Source account slug */
  fromAccountSlug: string;
  /** Destination account slug */
  toAccountSlug: string;
  /** Amount to debit from source (in minor units, positive value) */
  fromAmount: number;
  /** Amount to credit to destination (in minor units, positive value) */
  toAmount: number;
  /** ISO 4217 currency code of source account */
  fromCurrency: CurrencyCode;
  /** ISO 4217 currency code of destination account */
  toCurrency: CurrencyCode;
  /** Optional transfer description */
  description?: string;
  /** Telegram user ID who created this transfer */
  createdById: string;
  /** Display name of user who created this transfer */
  createdByName: string;
}
