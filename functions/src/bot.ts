import { Telegraf } from "telegraf";
import { handleBalance } from "./handlers/balance";
import { handleHistory } from "./handlers/history";
import { handleUndo } from "./handlers/undo";
import {
  handleAddCommand,
  handleAccountCallback,
  handleSessionMessage,
} from "./handlers/add";

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
    console.log(`[${ctx.updateType}] processed in ${ms}ms`);
  });

  // /start command
  bot.start(async (ctx) => {
    const name = ctx.from.first_name || "User";
    await ctx.reply(
      `Hello, ${name}! Welcome to AccountBot.\n\n` +
        `<b>Available commands:</b>\n` +
        `/add — Add a new transaction\n` +
        `/balance — View account balances\n` +
        `/history — View recent transactions\n` +
        `/undo — Revert last transaction\n\n` +
        `<i>Simple. Fast. Accurate.</i>`,
      { parse_mode: "HTML" }
    );
  });

  // /help command
  bot.help(async (ctx) => {
    await ctx.reply(
      `<b>AccountBot Help</b>\n\n` +
        `/add — Add a new transaction (interactive)\n` +
        `/balance — View all account balances\n` +
        `/history — View last 5 transactions\n` +
        `/undo — Revert your last transaction`,
      { parse_mode: "HTML" }
    );
  });

  // Command handlers
  bot.command("add", handleAddCommand);
  bot.command("balance", handleBalance);
  bot.command("history", handleHistory);
  bot.command("undo", handleUndo);

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
    console.error(`Error for ${ctx.updateType}:`, err);
  });

  return bot;
}
