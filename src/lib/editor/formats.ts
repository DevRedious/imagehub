/** Formats d'export.
 *
 *  Les suffixes reprennent la convention déjà en place dans les dossiers
 *  d'assets (`backdrop_wilobot_16x9.png`, `…_17x6.png`…) : un même visuel
 *  décliné, un fichier par ratio. Les dimensions, elles, sont ramenées à des
 *  ratios exacts et à une résolution ronde — une planche générée par IA sort
 *  souvent à 2752×1536, ce qui n'est pas tout à fait du 16:9.
 */

export interface Format {
  id: string;
  label: string;
  /** suffixe ajouté au nom du fichier */
  suffix: string;
  width: number;
  height: number;
  note?: string;
}

export const FORMATS: Format[] = [
  {
    id: "16x9",
    label: "16:9",
    suffix: "16x9",
    width: 2560,
    height: 1440,
    note: "Paysage large — couvertures, fonds d'écran",
  },
  {
    id: "9x16",
    label: "9:16",
    suffix: "9x16",
    width: 1440,
    height: 2560,
    note: "Portrait — stories, mobile",
  },
  {
    id: "191x100",
    label: "1.91:1",
    suffix: "191x100",
    width: 2400,
    height: 1256,
    note: "Aperçu de lien (OpenGraph)",
  },
  {
    id: "17x6",
    label: "17:6",
    suffix: "17x6",
    width: 3400,
    height: 1200,
    note: "Bandeau — bannière Discord (680×240)",
  },
  {
    id: "1x1",
    label: "1:1",
    suffix: "1x1",
    width: 2048,
    height: 2048,
    note: "Carré — avatars, vignettes",
  },
];

/** Format de départ d'une nouvelle composition. */
export const DEFAULT_FORMAT = FORMATS[0];

export function formatById(id: string): Format | undefined {
  return FORMATS.find((f) => f.id === id);
}

/** Ratio d'un format, pour dimensionner l'aperçu à l'écran. */
export function ratioOf(f: { width: number; height: number }): number {
  return f.width / f.height;
}
