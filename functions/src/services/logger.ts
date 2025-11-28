import { logger } from "firebase-functions";

/**
 * Structured logger wrapper for Firebase Cloud Functions
 */
export const log = {
  info: (message: string, data?: object) => {
    logger.info(message, data);
  },

  warn: (message: string, data?: object) => {
    logger.warn(message, data);
  },

  error: (message: string, error?: Error, data?: object) => {
    logger.error(message, {
      error: error?.message,
      stack: error?.stack,
      ...data,
    });
  },
};
