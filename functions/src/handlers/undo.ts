import { Context } from "telegraf";
import {
  getLastTransaction,
  markTransactionReverted,
  updateAccountBalance,
  getAccounts,
} from "../services/firestore";

/**
 * Handle /undo command
 * Reverts the last transaction
 */
export async function handleUndo(ctx: Context): Promise<void> {
  try {
    const userId = ctx.from?.id?.toString();

    if (!userId) {
      await ctx.reply("Could not identify user.");
      return;
    }

    // Get last transaction
    const lastTx = await getLastTransaction(userId);

    if (!lastTx) {
      await ctx.reply("No transactions to undo.");
      return;
    }

    // Revert balance
    const revertAmount = -lastTx.amount;
    await updateAccountBalance(lastTx.account, revertAmount);

    // Mark as reverted
    await markTransactionReverted(lastTx.id);

    // Get account name for display
    const accounts = await getAccounts();
    const account = accounts.find((a) => a.slug === lastTx.account);
    const accountName = account?.name || lastTx.account;

    const amountStr = lastTx.amount >= 0 ? `+${lastTx.amount}` : `${lastTx.amount}`;

    await ctx.reply(
      `<b>Transaction Reverted</b>\n\n` +
        `Account: ${accountName}\n` +
        `Amount: ${amountStr} ${lastTx.currency}\n` +
        `Description: "${lastTx.description}"`,
      { parse_mode: "HTML" }
    );
  } catch (error) {
    console.error("Error in /undo:", error);
    await ctx.reply("Failed to undo transaction. Please try again.");
  }
}
