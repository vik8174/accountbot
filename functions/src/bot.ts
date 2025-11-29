import { Telegraf } from "telegraf";
import { handleBalance } from "./handlers/balance";
import { handleHistory } from "./handlers/history";
// import { handleUndo } from "./handlers/undo"; // Temporarily disabled
import {
  handleAddCommand,
  handleAccountCallback,
  handleSessionMessage,
} from "./handlers/add";
import { log } from "./services/logger";
import { mainKeyboard } from "./utils/keyboard";

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
    await ctx.reply(
      `Hello, ${name}! Welcome to AccountBot.\n\n` +
        `<i>Simple. Fast. Accurate.</i>`,
      { parse_mode: "HTML", ...mainKeyboard }
    );
  });

  // /help command
  bot.help(async (ctx) => {
    await ctx.reply(
      `<b>AccountBot Help</b>\n\n` +
        `/add — Add a new transaction (interactive)\n` +
        `/balance — View all account balances\n` +
        `/history — View last 5 transactions`,
      { parse_mode: "HTML", ...mainKeyboard }
    );
  });

  // Command handlers
  bot.command("add", handleAddCommand);
  bot.command("balance", handleBalance);
  bot.command("history", handleHistory);
  // bot.command("undo", handleUndo); // Temporarily disabled

  // Callback query handler for account selection
  bot.action(/^add:account:.+$/, handleAccountCallback);

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
