# Changelog

All notable changes to TokenBurn will be documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Phase 2 — output cost & multi-turn cost-intelligence

Extends TokenBurn from an input-cost calculator into a complete
cost-intelligence tool. Output is billed 5-6× the input rate on every
current frontier model, so output prediction matters far more than input.

#### Added

- **Cascading output predictor** (`src/lib/outputPredictor.ts`). Three
  tiers — deterministic (explicit max_tokens / word / sentence caps),
  structural (list, table, JSON, function, report), archetype (9-class
  rule-based classifier with calibrated ratios). Always returns a
  log-normal-distributed low / expected / high triple with tier
  metadata so the UI can show prediction confidence. Cap at
  `max(min*5, input*3)` prevents the ratio model from blowing up
  on high-input cases.
- **Echo Probe** (`src/lib/echoProbe.ts`, `src/components/EchoProbe.tsx`).
  Sends the prompt to a cheap oracle (Claude Haiku 4.5 default; Gemini 3
  Flash, GPT-5.4 Nano alternates) with a STRICT system prompt that
  forbids answering. Caps oracle output at 180 tokens so the probe
  costs ~$0.001. Results cached by SHA-256 prompt fingerprint in
  localStorage (FIFO at 100 entries). Vendor calls wired for all three.
- **Self-calibrating feedback loop** (`src/lib/calibration.ts`,
  `src/components/SelfCalibration.tsx`). IndexedDB-backed sample store.
  Auto-detects OpenAI / Anthropic / Google response shapes; accepts
  arrays. Median per-archetype correction factors (median is robust to
  outliers vs mean); requires ≥5 samples per class. Confidence meter
  saturates at 1.0 after 30 samples. Export the calibrated model as
  JSON. Factors persist in localStorage and feed back into every
  prediction on the main analyser page.
- **Project / Session simulator** (`src/lib/session.ts`,
  `/session` route). Models multi-turn cost compounding. Per-turn
  rolling cache pattern: cache hits = tokens that were in the prior
  call's input, cache writes = tokens appearing in input for the
  first time. Without-cache vs with-cache (5m / 1h TTL) curves
  overlaid; warn-coloured break-even reference line. Four presets:
  coding agent, long research conversation, doc QA, customer support.
- **Cost waterfall + Output share column + range bands**. Stacked bar
  with six segments (billed input, cached input, cache write, long-ctx
  surcharge, output, reasoning) — output dominance is visually
  obvious. New "Out %" column with progress bar. Total / call cell
  now shows the low-expected-high range inline.
- **Reasoning-heavy hint**. Warn badge in the prompt header when the
  predicted archetype is reasoning-heavy (code / agentic) and the
  reasoning budget is 0.
- **Proxy mode** documented in README — ~30 LoC Express recipe for
  hands-off telemetry capture.

#### Tests

Added 47 cases. 101/101 total pass: cascading-predictor band coverage
on a 50-prompt labelled corpus (≥80%); structural list/table/JSON
within ±5% of hand-calc; 15-turn session simulator matches a
hand-calculated reference for both cached and non-cached cases; echo
probe response parser tolerant to whitespace/CRLF and rejects
malformed; calibration median is robust to outliers; ingesting
telemetry tightens held-out predictions (calibrated 0.5× factor
applied through to a held-out prompt yields exactly 0.5× the
baseline).


### Added

- Five new analyser detectors:
  - **Boilerplate**: strips "your task is to", "as an expert", "the
    following document", etc. — apply-able rewrite.
  - **Emoji bloat**: flags 5+ emoji with a one-click strip.
  - **Politeness coda**: drops "Thanks!", "Looking forward to your
    response", sign-offs.
  - **Preamble suppression**: for JSON/YAML/CSV/markdown tasks without
    a "no preamble" instruction, recommends adding one (saves 30–80
    output tokens per call).
  - **Emphasis stacking**: flags 4+ "IMPORTANT:" / "NOTE:" / "MUST:"
    markers as diluting each other.
- Cache-write tier UI: when tier=cached, expose "tokens written this
  call" + a 5m/1h TTL selector. Wires through to the existing
  `cacheWriteCost` math in pricing.ts so the first-call vs subsequent-
  call cost split is finally explicit.
- A11y: pricing tier toggle is now a proper radiogroup; model
  multi-select buttons announce `aria-pressed`; ModelTable wraps in a
  named region.
- `/forecast` page: a no-prompt-required cost sandbox for finance
  modelling. Direct inputs for tokens / call, output tokens, daily
  call volume, reasoning budget, cache hit fraction, and tier.
  Three scenario modes: single, "vs cached", "vs batch" (each
  surfaces the second column in the comparison table). Reuses the
  Model comparison table + Cost chart + CSV / JSON exporter. Cheapest
  vs most-expensive projection cards highlight the annual savings
  from routing.
- Header link to the new page (Forecast).
- Manual A/B compare mode. Toggle "A/B compare mode" in Settings to
  render a second editor for Prompt B. The Model comparison table grows
  "B total" and "Δ (A − B)" columns (sortable by delta — green = B
  cheaper, red = A cheaper). CSV / JSON export gain b_* and delta_*
  columns. The Diff view auto-pops with A vs B; "Accept B" promotes B
  to the active prompt and exits A/B mode. Share links round-trip the
  full A/B state.
- Live token-count badge in the prompt header (uses the canonical OpenAI
  exact count so the number is deterministic across vendors).
- Share-via-URL: "Share" button copies a hash-encoded link with the prompt,
  system, tier, selected models, and reasoning settings. The payload sits
  in the URL fragment, so it never leaves the browser on page load — only
  when the user pastes the URL elsewhere. 16KB payload cap with a helpful
  error message when exceeded.
- JSON export alongside CSV — structured payload with per-row pricing
  provenance (sourceUrl + lastVerified) and optional monthly/annual cost
  when the volume calculator is enabled.
- CSV export of the model-comparison table (RFC-4180 compliant), with
  optional monthly / annual columns when the volume calculator is on.
  Filenames are timestamped.
- Image upload: drop or pick an image file and the panel reads the
  dimensions directly off the bitmap — no need to type W/H. The file
  itself never leaves the browser (object-URL only).
- Attachments &amp; context panel: conversation history, tool / function-call
  schemas, image attachments (per-vendor token math), PDF page count — all
  flow through the same cost pipeline as the prompt.
- Pricing-freshness banner: warns when any model's `lastVerified` date is
  older than 45 days.
- Persistence: prompt, system prompt, attachments, selected models, tier,
  reasoning budget, cache fraction, volume settings, and dark mode are now
  stored in `localStorage` under the `tokenburn:v1` key. API keys are
  deliberately NOT persisted.
- Reset button on the Settings panel restores the seeded defaults.

### Changed

- Verbosity rewrite now preserves paragraph breaks, capitalises sentence
  starts, and consumes trailing dangling fragments. Apply-all on the seeded
  prompt now drops 13.3% of tokens while staying readable.

## [0.1.0] — 2026-05-23

### Added

- Initial release.
- Vendor catalog with standard, batch, and cached-input pricing tiers for Anthropic,
  OpenAI, Google, DeepSeek, xAI, Meta, Mistral.
- Bit-exact local tokenisation for OpenAI via `gpt-tokenizer` (o200k_base + cl100k_base).
- Calibrated empirical tokenisers for Anthropic (±8%) and Gemini (±10%).
- Optional opt-in calls to `count_tokens` (Anthropic) and `countTokens` (Google) for exact
  cross-checks.
- Image, PDF, system-prompt, tool-schema, and conversation-history token accounting.
- Long-context surcharge math (GPT-5.5 >272K, Gemini Pro >200K).
- Reasoning-token billing at output rate.
- Prompt efficiency analyser with verbosity, redundancy, structure, whitespace, examples,
  output-cap, cache, compression, and routing detectors.
- One-click apply / apply-all and "before vs optimised" diff view.
- Monaco prompt editor with inline issue underlining.
- Sortable model comparison table with cheapest highlight and last-verified date.
- Stacked input-vs-output cost chart (Recharts).
- Volume calculator with daily / monthly / annual projections.
- Calibration page for advanced users.
- Full vitest suite covering tokenisation, pricing math, output prediction, and analyser.
