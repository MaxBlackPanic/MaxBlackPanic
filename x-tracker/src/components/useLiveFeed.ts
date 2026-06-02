"use client";

/**
 * Client hook that owns the live connection state:
 *   - opens the SSE stream and keeps it reconnecting,
 *   - maintains the de-duplicated, newest-first list of posts,
 *   - tracks which post ids are "new" (just arrived) for the highlight anim,
 *   - exposes connection status + metadata for the header,
 *   - refetches analytics on mount and whenever new posts arrive.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Tweet } from "@/lib/types";
import type { AnalyticsPayload } from "@/app/api/analytics/route";

export type ConnStatus = "connecting" | "live" | "disconnected";

export interface FeedMeta {
  handle: string;
  provider: string;
  pollIntervalSeconds: number;
}

export interface LiveFeedState {
  tweets: Tweet[];
  newIds: Set<string>;
  status: ConnStatus;
  meta: FeedMeta | null;
  analytics: AnalyticsPayload | null;
  lastUpdated: number | null;
}

const MAX_TWEETS = 200;

export function useLiveFeed(): LiveFeedState {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [meta, setMeta] = useState<FeedMeta | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const seen = useRef<Set<string>>(new Set());
  const highlightTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const refetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch("/api/analytics", { cache: "no-store" });
      if (res.ok) setAnalytics((await res.json()) as AnalyticsPayload);
    } catch {
      /* transient; will retry on next update */
    }
  }, []);

  const mergeTweets = useCallback(
    (incoming: Tweet[], markNew: boolean) => {
      if (incoming.length === 0) return;
      const fresh = incoming.filter((t) => !seen.current.has(t.id));
      if (fresh.length === 0) return;
      for (const t of fresh) seen.current.add(t.id);

      setTweets((prev) => {
        const merged = [...fresh, ...prev].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        return merged.slice(0, MAX_TWEETS);
      });

      if (markNew) {
        setNewIds((prev) => {
          const next = new Set(prev);
          for (const t of fresh) next.add(t.id);
          return next;
        });
        // Clear the highlight after the animation window.
        for (const t of fresh) {
          const existing = highlightTimers.current.get(t.id);
          if (existing) clearTimeout(existing);
          const timer = setTimeout(() => {
            setNewIds((prev) => {
              const next = new Set(prev);
              next.delete(t.id);
              return next;
            });
            highlightTimers.current.delete(t.id);
          }, 6000);
          highlightTimers.current.set(t.id, timer);
        }
      }
    },
    [],
  );

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    // Capture the ref Map for cleanup so we don't read a possibly-changed ref.
    const timers = highlightTimers.current;

    const connect = () => {
      if (stopped) return;
      setStatus((s) => (s === "live" ? s : "connecting"));
      es = new EventSource("/api/stream");

      es.addEventListener("meta", (e) => {
        setMeta(JSON.parse((e as MessageEvent).data) as FeedMeta);
      });

      es.addEventListener("init", (e) => {
        const initial = JSON.parse((e as MessageEvent).data) as Tweet[];
        mergeTweets(initial, false);
        setStatus("live");
        setLastUpdated(Date.now());
        void refetchAnalytics();
      });

      es.addEventListener("tweets", (e) => {
        const incoming = JSON.parse((e as MessageEvent).data) as Tweet[];
        mergeTweets(incoming, true);
        setLastUpdated(Date.now());
        void refetchAnalytics();
      });

      es.onopen = () => setStatus("live");

      es.onerror = () => {
        setStatus("disconnected");
        es?.close();
        es = null;
        // EventSource auto-reconnects, but we recreate to re-run init backfill.
        if (!stopped && !reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
          }, 3000);
        }
      };
    };

    connect();

    return () => {
      stopped = true;
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, [mergeTweets, refetchAnalytics]);

  return { tweets, newIds, status, meta, analytics, lastUpdated };
}
