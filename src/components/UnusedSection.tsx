import { useState } from "react";
import { fmtBytes, type HeavyImage } from "../lib/project";
import { Thumb } from "./Thumb";

interface Props {
  items: HeavyImage[];
  rel: (path: string) => string;
  onDelete: (items: HeavyImage[]) => void;
  onPreview: (path: string) => void;
}

const PAGE = 30;

/** Assets sans aucune référence dans le code ni les .md → suppression proposée. */
export function UnusedSection({ items, rel, onDelete, onPreview }: Props) {
  const [visible, setVisible] = useState(PAGE);
  if (items.length === 0) return null;

  const bytes = items.reduce((n, i) => n + i.bytes, 0);
  const shown = items.slice(0, visible);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-zinc-300">
          🗑 Assets non utilisés ({items.length})
        </h2>
        <span className="text-xs text-zinc-500">
          aucune référence dans le code ni les .md · {fmtBytes(bytes)}
        </span>
        <button
          type="button"
          onClick={() => onDelete(items)}
          className="ml-auto rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/30 cursor-pointer"
        >
          Tout supprimer
        </button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
        {shown.map((img) => (
          <div
            key={img.path}
            title={rel(img.path)}
            className="group relative rounded-xl bg-card p-2"
          >
            <button
              type="button"
              onClick={() => onPreview(img.path)}
              title="Voir l'original"
              className="block w-full cursor-zoom-in"
            >
              <Thumb path={img.path} fill />
            </button>
            <p className="mt-1.5 truncate text-xs">
              {img.path.split("/").pop()}
            </p>
            <p className="text-[10px] text-zinc-500">{fmtBytes(img.bytes)}</p>
            <button
              type="button"
              onClick={() => onDelete([img])}
              title="Supprimer"
              className="absolute top-3 right-3 hidden rounded-full bg-zinc-950/80 px-2 py-1 text-xs text-red-300 transition-transform group-hover:block hover:scale-110 cursor-pointer"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {items.length > visible && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + 50)}
          className="w-full rounded-xl bg-panel py-2 text-xs text-zinc-400 transition-colors hover:text-zinc-100 cursor-pointer"
        >
          Afficher plus ({items.length - visible} restants)
        </button>
      )}
    </section>
  );
}
