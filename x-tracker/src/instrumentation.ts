/**
 * Next.js instrumentation hook — runs once when the server process boots.
 * We use it to start the single background poller as early as possible so the
 * feed is being populated even before the first client connects.
 *
 * Requires `experimental.instrumentationHook` on Next 14 (enabled below in
 * next.config via the App Router default for 14.2). The poller itself is
 * singleton-guarded, so this is also safe if a stream route starts it first.
 */
export async function register(): Promise<void> {
  // Only run in the Node.js server runtime (not edge / browser).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensurePollerStarted } = await import("./lib/poller");
    ensurePollerStarted();
  }
}
