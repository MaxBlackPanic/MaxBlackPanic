/**
 * Provider factory — the single place that decides which data source is live.
 *
 * Reads PROVIDER and returns the matching adapter. If a non-mock provider is
 * selected but its required env vars are missing, we log a clear warning and
 * fall back to the mock so the app never hard-crashes. The chosen instance is
 * cached on `globalThis` so dev hot-reload / repeated imports reuse it.
 */
import type { TweetProvider } from "../types";
import { config } from "../config";
import { MockProvider } from "./mock";
import { tryCreateAggregator } from "./aggregator";
import { tryCreateXApi } from "./xapi";

declare global {
  // eslint-disable-next-line no-var
  var __xtracker_provider: TweetProvider | undefined;
}

function build(): TweetProvider {
  switch (config.provider) {
    case "aggregator": {
      const agg = tryCreateAggregator();
      if (agg) return agg;
      console.warn(
        "[provider] PROVIDER=aggregator but AGG_BASE_URL / AGG_API_KEY are " +
          "not set — falling back to mock provider.",
      );
      return new MockProvider();
    }
    case "xapi": {
      const x = tryCreateXApi();
      if (x) return x;
      console.warn(
        "[provider] PROVIDER=xapi but X_BEARER_TOKEN is not set — falling " +
          "back to mock provider.",
      );
      return new MockProvider();
    }
    case "mock":
      return new MockProvider();
    default:
      console.warn(
        `[provider] Unknown PROVIDER="${config.provider}" — falling back to mock.`,
      );
      return new MockProvider();
  }
}

export function getProvider(): TweetProvider {
  if (!globalThis.__xtracker_provider) {
    globalThis.__xtracker_provider = build();
    console.log(
      `[provider] active provider: ${globalThis.__xtracker_provider.name} ` +
        `(PROVIDER=${config.provider}, handle=@${config.handle})`,
    );
  }
  return globalThis.__xtracker_provider;
}
