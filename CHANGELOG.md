# Changelog

All notable changes to TokenBurn will be documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

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
