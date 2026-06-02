"use client";

import type { Tweet } from "@/lib/types";
import { TweetCard } from "./TweetCard";

export function Feed({
  tweets,
  newIds,
}: {
  tweets: Tweet[];
  newIds: Set<string>;
}) {
  return (
    <section aria-label="Live feed" className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
          Live feed
        </h2>
        <span className="text-xs text-gray-600">{tweets.length} posts</span>
      </div>

      {tweets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-surface-border p-10 text-center text-sm text-gray-500">
          <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-accent" />
          Waiting for the first posts…
        </div>
      ) : (
        <div className="space-y-3">
          {tweets.map((t) => (
            <TweetCard key={t.id} tweet={t} isNew={newIds.has(t.id)} />
          ))}
        </div>
      )}
    </section>
  );
}
