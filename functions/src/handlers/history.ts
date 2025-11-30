import { Context } from "telegraf";
import { getTransactions, getAccounts } from "../services/firestore";
import { log } from "../services/logger";
import { formatAmount } from "../utils/currency";
import { formatDate } from "../utils/date";
import { t } from "../i18n";
import { cleanupSession } from "./add";

/**
 * Handle /history command
 * Shows last 5 transactions
 */
export async function handleHistory(ctx: Context): Promise<void> {
  try {
    // Cleanup any active /add session
    await cleanupSession(ctx);

    const transactions = await getTransactions(5);

    if (transactions.length === 0) {
      await ctx.telegram.sendMessage(
        ctx.chat!.id,
        await t("history.noTransactions")
      );
      return;
    }

    // Get accounts for name lookup
    const accounts = await getAccounts();
    const accountMap = new Map(accounts.map((a) => [a.slug, a.name]));

    // Get balance sync translation once
    const balanceSyncLabel = await t("history.balanceSync");

    // Build block message
    const MAX_DISPLAY_LENGTH = 30;
    const lines = await Promise.all(
      transactions.map(async (tx) => {
        const date = await formatDate(tx.createdAt);
        const accountName = accountMap.get(tx.accountSlug) || tx.accountSlug;
        const amountStr = formatAmount(tx.amount, tx.currency);
        const fullDescription =
          tx.source === "sync" ? balanceSyncLabel : tx.description || "";
        const description =
          fullDescription.length > MAX_DISPLAY_LENGTH
            ? fullDescription.slice(0, MAX_DISPLAY_LENGTH) + "..."
            : fullDescription;
        const author = tx.createdByName || "—";
        return `${date} ${amountStr}\n${accountName} · ${author} · ${description}`;
      })
    );

    const title = await t("history.title");
    const message = `<b>📋 ${title}</b>\n\n${lines.join("\n\n")}`;

    await ctx.telegram.sendMessage(ctx.chat!.id, message, {
      parse_mode: "HTML",
    });
  } catch (error) {
    log.error("Error in /history command", error as Error);
    await ctx.telegram.sendMessage(ctx.chat!.id, await t("common.failed"));
  }
}
