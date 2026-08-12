import { convertFileSrc } from "@tauri-apps/api/core";
import type { Asset } from "../../lib/library";

interface Props {
  assets: Asset[];
  loading: boolean;
  onAdd: (asset: Asset) => void;
  onDelete: (asset: Asset) => void;
  onImport: () => void;
  onSplitSheet: () => void;
}

/** Bibliothèque d'éléments : le stock de pièces détachées dans lequel on
 *  puise pour composer. */
export function AssetPanel({
  assets,
  loading,
  onAdd,
  onDelete,
  onImport,
  onSplitSheet,
}: Props) {
  return (
    <div className="flex min-h-0 w-56 shrink-0 flex-col gap-2">
      <div className="flex items-baseline justify-between px-0.5">
        <h3 className="text-xs font-semibold tracking-wider text-zinc-600">
          BIBLIOTHÈQUE
        </h3>
        {assets.length > 0 && (
          <span className="text-[11px] tabular-nums text-zinc-600">
            {assets.length}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onSplitSheet}
        className="cursor-pointer rounded-lg bg-accent-soft px-3 py-2 text-xs font-medium text-zinc-100 transition-colors hover:bg-accent-soft/70"
      >
        ✂️ Découper une planche…
      </button>
      <button
        type="button"
        onClick={onImport}
        className="cursor-pointer rounded-lg bg-card px-3 py-2 text-xs text-zinc-300 transition-colors hover:bg-accent-soft"
      >
        Importer des éléments…
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-panel p-2">
        {loading ? (
          <p className="px-1 py-6 text-center text-[11px] text-zinc-600">
            Lecture…
          </p>
        ) : assets.length === 0 ? (
          <p className="px-1 py-6 text-center text-[11px] leading-relaxed text-zinc-600">
            Vide pour l'instant.
            <br />
            Découpe une planche pour la remplir d'un coup.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {assets.map((a) => (
              <div
                key={a.path}
                className="group relative aspect-square overflow-hidden rounded-lg bg-card transition-colors hover:bg-accent-soft"
              >
                {/* la pièce elle-même est un bouton : elle se pose au clic
                    comme au glisser, et reste atteignable au clavier */}
                <button
                  type="button"
                  className="h-full w-full cursor-grab"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("imagehub/asset", a.path);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => onAdd(a)}
                  title={`${a.name}\nCliquer pour poser, ou glisser sur le canevas`}
                >
                  {/* affichage seul : ces vignettes ne sont jamais exportées,
                      la contrainte d'origine du canevas ne s'applique pas ici */}
                  <img
                    src={convertFileSrc(a.path)}
                    alt=""
                    className="h-full w-full object-contain p-1.5"
                    draggable={false}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(a)}
                  title="Retirer de la bibliothèque"
                  className="absolute top-0.5 right-0.5 hidden h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-black/70 text-[11px] text-zinc-300 transition-colors group-hover:flex hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
