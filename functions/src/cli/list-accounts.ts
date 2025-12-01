#!/usr/bin/env node
/**
 * List all accounts in Firestore
 *
 * Usage: npm run list-accounts
 */

import { getAccounts } from "../services/firestore";
import { formatBalance } from "../utils/currency";

async function main() {
  try {
    const accounts = await getAccounts();

    if (accounts.length === 0) {
      console.log("\nNo accounts found.\n");
      return;
    }

    console.log("\n=== Accounts ===\n");

    // Sort alphabetically by name (matches bot behavior)
    accounts.sort((a, b) => a.name.localeCompare(b.name));

    accounts.forEach((acc) => {
      console.log(`📊 ${acc.name}`);
      console.log(`   Slug: ${acc.slug}`);
      console.log(`   Balance: ${formatBalance(acc.balance, acc.currency)}`);
      console.log("");
    });

    console.log(`Total: ${accounts.length} account(s)\n`);
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", (error as Error).message);
    process.exit(1);
  }
}

main();
