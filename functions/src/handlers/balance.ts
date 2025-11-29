import { Context } from "telegraf";
import { getAccounts } from "../services/firestore";
import { log } from "../services/logger";
import { formatBalance } from "../utils/currency";
import { t } from "../i18n";

/**
 * Handle /balance command
 * Shows balance of all accounts in a table format
 */
export async function handleBalance(ctx: Context): Promise<void> {
  try {
    const accounts = await getAccounts();

    if (accounts.length === 0) {
      await ctx.reply(await t("balance.noAccounts"));
      return;
    }

    // Sort accounts by name
    accounts.sort((a, b) => a.name.localeCompare(b.name));

    // Build table
    const lines = accounts.map((acc) => {
      const balanceStr = formatBalance(acc.balance, acc.currency);
      return `${acc.name.padEnd(20)} ${balanceStr}`;
    });

    const title = await t("balance.title");
    const message = `<b>${title}</b>\n\n<pre>${lines.join("\n")}</pre>`;

    await ctx.reply(message, { parse_mode: "HTML" });
  } catch (error) {
    log.error("Error in /balance command", error as Error);
    await ctx.reply(await t("common.failed"));
  }
}
