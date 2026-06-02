/**
 * In-process pub/sub bus connecting the poller (publisher) to all connected
 * SSE clients (subscribers). A single shared `Set` of listener callbacks lives
 * on `globalThis` so the poller and every stream route share one instance
 * across module reloads.
 */
import type { Tweet } from "./types";

type Listener = (tweets: Tweet[]) => void;

declare global {
  // eslint-disable-next-line no-var
  var __xtracker_listeners: Set<Listener> | undefined;
}

const listeners: Set<Listener> =
  globalThis.__xtracker_listeners ?? (globalThis.__xtracker_listeners = new Set());

/** Register an SSE client. Returns an unsubscribe function. */
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Broadcast newly-detected posts to every connected client. */
export function broadcast(tweets: Tweet[]): void {
  if (tweets.length === 0) return;
  for (const fn of listeners) {
    try {
      fn(tweets);
    } catch (err) {
      console.error("[bus] listener threw:", err);
    }
  }
}

/** Current number of connected clients (handy for status / debugging). */
export function listenerCount(): number {
  return listeners.size;
}
