import { Markup, Context } from "telegraf";
import { t } from "../i18n";
import { isForumTopic } from "./chat";

/**
 * Get main keyboard with localized command buttons
 * Displayed at the bottom of the chat
 */
export async function getMainKeyboard() {
  return Markup.keyboard([
    [await t("keyboard.history"), await t("keyboard.add")],
    [await t("keyboard.balance"), await t("keyboard.transfer")],
    [await t("keyboard.sync"), await t("keyboard.cancel")],
  ]).resize().selective(false);
}

/**
 * Get main inline keyboard with command buttons
 * Used in forum topics where reply keyboard doesn't work
 */
export async function getMainInlineKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(await t("keyboard.history"), "cmd:history"),
      Markup.button.callback(await t("keyboard.add"), "cmd:add"),
    ],
    [
      Markup.button.callback(await t("keyboard.balance"), "cmd:balance"),
      Markup.button.callback(await t("keyboard.transfer"), "cmd:transfer"),
    ],
    [
      Markup.button.callback(await t("keyboard.sync"), "cmd:sync"),
      Markup.button.callback(await t("keyboard.cancel"), "cmd:cancel"),
    ],
  ]);
}

/**
 * Get appropriate keyboard based on chat type
 * Reply keyboard for private/groups, inline for topics
 */
export async function getAdaptiveKeyboard(ctx: Context) {
  if (isForumTopic(ctx)) {
    return await getMainInlineKeyboard();
  }
  return await getMainKeyboard(); // Existing reply keyboard
}
