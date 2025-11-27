import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { createBot } from "./bot";

// Define secret for Telegram bot token
const telegramToken = defineSecret("TELEGRAM_BOT_TOKEN");

/**
 * Telegram webhook handler
 */
export const telegramBot = onRequest(
  {
    secrets: [telegramToken],
    region: "europe-west1",
  },
  async (req, res) => {
    try {
      const token = telegramToken.value();

      if (!token) {
        console.error("TELEGRAM_BOT_TOKEN is not set");
        res.status(500).send("Bot token not configured");
        return;
      }

      const bot = createBot(token);

      // Handle the update
      await bot.handleUpdate(req.body);

      res.status(200).send("OK");
    } catch (error) {
      console.error("Error handling update:", error);
      res.status(500).send("Error");
    }
  }
);
