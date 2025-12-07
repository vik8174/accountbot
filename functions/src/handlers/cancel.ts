import { Context, Markup } from "telegraf";
import {
  getAccounts,
  getAccountBySlug,
  getUserTransactions,
  getTransactionById,
  createCancellationAndUpdateBalance,
  createTransferCancellation,
} from "../services/firestore";
import { log } from "../services/logger";
import { formatAmount } from "../utils/currency";
import { getAdaptiveKeyboard } from "../utils/keyboard";
import { getTopicOptions } from "../utils/topics";
import { t } from "../i18n";
import { formatDate } from "../utils/date";

const MAX_TRANSACTIONS_TO_SHOW = 10;

/**
 * Handle /cancel command
 * Shows user's recent transactions with cancel buttons
 */
export async function handleCancelCommand(ctx: Context): Promise<void> {
  try {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    const telegramUserId = ctx.from?.id?.toString();

    if (!telegramUserId) {
      await ctx.telegram.sendMessage(
        ctx.chat!.id,
        await t("common.userError"),
        getTopicOptions(ctx)
      );
      return;
    }

    // Get user's transactions (excluding cancellations and already cancelled)
    const allTransactions = await getUserTransactions(
      telegramUserId,
      MAX_TRANSACTIONS_TO_SHOW * 2
    );

    // Filter out cancellations and already cancelled transactions
    const transactions = allTransactions.filter(
      (tx) => tx.source !== "cancellation" && !tx.cancelledAt
    ).slice(0, MAX_TRANSACTIONS_TO_SHOW);

    if (transactions.length === 0) {
      await ctx.telegram.sendMessage(
        ctx.chat!.id,
        await t("cancel.noTransactions"),
        {
          ...(await getAdaptiveKeyboard(ctx)),
          ...getTopicOptions(ctx),
        }
      );
      return;
    }

    // Get account names for display
    const accounts = await getAccounts();
    const accountMap = new Map(accounts.map((a) => [a.slug, a.name]));

    // Build transaction buttons
    const buttons = await Promise.all(
      transactions.map(async (tx) => {
        const date = await formatDate(tx.createdAt);
        const accountName = accountMap.get(tx.accountSlug) || tx.accountSlug;
        const amount = formatAmount(tx.amount, tx.currency);
        const sourceLabel =
          tx.source === "transfer"
            ? " ↔️"
            : tx.source === "sync"
            ? " 🔄"
            : "";

        return Markup.button.callback(
          `${date} ${amount} ${accountName}${sourceLabel}`,
          `cancel:select:${tx.id}`
        );
      })
    );

    // One button per row
    const keyboard = buttons.map((btn) => [btn]);

    const title = await t("cancel.title");
    const selectPrompt = await t("cancel.selectTransaction");

    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      `<b>${title}</b>\n\n${selectPrompt}`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard(keyboard),
        ...getTopicOptions(ctx),
      }
    );
  } catch (error) {
    log.error("Error in /cancel command", error as Error);
    await ctx.telegram.sendMessage(
      ctx.chat!.id,
      await t("common.failed"),
      getTopicOptions(ctx)
    );
  }
}

/**
 * Handle transaction selection for cancellation
 */
export async function handleCancelSelectCallback(ctx: Context): Promise<void> {
  try {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) {
      return;
    }

    const data = ctx.callbackQuery.data;
    const match = data.match(/^cancel:select:(.+)$/);

    if (!match) {
      return;
    }

    const txnId = match[1];
    const telegramUserId = ctx.from?.id?.toString();

    if (!telegramUserId) {
      await ctx.answerCbQuery(await t("common.userError"));
      return;
    }

    const transaction = await getTransactionById(txnId);

    if (!transaction) {
      await ctx.answerCbQuery(await t("common.error"));
      return;
    }

    // Validate: only author can cancel
    if (transaction.createdById !== telegramUserId) {
      await ctx.answerCbQuery(await t("cancel.notYourTransaction"));
      return;
    }

    // Validate: cannot cancel cancellations
    if (transaction.source === "cancellation") {
      await ctx.answerCbQuery(await t("cancel.cannotCancelCancellation"));
      return;
    }

    // Validate: not already cancelled
    if (transaction.cancelledAt) {
      await ctx.answerCbQuery(await t("cancel.alreadyCancelled"));
      return;
    }

    // Get account name
    const account = await getAccountBySlug(transaction.accountSlug);
    const accountName = account?.name || transaction.accountSlug;

    // Build confirmation message
    const date = await formatDate(transaction.createdAt);
    const amount = formatAmount(transaction.amount, transaction.currency);
    const confirmPrompt = await t("cancel.confirmPrompt");
    const confirmLabel = await t("cancel.confirm");
    const abortLabel = await t("cancel.abort");

    let details = `${date} ${amount}\n${accountName}`;
    if (transaction.description) {
      details += ` · ${transaction.description}`;
    }
    if (transaction.source === "transfer") {
      details += `\n↔️ ${await t("transfer.transfer")}`;
    }

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(`✅ ${confirmLabel}`, `cancel:confirm:${txnId}`),
        Markup.button.callback(`❌ ${abortLabel}`, "cancel:abort"),
      ],
    ]);

    await ctx.answerCbQuery();
    await ctx.editMessageText(`${confirmPrompt}\n\n<b>${details}</b>`, {
      parse_mode: "HTML",
      ...keyboard,
      ...getTopicOptions(ctx),
    });
  } catch (error) {
    log.error("Error in cancel select callback", error as Error);
    await ctx.answerCbQuery(await t("common.error"));
  }
}

/**
 * Handle cancellation confirmation
 */
export async function handleCancelConfirmCallback(ctx: Context): Promise<void> {
  try {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) {
      return;
    }

    const data = ctx.callbackQuery.data;
    const match = data.match(/^cancel:confirm:(.+)$/);

    if (!match) {
      return;
    }

    const txnId = match[1];
    const telegramUserId = ctx.from?.id?.toString();
    const createdByName = ctx.from?.first_name || "Unknown";

    if (!telegramUserId) {
      await ctx.answerCbQuery(await t("common.userError"));
      return;
    }

    const transaction = await getTransactionById(txnId);

    if (!transaction) {
      await ctx.answerCbQuery(await t("common.error"));
      return;
    }

    // Re-validate
    if (transaction.createdById !== telegramUserId) {
      await ctx.answerCbQuery(await t("cancel.notYourTransaction"));
      return;
    }

    if (transaction.cancelledAt) {
      await ctx.answerCbQuery(await t("cancel.alreadyCancelled"));
      return;
    }

    await ctx.answerCbQuery();

    const topicOptions = getTopicOptions(ctx);

    try {
      // Check if it's a transfer
      if (transaction.source === "transfer" && transaction.linkedTransactionId) {
        await createTransferCancellation(txnId, telegramUserId, createdByName);

        // Get both accounts for message
        const linkedTx = await getTransactionById(transaction.linkedTransactionId);
        const [fromAccount, toAccount] = await Promise.all([
          getAccountBySlug(transaction.accountSlug),
          linkedTx ? getAccountBySlug(linkedTx.accountSlug) : null,
        ]);

        const successTitle = await t("cancel.transferCancelled");
        const fromAmount = formatAmount(
          -transaction.amount,
          transaction.currency
        );
        const toAmount = linkedTx
          ? formatAmount(-linkedTx.amount, linkedTx.currency)
          : "";

        await ctx.editMessageText(
          `<b>✅ ${successTitle}</b>\n\n` +
            `${fromAccount?.name || transaction.accountSlug} ${fromAmount}\n` +
            (toAccount
              ? `${toAccount.name} ${toAmount}`
              : ""),
          {
            parse_mode: "HTML",
            ...topicOptions,
          }
        );
      } else {
        // Regular transaction cancellation
        await createCancellationAndUpdateBalance(
          txnId,
          telegramUserId,
          createdByName
        );

        const account = await getAccountBySlug(transaction.accountSlug);
        const successTitle = await t("cancel.success");
        const originalAmount = formatAmount(
          transaction.amount,
          transaction.currency
        );
        const reversalAmount = formatAmount(
          -transaction.amount,
          transaction.currency
        );

        await ctx.editMessageText(
          `<b>✅ ${successTitle}</b>\n\n` +
            `${account?.name || transaction.accountSlug}\n` +
            `${await t("cancel.original")}: ${originalAmount}\n` +
            `${await t("cancel.reversal")}: ${reversalAmount}`,
          {
            parse_mode: "HTML",
            ...topicOptions,
          }
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      log.error("Error creating cancellation", error as Error, { txnId });

      if (errorMessage.includes("already cancelled")) {
        await ctx.editMessageText(await t("cancel.alreadyCancelled"), {
          parse_mode: "HTML",
          ...topicOptions,
        });
      } else {
        await ctx.editMessageText(await t("common.error"), {
          parse_mode: "HTML",
          ...topicOptions,
        });
      }
    }
  } catch (error) {
    log.error("Error in cancel confirm callback", error as Error);
    await ctx.answerCbQuery(await t("common.error"));
  }
}

/**
 * Handle cancellation abort
 */
export async function handleCancelAbortCallback(ctx: Context): Promise<void> {
  try {
    if (!ctx.callbackQuery) {
      return;
    }

    await ctx.answerCbQuery();

    // Delete the message
    try {
      await ctx.deleteMessage();
    } catch {
      /* ignore */
    }
  } catch (error) {
    log.error("Error in cancel abort callback", error as Error);
  }
}
