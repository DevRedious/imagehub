/** Pont vers la bibliothèque d'éléments et la découpe de planches. */

import { invoke } from "@tauri-apps/api/core";

export interface Asset {
  path: string;
  name: string;
  width: number | null;
  height: number | null;
}

/** Une pièce d'aperçu : sa vignette est une data URL, rien n'est encore écrit. */
export interface Piece {
  index: number;
  width: number;
  height: number;
  thumb: string;
}

export const SHEET_DEFAULTS = { gap: 8, minSize: 25, aggressiveness: 50 };

export function libraryDir(): Promise<string> {
  return invoke<string>("library_dir");
}

export function libraryList(): Promise<Asset[]> {
  return invoke<Asset[]>("library_list");
}

export function libraryImport(paths: string[]): Promise<Asset[]> {
  return invoke<Asset[]>("library_import", { paths });
}

export function libraryDelete(paths: string[]): Promise<void> {
  return invoke("library_delete", { paths });
}

export function libraryRename(path: string, name: string): Promise<Asset> {
  return invoke<Asset>("library_rename", { path, name });
}

/** Étape lente : détourage de la planche (mis en cache côté Rust). */
export function sheetCutout(args: {
  jobId: string;
  path: string;
  model?: string;
  aggressiveness?: number;
}): Promise<string> {
  return invoke<string>("sheet_cutout", args);
}

/** Étape rapide, rejouée à chaque cran de curseur. */
export function sheetPreview(args: {
  cutout: string;
  gap: number;
  minSize: number;
}): Promise<Piece[]> {
  return invoke<Piece[]>("sheet_preview", args);
}

/** Écriture des pièces retenues dans la bibliothèque. */
export function sheetCommit(args: {
  cutout: string;
  stem: string;
  gap: number;
  minSize: number;
  keep: number[];
}): Promise<Asset[]> {
  return invoke<Asset[]>("sheet_commit", args);
}

export interface Written {
  path: string;
  suffix: string;
}

export function saveComposition(args: {
  name: string;
  shots: { suffix: string; data: string }[];
  dir?: string | null;
}): Promise<Written[]> {
  return invoke<Written[]>("save_composition", args);
}

export function compositionDir(): Promise<string> {
  return invoke<string>("composition_dir");
}
