"use client";

import { useEffect, useState } from "react";
import { Radar, Loader2, KeyRound, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatTokens, formatUSD } from "@/lib/pricing";
import {
  DEFAULT_ORACLE_ID,
  ORACLE_OPTIONS,
  estimateProbeCost,
  fingerprintPrompt,
  getCachedProbe,
  runProbe,
  type ProbeResult,
} from "@/lib/echoProbe";
import { useTokenBurnStore } from "@/lib/store";

interface Props {
  prompt: string;
  /** Caller's local prediction (expected output tokens) for comparison. */
  localPredictedOutput: number;
  /** Caller's local prediction's projected dollar cost on the cheapest selected real model. */
  localProjectedCost: number;
}

export function EchoProbe({ prompt, localPredictedOutput, localProjectedCost }: Props) {
  const { anthropicApiKey, geminiApiKey, setAnthropicApiKey, setGeminiApiKey } =
    useTokenBurnStore();
  const [openaiKey, setOpenaiKey] = useState(""); // local-only; not persisted
  const [oracleId, setOracleId] = useState(DEFAULT_ORACLE_ID);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [cached, setCached] = useState(false);

  const oracle = ORACLE_OPTIONS.find((o) => o.id === oracleId)!;
  const apiKey =
    oracle.vendor === "anthropic" ? anthropicApiKey : oracle.vendor === "google" ? geminiApiKey : openaiKey;
  const setApiKey =
    oracle.vendor === "anthropic" ? setAnthropicApiKey : oracle.vendor === "google" ? setGeminiApiKey : setOpenaiKey;

  // Refresh cached result when the prompt or oracle changes.
  useEffect(() => {
    setError(null);
    setCached(false);
    if (!prompt) {
      setResult(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const fp = await fingerprintPrompt(oracleId, prompt);
      if (cancelled) return;
      const c = getCachedProbe(fp);
      if (c) {
        setResult(c);
        setCached(true);
      } else {
        setResult(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prompt, oracleId]);

  const probeCostEstimate = prompt ? estimateProbeCost(prompt, oracleId) : 0;

  async function onProbe() {
    if (!apiKey) {
      setError(`No ${oracle.label} API key set. Paste it below — kept in memory only.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await runProbe({ prompt, oracleModelId: oracleId, apiKey });
      setResult(r);
      setCached(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Radar className="h-4 w-4 text-primary" />
          Echo Probe
          <Badge variant="outline" className="text-[10px]">
            spend cents to predict dollars
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Sends your prompt to a cheap oracle that returns a structural outline + a token estimate
          — without answering the prompt. Cached by prompt fingerprint.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Oracle</Label>
            <select
              value={oracleId}
              onChange={(e) => setOracleId(e.target.value)}
              className="mt-1 h-8 rounded-md border bg-background px-2 text-xs"
            >
              {ORACLE_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
              <KeyRound className="h-3 w-3" /> {oracle.label} key (session-only)
            </Label>
            <Input
              type="password"
              placeholder={oracle.vendor === "openai" ? "sk-..." : oracle.vendor === "anthropic" ? "sk-ant-..." : "AIza..."}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="mt-1 h-8 font-mono text-xs"
            />
          </div>
          <Button
            onClick={onProbe}
            disabled={busy || !prompt}
            className="h-8 gap-1.5 text-xs"
            title={`Estimated probe cost: ${formatUSD(probeCostEstimate)}`}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {busy ? "Probing…" : `Probe (~${formatUSD(probeCostEstimate)})`}
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-xs">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Oracle estimate:</span>
                <span className="font-mono">
                  {formatTokens(result.estimatedOutputTokens)} tokens (
                  {formatTokens(result.confidenceLow)}–{formatTokens(result.confidenceHigh)})
                </span>
                {cached && (
                  <Badge variant="outline" className="text-[10px]">
                    cached
                  </Badge>
                )}
              </div>
              <div className="text-muted-foreground">
                Probe cost: <span className="text-foreground">{formatUSD(result.probeCostUSD)}</span>{" "}
                · Your local prediction: {formatTokens(localPredictedOutput)} tok →{" "}
                {formatUSD(localProjectedCost)}
              </div>
            </div>
            <div className="text-muted-foreground">
              <span className="font-medium text-foreground">Predicted outline:</span>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded border bg-background p-2 font-mono text-[11px]">
                {result.structuralOutline}
              </pre>
            </div>
            {result.estimatedOutputTokens > 0 && localPredictedOutput > 0 && (
              <div className="text-muted-foreground">
                Δ vs local:{" "}
                <span
                  className={
                    Math.abs(result.estimatedOutputTokens - localPredictedOutput) /
                      Math.max(localPredictedOutput, 1) >
                    0.3
                      ? "text-warn"
                      : "text-emerald-500"
                  }
                >
                  {result.estimatedOutputTokens > localPredictedOutput ? "+" : ""}
                  {result.estimatedOutputTokens - localPredictedOutput} tokens (
                  {(
                    ((result.estimatedOutputTokens - localPredictedOutput) /
                      Math.max(localPredictedOutput, 1)) *
                    100
                  ).toFixed(0)}
                  %)
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
