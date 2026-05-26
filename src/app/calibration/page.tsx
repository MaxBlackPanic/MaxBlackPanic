"use client";

import { useState } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useTokenBurnStore } from "@/lib/store";
import { MODELS } from "@/lib/models";
import { countTokensForText, anthropicExactCount, geminiExactCount } from "@/lib/tokenizer";

interface Result {
  model: string;
  vendor: string;
  estimated: number;
  exact: number | null;
  deltaPct: number | null;
  error?: string;
}

const SAMPLE_PROMPTS = [
  "Write a haiku about the ocean.",
  "Summarise the French Revolution in five bullet points.",
  "Translate the following sentence into Japanese: The quick brown fox jumps over the lazy dog.",
  "Explain how diffusion models generate images, in plain English.",
  "Refactor the following Python function to use list comprehensions:\n\ndef squares(n):\n    out = []\n    for i in range(n):\n        out.append(i*i)\n    return out",
  '{"role":"system","content":"You are a senior engineer reviewing a pull request.","tools":[{"name":"comment","parameters":{"line":"integer","body":"string"}}]}',
];

export default function CalibrationPage() {
  const { anthropicApiKey, setAnthropicApiKey, geminiApiKey, setGeminiApiKey } = useTokenBurnStore();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [prompt, setPrompt] = useState(SAMPLE_PROMPTS[0]);

  async function runCalibration() {
    setRunning(true);
    setResults([]);
    const out: Result[] = [];
    for (const m of MODELS) {
      const est = countTokensForText(prompt, m);
      const row: Result = {
        model: m.label,
        vendor: m.vendor,
        estimated: est.tokens,
        exact: null,
        deltaPct: null,
      };
      try {
        if (m.vendor === "anthropic" && anthropicApiKey) {
          const exact = await anthropicExactCount(anthropicApiKey, m, { user: prompt });
          row.exact = exact;
          row.deltaPct = exact === 0 ? 0 : ((est.tokens - exact) / exact) * 100;
        } else if (m.vendor === "google" && geminiApiKey) {
          const exact = await geminiExactCount(geminiApiKey, m, { user: prompt });
          row.exact = exact;
          row.deltaPct = exact === 0 ? 0 : ((est.tokens - exact) / exact) * 100;
        } else if (m.vendor === "openai") {
          row.exact = est.tokens;
          row.deltaPct = 0;
        }
      } catch (e) {
        row.error = (e as Error).message;
      }
      out.push(row);
      setResults([...out]);
    }
    setRunning(false);
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container mx-auto max-w-5xl space-y-4 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Calibrate against vendor APIs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Run the local tokeniser against Anthropic&apos;s <code>count_tokens</code> and Google&apos;s{" "}
              <code>countTokens</code> endpoints on a sample prompt. OpenAI rows always show 0%
              delta because <code>gpt-tokenizer</code> is bit-exact for <code>o200k_base</code>.
              Keys are kept in memory for the session only.
            </p>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label className="text-xs">Anthropic API key</Label>
                <Input
                  type="password"
                  placeholder="sk-ant-…"
                  value={anthropicApiKey}
                  onChange={(e) => setAnthropicApiKey(e.target.value)}
                  className="mt-1 font-mono text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">Google AI Studio key</Label>
                <Input
                  type="password"
                  placeholder="AIza…"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  className="mt-1 font-mono text-xs"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Sample prompt</Label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                className="mt-1 w-full rounded-md border bg-background p-2 font-mono text-xs"
              />
              <div className="mt-2 flex flex-wrap gap-1">
                {SAMPLE_PROMPTS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => setPrompt(p)}
                    className="rounded-md border bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/40"
                  >
                    Sample {i + 1}
                  </button>
                ))}
              </div>
            </div>

            <Button onClick={runCalibration} disabled={running}>
              {running ? "Running…" : "Run calibration"}
            </Button>
          </CardContent>
        </Card>

        {results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Model</th>
                      <th className="px-3 py-2 text-right">Estimated</th>
                      <th className="px-3 py-2 text-right">Exact</th>
                      <th className="px-3 py-2 text-right">Δ %</th>
                      <th className="px-3 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => {
                      const within =
                        r.deltaPct === null
                          ? null
                          : Math.abs(r.deltaPct) <= (r.vendor === "anthropic" ? 8 : 10);
                      return (
                        <tr key={r.model} className="border-t">
                          <td className="px-3 py-2">{r.model}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.estimated}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {r.exact ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {r.deltaPct === null ? "—" : `${r.deltaPct.toFixed(2)}%`}
                          </td>
                          <td className="px-3 py-2">
                            {r.error ? (
                              <Badge variant="destructive">{r.error}</Badge>
                            ) : within === null ? (
                              <Badge variant="outline">no key</Badge>
                            ) : within ? (
                              <Badge variant="success">within band</Badge>
                            ) : (
                              <Badge variant="warn">out of band</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
