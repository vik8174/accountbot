import { Context, Markup } from "telegraf";
import {
  getAccounts,
  getAccountBySlug,
  setSession,
  getSession,
  getSessionKey,
  deleteSession,
  createTransactionAndUpdateBalance,
} from "../services/firestore";
import { log } from "../services/logger";
import { toMinorUnits, formatAmount } from "../utils/currency";
import { getAdaptiveKeyboard } from "../utils/keyboard";
import { getTopicOptions } from "../utils/topics";
import { handleSyncAmountInput } from "./sync";
import {
  handleTransferAmountInput,
  handleTransferReceivedInput,
  handleTransferDescriptionInput,
} from "./transfer";
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
    // Answer callback query if from inline button
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    // Cleanup any existing session (e.g., if user started new /add while previous was in progress)
    await cleanupSession(ctx);

    const accounts = await getAccounts();

    if (accounts.length === 0) {
      await ctx.telegram.sendMessage(
        ctx.chat!.id,
        await t("add.noAccounts"),
        getTopicOptions(ctx)
      );
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
      {
        ...Markup.inlineKeyboard(keyboard),
        ...getTopicOptions(ctx),
      }
    );
  } catch (error) {
    log.error("Error in /add command", error as Error);
    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("common.failed"),
      getTopicOptions(ctx)
    );
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

    // Get topic ID if in a topic
    const topicOptions = getTopicOptions(ctx);
    const messageThreadId = topicOptions.message_thread_id;

    // Create session with message IDs and topic ID
    const sessionKey = getSessionKey(chatId, telegramUserId);
    await setSession(sessionKey, {
      step: "amount",
      accountSlug: slug,
      createdById: telegramUserId,
      messageIds,
      messageThreadId,
    });

    const selected = await t("add.selected", { name: account.name });
    const enterAmount = await t("add.enterAmount");

    await ctx.answerCbQuery();
    await ctx.editMessageText(`${selected}\n\n${enterAmount}`, {
      parse_mode: "HTML",
      ...topicOptions,
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
        session.accountSlug!,
        telegramUserId,
        text,
        session.messageIds || [],
        session.messageThreadId
      );
    }

    if (session.step === "description") {
      return await handleDescriptionInput(
        ctx,
        sessionKey,
        session.accountSlug!,
        session.amount!,
        telegramUserId,
        text,
        session.messageIds || [],
        session.messageThreadId
      );
    }

    if (session.step === "sync_amount") {
      return await handleSyncAmountInput(
        ctx,
        sessionKey,
        session.accountSlug!,
        telegramUserId,
        text,
        session.messageIds || [],
        session.messageThreadId
      );
    }

    // Transfer flow steps
    if (session.step === "transfer_amount") {
      return await handleTransferAmountInput(ctx, sessionKey, session, text);
    }

    if (session.step === "transfer_received") {
      // Check if user has already accepted a rate (receivedAmount is set)
      // In that case, this is a custom amount input
      if (session.receivedAmount === undefined) {
        return await handleTransferReceivedInput(ctx, sessionKey, session, text);
      }
      // If receivedAmount is already set, user might be typing something else
      return false;
    }

    if (session.step === "transfer_description") {
      return await handleTransferDescriptionInput(ctx, sessionKey, session, text);
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
  messageIds: number[],
  messageThreadId?: number
): Promise<boolean> {
  const MAX_AMOUNT = 1000000;

  // Save user's amount message ID
  const userMessageId = ctx.message && "message_id" in ctx.message
    ? ctx.message.message_id
    : null;

  // Parse amount (user enters in major units like 2.50)
  const normalizedText = text.replace(",", ".");
  const amountMajor = parseFloat(normalizedText);

  const topicOptions = messageThreadId ? { message_thread_id: messageThreadId } : {};

  // Not a number or zero
  if (isNaN(amountMajor) || amountMajor === 0) {
    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("add.invalidNumber"),
      topicOptions
    );
    return true;
  }

  // Maximum 2 decimal places
  const decimalPart = normalizedText.split(".")[1];
  if (decimalPart && decimalPart.length > 2) {
    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("add.maxDecimals"),
      topicOptions
    );
    return true;
  }

  // Amount limit
  if (Math.abs(amountMajor) > MAX_AMOUNT) {
    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("add.maxAmount", { max: MAX_AMOUNT.toLocaleString() }),
      topicOptions
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
    await t("add.enterDescription"),
    topicOptions
  );
  updatedMessageIds.push(botResponse.message_id);

  // Update session to description step with all message IDs
  await setSession(sessionKey, {
    step: "description",
    accountSlug,
    amount: amountMinor,
    createdById,
    messageIds: updatedMessageIds,
    messageThreadId,
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
  messageIds: number[],
  messageThreadId?: number
): Promise<boolean> {
  // Save user's description message ID
  const userMessageId = ctx.message && "message_id" in ctx.message
    ? ctx.message.message_id
    : null;

  const topicOptions = messageThreadId ? { message_thread_id: messageThreadId } : {};

  // Get account details
  const account = await getAccountBySlug(accountSlug);

  if (!account) {
    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("add.accountNotFound"),
      topicOptions
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

  // Create transaction and update balance atomically
  await createTransactionAndUpdateBalance({
    accountSlug,
    amount,
    currency: account.currency,
    description: formattedDescription,
    source: "manual",
    createdById,
    createdByName,
  });

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
      `${account.name} ${amountStr}\n` +
      `${createdByName} · ${formattedDescription}`,
    {
      parse_mode: "HTML",
      ...(await getAdaptiveKeyboard(ctx)),
      ...topicOptions,
    }
  );

  return true;
}
