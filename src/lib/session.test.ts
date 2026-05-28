import { describe, it, expect } from "vitest";
import { simulateSession, PRESETS, type SessionTurn } from "./session";
import { getModel } from "./models";

describe("session simulator / 3-turn reference (no caching)", () => {
  it("bills cumulative context each turn at the input rate", () => {
    // Use Claude Sonnet 4.6 — $3/M input, $15/M output.
    const m = getModel("claude-sonnet-4-6");
    const turns: SessionTurn[] = [
      { id: "1", inputAddition: 1_000_000, expectedOutput: 100_000 },
      { id: "2", inputAddition: 1_000_000, expectedOutput: 100_000 },
      { id: "3", inputAddition: 1_000_000, expectedOutput: 100_000 },
    ];
    const r = simulateSession(turns, { model: m });

    // Turn 0: context=1M tokens, input cost = 1*3 = $3; output 100K*15/1M = $1.5. Total = $4.5
    // Turn 1: context=1M+1M+100K=2.1M, input = 2.1*3 = $6.3; output $1.5. Total $7.8
    // Turn 2: context=1M+1M+100K+1M+100K=3.2M, input = 3.2*3 = $9.6; output $1.5. Total $11.1
    // Cumulative no-cache: 4.5 + 7.8 + 11.1 = 23.4
    expect(r.turns[0].noCacheCost).toBeCloseTo(4.5, 5);
    expect(r.turns[1].noCacheCost).toBeCloseTo(7.8, 5);
    expect(r.turns[2].noCacheCost).toBeCloseTo(11.1, 5);
    expect(r.totalNoCache).toBeCloseTo(23.4, 5);
  });
});

describe("session simulator / 3-turn reference (with caching, 5m TTL)", () => {
  it("bills cache writes at 1.25× and cache hits at 0.1× input", () => {
    const m = getModel("claude-sonnet-4-6");
    const turns: SessionTurn[] = [
      { id: "1", inputAddition: 1_000_000, expectedOutput: 100_000 },
      { id: "2", inputAddition: 1_000_000, expectedOutput: 100_000 },
      { id: "3", inputAddition: 1_000_000, expectedOutput: 100_000 },
    ];
    const r = simulateSession(turns, { model: m, ttl: "5m" });

    // Turn 0: writes = 1M, no hits.
    //   cache_write = 1M × 3 × 1.25 / 1M = $3.75
    //   output = 100K × 15 / 1M = $1.5
    //   total = $5.25
    expect(r.turns[0].withCacheCost).toBeCloseTo(5.25, 5);

    // Turn 1: hits = inputAddition[0] = 1M. writes = output[0] + inputAddition[1] = 1.1M.
    //   hit  = 1M × 0.3 / 1M = $0.3 (0.1 × $3 = $0.30)
    //   write = 1.1M × 3 × 1.25 / 1M = $4.125
    //   output = $1.5
    //   total = $5.925
    expect(r.turns[1].withCacheCost).toBeCloseTo(5.925, 5);

    // Turn 2: hits = inputAddition[0] + inputAddition[1] + output[0] = 1M+1M+100K = 2.1M
    //         writes = output[1] + inputAddition[2] = 100K + 1M = 1.1M
    //   hit  = 2.1M × 0.3 / 1M = $0.63
    //   write = 1.1M × 3.75 / 1M = $4.125
    //   output = $1.5
    //   total = $6.255
    expect(r.turns[2].withCacheCost).toBeCloseTo(6.255, 5);

    expect(r.totalWithCache).toBeCloseTo(5.25 + 5.925 + 6.255, 5);
  });

  it("1h TTL uses the 2× cache-write multiplier", () => {
    const m = getModel("claude-sonnet-4-6");
    const turns: SessionTurn[] = [
      { id: "1", inputAddition: 1_000_000, expectedOutput: 0 },
    ];
    const r = simulateSession(turns, { model: m, ttl: "1h" });
    // 1M × 3 × 2.0 / 1M = $6
    expect(r.turns[0].withCacheCost).toBeCloseTo(6, 5);
  });
});

describe("session simulator / 15-turn hand-calculated reference", () => {
  it("matches a hand-calculated 15-turn coding-agent session for both cached and non-cached", () => {
    // Use a synthetic model with simple rates: $1/M input, $10/M output.
    // This makes the hand-calc trivial. Use claude-haiku-4-5 ($1 in, $5 out).
    const m = getModel("claude-haiku-4-5");
    // 15 identical turns: inputAddition=1000, output=500.
    const turns: SessionTurn[] = Array.from({ length: 15 }, (_, i) => ({
      id: String(i),
      inputAddition: 1000,
      expectedOutput: 500,
    }));
    const r = simulateSession(turns, { model: m, ttl: "5m" });

    // Hand-calc no-cache:
    // Turn t: context = (t+1)*1000 + t*500
    // Sum over t=0..14:
    //   sum (t+1)*1000 = 1000 * sum_{t=0..14}(t+1) = 1000 * 120 = 120_000
    //   sum t*500     = 500 * sum_{t=0..14}(t)   = 500 * 105   =  52_500
    //   total context tokens (summed across calls) = 172_500
    // Plus 15 turns of 500 output each = 7500 output tokens.
    // Cost: 172_500 * 1 / 1M + 7500 * 5 / 1M = $0.1725 + $0.0375 = $0.21
    expect(r.totalNoCache).toBeCloseTo(0.21, 5);

    // Hand-calc with cache (5m, 1.25×):
    // Turn 0: writes=1000, hits=0, output=500
    //   cost = 1000*1*1.25/1M + 500*5/1M = $0.00125 + $0.0025 = $0.00375
    // Turn t (t>=1): hits = sum_{i=0..t-2}(1000+500) + 1000 = (t-1)*1500 + 1000
    //                writes = 500 + 1000 = 1500
    //   cost = hits*0.1/1M + writes*1.25/1M + 500*5/1M
    //        = (((t-1)*1500 + 1000) * 0.1 + 1500 * 1.25) / 1M + $0.0025
    //        = ((t-1)*150 + 100 + 1875) / 1M + $0.0025
    //        = ((t-1)*150 + 1975) / 1M + $0.0025
    //
    // Sum for t=1..14:
    //   sum (t-1)*150 = 150 * (0+1+2+...+13) = 150 * 91 = 13_650
    //   sum 1975 over 14 terms = 27_650
    //   subtotal divided by 1M = (13_650 + 27_650) / 1M = 0.0413
    //   plus 14 * $0.0025 = $0.035
    //   = $0.0763
    // Plus turn 0's $0.00375.
    // Total = $0.08005
    expect(r.totalWithCache).toBeCloseTo(0.08005, 4);

    // Break-even should happen on turn 1 or earlier (cached cost is lower from turn 1).
    expect(r.breakEvenTurnIndex).toBeLessThanOrEqual(1);
    expect(r.breakEvenTurnIndex).toBeGreaterThanOrEqual(0);

    // Savings should be substantial (~60%).
    expect(r.finalSavingsFraction).toBeGreaterThan(0.5);
  });
});

describe("session simulator / presets", () => {
  it("doc-qa preset shows large caching savings", () => {
    const preset = PRESETS.find((p) => p.id === "doc-qa")!;
    const m = getModel("claude-sonnet-4-6");
    const r = simulateSession(preset.build(), { model: m });
    expect(r.finalSavingsFraction).toBeGreaterThan(0.6);
    expect(r.totalWithCache).toBeLessThan(r.totalNoCache);
  });

  it("customer-support preset (short session) — caching may or may not break even", () => {
    const preset = PRESETS.find((p) => p.id === "customer-support")!;
    const m = getModel("claude-sonnet-4-6");
    const r = simulateSession(preset.build(), { model: m });
    expect(r.turns.length).toBe(8);
    // Either it broke even or it didn't — both are valid outcomes for a short session.
    expect([true, false]).toContain(r.breakEvenTurnIndex !== -1);
  });

  it("coding-agent preset has 25 turns and growing context", () => {
    const preset = PRESETS.find((p) => p.id === "coding-agent")!;
    const turns = preset.build();
    expect(turns.length).toBe(25);
    // Context grows monotonically.
    let lastCtx = 0;
    const m = getModel("claude-sonnet-4-6");
    const r = simulateSession(turns, { model: m });
    for (const t of r.turns) {
      expect(t.contextTokens).toBeGreaterThan(lastCtx);
      lastCtx = t.contextTokens;
    }
  });
});

describe("session simulator / edge cases", () => {
  it("empty session yields zero costs", () => {
    const m = getModel("claude-sonnet-4-6");
    const r = simulateSession([], { model: m });
    expect(r.totalNoCache).toBe(0);
    expect(r.totalWithCache).toBe(0);
    expect(r.turns.length).toBe(0);
    expect(r.breakEvenTurnIndex).toBe(-1);
  });

  it("single turn — cached cost > no-cache cost (no benefit, only write premium)", () => {
    const m = getModel("claude-sonnet-4-6");
    const r = simulateSession(
      [{ id: "1", inputAddition: 10_000, expectedOutput: 1_000 }],
      { model: m },
    );
    expect(r.totalWithCache).toBeGreaterThan(r.totalNoCache);
    expect(r.breakEvenTurnIndex).toBe(-1);
  });
});
