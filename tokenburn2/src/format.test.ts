import { describe, it, expect } from "vitest";
import { money, tokens, tokenRange } from "./format";

describe("money", () => {
  it("formats zero", () => {
    expect(money(0)).toBe("$0.00");
  });
  it("uses more precision for tiny amounts", () => {
    expect(money(0.0001234)).toBe("$0.00012");
  });
  it("uses 4 dp under a dollar", () => {
    expect(money(0.0105)).toBe("$0.0105");
  });
  it("uses 2 dp for larger amounts", () => {
    expect(money(123.456)).toBe("$123.46");
  });
});

describe("tokens", () => {
  it("adds thousands separators", () => {
    expect(tokens(1234567)).toBe("1,234,567");
  });
});

describe("tokenRange", () => {
  it("collapses to a point when exact", () => {
    expect(tokenRange(100, 100, 100)).toBe("100");
  });
  it("shows a range when estimated", () => {
    expect(tokenRange(85, 115, 100)).toBe("100 (85–115)");
  });
});
