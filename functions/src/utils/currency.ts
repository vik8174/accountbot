/**
 * Currency utilities for handling amounts in minor units (cents)
 *
 * All amounts in Firestore are stored as integers in minor units:
 * - USD: cents (100 cents = 1 dollar)
 * - EUR: cents (100 cents = 1 euro)
 * - UAH: kopiykas (100 kopiykas = 1 hryvnia)
 */

const DEFAULT_MAX_AMOUNT = 1000000;

export type ParseAmountResult =
  | { success: true; value: number }
  | { success: false; error: "invalid" | "zero" | "negative" | "max_decimals" | "max_amount" };

export interface ParseAmountOptions {
  allowNegative?: boolean; // default: true
  allowZero?: boolean; // default: false
  maxAmount?: number; // default: 1000000
}

/**
 * Parse user input string to amount in major units
 * Supports formats: 2.25, 2,25, 2, 2., 2.5, -5
 * @param text User input string
 * @param options Parsing options
 * @returns ParseAmountResult with value in major units or error
 */
export function parseAmount(
  text: string,
  options: ParseAmountOptions = {}
): ParseAmountResult {
  const { allowNegative = true, allowZero = false, maxAmount = DEFAULT_MAX_AMOUNT } = options;

  // Normalize: replace comma with dot
  const normalized = text.trim().replace(",", ".");

  // Parse as float
  const value = parseFloat(normalized);

  // Check if valid number
  if (isNaN(value)) {
    return { success: false, error: "invalid" };
  }

  // Check zero
  if (value === 0 && !allowZero) {
    return { success: false, error: "zero" };
  }

  // Check negative
  if (value < 0 && !allowNegative) {
    return { success: false, error: "negative" };
  }

  // Check decimal places (max 2)
  const decimalPart = normalized.split(".")[1];
  if (decimalPart && decimalPart.length > 2) {
    return { success: false, error: "max_decimals" };
  }

  // Check max amount
  if (Math.abs(value) > maxAmount) {
    return { success: false, error: "max_amount" };
  }

  return { success: true, value };
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  UAH: "₴",
};

/**
 * Format number with thousand separators (Anglo-American format)
 * @param value Absolute value to format
 * @returns Formatted string like "1,234.56"
 */
function formatNumber(value: number): string {
  const [intPart, decPart] = Math.abs(value).toFixed(2).split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${withThousands}.${decPart}`;
}

/**
 * Convert major units (dollars) to minor units (cents)
 * @param amount Amount in major units (e.g., 2.50 dollars)
 * @returns Amount in minor units (e.g., 250 cents)
 */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Convert minor units (cents) to major units (dollars)
 * @param amount Amount in minor units (e.g., 250 cents)
 * @returns Amount in major units (e.g., 2.50 dollars)
 */
export function toMajorUnits(amount: number): number {
  return amount / 100;
}

/**
 * Format amount from minor units for display
 * @param amountInMinorUnits Amount in cents/kopiykas
 * @param currency Currency code
 * @param showSign Whether to show +/- sign
 * @returns Formatted string like "+25.50 $" or "-1,234.56 €"
 */
export function formatAmount(
  amountInMinorUnits: number,
  currency: string,
  showSign = true
): string {
  const majorUnits = toMajorUnits(amountInMinorUnits);
  const formatted = formatNumber(majorUnits);
  const symbol = CURRENCY_SYMBOLS[currency] || currency;

  if (showSign) {
    const sign = amountInMinorUnits >= 0 ? "+" : "-";
    return `${sign}${formatted} ${symbol}`;
  }
  const sign = majorUnits < 0 ? "-" : "";
  return `${sign}${formatted} ${symbol}`;
}

/**
 * Format balance from minor units for display (always shows sign)
 * @param balanceInMinorUnits Balance in cents/kopiykas
 * @param currency Currency code
 * @returns Formatted string like "+1,234.56 ₴" or "-100.00 $"
 */
export function formatBalance(
  balanceInMinorUnits: number,
  currency: string
): string {
  const majorUnits = toMajorUnits(balanceInMinorUnits);
  const formatted = formatNumber(majorUnits);
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  const sign = balanceInMinorUnits >= 0 ? "+" : "-";
  return `${sign}${formatted} ${symbol}`;
}
