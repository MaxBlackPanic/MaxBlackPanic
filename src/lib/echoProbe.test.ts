import { describe, it, expect } from "vitest";
import {
  parseProbeResponse,
  fingerprintPrompt,
  estimateProbeCost,
  DEFAULT_ORACLE_ID,
} from "./echoProbe";

describe("echoProbe / response parser", () => {
  it("parses the canonical oracle response", () => {
    const text = `ESTIMATE: 850
LOW: 600
HIGH: 1200
OUTLINE:
- Intro paragraph framing the question
- Three sub-arguments with examples
- Closing summary and recommendation`;
    const r = parseProbeResponse(text);
    expect(r).not.toBeNull();
    expect(r!.estimate).toBe(850);
    expect(r!.low).toBe(600);
    expect(r!.high).toBe(1200);
    expect(r!.outline).toMatch(/Intro paragraph/);
  });

  it("returns null for malformed responses", () => {
    expect(parseProbeResponse("the answer is 42")).toBeNull();
    expect(parseProbeResponse("ESTIMATE: abc\nLOW: 1\nHIGH: 2\nOUTLINE:\n- x")).toBeNull();
  });

  it("tolerates extra whitespace and CRLF", () => {
    const text = "ESTIMATE:  100\r\nLOW:   50\r\nHIGH:  200\r\nOUTLINE:\r\n- only one section";
    const r = parseProbeResponse(text);
    expect(r?.estimate).toBe(100);
    expect(r?.low).toBe(50);
    expect(r?.high).toBe(200);
  });
});

describe("echoProbe / fingerprint", () => {
  it("produces stable hex SHA-256 digests", async () => {
    const f1 = await fingerprintPrompt("claude-haiku-4-5", "hello");
    const f2 = await fingerprintPrompt("claude-haiku-4-5", "hello");
    expect(f1).toBe(f2);
    expect(f1).toMatch(/^[0-9a-f]+$/);
  });

  it("differs when the oracle model differs", async () => {
    const a = await fingerprintPrompt("claude-haiku-4-5", "same prompt");
    const b = await fingerprintPrompt("gemini-3-flash", "same prompt");
    expect(a).not.toBe(b);
  });

  it("differs when the prompt differs", async () => {
    const a = await fingerprintPrompt("claude-haiku-4-5", "prompt A");
    const b = await fingerprintPrompt("claude-haiku-4-5", "prompt B");
    expect(a).not.toBe(b);
  });
});

describe("echoProbe / cost estimator", () => {
  it("estimates a sub-cent probe cost for a short prompt on Haiku 4.5", () => {
    const cost = estimateProbeCost("Summarise this document briefly.", DEFAULT_ORACLE_ID);
    // Haiku: $1/M in, $5/M out. Probe input ~200 tok system + 5 tok prompt = ~205,
    // assumed output 180. Cost ≈ 0.000205 + 0.0009 = ~$0.001.
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.01);
  });
});
