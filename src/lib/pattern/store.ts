/** Persistance du motif en cours.
 *
 *  Les Motifs sont une vue parmi d'autres : passer au Studio puis revenir la
 *  démonterait et perdrait tout le travail. On garde donc le document en local
 *  et on le relit au montage — même mécanisme que l'Atelier
 *  (`src/lib/editor/store.ts`).
 *
 *  L'enregistrement sur le DISQUE, lui, passe par `pattern_save_json` : c'est
 *  ce qui permet de rouvrir un motif d'une session à l'autre, et de le ranger à
 *  côté des tuiles qu'il a produites.
 */

import { DEFAULT_TILE, type Pattern, type PatternPiece } from "./types";

const KEY = "imagehub.pattern";

export function emptyPattern(): Pattern {
  return {
    name: "motif",
    tile: { width: DEFAULT_TILE, height: DEFAULT_TILE },
    // éteint par défaut : un motif sert le plus souvent de couche à poser sur
    // autre chose, et un aplat incrusté le rendrait inutilisable.
    background: { on: false, color: "#efe6d6" },
    pieces: [],
    seed: 1,
  };
}

/** Relit un document, en comblant ce qui manque.
 *
 *  Un JSON venu du disque peut avoir été écrit par une version antérieure, ou
 *  édité à la main : on fusionne sur un document vierge plutôt que de faire
 *  confiance à sa forme, et on refuse ce qui n'a pas de pièces exploitables. */
export function revivePattern(raw: unknown): Pattern {
  const base = emptyPattern();
  if (!raw || typeof raw !== "object") return base;
  const parsed = raw as Partial<Pattern>;
  const tile = parsed.tile;
  return {
    ...base,
    ...parsed,
    tile:
      tile && tile.width > 0 && tile.height > 0
        ? { width: tile.width, height: tile.height }
        : base.tile,
    background: { ...base.background, ...parsed.background },
    pieces: Array.isArray(parsed.pieces)
      ? parsed.pieces
          .map(revivePiece)
          .filter((p): p is PatternPiece => p !== null)
      : [],
  };
}

/** Une pièce relue, ou `null` si elle n'a rien d'exploitable.
 *
 *  Les motifs enregistrés avant le dessin ne portaient QUE des images, et pas
 *  de discriminant `kind` : on les promeut plutôt que de les jeter — c'est le
 *  travail de l'utilisateur. Une pièce d'une nature inconnue, en revanche, est
 *  écartée : mieux vaut un motif amputé qu'un rendu qui plante. */
function revivePiece(raw: unknown): PatternPiece | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const kind = p.kind ?? (typeof p.src === "string" ? "image" : null);
  switch (kind) {
    case "image":
      return typeof p.src === "string"
        ? ({ flipX: false, flipY: false, ...p, kind: "image" } as PatternPiece)
        : null;
    case "stroke":
      return Array.isArray(p.points) && p.points.length > 0
        ? ({ closed: false, ...p, kind: "stroke" } as PatternPiece)
        : null;
    case "shape":
      return { sides: 3, strokeWidth: 0, ...p, kind: "shape" } as PatternPiece;
    default:
      return null;
  }
}

export function loadPattern(): Pattern {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? revivePattern(JSON.parse(raw)) : emptyPattern();
  } catch {
    return emptyPattern();
  }
}

export function savePattern(p: Pattern): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* quota plein : la session continue, seule la reprise est perdue */
  }
}

/** Nom de fichier tiré du nom du motif. */
export function patternSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "motif";
}
