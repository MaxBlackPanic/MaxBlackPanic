import { money } from "../format";
import type { Suggestion } from "../suggestions";

export function SuggestionList({ suggestions }: { suggestions: Suggestion[] }) {
  if (suggestions.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No savings to suggest right now — your setup already looks lean.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {suggestions.map((s) => (
        <li
          key={s.id}
          className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="sm:pr-4">
            <div className="font-medium text-slate-800">{s.title}</div>
            <div className="mt-0.5 text-sm text-slate-600">{s.detail}</div>
          </div>
          {s.savingPerMonth > 0 ? (
            <div className="shrink-0 text-right">
              <div className="tabular font-semibold text-emerald-600">
                save {money(s.savingPerCall)}/call
              </div>
              <div className="tabular text-sm text-emerald-700">
                {money(s.savingPerMonth)}/month
              </div>
            </div>
          ) : (
            <div className="shrink-0 text-right text-xs font-medium uppercase tracking-wide text-amber-600">
              bounds risk
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
