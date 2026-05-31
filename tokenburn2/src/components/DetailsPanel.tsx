import { money, tokens } from "../format";
import type { CostBreakdown, ModelComparison } from "../cost";
import type { Model } from "../pricing";

type Props = {
  model: Model;
  inputTokens: number;
  forecastOutputTokens: number;
  maxTokens: number;
  cachedTokens: number;
  batch: boolean;
  expected: CostBreakdown;
  worstCase: CostBreakdown;
  comparison: ModelComparison[];
  callsPerMonth: number;
};

/** Per-token breakdown, cache/batch maths, and the cross-model table. */
export function DetailsPanel({
  model,
  inputTokens,
  forecastOutputTokens,
  maxTokens,
  cachedTokens,
  batch,
  expected,
  worstCase,
  comparison,
  callsPerMonth,
}: Props) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Per-call breakdown</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          <Row k="Input tokens" v={tokens(inputTokens)} />
          <Row k="Cached tokens" v={tokens(cachedTokens)} />
          <Row k="Forecast output" v={tokens(forecastOutputTokens)} />
          <Row k="Max output" v={tokens(maxTokens)} />
          <Row k="Input rate" v={`$${expected.appliedInputRate}/M`} />
          <Row k="Output rate" v={`$${expected.appliedOutputRate}/M`} />
          <Row k="Cache read rate" v={`$${expected.appliedCacheRate}/M`} />
          <Row k="Batch" v={batch ? "on (×0.5)" : "off"} />
          <Row k="Context tier" v={expected.overTier ? "high tier" : "standard"} />
        </dl>
        <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Calc
            label="Expected"
            input={expected.inputCost}
            output={expected.outputCost}
            total={expected.total}
          />
          <Calc
            label="Worst case"
            input={worstCase.inputCost}
            output={worstCase.outputCost}
            total={worstCase.total}
            warn
          />
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Same prompt across models</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1 pr-4 font-medium">Model</th>
                <th className="py-1 pr-4 text-right font-medium">Expected / call</th>
                <th className="py-1 pr-4 text-right font-medium">Worst case</th>
                <th className="py-1 text-right font-medium">Expected / month</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => {
                const isCurrent = row.model.id === model.id;
                return (
                  <tr
                    key={row.model.id}
                    className={`border-t border-slate-100 ${
                      isCurrent ? "bg-accent-50 font-medium" : ""
                    }`}
                  >
                    <td className="py-1.5 pr-4">
                      {row.model.label}
                      {isCurrent && (
                        <span className="ml-2 rounded bg-accent-500 px-1.5 py-0.5 text-xs text-white">
                          current
                        </span>
                      )}
                    </td>
                    <td className="tabular py-1.5 pr-4 text-right">{money(row.expected.total)}</td>
                    <td className="tabular py-1.5 pr-4 text-right text-amber-700">
                      {money(row.worstCase.total)}
                    </td>
                    <td className="tabular py-1.5 text-right">
                      {money(row.expected.total * Math.max(callsPerMonth, 0))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Cross-model output forecasts assume the same expected output length. Token counts for
          non-OpenAI models are estimates unless the proxy endpoint is configured.
        </p>
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 py-1">
      <dt className="text-slate-500">{k}</dt>
      <dd className="tabular font-medium text-slate-700">{v}</dd>
    </div>
  );
}

function Calc({
  label,
  input,
  output,
  total,
  warn,
}: {
  label: string;
  input: number;
  output: number;
  total: number;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        warn ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"
      }`}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="tabular mt-1 text-slate-700">
        {money(input)} input + {money(output)} output ={" "}
        <span className="font-semibold">{money(total)}</span>
      </div>
    </div>
  );
}
