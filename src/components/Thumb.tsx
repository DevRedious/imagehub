import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

interface Props {
  path: string;
  size?: number;
  /** mode galerie : occupe la largeur de la carte, hauteur fixe */
  fill?: boolean;
}

/** cache mémoire chemin original → chemin de la vignette (évite les
 *  allers-retours backend quand les listes se re-rendent) */
const thumbCache = new Map<string, string>();

/** Miniature d'un fichier image local, vignettée côté Rust (cache disque)
 *  pour ne jamais faire décoder la pleine résolution à WebKit. */
export function Thumb({ path, size = 48, fill = false }: Props) {
  const [src, setSrc] = useState<string | null>(
    () => thumbCache.get(path) ?? null,
  );

  useEffect(() => {
    if (thumbCache.has(path)) {
      setSrc(thumbCache.get(path) ?? null);
      return;
    }
    let alive = true;
    setSrc(null);
    invoke<string>("make_thumb", { path })
      .then((p) => {
        const url = convertFileSrc(p);
        thumbCache.set(path, url);
        if (alive) setSrc(url);
      })
      .catch(() => {
        if (alive) setSrc(convertFileSrc(path));
      });
    return () => {
      alive = false;
    };
  }, [path]);

  const cls = fill
    ? "h-24 w-full rounded-lg bg-zinc-900 object-contain"
    : "shrink-0 rounded-lg bg-zinc-900 object-contain";
  const style = fill ? undefined : { width: size, height: size };

  return src ? (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className={cls}
      style={style}
    />
  ) : (
    <div
      className={`animate-pulse ${fill ? "h-24 w-full rounded-lg bg-zinc-900" : "shrink-0 rounded-lg bg-zinc-900"}`}
      style={style}
    />
  );
}
