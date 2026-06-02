import { describe, it, expect } from "vitest";
import { buildSuggestions, type SuggestionInput } from "./suggestions";
import { getModel } from "./pricing";
import type { CallScenario } from "./cost";

const opus = getModel("claude-opus-4-7");

function base(overrides: Partial<SuggestionInput> = {}): SuggestionInput {
  const scenario: CallScenario = {
    inputTokens: 5_000,
    forecastOutputTokens: 1_000,
    maxTokens: 2_000,
  };
  return {
    scenario,
    model: opus,
    callsPerMonth: 1_000,
    prefixTokens: 0,
    maxTokensSet: true,
    ...overrides,
  };
}

describe("buildSuggestions", () => {
  it("suggests caching when a large stable prefix exists", () => {
    const s = buildSuggestions(base({ prefixTokens: 4_000 }));
    const cache = s.find((x) => x.id === "cache-prefix");
    expect(cache).toBeDefined();
    expect(cache!.savingPerCall).toBeGreaterThan(0);
    expect(cache!.savingPerMonth).toBeCloseTo(cache!.savingPerCall * 1_000, 8);
  });

  it("does not suggest caching for a tiny prefix", () => {
    const s = buildSuggestions(base({ prefixTokens: 100 }));
    expect(s.find((x) => x.id === "cache-prefix")).toBeUndefined();
  });

  it("offers cheaper models with positive savings", () => {
    const s = buildSuggestions(base());
    const switches = s.filter((x) => x.id.startsWith("switch-"));
    expect(switches.length).toBeGreaterThanOrEqual(2);
    for (const sw of switches) expect(sw.savingPerCall).toBeGreaterThan(0);
  });

  it("recommends a maxTokens cap when none is set", () => {
    const s = buildSuggestions(base({ maxTokensSet: false }));
    expect(s.find((x) => x.id === "set-maxtokens")).toBeDefined();
  });

  it("flags verbosity when output dwarfs the prompt", () => {
    const scenario: CallScenario = {
      inputTokens: 200,
      forecastOutputTokens: 4_000,
      maxTokens: 8_000,
    };
    const s = buildSuggestions(base({ scenario }));
    const verbose = s.find((x) => x.id === "constrain-output");
    expect(verbose).toBeDefined();
    expect(verbose!.savingPerCall).toBeGreaterThan(0);
  });
});
