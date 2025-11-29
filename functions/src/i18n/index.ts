import { getRemoteConfig } from "firebase-admin/remote-config";
import { uk } from "./uk";
import { en } from "./en";

const translations = { uk, en };

/**
 * ISO 639-1 language codes
 */
type LanguageCode = "uk" | "en";

let cachedLang: LanguageCode | null = null;

/**
 * Get current language from Firebase Remote Config
 * Cached for performance (clears on cold start)
 */
export async function getLanguage(): Promise<LanguageCode> {
  if (cachedLang) return cachedLang;

  try {
    const rc = getRemoteConfig();
    const template = await rc.getTemplate();
    const param = template.parameters["bot_language"];
    const lang = (param?.defaultValue as { value?: string })?.value || "uk";

    cachedLang = (lang === "en" ? "en" : "uk") as LanguageCode;
  } catch {
    // Fallback to Ukrainian if Remote Config is not configured
    cachedLang = "uk";
  }

  return cachedLang;
}

/**
 * Clear language cache (useful for testing)
 */
export function clearLanguageCache(): void {
  cachedLang = null;
}

/**
 * Translate a key to current language
 * @param key - Dot-separated path (e.g., "add.selectAccount")
 * @param params - Optional parameters for placeholders (e.g., {name: "John"})
 * @returns Translated string or key if not found
 */
export async function t(
  key: string,
  params?: Record<string, string | number>
): Promise<string> {
  const lang = await getLanguage();

  // Get nested value by key path: "add.selectAccount"
  const keys = key.split(".");
  let value: unknown = translations[lang];
  for (const k of keys) {
    value = (value as Record<string, unknown>)?.[k];
  }

  if (typeof value !== "string") return key; // fallback to key

  // Replace {param} placeholders
  if (params) {
    return value.replace(/\{(\w+)\}/g, (_, p: string) => {
      const replacement = params[p];
      return replacement !== undefined ? String(replacement) : `{${p}}`;
    });
  }

  return value;
}

/**
 * Get an array translation by key
 * @param key - Dot-separated path (e.g., "months.short")
 * @returns String array or empty array if not found
 */
export async function tArray(key: string): Promise<string[]> {
  const lang = await getLanguage();

  const keys = key.split(".");
  let value: unknown = translations[lang];
  for (const k of keys) {
    value = (value as Record<string, unknown>)?.[k];
  }

  if (Array.isArray(value)) {
    return value as string[];
  }

  return [];
}
