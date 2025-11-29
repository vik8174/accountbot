import { Markup } from "telegraf";
import { t } from "../i18n";

/**
 * Get main keyboard with localized command buttons
 * Displayed at the bottom of the chat
 */
export async function getMainKeyboard() {
  return Markup.keyboard([
    [await t("keyboard.history"), await t("keyboard.add")],
    [await t("keyboard.balance"), await t("keyboard.sync")],
  ]).resize();
}
