# Changelog

All notable changes to TokenBurn will be documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
