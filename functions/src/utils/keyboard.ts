import { Markup } from "telegraf";

/**
 * Main keyboard with command buttons
 * Displayed at the bottom of the chat
 */
export const mainKeyboard = Markup.keyboard([
  ["/add", "/balance"],
  ["/history", "/undo"],
]).resize();
