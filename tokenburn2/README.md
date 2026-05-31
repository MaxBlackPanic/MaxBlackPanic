# 🔥 TokenBurn 2.0

A clean-room **React + Vite + TypeScript** rebuild of TokenBurn. See what an LLM
prompt will cost **before** you send it — input cost, likely total, and
worst-case total — then get specific, dollar-quantified ways to spend less.

> This app lives in its own directory (`tokenburn2/`) and is fully independent
> of the original TokenBurn (Next.js) app at the repository root.

TokenBurn 2.0 has one job and tries to do it honestly:

- **Simple.** One screen, one number you can trust.
- **Accurate.** Exact counts where the provider allows them; everything else is
  clearly labelled as an estimate (with a range, never a false point value).

> Multimodal inputs (images, audio, files) are out of scope in v2 — counts cover
> text only.

## How counting works

| Provider           | Method                                   | Accuracy                           |
| ------------------ | ---------------------------------------- | ---------------------------------- |
| OpenAI             | `js-tiktoken` (`o200k_base`), in-browser | **Exact**, instant, no network     |
| Anthropic / Gemini | Serverless proxy → vendor count endpoint | **Exact** when proxy is configured |
| Anthropic / Gemini | Offline char-ratio fallback              | **≈ Estimate** (shown with range)  |

A small per-turn chat overhead (`~4 tokens/turn`) is added to the input total.

Your prompt never leaves your browser except, optionally, to **your own**
serverless proxy — never to a third party directly from the browser. API keys
are read server-side only and are **never** stored in the browser.

## The cost model

```
cost = (inputTokens × inputRate + outputTokens × outputRate) / 1_000_000
```

- **Input cost** — from the (exact or estimated) input token count.
- **Likely total** — input + `expectedOutput × outputRate`. The expected-output
  figure is a forecast, so this is always an estimate.
- **Worst case** — input + `maxTokens × outputRate`. The ceiling, derived solely
  from your max output cap. Shown in a muted/warning treatment so it never reads
  as a quote.

Adjustments:

- **Cache** — a cached prefix is billed at the model's cache-read rate:
  `cachedTokens × cacheRate + (inputTokens − cachedTokens) × inputRate`.
- **Batch** — applies a 50% multiplier to both input and output rates.
- **Context tier** — some models (e.g. Gemini 3.1 Pro) switch to a higher rate
  above a token threshold; this is applied automatically.

A **calls-per-month** field turns the per-call cost into a monthly budget figure.

## Getting started

```bash
cd tokenburn2
npm install
npm run dev      # http://localhost:5173
npm test         # run the unit tests (cost / tokens / suggestions / format)
npm run build    # type-check + production build
```

With no proxy configured the app works fully offline; Anthropic/Gemini counts
are shown as labelled estimates.

## The optional proxy (exact Anthropic / Gemini counts)

The single serverless function in [`api/count.ts`](api/count.ts) calls the
vendor token-count endpoints with a server-side key, so exact counts are
possible without exposing the key or the prompt to a third party from the
browser.

It is a standard Web `Request`/`Response` handler and deploys as a Vercel or
Netlify Edge function with no extra dependencies.

### Configure keys

Set these as **server-side environment variables** on your host (never in the
browser, never committed). See [`.env.example`](.env.example):

| Variable            | Purpose                                          |
| ------------------- | ------------------------------------------------ |
| `ANTHROPIC_API_KEY` | Enables exact Anthropic counts                   |
| `GEMINI_API_KEY`    | Enables exact Gemini counts                      |
| `APP_ORIGIN`        | Exact origin allowed by CORS, e.g. `https://...` |

If a provider's key is missing, the proxy returns `{ tokens: 0, exact: false }`
and the client falls back to its offline estimate. CORS is locked to
`APP_ORIGIN`.

### Local development with the proxy

Run the function locally (e.g. `vercel dev`) and point Vite at it:

```bash
PROXY_TARGET=http://localhost:3000 npm run dev
```

Vite proxies `/api/*` to `PROXY_TARGET` (default `http://localhost:3000`).

## Updating pricing

All pricing lives in one file: [`src/pricing.ts`](src/pricing.ts). There is no
database. Rates are **USD per million tokens**.

When vendor rates change:

1. Update the relevant `inputRate` / `outputRate` / `cacheReadRate` (and tier
   fields) in the `MODELS` array.
2. Bump `PRICING_VERIFIED` to today's date. The UI displays this date next to
   the result so users know how fresh the numbers are.
3. Run `npm test` — the calculation tests assert known figures (e.g. 1,000,000
   input tokens on Claude Sonnet = **$3.00**) and will catch typos.

To add a model, append an entry to `MODELS` with the correct `provider` and
`tokeniser` (`tiktoken-o200k`, `anthropic-endpoint`, or `gemini-endpoint`).

## Project layout

```
api/count.ts            Serverless proxy (Anthropic count_tokens / Gemini countTokens)
src/pricing.ts          Single source of truth for models and rates
src/cost.ts             Pure, unit-tested cost calculation
src/cost.test.ts        Hand-checked cost assertions
src/tokens.ts           Token counting (tiktoken / proxy / offline estimate)
src/tokens.test.ts      Token counting tests
src/suggestions.ts      Dollar-quantified savings suggestions
src/suggestions.test.ts Suggestion engine tests
src/format.ts           Display formatting helpers
src/format.test.ts      Formatting tests
src/App.tsx             The single screen
src/components/         Cost headline, suggestions, details panel
```

## Accuracy & honesty rules

- Every number is labelled **exact** or **estimate**. Exact only for OpenAI
  tiktoken counts and live vendor-endpoint counts.
- All output forecasts are estimates and are shown as such.
- The worst-case figure is always present and clearly the upper bound.
- The pricing "verified on" date is shown near the result.
