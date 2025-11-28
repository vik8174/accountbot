import { Context, Markup } from "telegraf";
import {
  getAccounts,
  getAccountBySlug,
  setSession,
  getSession,
  deleteSession,
  createTransaction,
  updateAccountBalance,
} from "../services/firestore";

/**
 * Handle /add command
 * Shows inline keyboard with accounts to select
 */
export async function handleAddCommand(ctx: Context): Promise<void> {
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
      Markup.button.callback(acc.name, `add:account:${acc.slug}`)
    );

    // Arrange buttons in rows of 2
    const keyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      keyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply("Select an account:", Markup.inlineKeyboard(keyboard));
  } catch (error) {
    console.error("Error in /add:", error);
    await ctx.reply("Failed to load accounts. Please try again.");
  }
}

/**
 * Handle account selection callback
 */
export async function handleAccountCallback(ctx: Context): Promise<void> {
  try {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) {
      return;
    }

    const data = ctx.callbackQuery.data;
    const match = data.match(/^add:account:(.+)$/);

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

    // Create session
    await setSession(chatId, {
      step: "amount",
      account: slug,
      telegramUserId,
    });

    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `Selected: <b>${account.name}</b>\n\nEnter the amount (positive or negative):`,
      { parse_mode: "HTML" }
    );
  } catch (error) {
    console.error("Error in account callback:", error);
    await ctx.answerCbQuery("Error occurred. Please try again.");
  }
}

/**
 * Handle text messages during session
 */
export async function handleSessionMessage(ctx: Context): Promise<boolean> {
  try {
    const chatId = ctx.chat?.id?.toString();
    const telegramUserId = ctx.from?.id?.toString();

    if (!chatId || !telegramUserId) {
      return false;
    }

    // Check for active session
    const session = await getSession(chatId);

    if (!session) {
      return false;
    }

    // Verify session belongs to this user
    if (session.telegramUserId !== telegramUserId) {
      await deleteSession(chatId);
      return false;
    }

    const text = (ctx.message && "text" in ctx.message) ? ctx.message.text : null;

    if (!text) {
      return false;
    }

    if (session.step === "amount") {
      return await handleAmountInput(ctx, chatId, session.account, telegramUserId, text);
    }

    if (session.step === "description") {
      return await handleDescriptionInput(
        ctx,
        chatId,
        session.account,
        session.amount!,
        telegramUserId,
        text
      );
    }

    return false;
  } catch (error) {
    console.error("Error handling session message:", error);
    return false;
  }
}

/**
 * Handle amount input
 */
async function handleAmountInput(
  ctx: Context,
  chatId: string,
  accountSlug: string,
  telegramUserId: string,
  text: string
): Promise<boolean> {
  // Parse amount
  const amount = parseFloat(text.replace(",", "."));

  if (isNaN(amount) || amount === 0) {
    await ctx.reply("Please enter a valid number (not zero):");
    return true;
  }

  // Update session to description step
  await setSession(chatId, {
    step: "description",
    account: accountSlug,
    amount,
    telegramUserId,
  });

  await ctx.reply("Enter a description for this transaction:");
  return true;
}

/**
 * Handle description input and create transaction
 */
async function handleDescriptionInput(
  ctx: Context,
  chatId: string,
  accountSlug: string,
  amount: number,
  telegramUserId: string,
  description: string
): Promise<boolean> {
  // Get account details
  const account = await getAccountBySlug(accountSlug);

  if (!account) {
    await ctx.reply("Account not found. Transaction cancelled.");
    await deleteSession(chatId);
    return true;
  }

  // Create transaction
  await createTransaction({
    account: accountSlug,
    amount,
    currency: account.currency,
    description,
    telegramUserId,
  });

  // Update account balance
  await updateAccountBalance(accountSlug, amount);

  // Delete session
  await deleteSession(chatId);

  // Send confirmation
  const amountStr = amount >= 0 ? `+${amount}` : `${amount}`;
  const newBalance = account.balance + amount;

  await ctx.reply(
    `<b>Transaction Added</b>\n\n` +
      `Account: ${account.name}\n` +
      `Amount: ${amountStr} ${account.currency}\n` +
      `Description: "${description}"\n\n` +
      `New balance: ${newBalance} ${account.currency}`,
    { parse_mode: "HTML" }
  );

  return true;
}
