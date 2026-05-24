import { describe, it, expect } from "vitest";
import { rowsToCSV, rowsToJSON } from "./exporter";
import type { ModelRow } from "@/components/ModelTable";
import { getModel } from "./models";

function row(overrides: Partial<ModelRow> = {}): ModelRow {
  return {
    model: getModel("gpt-5-4"),
    inputTokens: 1000,
    outputLow: 100,
    outputExpected: 300,
    outputHigh: 900,
    inputCost: 0.0025,
    outputCost: 0.0045,
    totalCost: 0.007,
    totalCostLow: 0.0035,
    totalCostHigh: 0.0145,
    contextUtilisation: 0.004,
    tokenConfidence: "exact",
    tokenUncertaintyFraction: 0,
    ...overrides,
  };
}

describe("exporter / CSV", () => {
  it("emits header + one row, RFC-4180-compliant", () => {
    const csv = rowsToCSV([row()], {
      tier: "standard",
      callsPerDay: 1000,
      includeVolume: false,
    });
    const lines = csv.trim().split("\n");
    expect(lines.length).toBe(2);
    expect(lines[0].startsWith("model_id,model_label,vendor,")).toBe(true);
    expect(lines[1].includes("gpt-5-4")).toBe(true);
    expect(lines[1].includes("openai")).toBe(true);
    // Total cost should be present at 6 decimal places.
    expect(lines[1]).toMatch(/0\.007000/);
  });

  it("includes volume columns when requested", () => {
    const csv = rowsToCSV([row()], {
      tier: "batch",
      callsPerDay: 1000,
      includeVolume: true,
    });
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("monthly_cost_usd");
    expect(lines[0]).toContain("annual_cost_usd");
    // 0.007 * 1000 * 365 = 2555.00
    expect(lines[1]).toContain("2555.00");
    // 0.007 * 1000 * 30 = 210.00
    expect(lines[1]).toContain("210.00");
    expect(lines[1]).toContain("batch");
  });

  it("rowsToJSON emits a structured payload with pricing provenance", () => {
    const json = rowsToJSON([row()], {
      tier: "standard",
      callsPerDay: 1000,
      includeVolume: true,
    });
    const parsed = JSON.parse(json);
    expect(parsed.tier).toBe("standard");
    expect(parsed.rows.length).toBe(1);
    expect(parsed.rows[0].modelId).toBe("gpt-5-4");
    expect(parsed.rows[0].vendor).toBe("openai");
    expect(parsed.rows[0].cost.totalPerCall).toBeCloseTo(0.007, 5);
    expect(parsed.rows[0].cost.monthly).toBeCloseTo(210, 0);
    expect(parsed.rows[0].cost.annual).toBeCloseTo(2555, 0);
    expect(parsed.rows[0].pricing.sourceUrl).toMatch(/^https?:/);
    expect(parsed.rows[0].pricing.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parsed.generatedAt).toMatch(/T.*Z$/);
  });

  it("rowsToJSON omits monthly/annual when volume disabled", () => {
    const json = rowsToJSON([row()], {
      tier: "standard",
      callsPerDay: 0,
      includeVolume: false,
    });
    const parsed = JSON.parse(json);
    expect(parsed.rows[0].cost.monthly).toBeUndefined();
    expect(parsed.rows[0].cost.annual).toBeUndefined();
  });

  it("quotes cells containing commas, quotes, or newlines", () => {
    const m = getModel("gpt-5-4");
    const r: ModelRow = row({
      model: {
        ...m,
        label: 'Weird "model", v2',
        sourceUrl: "https://example.com/pricing,page",
      },
    });
    const csv = rowsToCSV([r], { tier: "standard", callsPerDay: 0, includeVolume: false });
    // Embedded quotes doubled, whole cell wrapped.
    expect(csv).toContain('"Weird ""model"", v2"');
    expect(csv).toContain('"https://example.com/pricing,page"');
  });
});
