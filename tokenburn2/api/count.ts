// TokenBurn 2.0 — serverless token-counting proxy.
//
// A single function so provider API keys stay server-side and the user's prompt
// is never sent to a third party from the browser. Deployable as a Vercel/
// Netlify Edge function (standard Web Request/Response, no extra deps).
//
// Required env vars (set whichever providers you want exact counts for):
//   ANTHROPIC_API_KEY   — enables exact Anthropic counts
//   GEMINI_API_KEY      — enables exact Gemini counts
//   APP_ORIGIN          — the exact origin allowed by CORS, e.g. https://tokenburn.app
//
// If a provider's key is missing, this returns { tokens: 0, exact: false } so
// the client falls back to its clearly-labelled offline estimate.
//
// SECURITY: prompt text is never logged.

export const config = { runtime: "edge" };

type Body = {
  provider?: "anthropic" | "google";
  model?: string;
  text?: string;
};

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = process.env.APP_ORIGIN ?? "";
  // Only reflect the configured origin; otherwise omit (browser will block).
  const allow = origin && origin === allowed ? origin : allowed;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

function json(data: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(origin) });
}

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405, origin);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "invalid json" }, 400, origin);
  }

  const { provider, model, text } = body;
  if (!provider || !model || typeof text !== "string") {
    return json({ error: "provider, model and text are required" }, 400, origin);
  }

  try {
    if (provider === "anthropic") {
      return json(await countAnthropic(model, text), 200, origin);
    }
    if (provider === "google") {
      return json(await countGemini(model, text), 200, origin);
    }
    return json({ error: "unsupported provider" }, 400, origin);
  } catch {
    // Never leak prompt content or internal errors; client falls back offline.
    return json({ tokens: 0, exact: false }, 200, origin);
  }
}

async function countAnthropic(
  model: string,
  text: string
): Promise<{ tokens: number; exact: boolean }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { tokens: 0, exact: false };

  const res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: text }],
    }),
  });
  if (!res.ok) return { tokens: 0, exact: false };
  const data = (await res.json()) as { input_tokens?: number };
  if (typeof data.input_tokens !== "number") return { tokens: 0, exact: false };
  return { tokens: data.input_tokens, exact: true };
}

async function countGemini(
  model: string,
  text: string
): Promise<{ tokens: number; exact: boolean }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { tokens: 0, exact: false };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:countTokens?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text }] }] }),
  });
  if (!res.ok) return { tokens: 0, exact: false };
  const data = (await res.json()) as { totalTokens?: number };
  if (typeof data.totalTokens !== "number") return { tokens: 0, exact: false };
  return { tokens: data.totalTokens, exact: true };
}
