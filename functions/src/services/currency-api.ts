import { CurrencyCode } from "../types";
import { log } from "./logger";

const FRANKFURTER_API = "https://api.frankfurter.dev/v1";

interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

/**
 * Get exchange rate between two currencies.
 * Returns rate: 1 base = X target.
 * Returns null if API call fails.
 */
export async function getExchangeRate(
  base: CurrencyCode,
  target: CurrencyCode
): Promise<number | null> {
  if (base === target) {
    return 1;
  }

  try {
    const url = `${FRANKFURTER_API}/latest?base=${base}&symbols=${target}`;
    const response = await fetch(url);

    if (!response.ok) {
      log.error("Frankfurter API error", undefined, {
        status: response.status,
        base,
        target,
      });
      return null;
    }

    const data = (await response.json()) as FrankfurterResponse;
    const rate = data.rates[target];

    if (rate === undefined) {
      log.error("Exchange rate not found in response", undefined, {
        base,
        target,
        rates: data.rates,
      });
      return null;
    }

    log.info("Exchange rate fetched", {
      base,
      target,
      rate,
      date: data.date,
    });

    return rate;
  } catch (error) {
    log.error("Failed to fetch exchange rate", error as Error, {
      base,
      target,
    });
    return null;
  }
}

/**
 * Convert amount from one currency to another.
 * Amount is in minor units (cents/kopiykas).
 * Returns converted amount in minor units and the rate used.
 * Returns null if API call fails.
 */
export async function convertCurrency(
  amountMinor: number,
  from: CurrencyCode,
  to: CurrencyCode
): Promise<{ amountMinor: number; rate: number } | null> {
  const rate = await getExchangeRate(from, to);

  if (rate === null) {
    return null;
  }

  // Convert: minor units -> major units -> convert -> minor units
  // This avoids floating point issues with large minor unit values
  const amountMajor = amountMinor / 100;
  const convertedMajor = amountMajor * rate;
  const convertedMinor = Math.round(convertedMajor * 100);

  return {
    amountMinor: convertedMinor,
    rate,
  };
}

/**
 * Format exchange rate for display.
 * Example: "1 EUR = 1.105 USD"
 */
export function formatExchangeRate(
  rate: number,
  from: CurrencyCode,
  to: CurrencyCode
): string {
  const formattedRate = rate.toFixed(4).replace(/\.?0+$/, "");
  return `1 ${from} = ${formattedRate} ${to}`;
}
