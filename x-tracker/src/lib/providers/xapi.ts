/**
 * XApiProvider — adapter for the official X API v2 user timeline endpoint:
 *   GET /2/users/:id/tweets
 *
 * Auth is an app-only Bearer token (X_BEARER_TOKEN). The flow is:
 *   1. Resolve the handle -> numeric user id via GET /2/users/by/username/:handle
 *      (cached after the first call, since it never changes).
 *   2. Fetch the user's recent tweets, requesting the fields we need to derive
 *      isRepost / isReply / isQuote from `referenced_tweets`.
 *
 * RATE-LIMIT REALITY: on the lower X API tiers the user-tweets endpoint is
 * heavily limited (historically as low as a few requests per 15-minute window
 * on Basic). A 45s poll can exhaust that quota quickly. In production you would
 * widen POLL_INTERVAL_SECONDS, honor the `x-rate-limit-reset` header, and/or
 * use a tier that permits filtered-stream push instead of polling. This adapter
 * surfaces 429s as thrown errors so the poller's backoff kicks in.
 */
import type { Tweet, TweetProvider } from "../types";
import { config } from "../config";

const API = "https://api.twitter.com/2";

interface XReferencedTweet {
  type: "retweeted" | "quoted" | "replied_to";
  id: string;
}

interface XTweetData {
  id: string;
  text: string;
  created_at?: string;
  referenced_tweets?: XReferencedTweet[];
}

interface XTimelineResponse {
  data?: XTweetData[];
  errors?: unknown;
}

interface XUserLookupResponse {
  data?: { id: string; username: string; name: string };
  errors?: unknown;
}

export class XApiProvider implements TweetProvider {
  name = "X API v2";

  private userIdCache = new Map<string, string>();

  constructor(private readonly bearerToken: string) {}

  private get authHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${this.bearerToken}`,
      Accept: "application/json",
    };
  }

  /** Resolve and cache the numeric user id for a handle. */
  private async resolveUserId(handle: string): Promise<string> {
    const cached = this.userIdCache.get(handle);
    if (cached) return cached;

    const res = await fetch(
      `${API}/users/by/username/${encodeURIComponent(handle)}`,
      { headers: this.authHeaders, cache: "no-store" },
    );
    if (!res.ok) {
      throw new Error(
        `X API user lookup failed: ${res.status} ${res.statusText}`,
      );
    }
    const json = (await res.json()) as XUserLookupResponse;
    const id = json.data?.id;
    if (!id) throw new Error(`X API: could not resolve handle @${handle}`);
    this.userIdCache.set(handle, id);
    return id;
  }

  async fetchRecent(handle: string, limit: number): Promise<Tweet[]> {
    const userId = await this.resolveUserId(handle);

    const url = new URL(`${API}/users/${userId}/tweets`);
    // max_results must be between 5 and 100 for this endpoint.
    url.searchParams.set("max_results", String(Math.min(Math.max(limit, 5), 100)));
    // Ask for the fields needed to classify each post.
    url.searchParams.set("tweet.fields", "created_at,referenced_tweets");
    // Exclude nothing by default; both retweets and replies are real posts.

    const res = await fetch(url, { headers: this.authHeaders, cache: "no-store" });

    if (res.status === 429) {
      const reset = res.headers.get("x-rate-limit-reset");
      throw new Error(
        `X API rate limited (429)${reset ? `; resets at epoch ${reset}` : ""}`,
      );
    }
    if (!res.ok) {
      throw new Error(`X API timeline failed: ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as XTimelineResponse;
    const data = json.data ?? [];

    return data.map((t) => mapTweet(t, handle));
  }
}

function mapTweet(t: XTweetData, handle: string): Tweet {
  const refs = t.referenced_tweets ?? [];
  const isRepost = refs.some((r) => r.type === "retweeted");
  const isQuote = refs.some((r) => r.type === "quoted");
  const isReply = refs.some((r) => r.type === "replied_to");

  return {
    id: t.id,
    text: t.text,
    createdAt: t.created_at
      ? new Date(t.created_at).toISOString()
      : new Date().toISOString(),
    url: `https://x.com/${handle}/status/${t.id}`,
    isRepost,
    isReply,
    isQuote,
  };
}

/** Factory helper: build only if the required env var is present. */
export function tryCreateXApi(): XApiProvider | null {
  if (!config.xBearerToken) return null;
  return new XApiProvider(config.xBearerToken);
}
