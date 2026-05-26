"use client";

import { ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTokens, formatUSD } from "@/lib/pricing";

interface Props {
  before: string;
  after: string;
  beforeTokens: number;
  afterTokens: number;
  beforeCost: number;
  afterCost: number;
  onAccept: () => void;
  onRevert: () => void;
}

export function DiffView({
  before,
  after,
  beforeTokens,
  afterTokens,
  beforeCost,
  afterCost,
  onAccept,
  onRevert,
}: Props) {
  const tokenSaving = beforeTokens - afterTokens;
  const costSaving = beforeCost - afterCost;
  const tokenPct = beforeTokens === 0 ? 0 : (tokenSaving / beforeTokens) * 100;
  const costPct = beforeCost === 0 ? 0 : (costSaving / beforeCost) * 100;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Before vs optimised</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={tokenSaving > 0 ? "success" : "outline"}>
            {tokenSaving > 0 ? "−" : ""}
            {formatTokens(Math.abs(tokenSaving))} tokens ({tokenPct.toFixed(1)}%)
          </Badge>
          <Badge variant={costSaving > 0 ? "success" : "outline"}>
            {costSaving > 0 ? "−" : ""}
            {formatUSD(Math.abs(costSaving))} ({costPct.toFixed(1)}%)
          </Badge>
          <Button size="sm" variant="default" onClick={onAccept} className="gap-1.5">
            <Check className="h-3.5 w-3.5" />
            Accept
          </Button>
          <Button size="sm" variant="ghost" onClick={onRevert} className="gap-1.5">
            <X className="h-3.5 w-3.5" />
            Revert
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr]">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Original ({formatTokens(beforeTokens)} • {formatUSD(beforeCost)})
            </div>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">
              {before}
            </pre>
          </div>
          <div className="hidden items-center justify-center md:flex">
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-emerald-500">
              Optimised ({formatTokens(afterTokens)} • {formatUSD(afterCost)})
            </div>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-emerald-700/30 bg-emerald-500/5 p-3 text-xs">
              {after}
            </pre>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
