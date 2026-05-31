import { money } from "../format";

type Props = {
  inputCost: number;
  expectedTotal: number;
  worstCaseTotal: number;
  /** True when any figure depends on an estimated (non-exact) token count. */
  estimated: boolean;
};

/**
 * The three cost figures — the visual centre of the page. Worst case is given a
 * muted/warning treatment so it always reads as a ceiling, never a quote.
 */
export function CostHeadline({ inputCost, expectedTotal, worstCaseTotal, estimated }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Figure
        label="Input cost"
        value={inputCost}
        sub={estimated ? "≈ estimate" : "exact"}
        tone="neutral"
      />
      <Figure
        label="Likely total"
        value={expectedTotal}
        sub="≈ estimate (forecast output)"
        tone="accent"
        emphasis
      />
      <Figure
        label="Worst case"
        value={worstCaseTotal}
        sub="ceiling — max output"
        tone="warning"
      />
    </div>
  );
}

function Figure({
  label,
  value,
  sub,
  tone,
  emphasis,
}: {
  label: string;
  value: number;
  sub: string;
  tone: "neutral" | "accent" | "warning";
  emphasis?: boolean;
}) {
  const toneClasses =
    tone === "accent"
      ? "border-accent-500 bg-accent-50"
      : tone === "warning"
        ? "border-amber-300 bg-amber-50"
        : "border-slate-200 bg-white";
  const valueColour =
    tone === "accent" ? "text-accent-700" : tone === "warning" ? "text-amber-700" : "text-slate-800";

  return (
    <div className={`rounded-2xl border p-5 ${toneClasses}`}>
      <div className="text-sm font-medium text-slate-600">{label}</div>
      <div
        className={`tabular mt-1 font-semibold ${valueColour} ${
          emphasis ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl"
        }`}
      >
        {money(value)}
      </div>
      <div
        className={`mt-1 text-xs ${tone === "warning" ? "text-amber-700" : "text-slate-500"}`}
      >
        {sub}
      </div>
    </div>
  );
}
