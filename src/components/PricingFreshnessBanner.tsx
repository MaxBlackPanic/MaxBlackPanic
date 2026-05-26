"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { MODELS } from "@/lib/models";

/**
 * Pricing-staleness banner.
 *
 * Live-scraping every vendor's pricing page is brittle (the pages are
 * marketing HTML, not stable APIs), so instead we surface a banner when any
 * model's `lastVerified` date is older than `STALE_AFTER_DAYS`. Catalog
 * maintainers are expected to bump the date when they re-check prices.
 */

const STALE_AFTER_DAYS = 45;

export function PricingFreshnessBanner() {
  const stale = useMemo(() => {
    const now = Date.now();
    return MODELS.filter((m) => {
      const verifiedMs = Date.parse(m.lastVerified);
      if (Number.isNaN(verifiedMs)) return true;
      return (now - verifiedMs) / 86_400_000 > STALE_AFTER_DAYS;
    });
  }, []);

  if (stale.length === 0) return null;

  return (
    <div className="flex items-start gap-2 border-b border-warn/30 bg-warn/10 px-6 py-2 text-xs text-warn-foreground">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
      <div>
        <span className="font-semibold">
          {stale.length} model{stale.length === 1 ? "" : "s"} {stale.length === 1 ? "has" : "have"}{" "}
          pricing older than {STALE_AFTER_DAYS} days
        </span>
        <span className="ml-1 text-muted-foreground">
          ({stale
            .slice(0, 3)
            .map((m) => `${m.label} (${m.lastVerified})`)
            .join(", ")}
          {stale.length > 3 ? `, +${stale.length - 3} more` : ""}). Re-verify against the source
          URLs in <code>MODELS.md</code>.
        </span>
      </div>
    </div>
  );
}
