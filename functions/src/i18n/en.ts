/**
 * English translations (ISO 639-1: en)
 */
export const en = {
  start: {
    welcome: "Hello, {name}! Welcome to AccountBot.",
    tagline: "Simple. Fast. Accurate.",
  },
  help: {
    title: "AccountBot Help",
    add: "/add — Add a transaction",
    balance: "/balance — View balances",
    history: "/history — Transaction history",
    sync: "/sync — Sync balance",
  },
  add: {
    selectAccount: "Select an account:",
    noAccounts: "No accounts available.",
    enterAmount: "Enter the amount (positive or negative):",
    enterDescription: "Enter transaction description:",
    invalidNumber: "Please enter a valid number (not zero):",
    maxDecimals: "Maximum 2 decimal places (e.g., 25.50):",
    maxAmount: "Amount cannot exceed {max}:",
    success: "Transaction added",
    accountNotFound: "Account not found. Transaction cancelled.",
    selected: "Selected: <b>{name}</b>",
  },
  sync: {
    selectAccount: "Select account to sync:",
    currentBalance: "Current balance: {balance}",
    enterActual: "Enter the actual balance:",
    negativeNotAllowed: "Balance cannot be negative:",
    noChange: "Balance is already correct. No changes made.",
    success: "Balance synced",
    balanceSync: "Balance sync",
    maxBalance: "Balance cannot exceed {max}:",
    cancelled: "Account not found. Sync cancelled.",
  },
  balance: {
    title: "Account Balances",
    noAccounts: "No accounts found.",
  },
  history: {
    title: "Recent Transactions",
    noTransactions: "No transactions found.",
    balanceSync: "Balance sync",
  },
  common: {
    account: "Account",
    amount: "Amount",
    description: "Description",
    newBalance: "New balance",
    previous: "Previous",
    adjustment: "Adjustment",
    error: "Error. Please try again.",
    failed: "Failed to load. Please try again.",
    userError: "Error: Could not identify chat or user.",
    accountNotFound: "Account not found.",
  },
  keyboard: {
    add: "💸 Transaction",
    balance: "💰 Balance",
    history: "📋 History",
    sync: "🔄 Sync",
  },
};
