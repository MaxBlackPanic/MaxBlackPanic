/**
 * The single server-side poller.
 *
 * On each tick it asks the active provider for the most recent posts, inserts
 * only genuinely new ones (id-based diff in SQLite), and broadcasts the new
 * arrivals to all SSE clients. It is hardened so a single failed poll can never
 * kill the loop: every tick is wrapped in try/catch and repeated failures apply
 * exponential backoff before resuming the normal cadence.
 *
 * CRITICAL: exactly one poller must run per server process. Next.js can
 * evaluate a module multiple times (dev double-mount, route bundling), so the
 * running state is guarded by a singleton flag on `globalThis`.
 */
import { config, FEED_LIMIT } from "./config";
import { getProvider } from "./providers";
import { insertIfNew } from "./db";
import { broadcast } from "./bus";
import type { Tweet } from "./types";

interface PollerState {
  started: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  consecutiveFailures: number;
  lastPollAt: string | null;
  lastError: string | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __xtracker_poller: PollerState | undefined;
}

const state: PollerState =
  globalThis.__xtracker_poller ??
  (globalThis.__xtracker_poller = {
    started: false,
    timer: null,
    consecutiveFailures: 0,
    lastPollAt: null,
    lastError: null,
  });

const BASE_INTERVAL_MS = config.pollIntervalSeconds * 1000;
const MAX_BACKOFF_MS = 10 * 60 * 1000; // cap backoff at 10 minutes

/** One poll cycle. Returns the list of genuinely-new posts (may be empty). */
async function pollOnce(): Promise<Tweet[]> {
  const provider = getProvider();
  const fetched = await provider.fetchRecent(config.handle, FEED_LIMIT);

  // Insert oldest-first so created_at ordering is natural, then collect the
  // ones that were actually new.
  const ascending = [...fetched].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const fresh: Tweet[] = [];
  for (const t of ascending) {
    if (insertIfNew(t)) fresh.push(t);
  }
  return fresh;
}

function scheduleNext(delayMs: number): void {
  state.timer = setTimeout(tick, delayMs);
  // Don't keep the event loop alive solely for the poller.
  if (typeof state.timer === "object" && "unref" in state.timer) {
    (state.timer as { unref: () => void }).unref();
  }
}

async function tick(): Promise<void> {
  let delay = BASE_INTERVAL_MS;
  try {
    const fresh = await pollOnce();
    state.consecutiveFailures = 0;
    state.lastError = null;
    state.lastPollAt = new Date().toISOString();

    if (fresh.length > 0) {
      // Broadcast newest-first so clients prepend in the right order.
      const newestFirst = [...fresh].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      broadcast(newestFirst);
      console.log(`[poller] +${fresh.length} new post(s)`);
    }
  } catch (err) {
    state.consecutiveFailures += 1;
    state.lastError = err instanceof Error ? err.message : String(err);
    // Exponential backoff: base * 2^failures, capped.
    delay = Math.min(
      BASE_INTERVAL_MS * 2 ** state.consecutiveFailures,
      MAX_BACKOFF_MS,
    );
    console.error(
      `[poller] poll failed (#${state.consecutiveFailures}), retrying in ` +
        `${Math.round(delay / 1000)}s:`,
      state.lastError,
    );
  } finally {
    scheduleNext(delay);
  }
}

/** Idempotently start the poller. Safe to call from many places. */
export function ensurePollerStarted(): void {
  if (state.started) return;
  state.started = true;
  console.log(
    `[poller] starting (interval=${config.pollIntervalSeconds}s, ` +
      `handle=@${config.handle})`,
  );
  // Fire the first tick immediately so the DB populates without waiting a full
  // interval, then settle into the regular cadence.
  void tick();
}

/** Read-only snapshot of poller health for status surfaces. */
export function getPollerStatus(): Readonly<PollerState> {
  return state;
}
