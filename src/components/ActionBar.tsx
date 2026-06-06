import { ACTIONS } from "../lib/actions";
import type { ActionId } from "../types/job";

interface Props {
  disabled: boolean;
  onRun: (action: ActionId) => void;
}

export function ActionBar({ disabled, onRun }: Props) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2">
      {ACTIONS.map((a) => (
        <button
          key={a.id}
          type="button"
          disabled={disabled || !a.ready}
          onClick={() => onRun(a.id)}
          title={a.ready ? a.hint : `${a.hint} — moteur pas encore installé`}
          className="rounded-xl bg-card px-3 py-3 text-sm font-medium transition-colors
            hover:bg-accent-soft disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
        >
          <span className="mr-1.5">{a.icon}</span>
          {a.label}
          {!a.ready && (
            <span className="ml-1 text-xs text-zinc-500">(bientôt)</span>
          )}
        </button>
      ))}
    </div>
  );
}
