/** Nom de fichier d'un chemin, séparateurs Linux (/) et Windows (\) confondus. */
export function basename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

/** Extension en minuscules (sans le point), ou "" si absente. */
export function extOf(path: string): string {
  const name = basename(path);
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

/** Formats image pris en charge par l'app (dépôt, sélection, vignettes). */
export const IMAGE_EXTS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "avif",
  "svg",
  "bmp",
  "gif",
  "tiff",
  "ico",
];

/** Vrai si le chemin pointe vers un format image pris en charge. */
export function isSupportedImage(path: string): boolean {
  return IMAGE_EXTS.includes(extOf(path));
}

/** Variante de thème portée par le nom de fichier (convention `<base>-dark` /
 *  `<base>-light`), ou `null` sinon. `base` est en minuscules → sert de clé
 *  d'appairage de deux SVG dark/light en un seul pack. */
export function themeVariant(
  path: string,
): { base: string; variant: "dark" | "light" } | null {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  const stem = (dot > 0 ? name.slice(0, dot) : name).toLowerCase();
  if (stem.endsWith("-dark"))
    return { base: stem.slice(0, -5), variant: "dark" };
  if (stem.endsWith("-light"))
    return { base: stem.slice(0, -6), variant: "light" };
  return null;
}
