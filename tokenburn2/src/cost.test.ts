import { describe, it, expect } from "vitest";
import {
  costOf,
  expectedCost,
  worstCaseCost,
  monthlyCost,
  compareModels,
  type CallScenario,
} from "./cost";
import { getModel, MODELS } from "./pricing";

const sonnet = getModel("claude-sonnet-4-6"); // in 3 / out 15 / cache 0.3
const opus = getModel("claude-opus-4-7"); // in 5 / out 25 / cache 0.5
const geminiPro = getModel("gemini-3.1-pro"); // tiered at 200k
const gpt52 = getModel("gpt-5.2"); // no cacheReadRate

describe("costOf — hand-checked figures", () => {
  it("1,000,000 input tokens on Sonnet = $3.00", () => {
    const { inputCost } = costOf(1_000_000, 0, sonnet);
    expect(inputCost).toBeCloseTo(3.0, 10);
  });

  it("1,000,000 output tokens on Sonnet = $15.00", () => {
    const { outputCost } = costOf(0, 1_000_000, sonnet);
    expect(outputCost).toBeCloseTo(15.0, 10);
  });

  it("combines input and output", () => {
    // 1M in + 1M out on Sonnet = 3 + 15 = 18
    const { total } = costOf(1_000_000, 1_000_000, sonnet);
    expect(total).toBeCloseTo(18.0, 10);
  });

  it("1,000,000 input on Opus = $5.00, output = $25.00", () => {
    const c = costOf(1_000_000, 1_000_000, opus);
    expect(c.inputCost).toBeCloseTo(5.0, 10);
    expect(c.outputCost).toBeCloseTo(25.0, 10);
  });

  it("small realistic prompt", () => {
    // 1,000 in + 500 out on Sonnet = (1000*3 + 500*15)/1e6 = (3000 + 7500)/1e6
    const { total } = costOf(1_000, 500, sonnet);
    expect(total).toBeCloseTo(0.0105, 10);
  });
});

describe("cache adjustment", () => {
  it("cached prefix is billed at cacheReadRate", () => {
    // 1M input, all cached, Sonnet cache rate 0.3 => $0.30
    const { inputCost } = costOf(1_000_000, 0, sonnet, { cachedTokens: 1_000_000 });
    expect(inputCost).toBeCloseTo(0.3, 10);
  });

  it("splits cached and uncached input correctly", () => {
    // 1M input, 600k cached at 0.3, 400k at 3 => (600000*0.3 + 400000*3)/1e6
    // = (180000 + 1200000)/1e6 = 1.38
    const { inputCost } = costOf(1_000_000, 0, sonnet, { cachedTokens: 600_000 });
    expect(inputCost).toBeCloseTo(1.38, 10);
  });

  it("falls back to input rate when model has no cache read rate", () => {
    // gpt-5.2 has no cacheReadRate; caching saves nothing.
    const { inputCost } = costOf(1_000_000, 0, gpt52, { cachedTokens: 1_000_000 });
    expect(inputCost).toBeCloseTo(1.75, 10);
  });

  it("clamps cachedTokens to inputTokens", () => {
    const a = costOf(1_000, 0, sonnet, { cachedTokens: 999_999 });
    const b = costOf(1_000, 0, sonnet, { cachedTokens: 1_000 });
    expect(a.inputCost).toBeCloseTo(b.inputCost, 12);
  });
});

describe("batch multiplier", () => {
  it("halves both input and output rates", () => {
    const normal = costOf(1_000_000, 1_000_000, sonnet);
    const batched = costOf(1_000_000, 1_000_000, sonnet, { batch: true });
    expect(batched.total).toBeCloseTo(normal.total / 2, 10);
    expect(batched.total).toBeCloseTo(9.0, 10);
  });

  it("halves the cache rate too", () => {
    const { inputCost } = costOf(1_000_000, 0, sonnet, {
      cachedTokens: 1_000_000,
      batch: true,
    });
    expect(inputCost).toBeCloseTo(0.15, 10);
  });
});

describe("context tier", () => {
  it("uses base rate at or below the tier threshold", () => {
    const c = costOf(200_000, 0, geminiPro);
    expect(c.overTier).toBe(false);
    // 200k * 2 / 1e6 = 0.4
    expect(c.inputCost).toBeCloseTo(0.4, 10);
  });

  it("uses tier rate above the threshold", () => {
    const c = costOf(200_001, 0, geminiPro);
    expect(c.overTier).toBe(true);
    expect(c.appliedInputRate).toBe(4);
    // 200001 * 4 / 1e6
    expect(c.inputCost).toBeCloseTo((200_001 * 4) / 1e6, 10);
  });

  it("applies tier output rate above the threshold", () => {
    const c = costOf(300_000, 1_000_000, geminiPro);
    expect(c.appliedOutputRate).toBe(18);
    expect(c.outputCost).toBeCloseTo(18.0, 10);
  });
});

describe("expected vs worst case", () => {
  const scenario: CallScenario = {
    inputTokens: 2_000,
    forecastOutputTokens: 400,
    maxTokens: 4_000,
  };

  it("expected uses the forecast output", () => {
    const e = expectedCost(scenario, sonnet);
    // (2000*3 + 400*15)/1e6 = (6000 + 6000)/1e6 = 0.012
    expect(e.total).toBeCloseTo(0.012, 10);
  });

  it("worst case uses maxTokens and is always >= expected", () => {
    const w = worstCaseCost(scenario, sonnet);
    const e = expectedCost(scenario, sonnet);
    // (2000*3 + 4000*15)/1e6 = (6000 + 60000)/1e6 = 0.066
    expect(w.total).toBeCloseTo(0.066, 10);
    expect(w.total).toBeGreaterThanOrEqual(e.total);
  });
});

describe("monthlyCost", () => {
  it("multiplies per-call cost by calls", () => {
    expect(monthlyCost(0.012, 10_000)).toBeCloseTo(120, 10);
  });
  it("never goes negative", () => {
    expect(monthlyCost(0.012, -5)).toBe(0);
  });
});

describe("compareModels", () => {
  const scenario: CallScenario = {
    inputTokens: 10_000,
    forecastOutputTokens: 1_000,
    maxTokens: 2_000,
  };

  it("returns one row per model", () => {
    expect(compareModels(scenario)).toHaveLength(MODELS.length);
  });

  it("is sorted cheapest expected first", () => {
    const rows = compareModels(scenario);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].expected.total).toBeGreaterThanOrEqual(rows[i - 1].expected.total);
    }
  });

  it("cheapest row is flash-lite for this scenario", () => {
    const rows = compareModels(scenario);
    expect(rows[0].model.id).toBe("gemini-3.1-flash-lite");
  });
});
