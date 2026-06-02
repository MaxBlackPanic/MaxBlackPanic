/**
 * Server-Sent Events endpoint. Each connection:
 *   1. ensures the poller is running,
 *   2. immediately sends the latest N posts already in the DB (so the feed is
 *      populated on connect, no waiting for a poll),
 *   3. streams any newly-detected posts as the poller broadcasts them,
 *   4. cleans up its bus subscription + heartbeat when the client disconnects.
 *
 * SSE (not WebSockets) is deliberate: updates only flow server -> client, so a
 * one-way stream is simpler and sufficient.
 */
import { NextRequest } from "next/server";
import { subscribe } from "@/lib/bus";
import { getRecent } from "@/lib/db";
import { ensurePollerStarted } from "@/lib/poller";
import { getProvider } from "@/lib/providers";
import { config, FEED_LIMIT } from "@/lib/config";
import type { Tweet } from "@/lib/types";

// better-sqlite3 + long-lived stream => Node.js runtime, never static.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: NextRequest): Promise<Response> {
  ensurePollerStarted();

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Controller already closed (client gone mid-write).
          closed = true;
        }
      };

      // 1. Hello frame with metadata for the header UI.
      send(
        sseEvent("meta", {
          handle: config.handle,
          provider: getProvider().name,
          pollIntervalSeconds: config.pollIntervalSeconds,
        }),
      );

      // 2. Backfill: the latest posts already stored.
      const initial = getRecent(FEED_LIMIT);
      send(sseEvent("init", initial));

      // 3. Live updates from the poller.
      const unsubscribe = subscribe((tweets: Tweet[]) => {
        send(sseEvent("tweets", tweets));
      });

      // Heartbeat comment keeps proxies from closing an idle connection.
      const heartbeat = setInterval(() => send(`: ping\n\n`), 25_000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // 4. Clean up on client disconnect.
      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
