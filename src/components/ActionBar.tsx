import { ACTIONS, missingEngines, type ToolsStatus } from "../lib/actions";
import type { ActionId } from "../types/job";

interface Props {
  disabled: boolean;
  tools: ToolsStatus | null;
  onRun: (action: ActionId) => void;
}

export function ActionBar({ disabled, tools, onRun }: Props) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2">
      {ACTIONS.map((a) => {
        const missing = missingEngines(a, tools);
        const ready = missing.length === 0;
        return (
          <button
            key={a.id}
            type="button"
            disabled={disabled || !ready}
            onClick={() => onRun(a.id)}
            title={
              ready
                ? a.hint
                : `${a.hint} — moteur manquant : ${missing.join(", ")}`
            }
            className="rounded-xl bg-card px-3 py-3 text-sm font-medium transition-colors
              hover:bg-accent-soft disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
          >
            <span className="mr-1.5">{a.icon}</span>
            {a.label}
            {!ready && (
              <span className="ml-1 text-xs text-zinc-500">(indispo)</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
