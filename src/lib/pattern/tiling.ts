/** Le cœur du raccord : les neuf copies.
 *
 *  Pour une tuile `Tw × Th`, chaque pièce est dessinée NEUF fois, aux décalages
 *  `(dx, dy)` avec `dx ∈ {-Tw, 0, +Tw}` et `dy ∈ {-Th, 0, +Th}`, le tout écrêté
 *  aux limites de la tuile :
 *
 *      pour chaque pièce (par z-index croissant) :
 *          pour dy dans [-Th, 0, Th] :
 *              pour dx dans [-Tw, 0, Tw] :
 *                  dessiner la pièce à (x + dx, y + dy)
 *      écrêter le résultat à [0, Tw] × [0, Th]
 *
 *  Ce qui sort à droite rentre à gauche à la même hauteur, ce qui mord sur un
 *  coin réapparaît dans les trois autres : la tuile est raccordable PAR
 *  CONSTRUCTION. Aucune pièce n'est jamais repoussée à l'intérieur des bords —
 *  au contraire, **les débordements sont souhaitables**, c'est ce qui donne un
 *  motif organique plutôt qu'une grille de vignettes isolées.
 *
 *  La règle vaut pour TOUT ce qu'on pose : une image importée, un coup de
 *  crayon, un triangle. C'est ce qui fait qu'un trait tiré au-delà du bord
 *  ressort de l'autre côté au lieu d'être coupé.
 *
 *  ⚠️ Ce fichier est le pendant EXACT de `render_tile_with` dans
 *  `src-tauri/src/pattern.rs`. Toute divergence ferait mentir l'aperçu sur le
 *  résultat exporté, ce qui est le pire défaut possible pour un outil de motif.
 */

import { bounds, polygonPoints } from "./draw";
import type { PatternPiece, TileSize } from "./types";

/** Les décalages d'un axe, en multiples de la tuile. */
export const WRAP = [-1, 0, 1] as const;

/** Une pièce dans les pixels de la tuile : ce que Konva sait dessiner.
 *
 *  Rappel des unités (voir `types.ts`) : le CENTRE est une fraction de chaque
 *  axe, toute ÉTENDUE une fraction de la largeur. */
export interface PiecePx {
  x: number;
  y: number;
  /** demi-étendue de la pièce non tournée, contour compris */
  halfW: number;
  halfH: number;
  rotation: number;
}

/** Convertit une longueur normalisée en pixels de tuile. */
export function unit(v: number, tile: TileSize): number {
  return v * tile.width;
}

export function centerPx(
  piece: PatternPiece,
  tile: TileSize,
): { x: number; y: number } {
  return { x: piece.x * tile.width, y: piece.y * tile.height };
}

/** Boîte propre d'une pièce, non tournée, en pixels.
 *
 *  Le contour compte : un trait large déborde de la géométrie qui le porte, et
 *  l'oublier ferait disparaître une copie dont seule l'épaisseur mordait sur la
 *  tuile — un raccord manquant, pour un pixel de marge. */
export function toPixels(piece: PatternPiece, tile: TileSize): PiecePx {
  const at = centerPx(piece, tile);
  const common = { x: at.x, y: at.y, rotation: piece.rotation };
  switch (piece.kind) {
    case "image":
      return {
        ...common,
        halfW: unit(piece.width, tile) / 2,
        halfH: unit(piece.height, tile) / 2,
      };
    case "shape": {
      const marge = piece.stroke ? unit(piece.strokeWidth, tile) / 2 : 0;
      return {
        ...common,
        halfW: unit(piece.width, tile) / 2 + marge,
        halfH: unit(piece.height, tile) / 2 + marge,
      };
    }
    default: {
      // les points sont relatifs au centre, mais pas forcément symétriques :
      // on prend la plus grande distance au centre sur chaque axe
      const b = bounds(piece.points);
      const marge = unit(piece.width, tile) / 2;
      return {
        ...common,
        halfW:
          unit(Math.max(Math.abs(b.x), Math.abs(b.x + b.width)), tile) + marge,
        halfH:
          unit(Math.max(Math.abs(b.y), Math.abs(b.y + b.height)), tile) + marge,
      };
    }
  }
}

/** Demi-étendue de la boîte englobante d'une pièce TOURNÉE, en pixels.
 *
 *  Un rectangle incliné occupe plus de place que ses propres dimensions : sans
 *  ce calcul, on croirait une pièce hors de la tuile alors qu'un de ses coins y
 *  mord encore, et cette copie manquerait au motif. */
export function halfExtent(px: PiecePx): { x: number; y: number } {
  const rad = (px.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    x: px.halfW * 2 * cos + px.halfH * 2 * sin,
    y: px.halfW * 2 * sin + px.halfH * 2 * cos,
  };
}

/** Les décalages à dessiner réellement, en pixels.
 *
 *  Optimisation identique à celle du rendu Rust : une copie décalée n'est
 *  retenue que si sa boîte englobante touche la tuile. En pratique une pièce
 *  bien à l'intérieur n'est dessinée qu'une fois, une pièce à cheval sur un
 *  bord deux fois, une pièce de coin quatre fois — jamais neuf. Ce qui compte
 *  sur un canevas qui se redessine à chaque pixel parcouru par la souris.
 *
 *  Le résultat contient TOUJOURS `(0, 0)` : c'est la copie que l'utilisateur
 *  manipule, et elle doit exister même quand elle sort entièrement du cadre. */
export function copies(
  px: PiecePx,
  tile: TileSize,
): { dx: number; dy: number }[] {
  const half = halfExtent(px);
  const out: { dx: number; dy: number }[] = [];
  for (const my of WRAP) {
    for (const mx of WRAP) {
      const dx = mx * tile.width;
      const dy = my * tile.height;
      const centre = mx === 0 && my === 0;
      const touche =
        px.x + dx + half.x > 0 &&
        px.x + dx - half.x < tile.width &&
        px.y + dy + half.y > 0 &&
        px.y + dy - half.y < tile.height;
      if (centre || touche) out.push({ dx, dy });
    }
  }
  return out;
}

/** Ramène un centre dans la tuile, par le tore.
 *
 *  Une pièce traînée au-delà du bord droit est rigoureusement équivalente à la
 *  même pièce entrée par la gauche : on choisit la seconde écriture pour que la
 *  copie manipulable reste celle qu'on a sous le curseur, et pour qu'un motif
 *  enregistré ne traîne pas des coordonnées à 4,7 tuiles de distance. */
export function wrapCenter<T extends PatternPiece>(piece: T): T {
  const cycle = (v: number) => ((v % 1) + 1) % 1;
  return { ...piece, x: cycle(piece.x), y: cycle(piece.y) };
}

/** Redimensionne une pièce, quelle que soit sa nature.
 *
 *  Un tracé n'a pas de largeur propre : on met ses POINTS à l'échelle, et
 *  l'épaisseur du trait avec eux — sans quoi étirer un gribouillis le
 *  transformerait en fil de fer. */
export function scalePiece<T extends PatternPiece>(
  piece: T,
  sx: number,
  sy: number,
): T {
  if (piece.kind === "stroke") {
    // l'épaisseur suit la moyenne des deux axes : un trait rond ne peut pas
    // devenir ovale, et prendre un seul axe ferait maigrir le trait dès qu'on
    // étire dans l'autre sens
    const facteur = (Math.abs(sx) + Math.abs(sy)) / 2;
    return {
      ...piece,
      points: piece.points.map((p) => ({ x: p.x * sx, y: p.y * sy })),
      width: Math.max(0.0005, piece.width * facteur),
    };
  }
  return {
    ...piece,
    width: Math.max(0.001, piece.width * Math.abs(sx)),
    height: Math.max(0.001, piece.height * Math.abs(sy)),
  };
}

/** Sommets d'une forme, en unités normalisées relatives au centre : ce que
 *  Konva dessine pour un polygone, et ce que Rust reconstruit à l'identique. */
export function shapeOutline(
  piece: Extract<PatternPiece, { kind: "shape" }>,
): { x: number; y: number }[] {
  return polygonPoints(piece.sides, piece.width, piece.height);
}
