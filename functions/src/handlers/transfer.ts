import { Context, Markup } from "telegraf";
import {
  getAccounts,
  getAccountBySlug,
  setSession,
  getSession,
  getSessionKey,
  deleteSession,
  createTransferAndUpdateBalances,
} from "../services/firestore";
import { convertCurrency, formatExchangeRate } from "../services/currency-api";
import { log } from "../services/logger";
import { toMinorUnits, formatAmount } from "../utils/currency";
import { getAdaptiveKeyboard } from "../utils/keyboard";
import { getTopicOptions } from "../utils/topics";
import { cleanupSession } from "./add";
import { t } from "../i18n";
import { Session } from "../types";

const MAX_AMOUNT = 1000000;
const MAX_DESCRIPTION_LENGTH = 100;
const SKIP_COMMANDS = ["-", "/skip", "skip", ""];

/**
 * Handle /transfer command
 * Shows inline keyboard with accounts to select as source
 */
export async function handleTransferCommand(ctx: Context): Promise<void> {
  try {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    await cleanupSession(ctx);

    const accounts = await getAccounts();

    if (accounts.length < 2) {
      await ctx.telegram.sendMessage(
        ctx.chat!.id,
        await t("transfer.noOtherAccounts"),
        getTopicOptions(ctx)
      );
      return;
    }

    accounts.sort((a, b) => a.name.localeCompare(b.name));

    const buttons = accounts.map((acc) =>
      Markup.button.callback(
        `${acc.name} (${acc.currency})`,
        `transfer:from:${acc.slug}`
      )
    );

    const keyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      keyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("transfer.selectFrom"),
      {
        ...Markup.inlineKeyboard(keyboard),
        ...getTopicOptions(ctx),
      }
    );
  } catch (error) {
    log.error("Error in /transfer command", error as Error);
    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("common.failed"),
      getTopicOptions(ctx)
    );
  }
}

/**
 * Handle source account selection
 */
export async function handleTransferFromCallback(ctx: Context): Promise<void> {
  try {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) {
      return;
    }

    const data = ctx.callbackQuery.data;
    const match = data.match(/^transfer:from:(.+)$/);

    if (!match) {
      return;
    }

    const fromSlug = match[1];
    const chatId = ctx.chat?.id?.toString();
    const telegramUserId = ctx.from?.id?.toString();

    if (!chatId || !telegramUserId) {
      await ctx.answerCbQuery(await t("common.userError"));
      return;
    }

    const fromAccount = await getAccountBySlug(fromSlug);
    if (!fromAccount) {
      await ctx.answerCbQuery(await t("common.accountNotFound"));
      return;
    }

    // Get all accounts except the source
    const accounts = await getAccounts();
    const otherAccounts = accounts.filter((acc) => acc.slug !== fromSlug);

    if (otherAccounts.length === 0) {
      await ctx.answerCbQuery(await t("transfer.noOtherAccounts"));
      return;
    }

    otherAccounts.sort((a, b) => a.name.localeCompare(b.name));

    const messageIds: number[] = [];
    const callbackMessage = ctx.callbackQuery.message;
    if (callbackMessage?.message_id) {
      messageIds.push(callbackMessage.message_id);
    }

    const topicOptions = getTopicOptions(ctx);
    const messageThreadId = topicOptions.message_thread_id;

    const sessionKey = getSessionKey(chatId, telegramUserId);
    await setSession(sessionKey, {
      step: "transfer_to",
      fromAccountSlug: fromSlug,
      createdById: telegramUserId,
      messageIds,
      messageThreadId,
    });

    const buttons = otherAccounts.map((acc) =>
      Markup.button.callback(
        `${acc.name} (${acc.currency})`,
        `transfer:to:${acc.slug}`
      )
    );

    const keyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      keyboard.push(buttons.slice(i, i + 2));
    }

    const fromLabel = await t("transfer.from");
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `${fromLabel}: <b>${fromAccount.name}</b> (${fromAccount.currency})\n\n` +
        (await t("transfer.selectTo")),
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard(keyboard),
        ...topicOptions,
      }
    );
  } catch (error) {
    log.error("Error in transfer from callback", error as Error);
    await ctx.answerCbQuery(await t("common.error"));
  }
}

/**
 * Handle destination account selection
 */
export async function handleTransferToCallback(ctx: Context): Promise<void> {
  try {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) {
      return;
    }

    const data = ctx.callbackQuery.data;
    const match = data.match(/^transfer:to:(.+)$/);

    if (!match) {
      return;
    }

    const toSlug = match[1];
    const chatId = ctx.chat?.id?.toString();
    const telegramUserId = ctx.from?.id?.toString();

    if (!chatId || !telegramUserId) {
      await ctx.answerCbQuery(await t("common.userError"));
      return;
    }

    const sessionKey = getSessionKey(chatId, telegramUserId);
    const session = await getSession(sessionKey);

    if (!session || session.step !== "transfer_to" || !session.fromAccountSlug) {
      await ctx.answerCbQuery(await t("common.error"));
      return;
    }

    const fromSlug = session.fromAccountSlug;

    if (fromSlug === toSlug) {
      await ctx.answerCbQuery(await t("transfer.sameAccountError"));
      return;
    }

    const [fromAccount, toAccount] = await Promise.all([
      getAccountBySlug(fromSlug),
      getAccountBySlug(toSlug),
    ]);

    if (!fromAccount || !toAccount) {
      await ctx.answerCbQuery(await t("common.accountNotFound"));
      return;
    }

    const topicOptions = session.messageThreadId
      ? { message_thread_id: session.messageThreadId }
      : {};

    await setSession(sessionKey, {
      step: "transfer_amount",
      fromAccountSlug: fromSlug,
      toAccountSlug: toSlug,
      createdById: telegramUserId,
      messageIds: session.messageIds,
      messageThreadId: session.messageThreadId,
    });

    const fromLabel = await t("transfer.from");
    const toLabel = await t("transfer.to");

    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `${fromLabel}: <b>${fromAccount.name}</b> (${fromAccount.currency})\n` +
        `${toLabel}: <b>${toAccount.name}</b> (${toAccount.currency})\n\n` +
        (await t("transfer.enterAmount", { currency: fromAccount.currency })),
      {
        parse_mode: "HTML",
        ...topicOptions,
      }
    );
  } catch (error) {
    log.error("Error in transfer to callback", error as Error);
    await ctx.answerCbQuery(await t("common.error"));
  }
}

/**
 * Handle transfer amount input
 */
export async function handleTransferAmountInput(
  ctx: Context,
  sessionKey: string,
  session: Session,
  text: string
): Promise<boolean> {
  const userMessageId =
    ctx.message && "message_id" in ctx.message ? ctx.message.message_id : null;

  const topicOptions = session.messageThreadId
    ? { message_thread_id: session.messageThreadId }
    : {};

  const normalizedText = text.replace(",", ".");
  const amountMajor = parseFloat(normalizedText);

  // Validation
  if (isNaN(amountMajor) || amountMajor <= 0) {
    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("add.invalidNumber"),
      topicOptions
    );
    return true;
  }

  const decimalPart = normalizedText.split(".")[1];
  if (decimalPart && decimalPart.length > 2) {
    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("add.maxDecimals"),
      topicOptions
    );
    return true;
  }

  if (amountMajor > MAX_AMOUNT) {
    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("add.maxAmount", { max: MAX_AMOUNT.toLocaleString() }),
      topicOptions
    );
    return true;
  }

  const amountMinor = toMinorUnits(amountMajor);

  const [fromAccount, toAccount] = await Promise.all([
    getAccountBySlug(session.fromAccountSlug!),
    getAccountBySlug(session.toAccountSlug!),
  ]);

  if (!fromAccount || !toAccount) {
    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("common.accountNotFound"),
      topicOptions
    );
    await deleteSession(sessionKey);
    return true;
  }

  const updatedMessageIds = [...(session.messageIds || [])];
  if (userMessageId) {
    updatedMessageIds.push(userMessageId);
  }

  // Same currency - go directly to description
  if (fromAccount.currency === toAccount.currency) {
    const botResponse = await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("transfer.enterDescription"),
      topicOptions
    );
    updatedMessageIds.push(botResponse.message_id);

    await setSession(sessionKey, {
      step: "transfer_description",
      fromAccountSlug: session.fromAccountSlug,
      toAccountSlug: session.toAccountSlug,
      amount: amountMinor,
      receivedAmount: amountMinor,
      createdById: session.createdById,
      messageIds: updatedMessageIds,
      messageThreadId: session.messageThreadId,
    });

    return true;
  }

  // Cross-currency - fetch exchange rate
  const conversion = await convertCurrency(
    amountMinor,
    fromAccount.currency,
    toAccount.currency
  );

  if (conversion === null) {
    // API failed - ask for manual input
    const botResponse = await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("transfer.rateFailed", { currency: toAccount.currency }),
      topicOptions
    );
    updatedMessageIds.push(botResponse.message_id);

    await setSession(sessionKey, {
      step: "transfer_received",
      fromAccountSlug: session.fromAccountSlug,
      toAccountSlug: session.toAccountSlug,
      amount: amountMinor,
      createdById: session.createdById,
      messageIds: updatedMessageIds,
      messageThreadId: session.messageThreadId,
    });

    return true;
  }

  // Show calculated amount with accept/custom buttons
  const fromLabel = await t("transfer.from");
  const toLabel = await t("transfer.to");
  const calculatedLabel = await t("transfer.calculated");

  const formattedFromAmount = formatAmount(amountMinor, fromAccount.currency);
  const formattedToAmount = formatAmount(
    conversion.amountMinor,
    toAccount.currency
  );
  const rateStr = formatExchangeRate(
    conversion.rate,
    fromAccount.currency,
    toAccount.currency
  );

  const acceptLabel = await t("transfer.acceptRate", {
    amount: formattedToAmount,
  });
  const customLabel = await t("transfer.customAmount");

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback(`✅ ${acceptLabel}`, "transfer:rate:accept")],
    [Markup.button.callback(`✏️ ${customLabel}`, "transfer:rate:custom")],
  ]);

  const botResponse = await ctx.telegram.sendMessage(
    ctx.chat!.id,
    `${fromLabel}: <b>${fromAccount.name}</b> ${formattedFromAmount}\n` +
      `${toLabel}: <b>${toAccount.name}</b>\n\n` +
      `${calculatedLabel}: <b>${formattedToAmount}</b>\n` +
      `${rateStr}`,
    {
      parse_mode: "HTML",
      ...keyboard,
      ...topicOptions,
    }
  );
  updatedMessageIds.push(botResponse.message_id);

  await setSession(sessionKey, {
    step: "transfer_received",
    fromAccountSlug: session.fromAccountSlug,
    toAccountSlug: session.toAccountSlug,
    amount: amountMinor,
    receivedAmount: conversion.amountMinor,
    exchangeRate: conversion.rate,
    createdById: session.createdById,
    messageIds: updatedMessageIds,
    messageThreadId: session.messageThreadId,
  });

  return true;
}

/**
 * Handle rate accept/custom callback
 */
export async function handleTransferRateCallback(ctx: Context): Promise<void> {
  try {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) {
      return;
    }

    const data = ctx.callbackQuery.data;
    const chatId = ctx.chat?.id?.toString();
    const telegramUserId = ctx.from?.id?.toString();

    if (!chatId || !telegramUserId) {
      await ctx.answerCbQuery(await t("common.userError"));
      return;
    }

    const sessionKey = getSessionKey(chatId, telegramUserId);
    const session = await getSession(sessionKey);

    if (
      !session ||
      session.step !== "transfer_received" ||
      !session.fromAccountSlug ||
      !session.toAccountSlug
    ) {
      await ctx.answerCbQuery(await t("common.error"));
      return;
    }

    const topicOptions = session.messageThreadId
      ? { message_thread_id: session.messageThreadId }
      : {};

    await ctx.answerCbQuery();

    if (data === "transfer:rate:accept") {
      // User accepted the calculated rate - go to description
      await ctx.editMessageReplyMarkup(undefined);

      const botResponse = await ctx.telegram.sendMessage(
        ctx.chat!.id,
        await t("transfer.enterDescription"),
        topicOptions
      );

      const updatedMessageIds = [...(session.messageIds || [])];
      updatedMessageIds.push(botResponse.message_id);

      await setSession(sessionKey, {
        step: "transfer_description",
        fromAccountSlug: session.fromAccountSlug,
        toAccountSlug: session.toAccountSlug,
        amount: session.amount,
        receivedAmount: session.receivedAmount,
        exchangeRate: session.exchangeRate,
        createdById: session.createdById,
        messageIds: updatedMessageIds,
        messageThreadId: session.messageThreadId,
      });
    } else if (data === "transfer:rate:custom") {
      // User wants to enter custom amount
      const toAccount = await getAccountBySlug(session.toAccountSlug);

      await ctx.editMessageReplyMarkup(undefined);

      const botResponse = await ctx.telegram.sendMessage(
        ctx.chat!.id,
        await t("transfer.enterReceivedAmount", {
          name: toAccount?.name || "",
          currency: toAccount?.currency || "",
        }),
        topicOptions
      );

      const updatedMessageIds = [...(session.messageIds || [])];
      updatedMessageIds.push(botResponse.message_id);

      await setSession(sessionKey, {
        step: "transfer_received",
        fromAccountSlug: session.fromAccountSlug,
        toAccountSlug: session.toAccountSlug,
        amount: session.amount,
        receivedAmount: undefined,
        createdById: session.createdById,
        messageIds: updatedMessageIds,
        messageThreadId: session.messageThreadId,
      });
    }
  } catch (error) {
    log.error("Error in transfer rate callback", error as Error);
    await ctx.answerCbQuery(await t("common.error"));
  }
}

/**
 * Handle custom received amount input
 */
export async function handleTransferReceivedInput(
  ctx: Context,
  sessionKey: string,
  session: Session,
  text: string
): Promise<boolean> {
  const userMessageId =
    ctx.message && "message_id" in ctx.message ? ctx.message.message_id : null;

  const topicOptions = session.messageThreadId
    ? { message_thread_id: session.messageThreadId }
    : {};

  const normalizedText = text.replace(",", ".");
  const amountMajor = parseFloat(normalizedText);

  if (isNaN(amountMajor) || amountMajor <= 0) {
    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("add.invalidNumber"),
      topicOptions
    );
    return true;
  }

  const decimalPart = normalizedText.split(".")[1];
  if (decimalPart && decimalPart.length > 2) {
    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("add.maxDecimals"),
      topicOptions
    );
    return true;
  }

  if (amountMajor > MAX_AMOUNT) {
    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("add.maxAmount", { max: MAX_AMOUNT.toLocaleString() }),
      topicOptions
    );
    return true;
  }

  const receivedAmountMinor = toMinorUnits(amountMajor);

  const updatedMessageIds = [...(session.messageIds || [])];
  if (userMessageId) {
    updatedMessageIds.push(userMessageId);
  }

  const botResponse = await ctx.telegram.sendMessage(
    ctx.chat!.id,
    await t("transfer.enterDescription"),
    topicOptions
  );
  updatedMessageIds.push(botResponse.message_id);

  await setSession(sessionKey, {
    step: "transfer_description",
    fromAccountSlug: session.fromAccountSlug,
    toAccountSlug: session.toAccountSlug,
    amount: session.amount,
    receivedAmount: receivedAmountMinor,
    createdById: session.createdById,
    messageIds: updatedMessageIds,
    messageThreadId: session.messageThreadId,
  });

  return true;
}

/**
 * Handle transfer description input and create transfer
 */
export async function handleTransferDescriptionInput(
  ctx: Context,
  sessionKey: string,
  session: Session,
  text: string
): Promise<boolean> {
  const userMessageId =
    ctx.message && "message_id" in ctx.message ? ctx.message.message_id : null;

  const topicOptions = session.messageThreadId
    ? { message_thread_id: session.messageThreadId }
    : {};

  const [fromAccount, toAccount] = await Promise.all([
    getAccountBySlug(session.fromAccountSlug!),
    getAccountBySlug(session.toAccountSlug!),
  ]);

  if (!fromAccount || !toAccount) {
    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("common.accountNotFound"),
      topicOptions
    );
    await deleteSession(sessionKey);
    return true;
  }

  // Check if skip command
  const isSkip = SKIP_COMMANDS.includes(text.trim().toLowerCase());
  const description = isSkip
    ? undefined
    : (text.charAt(0).toUpperCase() + text.slice(1)).slice(
        0,
        MAX_DESCRIPTION_LENGTH
      );

  const createdByName = ctx.from?.first_name || "Unknown";

  // Create transfer
  await createTransferAndUpdateBalances({
    fromAccountSlug: session.fromAccountSlug!,
    toAccountSlug: session.toAccountSlug!,
    fromAmount: session.amount!,
    toAmount: session.receivedAmount!,
    fromCurrency: fromAccount.currency,
    toCurrency: toAccount.currency,
    description,
    createdById: session.createdById,
    createdByName,
  });

  await deleteSession(sessionKey);

  // Delete intermediate messages
  const allMessageIds = userMessageId
    ? [...(session.messageIds || []), userMessageId]
    : session.messageIds || [];

  for (const msgId of allMessageIds) {
    try {
      await ctx.telegram.deleteMessage(ctx.chat!.id, msgId);
    } catch {
      /* ignore */
    }
  }

  // Build success message
  const successTitle = await t("transfer.success");
  const fromLabel = await t("transfer.from");
  const toLabel = await t("transfer.to");

  const fromAmountStr = formatAmount(-session.amount!, fromAccount.currency);
  const toAmountStr = formatAmount(session.receivedAmount!, toAccount.currency);

  let message =
    `<b>✅ ${successTitle}</b>\n\n` +
    `${fromLabel}: ${fromAccount.name} ${fromAmountStr}\n` +
    `${toLabel}: ${toAccount.name} ${toAmountStr}`;

  if (description) {
    message += `\n${createdByName} · ${description}`;
  } else {
    message += `\n${createdByName}`;
  }

  await ctx.telegram.sendMessage(ctx.chat!.id, message, {
    parse_mode: "HTML",
    ...(await getAdaptiveKeyboard(ctx)),
    ...topicOptions,
  });

  return true;
}
