import { getAccountBySlug } from "../../services/firestore";
import { toMinorUnits } from "../../utils/currency";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface AmountValidationResult {
  valid: boolean;
  value?: number;
  error?: string;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_SLUG_LENGTH = 2;
const MAX_SLUG_LENGTH = 50;
const MAX_NAME_LENGTH = 50;
const MAX_AMOUNT = 1_000_000_000; // 1 billion in major units

/**
 * Validate slug format
 * Rules:
 * - Lowercase only
 * - Alphanumeric + hyphens
 * - No leading/trailing hyphens
 * - Min 2 chars, max 50 chars
 */
export function validateSlugFormat(slug: string): ValidationResult {
  if (!slug || slug.trim().length === 0) {
    return { valid: false, error: "Slug cannot be empty" };
  }

  const trimmed = slug.trim();

  if (trimmed.length < MIN_SLUG_LENGTH) {
    return {
      valid: false,
      error: `Slug must be at least ${MIN_SLUG_LENGTH} characters`,
    };
  }

  if (trimmed.length > MAX_SLUG_LENGTH) {
    return {
      valid: false,
      error: `Slug must be at most ${MAX_SLUG_LENGTH} characters`,
    };
  }

  if (!SLUG_PATTERN.test(trimmed)) {
    return {
      valid: false,
      error: "Slug must be lowercase letters, numbers, and hyphens only (no leading/trailing hyphens)",
    };
  }

  return { valid: true };
}

/**
 * Check slug uniqueness in Firestore
 */
export async function validateSlugUniqueness(
  slug: string
): Promise<ValidationResult> {
  const existing = await getAccountBySlug(slug);

  if (existing) {
    return {
      valid: false,
      error: `Account with slug '${slug}' already exists`,
    };
  }

  return { valid: true };
}

/**
 * Validate currency code
 */
export function validateCurrency(currency: string): ValidationResult {
  const validCurrencies = ["EUR", "USD", "UAH"];
  const normalized = currency.toUpperCase().trim();

  if (!validCurrencies.includes(normalized)) {
    return {
      valid: false,
      error: `Currency must be one of: ${validCurrencies.join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * Validate and parse amount
 * Returns amount in minor units (cents/kopiykas)
 */
export function validateAmount(amount: string): AmountValidationResult {
  if (!amount || amount.trim().length === 0) {
    return { valid: false, error: "Amount cannot be empty" };
  }

  const trimmed = amount.trim();
  const parsed = parseFloat(trimmed);

  if (isNaN(parsed)) {
    return { valid: false, error: "Amount must be a valid number" };
  }

  // Check for too many decimal places
  const decimalParts = trimmed.split(".");
  if (decimalParts.length > 1 && decimalParts[1].length > 2) {
    return { valid: false, error: "Amount can have at most 2 decimal places" };
  }

  // Check range
  if (Math.abs(parsed) > MAX_AMOUNT) {
    return {
      valid: false,
      error: `Amount must be between -${MAX_AMOUNT.toLocaleString()} and ${MAX_AMOUNT.toLocaleString()}`,
    };
  }

  // Convert to minor units
  const minorUnits = toMinorUnits(parsed);

  return { valid: true, value: minorUnits };
}

/**
 * Validate account name
 */
export function validateName(name: string): ValidationResult {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: "Name cannot be empty" };
  }

  const trimmed = name.trim();

  if (trimmed.length > MAX_NAME_LENGTH) {
    return {
      valid: false,
      error: `Name must be at most ${MAX_NAME_LENGTH} characters`,
    };
  }

  return { valid: true };
}

/**
 * Generate slug suggestion from account name
 */
export function generateSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}
