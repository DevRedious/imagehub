/** Pont vers le rendu Rust des motifs.
 *
 *  Le rendu final n'est PAS une capture du canevas : seul Rust garantit la
 *  résolution demandée, un rééchantillonnage Lanczos3 et un alpha correct.
 *  Voir `src-tauri/src/pattern.rs`.
 */

import { invoke } from "@tauri-apps/api/core";
import type { Written } from "../library";
import type { Pattern } from "./types";

/** Le motif, réduit à ce dont le rendu a besoin. Les identifiants, les noms de
 *  calques et la graine ne descendent pas : ils servent à l'édition, pas au
 *  dessin.
 *
 *  La forme envoyée est celle que Rust attend (`Spec` / `Geometry`), avec le
 *  discriminant `kind` à plat — d'où le passage par des `Record` plutôt que par
 *  les types d'édition. */
export interface RenderSpec {
  tile: { width: number; height: number };
  background: string | null;
  pieces: Record<string, unknown>[];
}

export function toSpec(pattern: Pattern): RenderSpec {
  return {
    tile: pattern.tile,
    background: pattern.background.on ? pattern.background.color : null,
    pieces: pattern.pieces.map((p) => {
      const commun = {
        kind: p.kind,
        x: p.x,
        y: p.y,
        rotation: p.rotation,
        opacity: p.opacity,
        visible: p.visible,
      };
      switch (p.kind) {
        case "image":
          return {
            ...commun,
            src: p.src,
            width: p.width,
            height: p.height,
            flipX: p.flipX,
            flipY: p.flipY,
          };
        case "stroke":
          return {
            ...commun,
            points: p.points,
            color: p.color,
            width: p.width,
            closed: p.closed,
          };
        default:
          return {
            ...commun,
            shape: p.shape,
            sides: p.sides,
            width: p.width,
            height: p.height,
            fill: p.fill,
            stroke: p.stroke,
            strokeWidth: p.strokeWidth,
          };
      }
    }),
  };
}

export type PatternFormat = "png" | "jpg" | "webp" | "avif";

/** Type ALIAS et non interface : `invoke` attend un `Record<string, unknown>`,
 *  et seul un type anonyme se voit accorder la signature d'index implicite qui
 *  le rend assignable. Une interface exigerait un transtypage à chaque appel. */
export type ExportArgs = {
  jobId: string;
  spec: RenderSpec;
  name: string;
  /** largeur visée ; la hauteur suit le rapport de la tuile */
  size: number;
  format: PatternFormat;
  quality?: number;
  /** écrire aussi la répétition 3×3, pour présentation */
  repeat?: boolean;
  /** dossier de destination ; absent = dépôt des motifs */
  dir?: string | null;
};

export function patternExport(args: ExportArgs): Promise<Written[]> {
  return invoke<Written[]>("pattern_export", args);
}

export function patternDir(): Promise<string> {
  return invoke<string>("pattern_dir");
}

export interface SavedPattern {
  path: string;
  name: string;
}

export function patternSaveJson(name: string, json: string): Promise<string> {
  return invoke<string>("pattern_save_json", { name, json });
}

export function patternListJson(): Promise<SavedPattern[]> {
  return invoke<SavedPattern[]>("pattern_list_json");
}

export function patternReadJson(path: string): Promise<string> {
  return invoke<string>("pattern_read_json", { path });
}
