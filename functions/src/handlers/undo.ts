import { Context } from "telegraf";
import {
  getLastTransaction,
  markTransactionReverted,
  updateAccountBalance,
  getAccounts,
} from "../services/firestore";
import { log } from "../services/logger";

/**
 * Handle /undo command
 * Reverts the last transaction
 */
export async function handleUndo(ctx: Context): Promise<void> {
  try {
    const telegramUserId = ctx.from?.id?.toString();

    if (!telegramUserId) {
      await ctx.reply("Could not identify user.");
      return;
    }

    // Get last transaction
    const lastTx = await getLastTransaction(telegramUserId);

    if (!lastTx) {
      await ctx.reply("No transactions to undo.");
      return;
    }

    // Check if already reverted (can only undo once)
    if (lastTx.reverted) {
      await ctx.reply("You already undid your last transaction.");
      return;
    }

    // Revert balance
    const revertAmount = -lastTx.amount;
    await updateAccountBalance(lastTx.accountSlug, revertAmount);

    // Mark as reverted
    await markTransactionReverted(lastTx.id);

    // Get account name for display
    const accounts = await getAccounts();
    const account = accounts.find((a) => a.slug === lastTx.accountSlug);
    const accountName = account?.name || lastTx.accountSlug;

    const amountStr = lastTx.amount >= 0 ? `+${lastTx.amount}` : `${lastTx.amount}`;

    await ctx.reply(
      "<b>Transaction Reverted</b>\n\n" +
        `Account: ${accountName}\n` +
        `Amount: ${amountStr} ${lastTx.currency}\n` +
        `Description: "${lastTx.description}"`,
      { parse_mode: "HTML" }
    );
  } catch (error) {
    log.error("Error in /undo command", error as Error, { telegramUserId: ctx.from?.id });
    await ctx.reply("Failed to undo transaction. Please try again.");
  }
}
