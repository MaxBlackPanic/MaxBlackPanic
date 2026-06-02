/**
 * Core domain types for the X tracker.
 *
 * Everything downstream of the provider layer speaks ONLY in terms of these
 * types. No part of the app outside `lib/providers/` should ever reference a
 * provider-specific field, response shape, or SDK. Swapping data sources means
 * adding one adapter file and flipping the PROVIDER env var — nothing else.
 */

/** A single normalized post, source-agnostic. */
export interface Tweet {
  /** Unique post id from the source. */
  id: string;
  text: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** Canonical link to the post. */
  url: string;
  isRepost: boolean;
  isReply: boolean;
  isQuote: boolean;
}

/**
 * The single seam between the app and any data source. Implement this once per
 * source (mock, aggregator, official API, …) and the rest of the app is
 * oblivious to which one is live.
 */
export interface TweetProvider {
  /** Human-readable provider name, surfaced in the UI. */
  name: string;
  /**
   * Fetch the most recent posts for `handle`, newest first, up to `limit`.
   * Implementations should be resilient and throw on unrecoverable errors so
   * the poller can apply backoff.
   */
  fetchRecent(handle: string, limit: number): Promise<Tweet[]>;
}
