import { useState } from "react";
import { fmtBytes, type HeavyImage } from "../lib/project";

interface Props {
  items: HeavyImage[];
  rel: (path: string) => string;
}

/** Notification discrète : assets déjà au format optimisé (AVIF/WebP). */
export function OptimizedBanner({ items, rel }: Props) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  const bytes = items.reduce((n, i) => n + i.bytes, 0);

  return (
    <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 px-3 py-2 text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-emerald-300/90 cursor-pointer"
      >
        ✨ {items.length} asset{items.length > 1 ? "s" : ""} déjà optimisé
        {items.length > 1 ? "s" : ""} (AVIF/WebP) · {fmtBytes(bytes)}
        <span className="ml-auto text-emerald-400/60">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <ul className="mt-2 space-y-0.5 border-emerald-500/20 border-l-2 pl-3 text-emerald-200/60">
          {items.map((i) => (
            <li key={i.path} className="truncate font-mono">
              {rel(i.path)} · {fmtBytes(i.bytes)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
