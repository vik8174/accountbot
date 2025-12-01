import prompts from "prompts";
import type { CurrencyCode } from "../../types";
import {
  validateName,
  validateSlugFormat,
  validateSlugUniqueness,
  validateAmount,
  generateSlugFromName,
} from "./validation";

export interface AccountInput {
  name: string;
  slug: string;
  currency: CurrencyCode;
  initialBalance: number; // in major units
}

/**
 * Interactive prompts for account creation
 */
export async function promptAccountDetails(): Promise<AccountInput> {
  const response = await prompts(
    [
      {
        type: "text",
        name: "name",
        message: "Enter account name (e.g., 'Cash', 'Visa Card'):",
        validate: (value: string) => {
          const result = validateName(value);
          return result.valid ? true : result.error || "Invalid name";
        },
      },
      {
        type: "text",
        name: "slug",
        message: "Enter unique slug (lowercase, hyphens allowed):",
        initial: (prev: string) => generateSlugFromName(prev),
        validate: async (value: string) => {
          // First check format
          const formatResult = validateSlugFormat(value);
          if (!formatResult.valid) {
            return formatResult.error || "Invalid slug format";
          }

          // Then check uniqueness
          const uniqueResult = await validateSlugUniqueness(value);
          if (!uniqueResult.valid) {
            return uniqueResult.error || "Slug already exists";
          }

          return true;
        },
      },
      {
        type: "select",
        name: "currency",
        message: "Select currency:",
        choices: [
          { title: "USD ($)", value: "USD" },
          { title: "EUR (€)", value: "EUR" },
          { title: "UAH (₴)", value: "UAH" },
        ],
        initial: 0, // USD as default
      },
      {
        type: "text",
        name: "initialBalance",
        message: "Enter initial balance (e.g., 100.50, or 0 for new account):",
        initial: "0",
        validate: (value: string) => {
          const result = validateAmount(value);
          return result.valid ? true : result.error || "Invalid amount";
        },
      },
      {
        type: "confirm",
        name: "confirm",
        message: (prev, values) => {
          const balance = parseFloat(values.initialBalance);
          const sign = balance >= 0 ? "+" : "";
          return `Create account '${values.name}' (${values.slug}) with ${sign}${balance} ${values.currency}?`;
        },
        initial: true,
      },
    ],
    {
      onCancel: () => {
        console.log("\nOperation cancelled.");
        process.exit(0);
      },
    }
  );

  // If user declined confirmation, exit
  if (!response.confirm) {
    console.log("\nOperation cancelled.");
    process.exit(0);
  }

  return {
    name: response.name,
    slug: response.slug,
    currency: response.currency as CurrencyCode,
    initialBalance: parseFloat(response.initialBalance),
  };
}
