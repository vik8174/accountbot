import { Context, Markup } from "telegraf";
import {
  getAccounts,
  getAccountBySlug,
  setSession,
  deleteSession,
  createTransaction,
  updateAccountBalance,
} from "../services/firestore";
import { log } from "../services/logger";
import { toMinorUnits, formatAmount, formatBalance } from "../utils/currency";
import { mainKeyboard } from "../utils/keyboard";

/**
 * Handle /sync command
 * Shows inline keyboard with accounts to select for balance sync
 */
export async function handleSyncCommand(ctx: Context): Promise<void> {
  try {
    const accounts = await getAccounts();

    if (accounts.length === 0) {
      await ctx.reply("No accounts available. Please create accounts first.");
      return;
    }

    // Sort accounts by name
    accounts.sort((a, b) => a.name.localeCompare(b.name));

    // Create inline keyboard with account buttons
    const buttons = accounts.map((acc) =>
      Markup.button.callback(acc.name, `sync:account:${acc.slug}`)
    );

    // Arrange buttons in rows of 2
    const keyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      keyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply("Select account to sync:", Markup.inlineKeyboard(keyboard));
  } catch (error) {
    log.error("Error in /sync command", error as Error);
    await ctx.reply("Failed to load accounts. Please try again.");
  }
}

/**
 * Handle account selection callback for sync
 */
export async function handleSyncAccountCallback(ctx: Context): Promise<void> {
  try {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) {
      return;
    }

    const data = ctx.callbackQuery.data;
    const match = data.match(/^sync:account:(.+)$/);

    if (!match) {
      return;
    }

    const slug = match[1];
    const chatId = ctx.chat?.id?.toString();
    const telegramUserId = ctx.from?.id?.toString();

    if (!chatId || !telegramUserId) {
      await ctx.answerCbQuery("Error: Could not identify chat or user.");
      return;
    }

    // Verify account exists
    const account = await getAccountBySlug(slug);
    if (!account) {
      await ctx.answerCbQuery("Account not found.");
      return;
    }

    // Create session for sync
    await setSession(chatId, {
      step: "sync_amount",
      accountSlug: slug,
      createdBy: telegramUserId,
    });

    const currentBalanceStr = formatBalance(account.balance, account.currency);

    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `<b>${account.name}</b>\n\n` +
        `Current balance: ${currentBalanceStr}\n\n` +
        "Enter the actual balance:",
      { parse_mode: "HTML" as const }
    );
  } catch (error) {
    log.error("Error in sync account callback", error as Error, {
      chatId: ctx.chat?.id,
    });
    await ctx.answerCbQuery("Error occurred. Please try again.");
  }
}

/**
 * Handle sync amount input and create adjustment transaction
 */
export async function handleSyncAmountInput(
  ctx: Context,
  chatId: string,
  accountSlug: string,
  createdBy: string,
  text: string
): Promise<boolean> {
  const MAX_AMOUNT = 1000000;

  // Parse amount (user enters in major units like 250.00)
  const normalizedText = text.replace(",", ".");
  const newBalanceMajor = parseFloat(normalizedText);

  // Not a number
  if (isNaN(newBalanceMajor)) {
    await ctx.reply("Please enter a valid number:");
    return true;
  }

  // Negative balance not allowed
  if (newBalanceMajor < 0) {
    await ctx.reply("Balance cannot be negative:");
    return true;
  }

  // Maximum 2 decimal places
  const decimalPart = normalizedText.split(".")[1];
  if (decimalPart && decimalPart.length > 2) {
    await ctx.reply("Maximum 2 decimal places allowed (e.g., 250.50):");
    return true;
  }

  // Amount limit
  if (newBalanceMajor > MAX_AMOUNT) {
    await ctx.reply(`Balance cannot exceed ${MAX_AMOUNT.toLocaleString()}:`);
    return true;
  }

  // Get account details
  const account = await getAccountBySlug(accountSlug);

  if (!account) {
    await ctx.reply("Account not found. Sync cancelled.");
    await deleteSession(chatId);
    return true;
  }

  // Calculate delta (difference between new and current balance)
  const newBalanceMinor = toMinorUnits(newBalanceMajor);
  const delta = newBalanceMinor - account.balance;

  // If no change needed
  if (delta === 0) {
    await deleteSession(chatId);
    await ctx.reply("Balance is already correct. No changes made.", {
      ...mainKeyboard,
    });
    return true;
  }

  // Create adjustment transaction
  await createTransaction({
    accountSlug,
    amount: delta,
    currency: account.currency,
    description: "Balance sync",
    createdBy,
  });

  // Update account balance
  await updateAccountBalance(accountSlug, delta);

  // Delete session
  await deleteSession(chatId);

  // Send confirmation
  const deltaStr = formatAmount(delta, account.currency);
  const newBalanceStr = formatBalance(newBalanceMinor, account.currency);
  const oldBalanceStr = formatBalance(account.balance, account.currency);

  await ctx.reply(
    "<b>Balance Synced</b>\n\n" +
      `Account: ${account.name}\n` +
      `Previous: ${oldBalanceStr}\n` +
      `Adjustment: ${deltaStr}\n` +
      `New balance: ${newBalanceStr}`,
    { parse_mode: "HTML", ...mainKeyboard }
  );

  return true;
}
