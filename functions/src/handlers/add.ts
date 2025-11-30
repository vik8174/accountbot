import { Context, Markup } from "telegraf";
import {
  getAccounts,
  getAccountBySlug,
  setSession,
  getSession,
  getSessionKey,
  deleteSession,
  createTransaction,
  updateAccountBalance,
} from "../services/firestore";
import { log } from "../services/logger";
import { toMinorUnits, formatAmount } from "../utils/currency";
import { getMainKeyboard } from "../utils/keyboard";
import { handleSyncAmountInput } from "./sync";
import { t } from "../i18n";

/**
 * Cleanup active session and delete intermediate messages
 * Called when user starts a new command while /add flow is in progress
 */
export async function cleanupSession(ctx: Context): Promise<void> {
  try {
    const chatId = ctx.chat?.id?.toString();
    const telegramUserId = ctx.from?.id?.toString();

    if (!chatId || !telegramUserId) {
      return;
    }

    const sessionKey = getSessionKey(chatId, telegramUserId);
    const session = await getSession(sessionKey);

    if (!session) {
      return;
    }

    // Delete all intermediate messages
    if (session.messageIds && session.messageIds.length > 0) {
      for (const msgId of session.messageIds) {
        try {
          await ctx.telegram.deleteMessage(ctx.chat!.id, msgId);
        } catch { /* ignore - message might already be deleted */ }
      }
    }

    // Delete session
    await deleteSession(sessionKey);
  } catch (error) {
    log.error("Error cleaning up session", error as Error, {
      chatId: ctx.chat?.id,
    });
  }
}

/**
 * Handle /add command
 * Shows inline keyboard with accounts to select
 */
export async function handleAddCommand(ctx: Context): Promise<void> {
  try {
    // Cleanup any existing session (e.g., if user started new /add while previous was in progress)
    await cleanupSession(ctx);

    const accounts = await getAccounts();

    if (accounts.length === 0) {
      await ctx.telegram.sendMessage(ctx.chat!.id, await t("add.noAccounts"));
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

    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("add.selectAccount"),
      Markup.inlineKeyboard(keyboard)
    );
  } catch (error) {
    log.error("Error in /add command", error as Error);
    await ctx.telegram.sendMessage(ctx.chat!.id, await t("common.failed"));
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
      await ctx.answerCbQuery(await t("common.userError"));
      return;
    }

    // Verify account exists
    const account = await getAccountBySlug(slug);
    if (!account) {
      await ctx.answerCbQuery(await t("common.accountNotFound"));
      return;
    }

    // Collect message IDs to delete later (excluding first command message)
    const messageIds: number[] = [];

    // Get inline keyboard message ID (will be edited, then deleted)
    const callbackMessage = ctx.callbackQuery.message;
    if (callbackMessage?.message_id) {
      messageIds.push(callbackMessage.message_id);
    }

    // Create session with message IDs
    const sessionKey = getSessionKey(chatId, telegramUserId);
    await setSession(sessionKey, {
      step: "amount",
      accountSlug: slug,
      createdById: telegramUserId,
      messageIds,
    });

    const selected = await t("add.selected", { name: account.name });
    const enterAmount = await t("add.enterAmount");

    await ctx.answerCbQuery();
    await ctx.editMessageText(`${selected}\n\n${enterAmount}`, {
      parse_mode: "HTML",
    });
  } catch (error) {
    log.error("Error in account callback", error as Error, {
      chatId: ctx.chat?.id,
    });
    await ctx.answerCbQuery(await t("common.error"));
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

    // Check for active session (using chatId:userId key)
    const sessionKey = getSessionKey(chatId, telegramUserId);
    const session = await getSession(sessionKey);

    if (!session) {
      return false;
    }

    const text = ctx.message && "text" in ctx.message ? ctx.message.text : null;

    if (!text) {
      return false;
    }

    if (session.step === "amount") {
      return await handleAmountInput(
        ctx,
        sessionKey,
        session.accountSlug,
        telegramUserId,
        text,
        session.messageIds || []
      );
    }

    if (session.step === "description") {
      return await handleDescriptionInput(
        ctx,
        sessionKey,
        session.accountSlug,
        session.amount!,
        telegramUserId,
        text,
        session.messageIds || []
      );
    }

    if (session.step === "sync_amount") {
      return await handleSyncAmountInput(
        ctx,
        sessionKey,
        session.accountSlug,
        telegramUserId,
        text,
        session.messageIds || []
      );
    }

    return false;
  } catch (error) {
    log.error("Error handling session message", error as Error, {
      chatId: ctx.chat?.id,
    });
    return false;
  }
}

/**
 * Handle amount input
 */
async function handleAmountInput(
  ctx: Context,
  sessionKey: string,
  accountSlug: string,
  createdById: string,
  text: string,
  messageIds: number[]
): Promise<boolean> {
  const MAX_AMOUNT = 1000000;

  // Save user's amount message ID
  const userMessageId = ctx.message && "message_id" in ctx.message
    ? ctx.message.message_id
    : null;

  // Parse amount (user enters in major units like 2.50)
  const normalizedText = text.replace(",", ".");
  const amountMajor = parseFloat(normalizedText);

  // Not a number or zero
  if (isNaN(amountMajor) || amountMajor === 0) {
    await ctx.telegram.sendMessage(ctx.chat!.id, await t("add.invalidNumber"));
    return true;
  }

  // Maximum 2 decimal places
  const decimalPart = normalizedText.split(".")[1];
  if (decimalPart && decimalPart.length > 2) {
    await ctx.telegram.sendMessage(ctx.chat!.id, await t("add.maxDecimals"));
    return true;
  }

  // Amount limit
  if (Math.abs(amountMajor) > MAX_AMOUNT) {
    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("add.maxAmount", { max: MAX_AMOUNT.toLocaleString() })
    );
    return true;
  }

  // Convert to minor units (cents) for storage
  const amountMinor = toMinorUnits(amountMajor);

  // Collect message IDs: previous + user's amount message + bot's response
  const updatedMessageIds = [...messageIds];
  if (userMessageId) {
    updatedMessageIds.push(userMessageId);
  }

  const botResponse = await ctx.telegram.sendMessage(
    ctx.chat!.id,
    await t("add.enterDescription")
  );
  updatedMessageIds.push(botResponse.message_id);

  // Update session to description step with all message IDs
  await setSession(sessionKey, {
    step: "description",
    accountSlug,
    amount: amountMinor,
    createdById,
    messageIds: updatedMessageIds,
  });

  return true;
}

/**
 * Handle description input and create transaction
 */
async function handleDescriptionInput(
  ctx: Context,
  sessionKey: string,
  accountSlug: string,
  amount: number,
  createdById: string,
  description: string,
  messageIds: number[]
): Promise<boolean> {
  // Save user's description message ID
  const userMessageId = ctx.message && "message_id" in ctx.message
    ? ctx.message.message_id
    : null;

  // Get account details
  const account = await getAccountBySlug(accountSlug);

  if (!account) {
    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("add.accountNotFound")
    );
    await deleteSession(sessionKey);
    return true;
  }

  // Capitalize first letter and truncate to max 100 chars
  const MAX_DESCRIPTION_LENGTH = 100;
  const formattedDescription = (
    description.charAt(0).toUpperCase() + description.slice(1)
  ).slice(0, MAX_DESCRIPTION_LENGTH);
  const createdByName = ctx.from?.first_name || "Unknown";

  // Create transaction
  await createTransaction({
    accountSlug,
    amount,
    currency: account.currency,
    description: formattedDescription,
    source: "manual",
    createdById,
    createdByName,
  });

  // Update account balance
  await updateAccountBalance(accountSlug, amount);

  // Delete session
  await deleteSession(sessionKey);

  // Delete all intermediate messages
  const allMessageIds = userMessageId ? [...messageIds, userMessageId] : messageIds;
  for (const msgId of allMessageIds) {
    try {
      await ctx.telegram.deleteMessage(ctx.chat!.id, msgId);
    } catch { /* ignore - message might already be deleted */ }
  }

  // Send confirmation
  const amountStr = formatAmount(amount, account.currency);
  const successTitle = await t("add.success");

  await ctx.telegram.sendMessage(
    ctx.chat!.id,
    `<b>✅ ${successTitle}</b>\n\n` +
      `${amountStr}:\n` +
      `  ${account.name} · ${createdByName} · ${formattedDescription}`,
    { parse_mode: "HTML", ...(await getMainKeyboard()) }
  );

  return true;
}
