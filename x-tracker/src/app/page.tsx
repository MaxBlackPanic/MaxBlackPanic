"use client";

import { useLiveFeed } from "@/components/useLiveFeed";
import { Header } from "@/components/Header";
import { Feed } from "@/components/Feed";
import { Analytics } from "@/components/Analytics";

export default function Dashboard() {
  const { tweets, newIds, status, meta, analytics, lastUpdated } =
    useLiveFeed();

  return (
    <div className="min-h-screen">
      <Header meta={meta} status={status} lastUpdated={lastUpdated} />

      <main className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_360px]">
        {/* Feed first in DOM for mobile, analytics sticks on the side at lg. */}
        <div className="order-2 lg:order-1">
          <Feed tweets={tweets} newIds={newIds} />
        </div>

        <aside className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-20">
            <Analytics data={analytics} />
          </div>
        </aside>
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-10 pt-2 text-center text-xs text-gray-600 sm:px-6">
        “Real time” means polling at the configured interval — not push.
        Source-agnostic: swap providers via the <code className="text-gray-500">PROVIDER</code> env var.
      </footer>
    </div>
  );
}
