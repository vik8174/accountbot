#!/usr/bin/env node
/**
 * Export transactions to CSV format
 *
 * Usage:
 *   npm run export-transactions
 *   npm run export-transactions -- --account cash
 *   npm run export-transactions -- --from 2024-01-01 --to 2024-12-31
 *   npm run export-transactions -- --account visa --from 2024-01-01
 *
 * Output: exports/transactions_<account>_<from>_<to>.csv
 */

import * as fs from "fs";
import * as path from "path";
import { getAllTransactions, getAccountBySlug } from "../services/firestore";
import { toMajorUnits } from "../utils/currency";
import type { Transaction } from "../types";

const EXPORTS_DIR = path.join(__dirname, "../../exports");

interface CliArgs {
  account?: string;
  from?: string;
  to?: string;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--account" && argv[i + 1]) {
      args.account = argv[i + 1];
      i++;
    } else if (argv[i] === "--from" && argv[i + 1]) {
      args.from = argv[i + 1];
      i++;
    } else if (argv[i] === "--to" && argv[i + 1]) {
      args.to = argv[i + 1];
      i++;
    } else if (argv[i] === "--help" || argv[i] === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp(): void {
  console.log(`
Export transactions to CSV format

Usage:
  npm run export-transactions [options]

Options:
  --account <slug>      Filter by account slug
  --from <YYYY-MM-DD>   Start date (inclusive)
  --to <YYYY-MM-DD>     End date (inclusive)
  --help, -h            Show this help message

Output:
  File saved to: exports/transactions_<account>_<from>_<to>.csv

Examples:
  npm run export-transactions
  npm run export-transactions -- --account cash
  npm run export-transactions -- --from 2024-01-01 --to 2024-12-31
  npm run export-transactions -- --account visa --from 2024-01-01
`);
}

function parseDate(dateStr: string): Date | null {
  // Validate YYYY-MM-DD format
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));

  // Validate date is real (e.g., not 2024-02-30)
  if (
    date.getFullYear() !== parseInt(year) ||
    date.getMonth() !== parseInt(month) - 1 ||
    date.getDate() !== parseInt(day)
  ) {
    return null;
  }

  return date;
}

function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeISO(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function escapeCSV(value: string): string {
  // Escape double quotes and wrap in quotes if contains comma, quote, or newline
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

function transactionToCSV(txn: Transaction & { id: string }): string {
  const date = txn.createdAt.toDate();
  const amount = toMajorUnits(txn.amount);

  const fields = [
    formatDateISO(date),
    formatTimeISO(date),
    txn.accountSlug,
    amount.toFixed(2),
    txn.currency,
    toMajorUnits(txn.balanceAfter).toFixed(2),
    txn.source,
    escapeCSV(txn.description || ""),
    escapeCSV(txn.createdByName),
  ];

  return fields.join(",");
}

function generateFileName(args: CliArgs): string {
  const account = args.account || "all";
  const from = args.from || "all";
  const to = args.to || "all";
  return `transactions_${account}_${from}_${to}.csv`;
}

function ensureExportsDir(): void {
  if (!fs.existsSync(EXPORTS_DIR)) {
    fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  }
}

async function main() {
  try {
    console.log("=== Export Transactions ===\n");

    const args = parseArgs();

    // Validate account if provided
    if (args.account) {
      const account = await getAccountBySlug(args.account);
      if (!account) {
        console.error(`\n❌ Error: Account '${args.account}' not found`);
        process.exit(1);
      }
    }

    // Parse dates
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (args.from) {
      const parsed = parseDate(args.from);
      if (!parsed) {
        console.error(`\n❌ Error: Invalid date format '${args.from}'. Use YYYY-MM-DD`);
        process.exit(1);
      }
      startDate = parsed;
    }

    if (args.to) {
      const parsed = parseDate(args.to);
      if (!parsed) {
        console.error(`\n❌ Error: Invalid date format '${args.to}'. Use YYYY-MM-DD`);
        process.exit(1);
      }
      endDate = parsed;
    }

    // Validate date range
    if (startDate && endDate && startDate > endDate) {
      console.error("\n❌ Error: Start date must be before end date");
      process.exit(1);
    }

    // Fetch transactions
    const transactions = await getAllTransactions(args.account, startDate, endDate);

    if (transactions.length === 0) {
      console.log("No transactions found.\n");
      process.exit(0);
    }

    // Ensure exports directory exists
    ensureExportsDir();

    // Generate file path
    const fileName = generateFileName(args);
    const filePath = path.join(EXPORTS_DIR, fileName);

    // Build CSV content
    const header = "date,time,account,amount,currency,balance_after,source,description,created_by";
    const rows = transactions.map(transactionToCSV);
    const csvContent = [header, ...rows].join("\n");

    // Write to file
    fs.writeFileSync(filePath, csvContent, "utf-8");

    console.log("\n✅ Transactions exported successfully!");
    console.log(`   Count: ${transactions.length} transaction(s)`);
    console.log(`   File: ${filePath}\n`);

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", (error as Error).message);
    process.exit(1);
  }
}

main();
