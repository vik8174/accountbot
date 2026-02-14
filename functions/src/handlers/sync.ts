import { Context, Markup } from "telegraf";
import {
  getAccounts,
  getAccountBySlug,
  setSession,
  getSessionKey,
  deleteSession,
  createTransactionAndUpdateBalance,
} from "../services/firestore";
import { log } from "../services/logger";
import { toMinorUnits, formatAmount, formatBalance, parseAmount } from "../utils/currency";
import { getAdaptiveKeyboard, getCancelKeyboard } from "../utils/keyboard";
import { getTopicOptions } from "../utils/topics";
import { t } from "../i18n";
import { cleanupSession } from "./add";

/**
 * Handle /sync command
 * Shows inline keyboard with accounts to select for balance sync
 */
export async function handleSyncCommand(ctx: Context): Promise<void> {
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
        await t("add.noAccounts"),
        getTopicOptions(ctx)
      );
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

    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("sync.selectAccount"),
      {
        ...Markup.inlineKeyboard(keyboard),
        ...getTopicOptions(ctx),
      }
    );
  } catch (error) {
    log.error("Error in /sync command", error as Error);
    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("common.failed"),
      getTopicOptions(ctx)
    );
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

    // Create session for sync with message IDs and topic ID
    const sessionKey = getSessionKey(chatId, telegramUserId);
    await setSession(sessionKey, {
      step: "sync_amount",
      accountSlug: slug,
      createdById: telegramUserId,
      messageIds,
      messageThreadId,
    });

    const currentBalanceStr = formatBalance(account.balance, account.currency);
    const currentBalanceLabel = await t("sync.currentBalance", { balance: currentBalanceStr });
    const enterActual = await t("sync.enterActual");
    const cancelKeyboard = await getCancelKeyboard();

    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `<b>${account.name}</b>\n\n${currentBalanceLabel}\n\n${enterActual}`,
      { parse_mode: "HTML" as const, ...cancelKeyboard, ...topicOptions }
    );
  } catch (error) {
    log.error("Error in sync account callback", error as Error, {
      chatId: ctx.chat?.id,
    });
    await ctx.answerCbQuery(await t("common.error"));
  }
}

/**
 * Handle sync amount input and create adjustment transaction
 */
export async function handleSyncAmountInput(
  ctx: Context,
  sessionKey: string,
  accountSlug: string,
  createdById: string,
  text: string,
  messageIds: number[] = [],
  messageThreadId?: number
): Promise<boolean> {
  // Save user's amount message ID
  const userMessageId = ctx.message && "message_id" in ctx.message
    ? ctx.message.message_id
    : null;

  const topicOptions = messageThreadId ? { message_thread_id: messageThreadId } : {};

  // Parse amount (user enters in major units like 250.00)
  const result = parseAmount(text, { allowNegative: false, allowZero: true });

  if (!result.success) {
    const errorMessages: Record<string, string> = {
      invalid: "add.invalidNumber",
      zero: "add.invalidNumber",
      negative: "sync.negativeNotAllowed",
      max_decimals: "add.maxDecimals",
      max_amount: "sync.maxBalance",
    };
    const messageKey = errorMessages[result.error];
    const message = result.error === "max_amount"
      ? await t(messageKey, { max: (1000000).toLocaleString() })
      : await t(messageKey);
    await ctx.telegram.sendMessage(ctx.chat!.id, message, topicOptions);
    return true;
  }

  const newBalanceMajor = result.value;

  // Get account details
  const account = await getAccountBySlug(accountSlug);

  if (!account) {
    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("sync.cancelled"),
      topicOptions
    );
    await deleteSession(sessionKey);
    return true;
  }

  // Calculate delta (difference between new and current balance)
  const newBalanceMinor = toMinorUnits(newBalanceMajor);
  const delta = newBalanceMinor - account.balance;

  // If no change needed
  if (delta === 0) {
    await deleteSession(sessionKey);
    await ctx.telegram.sendMessage(ctx.chat!.id, await t("sync.noChange"), {
      ...(await getAdaptiveKeyboard(ctx)),
      ...topicOptions,
    });
    return true;
  }

  // Create adjustment transaction and update balance atomically
  const createdByName = ctx.from?.first_name || "Unknown";
  await createTransactionAndUpdateBalance({
    accountSlug,
    amount: delta,
    currency: account.currency,
    source: "sync",
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
  const deltaStr = formatAmount(delta, account.currency);
  const newBalanceStr = formatBalance(newBalanceMinor, account.currency);
  const oldBalanceStr = formatBalance(account.balance, account.currency);

  const successTitle = await t("sync.success");
  const previousLabel = await t("common.previous");
  const adjustmentLabel = await t("common.adjustment");
  const newBalanceLabel = await t("common.newBalance");

  await ctx.telegram.sendMessage(
    ctx.chat!.id,
    `<b>✅ ${successTitle}</b>\n\n` +
      `${account.name}\n` +
      `${previousLabel} ${oldBalanceStr}\n` +
      `${adjustmentLabel} ${deltaStr}\n` +
      `${newBalanceLabel} ${newBalanceStr}`,
    {
      parse_mode: "HTML",
      ...(await getAdaptiveKeyboard(ctx)),
      ...topicOptions,
    }
  );

  return true;
}
