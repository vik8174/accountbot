#!/usr/bin/env node
/**
 * CLI script for renaming account display name
 *
 * Usage: npm run rename-account
 */

import prompts from "prompts";
import { getAccounts, updateAccountName } from "../services/firestore";
import { validateName } from "./utils/validation";

async function main() {
  try {
    console.log("=== Rename Account ===\n");

    // Step 1: Load accounts
    const accounts = await getAccounts();

    if (accounts.length === 0) {
      console.log("No accounts found.");
      process.exit(0);
    }

    // Sort by name
    accounts.sort((a, b) => a.name.localeCompare(b.name));

    // Step 2: Select account
    const accountResponse = await prompts(
      {
        type: "select",
        name: "account",
        message: "Select account to rename:",
        choices: accounts.map((acc) => ({
          title: `${acc.name} (${acc.slug})`,
          value: acc,
        })),
      },
      {
        onCancel: () => {
          console.log("\nOperation cancelled.");
          process.exit(0);
        },
      }
    );

    const selectedAccount = accountResponse.account;

    // Step 3: Enter new name
    const nameResponse = await prompts(
      {
        type: "text",
        name: "newName",
        message: `Enter new name for "${selectedAccount.name}":`,
        validate: (value: string) => {
          const result = validateName(value);
          if (!result.valid) {
            return result.error || "Invalid name";
          }
          if (value.trim() === selectedAccount.name) {
            return "New name must be different from current name";
          }
          return true;
        },
      },
      {
        onCancel: () => {
          console.log("\nOperation cancelled.");
          process.exit(0);
        },
      }
    );

    const newName = nameResponse.newName.trim();

    // Step 4: Confirm
    const confirmResponse = await prompts(
      {
        type: "confirm",
        name: "confirm",
        message: `Rename "${selectedAccount.name}" → "${newName}"?`,
        initial: true,
      },
      {
        onCancel: () => {
          console.log("\nOperation cancelled.");
          process.exit(0);
        },
      }
    );

    if (!confirmResponse.confirm) {
      console.log("\nOperation cancelled.");
      process.exit(0);
    }

    // Step 5: Update in Firestore
    await updateAccountName(selectedAccount.slug, newName);

    // Step 6: Success message
    console.log("\n✅ Account renamed successfully!");
    console.log(`   ${selectedAccount.slug}: ${selectedAccount.name} → ${newName}\n`);

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", (error as Error).message);
    process.exit(1);
  }
}

main();
