/** Formats et résolutions d'export d'une tuile.
 *
 *  Table déclarative, tenue à part comme celle de l'Atelier
 *  (`src/lib/editor/formats.ts`) : ce sont des données, pas de la logique, et
 *  les garder hors de la modale permet d'y lire d'un coup d'œil ce que l'outil
 *  sait produire.
 */

import type { PatternFormat } from "./api";

/** Résolutions proposées, en largeur. Indépendantes de la taille d'édition :
 *  composer en 480 px et sortir en 2048 px ne perd rien, puisque le rendu Rust
 *  repart des fichiers d'origine et redessine les tracés à la volée. */
export const EXPORT_SIZES = [512, 1024, 2048, 4096];

export interface FormatDef {
  id: PatternFormat;
  label: string;
  note: string;
  /** la transparence est-elle conservée ? */
  alpha: boolean;
}

export const EXPORT_FORMATS: FormatDef[] = [
  {
    id: "png",
    label: "PNG",
    note: "Transparence conservée — le format du motif réutilisable",
    alpha: true,
  },
  {
    id: "webp",
    label: "WebP",
    note: "Sans perte, transparence conservée, deux à trois fois plus léger",
    alpha: true,
  },
  {
    id: "avif",
    label: "AVIF",
    note: "Le plus léger, transparence conservée (nécessite avifenc)",
    alpha: true,
  },
  {
    id: "jpg",
    label: "JPG",
    note: "Sans transparence : exige un fond, qui sera aplati",
    alpha: false,
  },
];
