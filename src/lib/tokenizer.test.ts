import { describe, it, expect } from "vitest";
import { countTokensForText, countPromptTokens } from "./tokenizer";
import { getModel } from "./models";

describe("tokenizer / OpenAI exact counts", () => {
  it("counts plain English with o200k_base", () => {
    const m = getModel("gpt-5-4");
    const r = countTokensForText("Hello, world!", m);
    expect(r.confidence).toBe("exact");
    expect(r.tokens).toBeGreaterThan(0);
    expect(r.tokens).toBeLessThan(10);
  });

  it("returns 0 for empty input", () => {
    const m = getModel("gpt-5-4");
    expect(countTokensForText("", m).tokens).toBe(0);
  });

  it("produces stable counts for canonical strings", () => {
    const m = getModel("gpt-5-4");
    // These reference values were verified against gpt-tokenizer/o200k_base.
    const samples: Array<[string, number]> = [
      ["The quick brown fox jumps over the lazy dog.", 10],
      ["function add(a, b) { return a + b; }", 12],
      ["{\"name\":\"Alice\",\"age\":30}", 8],
    ];
    for (const [text, expectedTokens] of samples) {
      const got = countTokensForText(text, m).tokens;
      // Allow ±1 token tolerance for tokeniser version drift.
      expect(Math.abs(got - expectedTokens), `text=${text} got=${got}`).toBeLessThanOrEqual(1);
    }
  });
});

describe("tokenizer / Anthropic empirical", () => {
  it("returns medium-confidence with ±8% band", () => {
    const m = getModel("claude-sonnet-4-6");
    const r = countTokensForText("The quick brown fox jumps over the lazy dog.", m);
    expect(r.confidence).toBe("medium");
    expect(r.uncertaintyFraction).toBeCloseTo(0.08);
    expect(r.tokens).toBeGreaterThan(0);
  });

  it("uses higher multiplier for Opus 4.7", () => {
    const opus47 = getModel("claude-opus-4-7");
    const sonnet = getModel("claude-sonnet-4-6");
    const text = "Lorem ipsum dolor sit amet, consectetur adipiscing elit.";
    const a = countTokensForText(text, opus47).tokens;
    const b = countTokensForText(text, sonnet).tokens;
    expect(a).toBeGreaterThan(b);
  });
});

describe("tokenizer / Gemini empirical", () => {
  it("estimates ±10% for Gemini", () => {
    const m = getModel("gemini-3-flash");
    const r = countTokensForText("The quick brown fox jumps over the lazy dog.", m);
    expect(r.confidence).toBe("medium");
    expect(r.uncertaintyFraction).toBeCloseTo(0.1);
  });
});

describe("tokenizer / countPromptTokens combined", () => {
  it("sums user + system + tools + history + images + pdfs", () => {
    const m = getModel("claude-sonnet-4-6");
    const r = countPromptTokens(
      {
        user: "Summarise this document in three bullets.",
        system: "You are a careful financial analyst.",
        tools: ['{"name":"get_quote","parameters":{"symbol":"string"}}'],
        history: "User: hi\nAssistant: hello",
        images: [{ width: 750, height: 750 }],
        pdfPages: 2,
      },
      m,
    );
    expect(r.total).toBe(r.user + r.system + r.tools + r.history + r.images + r.pdfs);
    expect(r.images).toBe(Math.ceil((750 * 750) / 750)); // = 750
    expect(r.pdfs).toBeGreaterThan(0);
    expect(r.confidence).toBe("medium");
  });

  it("uses fixed image cost for Gemini", () => {
    const m = getModel("gemini-3-1-pro");
    const r = countPromptTokens(
      { user: "Describe the image.", images: [{ width: 100, height: 100 }] },
      m,
    );
    expect(r.images).toBe(560);
  });
});
