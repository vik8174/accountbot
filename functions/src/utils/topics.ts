import { Context } from "telegraf";

/**
 * Get message thread ID from context (for forum/topic support)
 * Returns undefined if not in a topic
 */
export function getMessageThreadId(ctx: Context): number | undefined {
  // Try ctx.message first (for regular messages and commands)
  if (ctx.message && "message_thread_id" in ctx.message) {
    return ctx.message.message_thread_id;
  }

  // Try ctx.callbackQuery.message (for inline button clicks)
  if (ctx.callbackQuery?.message && "message_thread_id" in ctx.callbackQuery.message) {
    return ctx.callbackQuery.message.message_thread_id;
  }

  return undefined;
}

/**
 * Get extra options for sending messages (includes topic support)
 */
export function getTopicOptions(ctx: Context): { message_thread_id?: number } {
  const messageThreadId = getMessageThreadId(ctx);
  return messageThreadId ? { message_thread_id: messageThreadId } : {};
}
