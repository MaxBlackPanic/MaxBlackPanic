/**
 * Central, typed access to runtime configuration. Reading env vars in exactly
 * one place keeps defaults consistent and makes the supported knobs obvious.
 */

export type ProviderName = "mock" | "aggregator" | "xapi";

function str(key: string, fallback: string): string {
  const v = process.env[key];
  return v && v.trim().length > 0 ? v.trim() : fallback;
}

function int(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const config = {
  /** Which provider adapter to use. Defaults to the keyless mock. */
  provider: str("PROVIDER", "mock") as ProviderName,
  /** Account to track. Strips a leading "@" so either form works. */
  handle: str("TARGET_HANDLE", "elonmusk").replace(/^@/, ""),
  /** Seconds between poll ticks. */
  pollIntervalSeconds: int("POLL_INTERVAL_SECONDS", 45),

  // --- AggregatorProvider ---
  aggBaseUrl: process.env.AGG_BASE_URL ?? "",
  aggApiKey: process.env.AGG_API_KEY ?? "",

  // --- XApiProvider (official X API v2) ---
  xBearerToken: process.env.X_BEARER_TOKEN ?? "",
} as const;

/** How many posts to keep in the in-memory / initial-load window. */
export const FEED_LIMIT = 50;
