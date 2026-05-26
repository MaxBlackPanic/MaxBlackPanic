# Model & Pricing Reference

Single source of truth for every model TokenBurn knows about. All rates are USD per 1M
tokens unless noted otherwise. Last bulk verification: **2026-05-23**.

When updating prices: edit `src/lib/models.ts`, update `lastVerified` in this file too, and
add a `CHANGELOG.md` entry.

---

## Anthropic

Source: <https://www.anthropic.com/pricing>

| Model | Input | Output | Cached input | Cache write 5m | Cache write 1h | Context | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Claude Opus 4.7 | $5.00 | $25.00 | $0.50 | 1.25× input | 2× input | 1M | new Opus 4.7 tokeniser (estimated 1.30× cl100k) |
| Claude Opus 4.6 | $5.00 | $25.00 | $0.50 | 1.25× input | 2× input | 1M | |
| Claude Sonnet 4.6 | $3.00 | $15.00 | $0.30 | 1.25× input | 2× input | 1M | |
| Claude Haiku 4.5 | $1.00 | $5.00 | $0.10 | 1.25× input | 2× input | 1M | |

- Batch tier: 50% discount on both input and output.
- Image cost: `(width × height) / 750` tokens.
- PDF cost: 1,500–3,000 tokens per page (density-dependent).
- Token counting API: `POST https://api.anthropic.com/v1/messages/count_tokens`
  ([docs](https://docs.claude.com/en/docs/build-with-claude/token-counting)).

---

## OpenAI

Source: <https://openai.com/api/pricing/>

| Model | Input | Output | Cached input | Context | Notes |
| --- | --- | --- | --- | --- | --- |
| GPT-5.5 | $5.00 | $30.00 | $0.50 | 400K | 2× input / 1.5× output above 272K input tokens |
| GPT-5.5 Pro | $30.00 | $180.00 | $3.00 | 400K | reasoning-heavy frontier |
| GPT-5.4 | $2.50 | $15.00 | $0.25 | 256K | |
| GPT-5.4 Mini | $0.50 | $4.00 | $0.05 | 256K | |
| GPT-5.4 Nano | $0.20 | $1.25 | $0.02 | 128K | |
| GPT-5.3 Codex | $1.75 | $14.00 | $0.175 | 256K | code-tuned |
| GPT-4o (legacy) | $2.50 | $10.00 | $1.25 | 128K | legacy — prefer GPT-5.4 |
| o3 (legacy reasoning) | $2.00 | $8.00 | $0.50 | 200K | |
| o4-mini (legacy reasoning) | $1.10 | $4.40 | $0.275 | 200K | |

- Batch tier: 50% discount.
- Token counting: bit-exact locally via `gpt-tokenizer` (`o200k_base` for current models,
  `cl100k_base` for legacy).

---

## Google

Source: <https://ai.google.dev/gemini-api/docs/pricing>

| Model | Input | Output | Cached input | Context | Notes |
| --- | --- | --- | --- | --- | --- |
| Gemini 3.1 Pro | $2.00 | $12.00 | $0.20 | 2M | 2× input / 1.5× output above 200K |
| Gemini 3.5 Flash | $1.50 | $9.00 | $0.15 | 1M | |
| Gemini 3 Flash | $0.50 | $3.00 | $0.05 | 1M | image = 560 tokens flat |
| Gemini 2.5 Pro | $1.25 | $10.00 | $0.125 | 2M | 2× input / 1.5× output above 200K |
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 | $0.01 | 1M | nano tier |

- Batch tier: 50% discount.
- Context caching: 10% of input rate + $1.00–$4.50 per million tokens / hour storage.
- Token counting API: `POST /v1beta/models/{model}:countTokens`
  ([docs](https://ai.google.dev/api/tokens)).

---

## Estimate-only vendors

These vendors do not ship a published client-side tokeniser. Token counts use a loose
empirical multiplier on cl100k_base and are flagged ±10% in the UI.

| Model | Vendor | Input | Output | Source |
| --- | --- | --- | --- | --- |
| DeepSeek V3 | DeepSeek | $0.27 | $1.10 | <https://api-docs.deepseek.com/quick_start/pricing> |
| Grok 4 | xAI | $3.00 | $15.00 | <https://x.ai/api> |
| Llama 3.3 405B (hosted) | Meta | $3.50 | $3.50 | <https://llama.developer.meta.com/docs/pricing> |
| Mistral Large 2 | Mistral | $2.00 | $6.00 | <https://mistral.ai/technology/#pricing> |

---

## Reasoning tokens

For models that support extended thinking, reasoning tokens are billed at the OUTPUT rate.
Models flagged with `supportsReasoning: true`:

- Anthropic: Opus 4.7, Opus 4.6, Sonnet 4.6, Haiku 4.5
- OpenAI: GPT-5.5, GPT-5.5 Pro, GPT-5.4, GPT-5.4 Mini, GPT-5.3 Codex, o3, o4-mini
- Google: Gemini 3.1 Pro, Gemini 3.5 Flash
- xAI: Grok 4

The reasoning budget you enter in the UI is treated as a *maximum*, not a guaranteed
spend.

---

## Change procedure

1. Update `src/lib/models.ts` for the affected model(s).
2. Update the table above and bump `lastVerified` for the row.
3. Add a `CHANGELOG.md` entry.
4. Run `npm test` — the hand-calculated reference tests in `pricing.test.ts` will catch
   any unintended math changes.
