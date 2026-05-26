# TokenBurn

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

The repo includes `vercel.json` and is ready to deploy with the default Next.js preset:

```bash
npx vercel        # link + deploy
npx vercel --prod # production
```

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
