import { convertFileSrc } from "@tauri-apps/api/core";
import type { Asset } from "../../lib/library";
import { TrashIcon } from "../icons";

interface Props {
  assets: Asset[];
  loading: boolean;
  onAdd: (asset: Asset) => void;
  onDelete: (asset: Asset) => void;
  onImport: () => void;
  onSplitSheet: () => void;
  onClear: () => void;
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
  onClear,
}: Props) {
  return (
    <div className="flex min-h-0 w-56 shrink-0 flex-col gap-2">
      <div className="flex items-baseline justify-between px-0.5">
        <h3 className="text-xs font-semibold tracking-wider text-zinc-600">
          BIBLIOTHÈQUE
        </h3>
        {assets.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClear}
              title="Retirer toutes les pièces de la bibliothèque"
              className="flex cursor-pointer items-center gap-1 rounded-md border border-zinc-700 bg-card px-1.5 py-0.5 text-[11px] text-zinc-400 transition-colors hover:border-red-500/70 hover:bg-red-500/15 hover:text-red-400"
            >
              <TrashIcon size={11} />
              Tout
            </button>
            <span className="text-[11px] tabular-nums text-zinc-600">
              {assets.length}
            </span>
          </div>
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
                {/* Un vrai bouton, pas un glyphe posé sur l'image : surface
                    opaque, bordure, icône, état au survol. Et visible en
                    permanence — caché, il passait pour inexistant, alors que
                    c'est le seul moyen de retirer une pièce. */}
                <button
                  type="button"
                  onClick={() => onDelete(a)}
                  title={`Retirer « ${a.name} » de la bibliothèque`}
                  aria-label={`Retirer ${a.name} de la bibliothèque`}
                  className="absolute top-1.5 right-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900/90 text-zinc-400 shadow-sm shadow-black/40 transition-colors hover:border-red-500/70 hover:bg-red-500/20 hover:text-red-400 focus-visible:border-red-500/70 focus-visible:text-red-400 focus-visible:outline-none"
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
