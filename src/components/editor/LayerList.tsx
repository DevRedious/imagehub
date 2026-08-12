import type { Layer } from "../../lib/editor/types";

interface Props {
  layers: Layer[];
  selected: string[];
  onSelect: (ids: string[]) => void;
  onChange: (layer: Layer) => void;
  onRaise: (id: string, delta: number) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onMirror: (id: string) => void;
}

const ICON: Record<Layer["kind"], string> = {
  image: "🖼",
  text: "T",
  shape: "◻",
};

/** Pile des calques, du dessus vers le dessous — comme on la lit dans un
 *  éditeur d'images, alors que le tableau est rangé dans l'ordre de dessin. */
export function LayerList({
  layers,
  selected,
  onSelect,
  onChange,
  onRaise,
  onDelete,
  onDuplicate,
  onMirror,
}: Props) {
  const stack = [...layers].reverse();

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <h3 className="px-0.5 text-xs font-semibold tracking-wider text-zinc-600">
        CALQUES
      </h3>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-xl bg-panel p-2">
        {stack.length === 0 && (
          <p className="px-1 py-4 text-center text-[11px] leading-relaxed text-zinc-600">
            Aucun calque.
            <br />
            Glisse un élément depuis la bibliothèque.
          </p>
        )}
        {stack.map((l) => {
          const active = selected.includes(l.id);
          return (
            <div
              key={l.id}
              className={`group flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-colors ${
                active
                  ? "bg-accent-soft text-zinc-100"
                  : "text-zinc-400 hover:bg-card"
              }`}
            >
              <button
                type="button"
                onClick={() => onChange({ ...l, visible: !l.visible })}
                title={l.visible ? "Masquer" : "Afficher"}
                className="w-4 shrink-0 cursor-pointer text-center text-[11px] transition-transform hover:scale-125"
              >
                {l.visible ? "👁" : "◌"}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  if (e.shiftKey || e.ctrlKey) {
                    onSelect(
                      active
                        ? selected.filter((s) => s !== l.id)
                        : [...selected, l.id],
                    );
                  } else {
                    onSelect([l.id]);
                  }
                }}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
                title={l.name}
              >
                <span className="w-3.5 shrink-0 text-center text-[10px] text-zinc-500">
                  {ICON[l.kind]}
                </span>
                <span className={`truncate ${l.visible ? "" : "opacity-50"}`}>
                  {l.kind === "text" ? l.text || l.name : l.name}
                </span>
              </button>
              <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                <button
                  type="button"
                  onClick={() => onRaise(l.id, 1)}
                  title="Monter"
                  className="cursor-pointer px-0.5 text-zinc-500 transition-transform hover:scale-125 hover:text-zinc-200"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => onRaise(l.id, -1)}
                  title="Descendre"
                  className="cursor-pointer px-0.5 text-zinc-500 transition-transform hover:scale-125 hover:text-zinc-200"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => onMirror(l.id)}
                  title="Créer le miroir"
                  className="cursor-pointer px-0.5 text-zinc-500 transition-transform hover:scale-125 hover:text-zinc-200"
                >
                  ⇋
                </button>
                <button
                  type="button"
                  onClick={() => onDuplicate(l.id)}
                  title="Dupliquer"
                  className="cursor-pointer px-0.5 text-zinc-500 transition-transform hover:scale-125 hover:text-zinc-200"
                >
                  ⧉
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(l.id)}
                  title="Supprimer"
                  className="cursor-pointer px-0.5 text-zinc-600 transition-transform hover:scale-125 hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
