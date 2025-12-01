#!/usr/bin/env node
/**
 * CLI script for adding new accounts to Firestore
 *
 * Usage: npm run add-account
 *
 * Requires Firebase login: firebase login
 */

import { promptAccountDetails } from "./utils/prompts";
import { createAccount } from "../services/firestore";
import { toMinorUnits } from "../utils/currency";
import { formatBalance } from "../utils/currency";
import type { Account } from "../types";

async function main() {
  try {
    console.log("=== Add New Account ===\n");

    // Step 1: Collect input interactively
    const input = await promptAccountDetails();

    // Step 2: Transform to Account model
    const account: Account = {
      name: input.name.trim(),
      slug: input.slug.toLowerCase(),
      currency: input.currency,
      balance: toMinorUnits(input.initialBalance),
    };

    // Step 3: Create in Firestore
    const accountId = await createAccount(account);

    // Step 4: Success message
    console.log("\n✅ Account created successfully!");
    console.log(`   ID: ${accountId}`);
    console.log(`   Slug: ${account.slug}`);
    console.log(
      `   Balance: ${formatBalance(account.balance, account.currency)}\n`
    );

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", (error as Error).message);
    process.exit(1);
  }
}

main();
