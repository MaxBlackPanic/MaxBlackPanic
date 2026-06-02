/**
 * AggregatorProvider — generic adapter for a third-party aggregator REST API
 * (e.g. twitterapi.io / socialdata.tools and friends).
 *
 * Aggregators all differ in their exact endpoint paths and JSON shapes, so this
 * adapter is intentionally written to be edited in ONE place. Everything the
 * app needs is normalized into the `Tweet` interface below. The two things you
 * will almost certainly need to change for your chosen aggregator are clearly
 * marked with `>>> PLUG IN HERE` comments:
 *
 *   1. The request URL + auth header (the endpoint path & query params).
 *   2. The `mapItem()` function (how each raw JSON post maps onto `Tweet`).
 */
import type { Tweet, TweetProvider } from "../types";
import { config } from "../config";

/**
 * Loose shape of one raw post from a generic aggregator. Fields are optional
 * because every provider names things slightly differently — `mapItem` decides
 * which ones to read. This is the only place `unknown`-ish data lives; it is
 * narrowed before it ever leaves the provider.
 */
interface RawAggregatorPost {
  id?: string | number;
  id_str?: string;
  tweet_id?: string;
  text?: string;
  full_text?: string;
  content?: string;
  created_at?: string;
  date?: string;
  url?: string;
  permalink?: string;
  // Type flags vary wildly between aggregators:
  is_retweet?: boolean;
  retweeted?: boolean;
  is_reply?: boolean;
  in_reply_to_status_id?: string | null;
  is_quote?: boolean;
  is_quote_status?: boolean;
}

export class AggregatorProvider implements TweetProvider {
  name = "Aggregator API";

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async fetchRecent(handle: string, limit: number): Promise<Tweet[]> {
    // >>> PLUG IN HERE (1/2): endpoint path, query params, and auth.
    // Replace the path/params below with your aggregator's documented route.
    // Common patterns: `/v1/tweets?username=...` or `/user/last_tweets?...`.
    const url = new URL(`${this.baseUrl.replace(/\/$/, "")}/v1/tweets`);
    url.searchParams.set("username", handle);
    url.searchParams.set("limit", String(limit));

    const res = await fetch(url, {
      headers: {
        // Many aggregators use `X-API-Key`; some use `Authorization: Bearer`.
        // Adjust to match your provider's docs.
        "X-API-Key": this.apiKey,
        Accept: "application/json",
      },
      // Never cache a live feed.
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(
        `Aggregator request failed: ${res.status} ${res.statusText}`,
      );
    }

    const json: unknown = await res.json();

    // >>> PLUG IN HERE (2/2): locate the array of posts in the response.
    // Some APIs return `{ data: [...] }`, others `{ tweets: [...] }` or a bare
    // array. Adjust `extractItems` to match.
    const items = extractItems(json);
    return items.map((item) => mapItem(item, handle));
  }
}

/** Pull the list of raw posts out of whatever envelope the API uses. */
function extractItems(json: unknown): RawAggregatorPost[] {
  if (Array.isArray(json)) return json as RawAggregatorPost[];
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    for (const key of ["data", "tweets", "results", "statuses"]) {
      if (Array.isArray(obj[key])) return obj[key] as RawAggregatorPost[];
    }
  }
  return [];
}

/** Map one raw aggregator post onto the normalized `Tweet`. Edit freely. */
function mapItem(raw: RawAggregatorPost, handle: string): Tweet {
  const id = String(raw.id_str ?? raw.tweet_id ?? raw.id ?? "");
  const text = raw.text ?? raw.full_text ?? raw.content ?? "";
  const createdAtRaw = raw.created_at ?? raw.date ?? new Date().toISOString();

  const isRepost = Boolean(raw.is_retweet ?? raw.retweeted ?? false);
  const isReply = Boolean(
    raw.is_reply ?? (raw.in_reply_to_status_id != null && raw.in_reply_to_status_id !== ""),
  );
  const isQuote = Boolean(raw.is_quote ?? raw.is_quote_status ?? false);

  return {
    id,
    text,
    // Normalize to ISO 8601. `new Date(...)` handles both ISO and the legacy
    // Twitter "ddd MMM DD HH:mm:ss +0000 YYYY" format on V8.
    createdAt: toIso(createdAtRaw),
    url:
      raw.url ??
      raw.permalink ??
      (id ? `https://x.com/${handle}/status/${id}` : `https://x.com/${handle}`),
    isRepost,
    isReply,
    isQuote,
  };
}

function toIso(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** Factory helper: build only if the required env vars are present. */
export function tryCreateAggregator(): AggregatorProvider | null {
  if (!config.aggBaseUrl || !config.aggApiKey) return null;
  return new AggregatorProvider(config.aggBaseUrl, config.aggApiKey);
}
