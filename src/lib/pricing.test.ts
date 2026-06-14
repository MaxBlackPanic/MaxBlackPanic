import { describe, it, expect } from "vitest";
import { computeCost, projectVolume, formatUSD, formatTokens } from "./pricing";
import { getModel } from "./models";

describe("pricing / hand-calculated references", () => {
  it("Claude Sonnet 4.6: 1M in + 200K out at standard", () => {
    const m = getModel("claude-sonnet-4-6");
    const c = computeCost(m, { inputTokens: 1_000_000, outputTokens: 200_000 });
    // 1.0M × $3 + 0.2M × $15 = $3 + $3 = $6
    expect(c.total).toBeCloseTo(6, 5);
    expect(c.inputCost).toBeCloseTo(3, 5);
    expect(c.outputCost).toBeCloseTo(3, 5);
  });

  it("Claude Opus 4.7: 100K in + 50K out at standard", () => {
    const m = getModel("claude-opus-4-7");
    // 0.1 × 5 + 0.05 × 25 = 0.5 + 1.25 = 1.75
    const c = computeCost(m, { inputTokens: 100_000, outputTokens: 50_000 });
    expect(c.total).toBeCloseTo(1.75, 5);
  });

  it("Claude Haiku 4.5: 1M in + 1M out at standard", () => {
    const m = getModel("claude-haiku-4-5");
    // 1 × 1 + 1 × 5 = 6
    const c = computeCost(m, { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(c.total).toBeCloseTo(6, 5);
  });

  it("GPT-5.4: 500K in + 100K out", () => {
    const m = getModel("gpt-5-4");
    // 0.5 × 2.5 + 0.1 × 15 = 1.25 + 1.5 = 2.75
    const c = computeCost(m, { inputTokens: 500_000, outputTokens: 100_000 });
    expect(c.total).toBeCloseTo(2.75, 5);
  });

  it("GPT-5.4 Nano: 1M in + 200K out", () => {
    const m = getModel("gpt-5-4-nano");
    // 1 × 0.2 + 0.2 × 1.25 = 0.2 + 0.25 = 0.45
    const c = computeCost(m, { inputTokens: 1_000_000, outputTokens: 200_000 });
    expect(c.total).toBeCloseTo(0.45, 5);
  });

  it("Gemini 3 Flash: 2M in + 500K out", () => {
    const m = getModel("gemini-3-flash");
    // 2 × 0.5 + 0.5 × 3 = 1 + 1.5 = 2.5
    const c = computeCost(m, { inputTokens: 2_000_000, outputTokens: 500_000 });
    expect(c.total).toBeCloseTo(2.5, 5);
  });
});

describe("pricing / batch tier", () => {
  it("Claude Sonnet 4.6 batch is 50% of standard", () => {
    const m = getModel("claude-sonnet-4-6");
    const std = computeCost(m, { inputTokens: 1_000_000, outputTokens: 200_000 }, "standard");
    const b = computeCost(m, { inputTokens: 1_000_000, outputTokens: 200_000 }, "batch");
    expect(b.total).toBeCloseTo(std.total * 0.5, 5);
  });

  it("GPT-5.4 batch is 50% of standard", () => {
    const m = getModel("gpt-5-4");
    const std = computeCost(m, { inputTokens: 500_000, outputTokens: 100_000 });
    const b = computeCost(m, { inputTokens: 500_000, outputTokens: 100_000 }, "batch");
    expect(b.total).toBeCloseTo(std.total * 0.5, 5);
  });
});

describe("pricing / cached input", () => {
  it("Claude Sonnet 4.6: cache hit costs 10% on the cached portion", () => {
    const m = getModel("claude-sonnet-4-6");
    // 1M total input, 800K cached. Cached: 0.8 × 0.3 = 0.24. Billed input: 0.2 × 3 = 0.6.
    // Output: 0.1 × 15 = 1.5. Total: 0.24 + 0.6 + 1.5 = 2.34.
    const c = computeCost(m, {
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      cachedInputTokens: 800_000,
    });
    expect(c.total).toBeCloseTo(2.34, 5);
  });

  it("Claude cache write 5m: 1.25× base input", () => {
    const m = getModel("claude-sonnet-4-6");
    // Cache write of 1M @ 1.25 × $3 = $3.75. No input/output for clarity.
    const c = computeCost(m, {
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 1_000_000,
      cacheWriteTtl: "5m",
    });
    expect(c.cacheWriteCost).toBeCloseTo(3.75, 5);
  });

  it("Claude cache write 1h: 2× base input", () => {
    const m = getModel("claude-sonnet-4-6");
    const c = computeCost(m, {
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 1_000_000,
      cacheWriteTtl: "1h",
    });
    expect(c.cacheWriteCost).toBeCloseTo(6, 5);
  });
});

describe("pricing / long-context surcharge", () => {
  it("GPT-5.5: 300K input triggers 2× input above 272K threshold", () => {
    const m = getModel("gpt-5-5");
    // Base: 300K × $5 = $1.50. Output: 10K × $30 = $0.30. Total base: $1.80.
    // Surcharge on overflow (28K): input delta = 28K × $5 × (2-1) / 1M = $0.14.
    // Output 10K × $30 × (1.5-1) / 1M = $0.15.
    // Total: 1.80 + 0.14 + 0.15 = 2.09.
    const c = computeCost(m, { inputTokens: 300_000, outputTokens: 10_000 });
    expect(c.total).toBeCloseTo(2.09, 5);
    expect(c.longContextSurchargeCost).toBeCloseTo(0.29, 5);
  });

  it("Gemini 3.1 Pro: 250K input triggers 2× above 200K", () => {
    const m = getModel("gemini-3-1-pro");
    // Input: 250K × $2 = $0.50. Output: 50K × $12 = $0.60. Base: $1.10.
    // Surcharge: overflow 50K × $2 × (2-1)/1M = $0.10; output 50K × $12 × 0.5/1M = $0.30.
    // Total: 1.10 + 0.10 + 0.30 = 1.50.
    const c = computeCost(m, { inputTokens: 250_000, outputTokens: 50_000 });
    expect(c.total).toBeCloseTo(1.5, 5);
  });
});

describe("pricing / reasoning tokens", () => {
  it("Claude Opus 4.7: reasoning billed at output rate", () => {
    const m = getModel("claude-opus-4-7");
    // 10K reasoning × $25/M = $0.25
    const c = computeCost(m, { inputTokens: 0, outputTokens: 0, reasoningTokens: 10_000 });
    expect(c.reasoningCost).toBeCloseTo(0.25, 5);
  });
});

describe("projectVolume", () => {
  it("scales per-call to day / month / year", () => {
    const v = projectVolume(0.001, 1000);
    expect(v.perDay).toBeCloseTo(1, 5);
    expect(v.perMonth).toBeCloseTo(30, 5);
    expect(v.perYear).toBeCloseTo(365, 5);
  });
});

describe("formatters", () => {
  it("formats USD with sensible precision", () => {
    expect(formatUSD(0)).toBe("$0.00");
    // Sub-microdollar: fixed 7 decimals, NOT scientific (finance-readable).
    expect(formatUSD(0.0000330)).toBe("$0.0000330");
    expect(formatUSD(0.00001)).toBe("$0.0000100");
    // Tenths of a cent: 5 decimals.
    expect(formatUSD(0.00018)).toBe("$0.00018");
    expect(formatUSD(0.5)).toBe("$0.5000");
    expect(formatUSD(12.345)).toBe("$12.35");
    expect(formatUSD(100_000)).toBe("$100,000");
  });

  it("handles negative deltas and falls back to scientific only for truly micro values", () => {
    expect(formatUSD(-0.5)).toBe("-$0.5000");
    expect(formatUSD(-0.0000330)).toBe("-$0.0000330");
    // Below $1e-7 — scientific is the lesser evil vs 10+ decimals.
    expect(formatUSD(1e-9)).toMatch(/e/);
  });

  it("formats tokens with K/M suffixes", () => {
    expect(formatTokens(500)).toBe("500");
    expect(formatTokens(1500)).toBe("1.5K");
    expect(formatTokens(2_500_000)).toBe("2.50M");
  });
});
