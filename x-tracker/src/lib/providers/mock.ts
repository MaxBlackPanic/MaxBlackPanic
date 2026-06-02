/**
 * MockProvider — generates plausible fake posts with no API keys required.
 *
 * This is what makes the whole app demoable out of the box. It maintains a
 * persistent in-memory timeline with STABLE ids so the poller's id-based
 * diffing works correctly: every poll returns the same recent posts, and only
 * occasionally is a brand-new post prepended (fresh id + newer timestamp) so
 * the live feed and analytics actually move while you watch. Default provider.
 */
import type { Tweet, TweetProvider } from "../types";

const SAMPLE_TEXTS = [
  "Exciting things coming soon. Stay tuned. 🚀",
  "Just shipped a major update to the platform.",
  "The future is going to be wild. In a good way.",
  "Great meeting with the team today. So much progress.",
  "Reading through your replies — incredible ideas in here.",
  "Production is hard. Worth it though.",
  "We're hiring engineers who love hard problems.",
  "This is the most important technology of our lifetime.",
  "Coffee, code, repeat. ☕",
  "Sometimes the simplest solution is the right one.",
  "Massive thanks to everyone supporting the mission.",
  "Working late tonight. Big launch tomorrow.",
  "AI is advancing faster than most people realize.",
  "Reliability over hype, always.",
  "Shipping > talking.",
];

const REPLY_PREFIXES = [
  "@somebody great point —",
  "@another_user exactly,",
  "Replying to the thread:",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface MintOptions {
  handle: string;
  createdAtMs: number;
}

let seq = 0;

function mint({ handle, createdAtMs }: MintOptions): Tweet {
  const id = `mock-${createdAtMs}-${seq++}`;
  const roll = Math.random();
  const isReply = roll < 0.18;
  const isRepost = !isReply && roll < 0.32;
  const isQuote = !isReply && !isRepost && roll < 0.42;

  let text: string;
  if (isReply) text = `${pick(REPLY_PREFIXES)} ${pick(SAMPLE_TEXTS)}`;
  else if (isRepost) text = `RT @someone: ${pick(SAMPLE_TEXTS)}`;
  else if (isQuote) text = `${pick(SAMPLE_TEXTS)} — couldn't agree more.`;
  else text = pick(SAMPLE_TEXTS);

  return {
    id,
    text,
    createdAt: new Date(createdAtMs).toISOString(),
    url: `https://x.com/${handle}/status/${createdAtMs}${id}`,
    isRepost,
    isReply,
    isQuote,
  };
}

/**
 * Persistent timeline, newest first. Seeded lazily on first fetch with a
 * believable backfill so the feed populates immediately on the first poll.
 */
let timeline: Tweet[] | null = null;

function seed(handle: string, count: number): Tweet[] {
  const out: Tweet[] = [];
  let t = Date.now() - 2 * 60 * 1000; // most recent ~2 min ago
  for (let i = 0; i < count; i++) {
    out.push(mint({ handle, createdAtMs: t }));
    // Backwards in time, 4–40 min between posts.
    t -= (4 + Math.floor(Math.random() * 36)) * 60 * 1000;
  }
  return out;
}

export class MockProvider implements TweetProvider {
  name = "Mock (demo data)";

  async fetchRecent(handle: string, limit: number): Promise<Tweet[]> {
    if (timeline === null) {
      timeline = seed(handle, Math.max(limit, 50));
    } else if (Math.random() < 0.6) {
      // ~60% of polls mint one (occasionally two) genuinely new posts, dated
      // just after the current newest so they sort to the top.
      const newest = new Date(timeline[0].createdAt).getTime();
      const newCount = Math.random() < 0.25 ? 2 : 1;
      for (let i = 0; i < newCount; i++) {
        const createdAtMs = Math.max(newest, Date.now()) + (i + 1) * 1000;
        timeline.unshift(mint({ handle, createdAtMs }));
      }
    }

    return timeline.slice(0, limit);
  }
}
