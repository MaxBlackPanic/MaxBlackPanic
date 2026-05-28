# TokenBurn

[![CI](https://github.com/MaxBlackPanic/MaxBlackPanic/actions/workflows/ci.yml/badge.svg)](https://github.com/MaxBlackPanic/MaxBlackPanic/actions/workflows/ci.yml)

**TokenBurn** is an AI token-burn calculator that:

- predicts how many tokens a given prompt will consume across every major frontier model,
- estimates the dollar cost of running that prompt under standard, batch, and cached-input
  pricing tiers,
- analyses the prompt for efficiency and returns concrete, ranked rewriting suggestions
  that reduce token burn without degrading task quality, and
- lets you compare a "before" prompt against an "after" prompt to quantify the saving in
  tokens, dollars, and latency.

The numbers are accurate enough that a finance team or platform engineer can trust them for
monthly budget forecasting. OpenAI counts are bit-exact (`gpt-tokenizer`); Anthropic and
Gemini counts use calibrated empirical models and can be cross-checked against the vendor
`count_tokens` / `countTokens` endpoints on the `/calibration` page.

## Stack

- Next.js 14 (App Router) + TypeScript strict
- Tailwind CSS + shadcn-style component primitives
- Zustand for client state
- Recharts for visualisations
- Monaco for the prompt editor
- vitest for the test suite

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # production build
npm test             # full test suite
npm run typecheck    # tsc --noEmit
```

No API keys are required to use the app. Tokenisation runs entirely client-side; vendor
exact-count endpoints are only called when you explicitly opt in on the Settings panel and
paste a session-scoped API key.

## Deploying to Vercel

The repo includes `vercel.json` and is ready to deploy with the default Next.js preset.

### One-time setup

1. `npm i -g vercel` (or use `npx vercel ...` ad-hoc).
2. `vercel login` and authenticate with the account that should own the deployment.
3. From the repo root: `vercel link` — answer **N** when asked if an existing project exists, then accept the defaults for framework (Next.js), root directory (`./`), build command (`next build`), output directory (default).

### Deploy

```bash
vercel              # preview deploy (gets a unique URL)
vercel --prod       # production deploy (gets your project's main URL)
```

No environment variables are required — TokenBurn has zero server-side secrets. All tokenisation runs in the browser; vendor count-token API keys (Anthropic, Google) are entered by the user at runtime and held in session memory only.

### Auto-deploy from GitHub

Connect the repo via the Vercel dashboard (Add New… → Project → Import Git Repository). Once linked:

- Every push to `main` triggers a production deploy.
- Every PR triggers a preview deploy with a unique URL Vercel comments on the PR.

The CI workflow in `.github/workflows/ci.yml` runs typecheck + lint + tests + build on every PR independently of Vercel, so a broken PR is caught before review even loads.

### What CI checks

- `npm run typecheck` — strict TypeScript compilation.
- `npm run lint` — Next.js ESLint rules.
- `npm test` — 61 vitest cases (tokeniser, pricing math, analyser, exporter, share encoder).
- `npm run build` — full production build with telemetry disabled.
- Output verification — confirms `.next/BUILD_ID` exists.

## Phase 2 — output cost & multi-turn cost-intelligence

Phase 2 extends TokenBurn from an input-cost calculator into a complete
cost-intelligence tool. Output is billed 5-6× the input rate on every
current frontier model, so getting output prediction right matters far more
than getting input right.

### Cascading output predictor

`src/lib/outputPredictor.ts` runs three tiers in order — first applicable
tier wins. Every prediction carries the tier name in the UI so you see
which signal fired.

1. **Deterministic** — explicit `max_tokens=N` (hard ceiling), "in N words"
   (×1.33), "in N sentences" (×25), "one sentence" / TL;DR (tight band).
2. **Structural** — detected output shape: list of N items, table R×C cells,
   JSON object with named keys, email / letter, report with named sections,
   function / function+tests / class.
3. **Archetype** — rule-based classifier into 9 task classes (classification,
   extraction, summarisation, QA, open generation, code, translation,
   rewriting, agentic), each with a calibrated output/input ratio + log-normal
   sigma + minimum-expected floor. Apply optional per-user correction factor
   from the self-calibration loop.

Output is always a log-normal-distributed low / expected / high triple.
Archetype ratios live in `src/lib/outputArchetypes.ts` and are exposed for
the calibration loop to override.

### Echo Probe — "spend cents to predict dollars"

`/` → **Echo Probe** card. Sends your prompt to a cheap oracle (Claude Haiku
4.5 by default; Gemini 3 Flash or GPT-5.4 Nano as alternates) with a system
prompt that forbids answering and requires:

```
ESTIMATE: <int>
LOW: <int>
HIGH: <int>
OUTLINE:
- section 1
- section 2
- ...
```

Probe responses are capped at 180 tokens so the call costs ~$0.001 on Haiku
for a typical prompt. Results are cached by SHA-256 fingerprint of
`(oracle_id + prompt)` in `localStorage` (FIFO eviction at 100 entries), so
repeated probes are free.

The probe **never runs without an explicit click** and the prompt only
travels when you click. API keys stay in session memory only.

### Self-calibration feedback loop

`/calibration` → **Self-calibration** card. Two ingest paths:

1. **Paste box** — paste a usage object from your API response. Auto-detects
   OpenAI (`usage.prompt_tokens`/`completion_tokens`), Anthropic
   (`usage.input_tokens`/`output_tokens`), and Google
   (`usageMetadata.promptTokenCount`/`candidatesTokenCount`). Accepts
   arrays for batched ingestion.
2. **File upload** — drop a JSON array of any of the above.
3. **Optional proxy mode** (you build this) — see "Proxy mode" below.

Samples live in **IndexedDB** locally (DB `tokenburn-calibration`, store
`samples`). Nothing leaves the browser. Per-archetype median correction
factors are fitted once you have ≥5 samples per class; median is used (not
mean) so a few outliers don't skew the calibration. Confidence saturates at
1.0 after 30 total samples. The fitted factors persist in `localStorage`
under `tokenburn:v1` and are automatically applied to all future predictions
on the main analyser page.

Export the calibrated model as JSON for sharing with your finance team.

### Proxy mode (optional, ~30 LoC)

To stop pasting usage objects manually, route your API calls through a tiny
local proxy that logs `(prompt, model, input_tokens, output_tokens)` and
serves up a JSON file you can drop into the Self-Calibration upload box.

A minimal Express version:

```js
// proxy.js — run with: node proxy.js
import express from "express";
import fs from "node:fs";
const app = express();
app.use(express.json({ limit: "10mb" }));
const log = fs.createWriteStream("tokenburn-usage.jsonl", { flags: "a" });

app.post("/v1/messages", async (req, res) => {
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { ...req.headers, host: "api.anthropic.com" },
    body: JSON.stringify(req.body),
  });
  const json = await upstream.json();
  log.write(JSON.stringify({
    model: req.body.model,
    prompt: req.body.messages?.[0]?.content,
    usage: json.usage,
  }) + "\n");
  res.status(upstream.status).json(json);
});
app.listen(8787);
```

Then point your client at `http://localhost:8787` instead of
`https://api.anthropic.com`. Convert `tokenburn-usage.jsonl` to a JSON
array (`[ ... ]`) before uploading.

### Session simulator

`/session` → models multi-turn conversations where context compounds. Each
turn re-bills the full accumulated context as input. Compares
**without caching** vs **with caching (5m or 1h TTL)** side-by-side and
plots cumulative spend across turns. Marks the break-even turn with a
warn-coloured reference line.

Four presets: coding agent (25 turns), long research conversation (30
turns), document QA over large corpus (1 huge initial + 10 Q/A), customer
support thread (8 turns). Editable per-turn input/output. JSON export.

### Reasoning tokens

When the cascading predictor classifies a prompt as `code` or `agentic`
and you haven't set a Reasoning budget, the main page shows a warn-coloured
"reasoning likely — budget not set" hint. Reasoning tokens are billed at the
OUTPUT rate on every model that supports extended thinking. Set the budget
in Settings → Reasoning Budget; it's modelled as a separate **Reasoning**
segment in the stacked cost waterfall.

### Cost waterfall

The main page's chart is a six-segment stacked bar — billed input, cached
input, cache write, long-context surcharge, output, reasoning — so the
dominance of output over input is visually obvious for almost every prompt.
The Model comparison table also gains an **Out %** column showing
`output_cost / total_cost` with a green / warn / destructive progress bar.

## How tokenisation works

| Vendor | Method | Confidence |
| --- | --- | --- |
| OpenAI (GPT-5.x, GPT-4o, o-series) | `gpt-tokenizer` (`o200k_base` / `cl100k_base`) | exact |
| Anthropic (Claude 4 family) | calibrated empirical multiplier on `cl100k_base`; optional API exact count | ±8% |
| Google (Gemini 2/3) | SentencePiece-aware empirical multiplier on `cl100k_base`; optional API exact count | ±10% |
| DeepSeek, Grok, Llama, Mistral | loose empirical multiplier — surfaced in the UI as estimate-only | ±10% |

Image and PDF token costs follow vendor formulas — see `src/lib/tokenizer.ts` for the exact
shape (Claude charges `(width × height) / 750` tokens per image; Gemini 3 Flash bills a flat
560 tokens per input image; Anthropic PDFs run ~1,500–3,000 tokens per page depending on
density).

## How pricing works

`src/lib/models.ts` is the single source of truth for every model's pricing. Each entry
records:

- standard `input` / `output` rate per 1M tokens,
- `cachedInput` rate (cache HIT),
- `cacheWrite5mMultiplier` / `cacheWrite1hMultiplier` (Anthropic-style),
- `batchMultiplier` (usually 0.5),
- `longContextSurcharge` (GPT-5.5 above 272K, Gemini Pro above 200K),
- `sourceUrl` + `lastVerified` date.

The `lastVerified` date is shown next to each row in the UI; a warning banner surfaces when
a price source returns a different number on boot.

See [MODELS.md](./MODELS.md) for the full pricing-source ledger.

## How the analyser works

The analyser is a deterministic, rule-based pipeline. Each detector emits one or more
suggestions with:

- estimated token saving,
- confidence rating (low/medium/high),
- severity (info/low/medium/high),
- and, where the rewrite is deterministic, an `apply` function for one-click optimisation.

Detectors implemented in `src/lib/analyser.ts`:

1. **Verbosity** — strips filler ("please could you", "in order to", "I would like you to").
2. **Redundancy** — flags repeated directives ("respond in JSON" three times).
3. **Structure** — recommends `<role>/<task>/<context>/<output_format>` rewrite for long paragraphs.
4. **Whitespace / Markdown bloat** — tabs, double spaces, blank-line runs.
5. **Few-shot overload** — more than three examples → recommend two.
6. **Output cap** — flags missing `max_tokens` / word count / sentence cap.
7. **Cache opportunity** — recommends prompt caching for static prefixes >1,024 tokens.
8. **Compression** — LLMLingua-style hint for long, stopword-dense contexts.
9. **Routing** — classifies the task and recommends the cheapest model per vendor.

## Validation

`npm test` runs the full vitest suite covering:

- OpenAI counts matching `gpt-tokenizer` exactly,
- Anthropic empirical counts in the ±8% band, Gemini in ±10%,
- pricing math against hand-calculated references for every vendor,
- batch / cached / long-context surcharge math,
- reasoning-token billing at output rate,
- analyser detectors and ranking.

The `/calibration` page lets advanced users run the same checks against their own API keys
and see the delta per model.

## Contributing — updating prices

1. Open `src/lib/models.ts`.
2. Bump the price fields for the affected model.
3. Update `lastVerified` to today's date and the `sourceUrl` if the vendor changed pages.
4. Run `npm test` to confirm the cost-math reference tests still pass.
5. Add a `CHANGELOG.md` entry.

## Privacy

- All tokenisation runs client-side; prompts never leave the browser unless you opt in to
  the exact-count endpoints.
- Prompt, system prompt, attachments, and preferences are persisted to your browser's
  `localStorage` (under the `tokenburn:v1` key) so you don't lose work on refresh. Clear it
  via the browser devtools, or use the "Reset prompt &amp; attachments" button on the
  Settings panel.
- **API keys are NEVER persisted** — they live in memory for the session only. There are no
  TokenBurn servers; nothing is transmitted unless you explicitly hit "Run calibration" or
  switch on exact-count mode.
- No telemetry, no analytics.

## License

MIT.
