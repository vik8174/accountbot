import { Context } from "telegraf";
import {
  getLastTransaction,
  markTransactionReverted,
  updateAccountBalance,
  getAccounts,
} from "../services/firestore";
import { log } from "../services/logger";
import { formatAmount } from "../utils/currency";

/**
 * Handle /undo command
 * Reverts the last transaction
 */
export async function handleUndo(ctx: Context): Promise<void> {
  try {
    // Get last transaction
    const lastTx = await getLastTransaction();

    if (!lastTx) {
      await ctx.reply("No transactions to undo.");
      return;
    }

    // Check if already reverted (can only undo once)
    if (lastTx.reverted) {
      await ctx.reply("The last transaction was already undone.");
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

    const amountStr = formatAmount(lastTx.amount, lastTx.currency);

    await ctx.reply(
      "<b>Transaction Reverted</b>\n\n" +
        `Account: ${accountName}\n` +
        `Amount: ${amountStr}\n` +
        `Description: "${lastTx.description}"`,
      { parse_mode: "HTML" }
    );
  } catch (error) {
    log.error("Error in /undo command", error as Error);
    await ctx.reply("Failed to undo transaction. Please try again.");
  }
}
