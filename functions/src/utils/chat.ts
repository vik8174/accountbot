import { Context } from "telegraf";

/**
 * Check if context is from a forum topic
 * Forum topics are supergroups with message_thread_id
 */
export function isForumTopic(ctx: Context): boolean {
  // Check both regular messages and callback queries
  let messageThreadId: number | undefined;

  if (ctx.message && "message_thread_id" in ctx.message) {
    messageThreadId = ctx.message.message_thread_id;
  } else if (ctx.callbackQuery?.message && "message_thread_id" in ctx.callbackQuery.message) {
    messageThreadId = ctx.callbackQuery.message.message_thread_id;
  }

  return ctx.chat?.type === "supergroup" && messageThreadId !== undefined;
}

/**
 * Check if context is from a private chat
 */
export function isPrivateChat(ctx: Context): boolean {
  return ctx.chat?.type === "private";
}
