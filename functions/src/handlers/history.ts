import { Context } from "telegraf";
import { getTransactions, getAccounts } from "../services/firestore";
import { log } from "../services/logger";
import { formatAmount } from "../utils/currency";

/**
 * Format date as YYYY-MM-DD HH:mm
 */
function formatDate(timestamp: FirebaseFirestore.Timestamp): string {
  const date = timestamp.toDate();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Handle /history command
 * Shows last 5 transactions
 */
export async function handleHistory(ctx: Context): Promise<void> {
  try {
    const transactions = await getTransactions(5);

    if (transactions.length === 0) {
      await ctx.reply("No transactions found.");
      return;
    }

    // Get accounts for name lookup
    const accounts = await getAccounts();
    const accountMap = new Map(accounts.map((a) => [a.slug, a.name]));

    // Build message
    const lines = transactions.map((tx, index) => {
      const date = formatDate(tx.timestamp);
      const accountName = accountMap.get(tx.accountSlug) || tx.accountSlug;
      const amountStr = formatAmount(tx.amount, tx.currency);
      return `${index + 1}) ${date} — ${accountName} — ${amountStr}\n   "${tx.description}"`;
    });

    const message = `<b>Recent Transactions</b>\n\n${lines.join("\n\n")}`;

    await ctx.reply(message, { parse_mode: "HTML" });
  } catch (error) {
    log.error("Error in /history command", error as Error);
    await ctx.reply("Failed to get history. Please try again.");
  }
}
