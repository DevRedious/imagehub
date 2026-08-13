import { useState } from "react";
import type { PatternPiece } from "../../lib/pattern/types";

/** Un glyphe par nature : une liste qui mêle photos découpées, coups de crayon
 *  et polygones devient illisible si tout se ressemble. */
function glyphe(piece: PatternPiece): string {
  switch (piece.kind) {
    case "image":
      return "🖼";
    case "stroke":
      return piece.points.length > 2 ? "✎" : "╱";
    default:
      switch (piece.shape) {
        case "ellipse":
          return "◯";
        case "rect":
          return "▭";
        default:
          return "△";
      }
  }
}

interface Props {
  pieces: PatternPiece[];
  selected: string[];
  onSelect: (ids: string[]) => void;
  onChange: (piece: PatternPiece) => void;
  onRaise: (id: string, delta: number) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

/** Pile des calques, du dessus vers le dessous — comme on la lit dans un
 *  éditeur d'images, alors que le tableau est rangé dans l'ordre de dessin.
 *
 *  Le renommage se fait sur place, au double-clic : un motif finit avec vingt
 *  pièces tirées du même fichier, et « feuille-03 » douze fois de suite ne dit
 *  plus rien de ce qu'on cherche. */
export function PieceList({
  pieces,
  selected,
  onSelect,
  onChange,
  onRaise,
  onDelete,
  onDuplicate,
}: Props) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const stack = [...pieces].reverse();

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <h3 className="px-0.5 text-xs font-semibold tracking-wider text-zinc-600">
        CALQUES
      </h3>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-xl bg-panel p-2">
        {stack.length === 0 && (
          <p className="px-1 py-4 text-center text-[11px] leading-relaxed text-zinc-600">
            Aucune pièce.
            <br />
            Glisse un élément depuis la bibliothèque, ou sème-en une poignée.
          </p>
        )}
        {stack.map((p) => {
          const active = selected.includes(p.id);
          return (
            <div
              key={p.id}
              className={`group flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-colors ${
                active
                  ? "bg-accent-soft text-zinc-100"
                  : "text-zinc-400 hover:bg-card"
              }`}
            >
              <button
                type="button"
                onClick={() => onChange({ ...p, visible: !p.visible })}
                title={p.visible ? "Masquer" : "Afficher"}
                className="w-4 shrink-0 cursor-pointer text-center text-[11px] transition-transform hover:scale-125"
              >
                {p.visible ? "👁" : "◌"}
              </button>

              {renaming === p.id ? (
                <input
                  // biome-ignore lint/a11y/noAutofocus: le champ n'existe que parce qu'on vient de demander à renommer
                  autoFocus
                  defaultValue={p.name}
                  // Le nom est SÉLECTIONNÉ à l'ouverture : on renomme presque
                  // toujours pour remplacer, et sans ça le curseur se pose en
                  // fin de champ — taper « Feuille » sur « Crayon » donnait
                  // « CrayonFeuille », qu'il fallait effacer à la main.
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={(e) => {
                    onChange({ ...p, name: e.target.value.trim() || p.name });
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  className="min-w-0 flex-1 rounded bg-card px-1.5 py-0.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-accent"
                />
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    if (e.shiftKey || e.ctrlKey) {
                      onSelect(
                        active
                          ? selected.filter((s) => s !== p.id)
                          : [...selected, p.id],
                      );
                    } else {
                      onSelect([p.id]);
                    }
                  }}
                  onDoubleClick={() => setRenaming(p.id)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
                  title={`${p.name}\nDouble-clic pour renommer`}
                >
                  <span className="w-3.5 shrink-0 text-center text-[10px] text-zinc-500">
                    {glyphe(p)}
                  </span>
                  <span className={`truncate ${p.visible ? "" : "opacity-50"}`}>
                    {p.name}
                  </span>
                </button>
              )}

              <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                <button
                  type="button"
                  onClick={() => onRaise(p.id, 1)}
                  title="Monter"
                  className="cursor-pointer px-0.5 text-zinc-500 transition-transform hover:scale-125 hover:text-zinc-200"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => onRaise(p.id, -1)}
                  title="Descendre"
                  className="cursor-pointer px-0.5 text-zinc-500 transition-transform hover:scale-125 hover:text-zinc-200"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => onDuplicate(p.id)}
                  title="Dupliquer (Ctrl+D)"
                  className="cursor-pointer px-0.5 text-zinc-500 transition-transform hover:scale-125 hover:text-zinc-200"
                >
                  ⧉
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(p.id)}
                  title="Supprimer (Suppr)"
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
