/**
 * URL share encoder/decoder. We stuff a small JSON payload into the URL
 * fragment (`#share=...`) so the prompt is never sent over the wire — the
 * fragment never leaves the browser unless the user explicitly pastes the
 * URL elsewhere. Payload is base64url-encoded JSON.
 */

import type { Tier } from "./pricing";

export interface SharePayload {
  v: 1;
  prompt: string;
  system?: string;
  tier?: Tier;
  models?: string[];
  reasoning?: number;
  cachedFrac?: number;
}

function base64UrlEncode(s: string): string {
  if (typeof window === "undefined") return Buffer.from(s, "utf-8").toString("base64");
  // Browser path: use btoa with UTF-8 → binary conversion.
  const utf8 = new TextEncoder().encode(s);
  let bin = "";
  for (const b of utf8) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(s: string): string {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = norm + "===".slice((norm.length + 3) % 4);
  if (typeof window === "undefined") return Buffer.from(padded, "base64").toString("utf-8");
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Maximum encoded payload length (URL spec is ~2KB practical, but hashes tolerate more). */
export const MAX_SHARE_BYTES = 16_000;

export function encodeShare(payload: SharePayload): string {
  const json = JSON.stringify(payload);
  const encoded = base64UrlEncode(json);
  if (encoded.length > MAX_SHARE_BYTES) {
    throw new Error(
      `Share payload too large (${encoded.length} bytes > ${MAX_SHARE_BYTES} byte limit). Trim the prompt or use a shorter system message.`,
    );
  }
  return encoded;
}

export function decodeShare(encoded: string): SharePayload | null {
  try {
    const json = base64UrlDecode(encoded);
    const parsed = JSON.parse(json);
    if (parsed && parsed.v === 1 && typeof parsed.prompt === "string") {
      return parsed as SharePayload;
    }
    return null;
  } catch {
    return null;
  }
}

/** Build a complete share URL from the current location and a payload. */
export function buildShareUrl(payload: SharePayload, origin?: string): string {
  const encoded = encodeShare(payload);
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin + window.location.pathname : "");
  return `${base}#share=${encoded}`;
}

/** Parse `#share=...` from a URL hash. Returns null when not present or invalid. */
export function parseShareFromHash(hash: string): SharePayload | null {
  const m = hash.match(/(?:^|[#&])share=([A-Za-z0-9_\-]+)/);
  if (!m) return null;
  return decodeShare(m[1]);
}
