"use client";

import { useEffect, useState } from "react";
import type { Tweet } from "@/lib/types";
import { absoluteTime, relativeTime } from "@/lib/time";

const BADGES: { key: keyof Tweet; label: string; cls: string }[] = [
  {
    key: "isRepost",
    label: "Repost",
    cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  },
  {
    key: "isReply",
    label: "Reply",
    cls: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  },
  {
    key: "isQuote",
    label: "Quote",
    cls: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  },
];

export function TweetCard({
  tweet,
  isNew,
}: {
  tweet: Tweet;
  isNew: boolean;
}) {
  // Keep relative time fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const activeBadges = BADGES.filter((b) => tweet[b.key]);

  return (
    <article
      className={[
        "group relative rounded-2xl border bg-surface-raised p-4 transition-colors duration-700 sm:p-5",
        isNew
          ? "animate-fade-slide-in border-accent/50 ring-1 ring-accent/30"
          : "border-surface-border hover:border-gray-600",
      ].join(" ")}
    >
      {isNew && (
        <span className="absolute -top-2 left-4 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black">
          new
        </span>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-2">
        {activeBadges.map((b) => (
          <span
            key={b.label}
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${b.cls}`}
          >
            {b.label}
          </span>
        ))}
        {activeBadges.length === 0 && (
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium text-gray-400 ring-1 ring-inset ring-white/10">
            Post
          </span>
        )}
      </div>

      <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-gray-100">
        {tweet.text}
      </p>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500">
        <time dateTime={tweet.createdAt} title={absoluteTime(tweet.createdAt)}>
          {relativeTime(tweet.createdAt)} · {absoluteTime(tweet.createdAt)}
        </time>
        <a
          href={tweet.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-accent transition-colors hover:bg-accent/10"
        >
          Open
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M7 17 17 7M9 7h8v8" />
          </svg>
        </a>
      </div>
    </article>
  );
}
