/**
 * Currency utilities for handling amounts in minor units (cents)
 *
 * All amounts in Firestore are stored as integers in minor units:
 * - USD: cents (100 cents = 1 dollar)
 * - EUR: cents (100 cents = 1 euro)
 * - UAH: kopiykas (100 kopiykas = 1 hryvnia)
 */

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
 * @returns Formatted string like "+2.50 USD" or "-100.00 EUR"
 */
export function formatAmount(
  amountInMinorUnits: number,
  currency: string,
  showSign = true
): string {
  const majorUnits = toMajorUnits(amountInMinorUnits);
  const formatted = majorUnits.toFixed(2);

  if (showSign && amountInMinorUnits >= 0) {
    return `+${formatted} ${currency}`;
  }
  return `${formatted} ${currency}`;
}

/**
 * Format balance from minor units for display (always shows sign)
 * @param balanceInMinorUnits Balance in cents/kopiykas
 * @param currency Currency code
 * @returns Formatted string like "+2.50" or "-100.00"
 */
export function formatBalance(
  balanceInMinorUnits: number,
  currency: string
): string {
  const majorUnits = toMajorUnits(balanceInMinorUnits);
  const formatted = majorUnits.toFixed(2);
  const sign = balanceInMinorUnits >= 0 ? "+" : "";
  return `${sign}${formatted} ${currency}`;
}
