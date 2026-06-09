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
