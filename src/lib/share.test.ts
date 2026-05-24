import { describe, it, expect } from "vitest";
import { encodeShare, decodeShare, parseShareFromHash, buildShareUrl } from "./share";

describe("share / round-trip", () => {
  it("encodes and decodes a basic payload", () => {
    const p = { v: 1 as const, prompt: "Summarise the document.", tier: "standard" as const };
    const enc = encodeShare(p);
    expect(typeof enc).toBe("string");
    expect(enc.length).toBeGreaterThan(0);
    const dec = decodeShare(enc);
    expect(dec).toEqual(p);
  });

  it("survives unicode and newlines", () => {
    const p = {
      v: 1 as const,
      prompt: "Résumé this — “smart quotes” + emoji 🔥\n\nLine two.\nLine three.",
      system: "You are 日本語 fluent.",
      models: ["claude-opus-4-7", "gpt-5-4"],
    };
    const dec = decodeShare(encodeShare(p));
    expect(dec).toEqual(p);
  });

  it("returns null for malformed input", () => {
    expect(decodeShare("not-base64!!!")).toBeNull();
    expect(decodeShare("aGVsbG8")).toBeNull(); // valid base64 but not our shape
  });

  it("parseShareFromHash extracts the payload", () => {
    const enc = encodeShare({ v: 1, prompt: "Hello world." });
    expect(parseShareFromHash(`#share=${enc}`)?.prompt).toBe("Hello world.");
    expect(parseShareFromHash(`#other=foo&share=${enc}`)?.prompt).toBe("Hello world.");
    expect(parseShareFromHash("#nothing")).toBeNull();
    expect(parseShareFromHash("")).toBeNull();
  });

  it("buildShareUrl composes a hash URL", () => {
    const url = buildShareUrl({ v: 1, prompt: "Hi." }, "https://tokenburn.app/");
    expect(url.startsWith("https://tokenburn.app/#share=")).toBe(true);
    const enc = url.split("#share=")[1];
    expect(decodeShare(enc)?.prompt).toBe("Hi.");
  });

  it("rejects payloads above the byte limit", () => {
    const big = { v: 1 as const, prompt: "x".repeat(20_000) };
    expect(() => encodeShare(big)).toThrow(/too large/);
  });
});
