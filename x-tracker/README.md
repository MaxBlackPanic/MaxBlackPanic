# X Tracker — live feed

A production-shaped, **source-agnostic** web app that tracks a single X (Twitter)
account's posts in near real time, streams new posts to the browser live, and
shows simple analytics. Default target: **@elonmusk** (configurable). It runs
end-to-end with **zero API keys** out of the box using a built-in mock provider.

![stack](https://img.shields.io/badge/Next.js-App%20Router-black) ![ts](https://img.shields.io/badge/TypeScript-strict-blue) ![sse](https://img.shields.io/badge/transport-SSE-green)

## Run it

```bash
cd x-tracker
npm install
npm run dev
# open http://localhost:3000
```

That's it — no keys, no external database. The mock provider mints plausible
posts on each poll, so the feed populates immediately and keeps moving while you
watch. A SQLite file is created at `data/tweets.db` on first run.

## How it works (in three paragraphs)

**Provider layer.** Every data source sits behind one interface, `TweetProvider`
(`src/lib/types.ts`). A factory (`src/lib/providers/index.ts`) reads the
`PROVIDER` env var and returns the matching adapter — `MockProvider`,
`AggregatorProvider`, or `XApiProvider`. Nothing else in the app knows which
source is live; swapping sources means changing one env var and, for a brand-new
source, adding one adapter file. If a non-mock provider is missing its keys, the
factory logs a warning and falls back to mock so the app never hard-crashes.

**Polling + diffing.** A single server-side poller (`src/lib/poller.ts`, started
once at boot via `src/instrumentation.ts` and guarded by a `globalThis`
singleton) ticks every `POLL_INTERVAL_SECONDS`. Each tick calls
`provider.fetchRecent(handle, 50)`, inserts only genuinely new posts into SQLite
(id-based diff, `src/lib/db.ts`), and broadcasts the new arrivals over an
in-process bus. Failures are caught per-tick and trigger exponential backoff, so
one bad poll never kills the loop.

**Live delivery + UI.** The browser opens a Server-Sent Events stream
(`src/app/api/stream/route.ts`). On connect it receives the latest posts already
in the DB (instant populate), then receives each new post as the poller finds
it. SSE — not WebSockets — is used deliberately: updates only flow
server → client, so a one-way stream is simpler and sufficient. The dashboard
(`src/app/page.tsx`) renders a reverse-chronological feed with new-post highlight
animations and an analytics panel (posts today / last hour / avg per day + a
Recharts bar chart of posts per hour over the last 24h), all refreshed as posts
arrive.

## Switching providers

Set `PROVIDER` (and the relevant keys) in `.env.local` — see `.env.example`:

| `PROVIDER`   | What it does                                    | Required env vars            |
| ------------ | ----------------------------------------------- | ---------------------------- |
| `mock`       | Generated demo data, no keys (default)          | —                            |
| `aggregator` | Generic third-party aggregator REST API         | `AGG_BASE_URL`, `AGG_API_KEY`|
| `xapi`       | Official X API v2 user-timeline endpoint        | `X_BEARER_TOKEN`             |

- **Aggregator:** open `src/lib/providers/aggregator.ts` and adjust the two
  `>>> PLUG IN HERE` spots — the request URL/auth and the `mapItem()` JSON →
  `Tweet` mapping — to match your aggregator (twitterapi.io / socialdata.tools
  style). Everything else is already wired.
- **Official X API:** set `X_BEARER_TOKEN`. The adapter resolves the handle to a
  numeric user id, then polls `GET /2/users/:id/tweets`.

To add a totally new source, implement `TweetProvider` in one new file and wire
one `case` into the factory. No other file changes.

## Honest notes

- **"Real time" = polling**, not push. New posts appear within one
  `POLL_INTERVAL_SECONDS` cycle (default 45s), not the instant they're posted.
- **Scraping X directly violates its Terms of Service.** This app does not
  scrape. The supported routes are a licensed third-party **aggregator** or the
  **official X API**; the mock provider is for local development and demos.
- **Rate limits are real.** Lower official X API tiers permit only a handful of
  timeline requests per 15-minute window — widen `POLL_INTERVAL_SECONDS`
  accordingly. The X adapter surfaces 429s so the poller backs off automatically.

## Project structure

```
x-tracker/
├─ src/
│  ├─ app/
│  │  ├─ page.tsx                 # dashboard (client)
│  │  ├─ layout.tsx
│  │  ├─ globals.css
│  │  └─ api/
│  │     ├─ stream/route.ts       # SSE endpoint
│  │     └─ analytics/route.ts    # analytics snapshot
│  ├─ components/                 # Header, Feed, TweetCard, Analytics, hook
│  ├─ lib/
│  │  ├─ types.ts                 # Tweet + TweetProvider interfaces
│  │  ├─ config.ts                # typed env access
│  │  ├─ db.ts                    # SQLite (better-sqlite3) helpers
│  │  ├─ poller.ts                # singleton polling + diffing engine
│  │  ├─ bus.ts                   # in-process pub/sub for SSE
│  │  └─ providers/               # mock | aggregator | xapi + factory
│  └─ instrumentation.ts          # starts the poller at server boot
└─ .env.example
```
