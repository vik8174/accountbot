import { Context } from "telegraf";
import { getAccounts } from "../services/firestore";
import { log } from "../services/logger";
import { formatBalance } from "../utils/currency";
import { getAdaptiveKeyboard } from "../utils/keyboard";
import { getTopicOptions } from "../utils/topics";
import { t } from "../i18n";
import { cleanupSession } from "./add";

/**
 * Handle /balance command
 * Shows balance of all accounts in a table format
 */
export async function handleBalance(ctx: Context): Promise<void> {
  try {
    // Answer callback query if from inline button
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    // Cleanup any active /add session
    await cleanupSession(ctx);

    const accounts = await getAccounts();

    if (accounts.length === 0) {
      await ctx.telegram.sendMessage(
        ctx.chat!.id,
        await t("balance.noAccounts"),
        getTopicOptions(ctx)
      );
      return;
    }

    // Sort accounts by name
    accounts.sort((a, b) => a.name.localeCompare(b.name));

    // Build block list
    const lines = accounts.map((acc) => {
      const balanceStr = formatBalance(acc.balance, acc.currency);
      return `${acc.name} ${balanceStr}`;
    });

    const title = await t("balance.title");
    const message = `<b>💰 ${title}</b>\n\n${lines.join("\n")}`;

    await ctx.telegram.sendMessage(ctx.chat!.id, message, {
      parse_mode: "HTML",
      ...(await getAdaptiveKeyboard(ctx)),
      ...getTopicOptions(ctx),
    });
  } catch (error) {
    log.error("Error in /balance command", error as Error);
    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("common.failed"),
      getTopicOptions(ctx)
    );
  }
}
