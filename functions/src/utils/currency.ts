/**
 * Currency utilities for handling amounts in minor units (cents)
 *
 * All amounts in Firestore are stored as integers in minor units:
 * - USD: cents (100 cents = 1 dollar)
 * - EUR: cents (100 cents = 1 euro)
 * - UAH: kopiykas (100 kopiykas = 1 hryvnia)
 */

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
