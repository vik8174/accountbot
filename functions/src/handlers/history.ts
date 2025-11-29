import { Context } from "telegraf";
import { getTransactions, getAccounts } from "../services/firestore";
import { log } from "../services/logger";
import { formatAmount } from "../utils/currency";
import { t } from "../i18n";

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
      await ctx.reply(await t("history.noTransactions"));
      return;
    }

    // Get accounts for name lookup
    const accounts = await getAccounts();
    const accountMap = new Map(accounts.map((a) => [a.slug, a.name]));

    // Get balance sync translation once
    const balanceSyncLabel = await t("history.balanceSync");

    // Build message
    const lines = transactions.map((tx, index) => {
      const date = formatDate(tx.timestamp);
      const accountName = accountMap.get(tx.accountSlug) || tx.accountSlug;
      const amountStr = formatAmount(tx.amount, tx.currency);
      const description = tx.source === "sync" ? balanceSyncLabel : tx.description;
      return `${index + 1}) ${date} — ${accountName} — ${amountStr}\n   "${description}"`;
    });

    const title = await t("history.title");
    const message = `<b>${title}</b>\n\n${lines.join("\n\n")}`;

    await ctx.reply(message, { parse_mode: "HTML" });
  } catch (error) {
    log.error("Error in /history command", error as Error);
    await ctx.reply(await t("common.failed"));
  }
}
