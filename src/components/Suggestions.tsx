"use client";

import { Sparkles, Wand2, AlertCircle, Info, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { PromptSuggestion } from "@/lib/analyser";

interface Props {
  suggestions: PromptSuggestion[];
  promptText: string;
  onApply: (s: PromptSuggestion) => void;
  onApplyAll: () => void;
}

const SEVERITY: Record<
  PromptSuggestion["severity"],
  { icon: typeof AlertCircle; className: string; label: string }
> = {
  high: { icon: AlertCircle, className: "text-destructive", label: "High" },
  medium: { icon: AlertCircle, className: "text-warn", label: "Medium" },
  low: { icon: Circle, className: "text-muted-foreground", label: "Low" },
  info: { icon: Info, className: "text-blue-400", label: "Info" },
};

export function Suggestions({ suggestions, promptText, onApply, onApplyAll }: Props) {
  if (suggestions.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-emerald-500" />
          No efficiency issues detected. This prompt looks tight.
        </CardContent>
      </Card>
    );
  }

  const applicable = suggestions.filter((s) => s.apply);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-muted-foreground">
          {suggestions.length} suggestion{suggestions.length === 1 ? "" : "s"}
        </div>
        {applicable.length > 0 && (
          <Button size="sm" variant="default" onClick={onApplyAll} className="gap-1.5">
            <Wand2 className="h-3.5 w-3.5" />
            Apply all ({applicable.length})
          </Button>
        )}
      </div>
      <ul className="space-y-2">
        {suggestions.map((s) => {
          const Icon = SEVERITY[s.severity].icon;
          return (
            <li key={s.id}>
              <Card>
                <CardContent className="py-3">
                  <div className="flex items-start gap-3">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${SEVERITY[s.severity].className}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm">{s.title}</span>
                        {s.estimatedTokenSaving > 0 && (
                          <Badge variant="success" className="text-[10px]">
                            −{s.estimatedTokenSaving} tokens
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">
                          {s.category}
                        </Badge>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {s.confidence} confidence
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{s.detail}</p>
                    </div>
                    {s.apply && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => onApply(s)}
                        disabled={!promptText}
                      >
                        Apply
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
