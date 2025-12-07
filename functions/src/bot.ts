import { Telegraf } from "telegraf";
import { handleBalance } from "./handlers/balance";
import { handleHistory } from "./handlers/history";
import {
  handleAddCommand,
  handleAccountCallback,
  handleSessionMessage,
} from "./handlers/add";
import {
  handleSyncCommand,
  handleSyncAccountCallback,
} from "./handlers/sync";
import {
  handleTransferCommand,
  handleTransferFromCallback,
  handleTransferToCallback,
  handleTransferRateCallback,
} from "./handlers/transfer";
import {
  handleCancelCommand,
  handleCancelSelectCallback,
  handleCancelConfirmCallback,
  handleCancelAbortCallback,
} from "./handlers/cancel";
import { log } from "./services/logger";
import { getAdaptiveKeyboard } from "./utils/keyboard";
import { getTopicOptions } from "./utils/topics";
import { t } from "./i18n";

/**
 * Create and configure the Telegraf bot
 */
export function createBot(token: string): Telegraf {
  const bot = new Telegraf(token);

  // Logging middleware
  bot.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    log.info("Update processed", {
      updateType: ctx.updateType,
      duration: ms,
      userId: ctx.from?.id,
      chatId: ctx.chat?.id,
    });
  });

  // /start command
  bot.start(async (ctx) => {
    const name = ctx.from.first_name || "User";
    const welcome = await t("start.welcome", { name });
    const commands = await t("start.commands");
    const add = await t("help.add");
    const balance = await t("help.balance");
    const history = await t("help.history");
    const sync = await t("help.sync");
    const keyboardHint = await t("start.keyboardHint");

    await ctx.telegram.sendMessage(
      ctx.chat.id,
      `${welcome}\n\n` +
        `<b>${commands}</b>\n${add}\n${balance}\n${history}\n${sync}\n\n` +
        `${keyboardHint}`,
      {
        parse_mode: "HTML",
        ...(await getAdaptiveKeyboard(ctx)),
        ...getTopicOptions(ctx),
      }
    );
  });

  // /help command
  bot.help(async (ctx) => {
    const title = await t("help.title");
    const add = await t("help.add");
    const balance = await t("help.balance");
    const history = await t("help.history");
    const sync = await t("help.sync");
    const transfer = await t("help.transfer");
    const cancel = await t("help.cancel");
    await ctx.telegram.sendMessage(
      ctx.chat.id,
      `<b>${title}</b>\n\n${add}\n${balance}\n${history}\n${sync}\n${transfer}\n${cancel}`,
      { parse_mode: "HTML", ...(await getAdaptiveKeyboard(ctx)), ...getTopicOptions(ctx) }
    );
  });

  // Command handlers
  bot.command("add", handleAddCommand);
  bot.command("balance", handleBalance);
  bot.command("history", handleHistory);
  bot.command("sync", handleSyncCommand);
  bot.command("transfer", handleTransferCommand);
  bot.command("cancel", handleCancelCommand);

  // Keyboard button handlers (hears emoji prefix)
  bot.hears(/^💸/, handleAddCommand);
  bot.hears(/^💰/, handleBalance);
  bot.hears(/^📋/, handleHistory);
  bot.hears(/^🔄/, handleSyncCommand);
  bot.hears(/^↔️/, handleTransferCommand);
  bot.hears(/^❌/, handleCancelCommand);

  // Callback query handlers for account selection
  bot.action(/^add:account:.+$/, handleAccountCallback);
  bot.action(/^sync:account:.+$/, handleSyncAccountCallback);

  // Transfer callbacks
  bot.action(/^transfer:from:.+$/, handleTransferFromCallback);
  bot.action(/^transfer:to:.+$/, handleTransferToCallback);
  bot.action(/^transfer:rate:(accept|custom)$/, handleTransferRateCallback);

  // Cancel callbacks
  bot.action(/^cancel:select:.+$/, handleCancelSelectCallback);
  bot.action(/^cancel:confirm:.+$/, handleCancelConfirmCallback);
  bot.action("cancel:abort", handleCancelAbortCallback);

  // Inline keyboard callback handlers (for forum topics)
  bot.action("cmd:add", handleAddCommand);
  bot.action("cmd:balance", handleBalance);
  bot.action("cmd:history", handleHistory);
  bot.action("cmd:sync", handleSyncCommand);
  bot.action("cmd:transfer", handleTransferCommand);
  bot.action("cmd:cancel", handleCancelCommand);

  // Text message handler for session flow
  bot.on("text", async (ctx, next) => {
    const handled = await handleSessionMessage(ctx);
    if (!handled) {
      await next();
    }
  });

  // Error handler
  bot.catch((err, ctx) => {
    log.error("Bot error", err as Error, {
      updateType: ctx.updateType,
      userId: ctx.from?.id,
      chatId: ctx.chat?.id,
    });
  });

  return bot;
}
