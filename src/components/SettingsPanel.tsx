"use client";

import { Lock, Unlock, KeyRound, RotateCcw } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MODELS } from "@/lib/models";
import { useTokenBurnStore } from "@/lib/store";
import { Badge } from "./ui/badge";

export function SettingsPanel() {
  const {
    tier,
    setTier,
    reasoningBudget,
    setReasoningBudget,
    cachedInputFraction,
    setCachedInputFraction,
    cacheWriteTokens,
    setCacheWriteTokens,
    cacheWriteTtl,
    setCacheWriteTtl,
    exactCountEnabled,
    setExactCountEnabled,
    anthropicApiKey,
    setAnthropicApiKey,
    geminiApiKey,
    setGeminiApiKey,
    selectedModelIds,
    toggleModel,
    showSystem,
    setShowSystem,
    showVolume,
    toggleVolume,
    showAttachments,
    setShowAttachments,
    abMode,
    setAbMode,
    resetPrompt,
  } = useTokenBurnStore();

  return (
    <Card>
      <CardContent className="space-y-5 py-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pricing tier
          </div>
          <div
            className="mt-2 inline-flex gap-1 rounded-md bg-muted p-1"
            role="radiogroup"
            aria-label="Pricing tier"
          >
            {(["standard", "batch", "cached"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTier(t)}
                role="radio"
                aria-checked={tier === t}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  tier === t
                    ? "bg-background text-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "standard" ? "Standard" : t === "batch" ? "Batch (−50%)" : "Cached (−90%)"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Reasoning budget
          </div>
          <div className="mt-2 flex items-center gap-3">
            <Input
              type="number"
              min={0}
              step={512}
              value={reasoningBudget}
              onChange={(e) => setReasoningBudget(Math.max(0, parseInt(e.target.value || "0", 10)))}
              className="w-32"
            />
            <span className="text-xs text-muted-foreground">
              max tokens, billed at output rate. 0 disables.
            </span>
          </div>
        </div>

        {tier === "cached" && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cache hit fraction
            </div>
            <div className="mt-2 flex items-center gap-3">
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={cachedInputFraction}
                onChange={(e) =>
                  setCachedInputFraction(
                    Math.min(1, Math.max(0, parseFloat(e.target.value || "0"))),
                  )
                }
                className="w-32"
              />
              <span className="text-xs text-muted-foreground">
                0–1. e.g. 0.9 = 90% of input is cached.
              </span>
            </div>
          </div>
        )}

        {tier === "cached" && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cache write (this call)
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input
                type="number"
                min={0}
                step={100}
                value={cacheWriteTokens}
                onChange={(e) => setCacheWriteTokens(parseInt(e.target.value || "0", 10))}
                className="w-32"
                aria-label="Tokens being written to the cache this call"
              />
              <span className="text-xs text-muted-foreground">tokens written</span>
              <div className="inline-flex gap-1 rounded-md bg-muted p-1">
                {(["5m", "1h"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setCacheWriteTtl(t)}
                    className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                      cacheWriteTtl === t
                        ? "bg-background text-foreground shadow"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    aria-label={`Cache TTL ${t}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Anthropic charges 1.25× base input for 5-minute TTL, 2× for 1-hour. Use this for the
              first call that populates the cache; subsequent cached-hit calls don&apos;t pay it.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="sys" className="text-xs uppercase tracking-wider text-muted-foreground">
              System prompt
            </Label>
            <Switch id="sys" checked={showSystem} onCheckedChange={setShowSystem} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="vol" className="text-xs uppercase tracking-wider text-muted-foreground">
              Volume calculator
            </Label>
            <Switch id="vol" checked={showVolume} onCheckedChange={toggleVolume} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="atts" className="text-xs uppercase tracking-wider text-muted-foreground">
              Attachments &amp; context
            </Label>
            <Switch id="atts" checked={showAttachments} onCheckedChange={setShowAttachments} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="ab" className="text-xs uppercase tracking-wider text-muted-foreground">
              A/B compare mode
            </Label>
            <Switch id="ab" checked={abMode} onCheckedChange={setAbMode} />
          </div>
        </div>

        <div className="rounded-md border bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {exactCountEnabled ? (
                  <Unlock className="h-3 w-3" />
                ) : (
                  <Lock className="h-3 w-3" />
                )}
                Exact vendor counts
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Sends your prompt to Anthropic / Google count-tokens endpoints. Disabled by default
                — local estimates are used otherwise.
              </p>
            </div>
            <Switch checked={exactCountEnabled} onCheckedChange={setExactCountEnabled} />
          </div>
          {exactCountEnabled && (
            <div className="mt-3 space-y-2">
              <div>
                <Label htmlFor="ak" className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <KeyRound className="h-3 w-3" /> Anthropic API key (session only)
                </Label>
                <Input
                  id="ak"
                  type="password"
                  placeholder="sk-ant-…"
                  value={anthropicApiKey}
                  onChange={(e) => setAnthropicApiKey(e.target.value)}
                  className="mt-1 font-mono text-xs"
                />
              </div>
              <div>
                <Label htmlFor="gk" className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <KeyRound className="h-3 w-3" /> Google AI Studio key (session only)
                </Label>
                <Input
                  id="gk"
                  type="password"
                  placeholder="AIza…"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  className="mt-1 font-mono text-xs"
                />
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Models compared ({selectedModelIds.length})
          </div>
          <div
            className="mt-2 flex max-h-48 flex-wrap gap-1 overflow-y-auto pr-1"
            role="group"
            aria-label="Models to include in the comparison"
          >
            {MODELS.map((m) => {
              const on = selectedModelIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggleModel(m.id)}
                  aria-pressed={on}
                  className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                    on
                      ? "border-primary/40 bg-primary/15 text-foreground"
                      : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
            <Badge variant="outline" className="text-[10px]">Estimate-only:</Badge>
            <span>DeepSeek, Grok, Llama, Mistral — counts shown ±10%.</span>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={resetPrompt}
          className="w-full justify-start gap-2 text-xs text-muted-foreground"
        >
          <RotateCcw className="h-3 w-3" />
          Reset prompt &amp; attachments to defaults
        </Button>
      </CardContent>
    </Card>
  );
}
