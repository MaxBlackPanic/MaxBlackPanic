import { describe, it, expect } from "vitest";
import { predictOutput } from "./outputPredictor";
import { getModel } from "./models";

describe("outputPredictor", () => {
  it("classification gets a small output range", () => {
    const m = getModel("claude-haiku-4-5");
    const r = predictOutput(1000, "Classify this review as positive or negative.", m);
    expect(r.taskClass).toBe("classification");
    expect(r.expected).toBeLessThan(200);
    expect(r.low).toBeLessThan(r.expected);
    expect(r.high).toBeGreaterThan(r.expected);
  });

  it("creative gets a much larger range", () => {
    const m = getModel("claude-opus-4-7");
    const r = predictOutput(500, "Write a story about a robot learning to paint.", m);
    expect(r.taskClass).toBe("creative");
    expect(r.expected).toBeGreaterThan(500);
  });

  it("honours explicit max_tokens", () => {
    const m = getModel("gpt-5-4");
    const r = predictOutput(1000, "Do the thing. max_tokens=120", m);
    expect(r.expected).toBe(120);
  });

  it("honours one-sentence cue", () => {
    const m = getModel("gpt-5-4-mini");
    const r = predictOutput(1000, "Explain quantum entanglement in one sentence.", m);
    expect(r.expected).toBeLessThanOrEqual(30);
  });

  it("clamps to model max output", () => {
    const m = getModel("gemini-2-5-flash-lite");
    const r = predictOutput(50000, "Write a comprehensive detailed in-depth report.", m);
    expect(r.expected).toBeLessThanOrEqual(m.maxOutputTokens);
    expect(r.high).toBeLessThanOrEqual(m.maxOutputTokens);
  });
});
