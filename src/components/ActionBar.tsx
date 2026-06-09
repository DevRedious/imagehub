import {
  ACTIONS,
  type ActionDef,
  actionApplies,
  actionAvailability,
  CATEGORIES,
  type ToolsStatus,
} from "../lib/actions";
import type { ActionId } from "../types/job";

interface Props {
  tools: ToolsStatus | null;
  stagedExts: Set<string>;
  onRun: (action: ActionId) => void;
}

export function ActionBar({ tools, stagedExts, onRun }: Props) {
  const empty = stagedExts.size === 0;
  return (
    <div className="space-y-4">
      {CATEGORIES.map((cat) => {
        const actions = ACTIONS.filter((a) => a.category === cat.id);
        // Mixte : avec des fichiers présents, on masque la catégorie qui n'a
        // aucune action applicable. À vide, on montre tout (découvrabilité).
        const visible =
          empty || actions.some((a) => actionApplies(a, stagedExts));
        if (!visible) return null;
        return (
          <div key={cat.id} className="space-y-2">
            <h3 className="text-xs font-semibold tracking-wider text-zinc-600">
              {cat.label.toUpperCase()}
            </h3>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2">
              {actions.map((a) => (
                <ActionButton
                  key={a.id}
                  action={a}
                  tools={tools}
                  stagedExts={stagedExts}
                  empty={empty}
                  onRun={onRun}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface ButtonProps {
  action: ActionDef;
  tools: ToolsStatus | null;
  stagedExts: Set<string>;
  empty: boolean;
  onRun: (action: ActionId) => void;
}

function ActionButton({
  action,
  tools,
  stagedExts,
  empty,
  onRun,
}: ButtonProps) {
  const avail = actionAvailability(action, tools, stagedExts);
  const ready = avail.state === "ready";
  // raison en sous-texte seulement quand c'est un vrai blocage (type/moteur) ;
  // à vide on se contente de griser + l'info-bulle, pour ne pas répéter partout.
  const reason = avail.state === "disabled" ? avail.reason : "";
  return (
    <button
      type="button"
      disabled={!ready}
      onClick={() => onRun(action.id)}
      title={ready ? action.hint : reason}
      className="cursor-pointer rounded-xl bg-card px-3 py-3 text-sm font-medium transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-35"
    >
      <span className="mr-1.5">{action.icon}</span>
      {action.label}
      {!ready && !empty && (
        <span className="mt-0.5 block text-[11px] font-normal text-zinc-500">
          {reason}
        </span>
      )}
    </button>
  );
}
