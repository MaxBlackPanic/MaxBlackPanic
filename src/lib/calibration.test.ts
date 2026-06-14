import { describe, it, expect } from "vitest";
import {
  buildCalibrationReport,
  parseUsagePayload,
  rowToSample,
  MIN_SAMPLES_PER_ARCHETYPE,
  type UsageSample,
} from "./calibration";
import type { Archetype } from "./outputArchetypes";
import { predictOutput } from "./outputPredictor";
import { getModel } from "./models";

function makeSample(
  archetype: Archetype,
  predicted: number,
  actual: number,
  i = 0,
): UsageSample {
  return {
    id: `s${archetype}-${i}`,
    timestamp: new Date().toISOString(),
    archetype,
    vendor: "openai",
    modelId: "gpt-5-4",
    inputTokens: 100,
    outputTokens: actual,
    predictedOutputTokens: predicted,
  };
}

describe("calibration / report builder", () => {
  it("computes median correction per archetype with ≥5 samples", () => {
    const samples: UsageSample[] = [];
    // open: predicted 600, actuals 900 (ratio 1.5) — five samples
    for (let i = 0; i < 5; i++) samples.push(makeSample("open", 600, 900, i));
    // code: only 3 samples — should NOT get a correction factor
    for (let i = 0; i < 3; i++) samples.push(makeSample("code", 300, 600, i));

    const r = buildCalibrationReport(samples);
    expect(r.factors.open).toBeCloseTo(1.5, 5);
    expect(r.factors.code).toBeUndefined();
    expect(r.counts.open).toBe(5);
    expect(r.counts.code).toBe(3);
    expect(r.deltaPct.open).toBeCloseTo(50, 1);
  });

  it("uses median (not mean) — robust to outliers", () => {
    const samples: UsageSample[] = [];
    // 5 samples: ratios 1.0, 1.0, 1.0, 1.0, 10.0 — median is 1.0, mean is 2.8
    [1, 1, 1, 1, 10].forEach((r, i) =>
      samples.push(makeSample("summarisation", 100, 100 * r, i)),
    );
    const r = buildCalibrationReport(samples);
    expect(r.factors.summarisation).toBeCloseTo(1.0, 5);
  });

  it("confidence saturates at 1.0 after 30 samples", () => {
    const samples: UsageSample[] = Array.from({ length: 30 }, (_, i) =>
      makeSample("qa", 100, 120, i),
    );
    const r = buildCalibrationReport(samples);
    expect(r.confidence).toBe(1);

    const half: UsageSample[] = Array.from({ length: 15 }, (_, i) =>
      makeSample("qa", 100, 120, i),
    );
    expect(buildCalibrationReport(half).confidence).toBe(0.5);
  });
});

describe("calibration / payload parser", () => {
  it("accepts OpenAI usage shape", () => {
    const rows = parseUsagePayload({
      usage: { prompt_tokens: 100, completion_tokens: 200 },
      model: "gpt-5-4",
      prompt: "summarise this",
    });
    expect(rows.length).toBe(1);
    expect(rows[0].inputTokens).toBe(100);
    expect(rows[0].outputTokens).toBe(200);
    expect(rows[0].modelId).toBe("gpt-5-4");
  });

  it("accepts Anthropic usage shape", () => {
    const rows = parseUsagePayload({
      usage: { input_tokens: 50, output_tokens: 150 },
      model: "claude-sonnet-4-6",
    });
    expect(rows[0].inputTokens).toBe(50);
    expect(rows[0].outputTokens).toBe(150);
  });

  it("accepts Google usageMetadata shape", () => {
    const rows = parseUsagePayload({
      usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 220 },
      model: "gemini-3-flash",
    });
    expect(rows[0].inputTokens).toBe(80);
    expect(rows[0].outputTokens).toBe(220);
  });

  it("accepts an array of mixed-shape payloads", () => {
    const rows = parseUsagePayload([
      { usage: { prompt_tokens: 1, completion_tokens: 2 }, model: "gpt-5-4" },
      { usage: { input_tokens: 3, output_tokens: 4 }, model: "claude-haiku-4-5" },
      { usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 6 }, model: "gemini-3-flash" },
    ]);
    expect(rows.length).toBe(3);
  });

  it("rejects empty / malformed inputs gracefully", () => {
    expect(parseUsagePayload(null).length).toBe(0);
    expect(parseUsagePayload({}).length).toBe(0);
    expect(parseUsagePayload("not json").length).toBe(0);
  });
});

describe("calibration / rowToSample auto-classification", () => {
  it("classifies the archetype from the prompt when not provided", () => {
    const s = rowToSample({
      prompt: "Classify this email as spam.",
      modelId: "gpt-5-4-nano",
      inputTokens: 60,
      outputTokens: 8,
    });
    expect(s?.archetype).toBe("classification");
    expect(s?.vendor).toBe("openai");
  });

  it("auto-detects vendor from model id prefix", () => {
    expect(rowToSample({ modelId: "claude-opus-4-7", inputTokens: 1, outputTokens: 1 })?.vendor).toBe("anthropic");
    expect(rowToSample({ modelId: "gemini-3-1-pro", inputTokens: 1, outputTokens: 1 })?.vendor).toBe("google");
    expect(rowToSample({ modelId: "deepseek-v3", inputTokens: 1, outputTokens: 1 })?.vendor).toBe("deepseek");
  });
});

describe("calibration / tightens prediction on held-out data", () => {
  it("ingesting telemetry reduces |actual − predicted| / actual on a held-out sample", () => {
    const m = getModel("gpt-5-4");
    // Training: 20 samples for "open" archetype showing actuals consistently
    // 0.5× the baseline prediction. Held-out sample: same pattern.
    const training: UsageSample[] = Array.from({ length: 20 }, (_, i) => {
      const prompt = "Write a story about a robot."; // archetype=open
      const baselinePred = predictOutput(200, prompt, m).expected;
      const actual = baselinePred * 0.5;
      return makeSample("open", baselinePred, actual, i);
    });

    const report = buildCalibrationReport(training);
    expect(report.factors.open).toBeCloseTo(0.5, 2);

    // Held-out — same archetype.
    const heldOutPrompt = "Write a poem about autumn.";
    const baseline = predictOutput(200, heldOutPrompt, m);
    const calibrated = predictOutput(200, heldOutPrompt, m, {
      correctionFactors: report.factors,
    });
    // Expected behaviour: calibrated prediction is exactly 0.5× baseline.
    expect(calibrated.expected).toBeCloseTo(baseline.expected * 0.5, 0);
  });
});
