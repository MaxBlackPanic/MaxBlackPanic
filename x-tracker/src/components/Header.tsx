"use client";

import { useEffect, useState } from "react";
import type { ConnStatus, FeedMeta } from "./useLiveFeed";
import { relativeTime } from "@/lib/time";

const STATUS_META: Record<
  ConnStatus,
  { label: string; dot: string; ring: string }
> = {
  live: { label: "Live", dot: "bg-emerald-400", ring: "bg-emerald-400/30" },
  connecting: { label: "Connecting", dot: "bg-amber-400", ring: "bg-amber-400/30" },
  disconnected: { label: "Disconnected", dot: "bg-rose-500", ring: "bg-rose-500/30" },
};

export function Header({
  meta,
  status,
  lastUpdated,
}: {
  meta: FeedMeta | null;
  status: ConnStatus;
  lastUpdated: number | null;
}) {
  // Re-render the "updated Xs ago" label every second.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const s = STATUS_META[status];
  const handle = meta?.handle ?? "…";

  return (
    <header className="sticky top-0 z-10 border-b border-surface-border bg-surface/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-lg font-black text-black">
            𝕏
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-white">
                @{handle}
              </span>
              <span className="hidden text-xs text-gray-500 sm:inline">
                live tracker
              </span>
            </div>
            <div className="text-xs text-gray-500">
              {meta ? (
                <>
                  via{" "}
                  <span className="font-medium text-gray-400">
                    {meta.provider}
                  </span>{" "}
                  · polling every {meta.pollIntervalSeconds}s
                </>
              ) : (
                "initializing…"
              )}
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-4">
          {lastUpdated && (
            <span className="hidden text-xs text-gray-500 sm:inline">
              updated {relativeTime(new Date(lastUpdated).toISOString())}
            </span>
          )}
          <div className="flex items-center gap-2 rounded-full border border-surface-border bg-surface-raised px-3 py-1.5">
            <span className="relative flex h-2.5 w-2.5">
              {status === "live" && (
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full ${s.ring}`}
                />
              )}
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${s.dot}`}
              />
            </span>
            <span className="text-xs font-medium text-gray-300">{s.label}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
