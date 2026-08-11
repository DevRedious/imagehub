import { invoke } from "@tauri-apps/api/core";

export interface ExpandedInputs {
  images: string[];
  /** entrées écartées : format non pris en charge, ou dossier sans image */
  skipped: number;
  /** des images ont été laissées de côté (limite atteinte) */
  truncated: boolean;
}

/** Développe une sélection (fichiers et/ou dossiers) en liste d'images.
 *  Le webview ne lisant pas le disque, c'est le backend qui parcourt les
 *  dossiers — même chemin pour le glisser-déposer et le sélecteur. */
export function expandInputs(paths: string[]): Promise<ExpandedInputs> {
  return invoke<ExpandedInputs>("expand_inputs", { paths });
}
