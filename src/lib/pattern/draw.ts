/** Les outils de dessin, et la géométrie qu'ils produisent.
 *
 *  ⚠️ `polygonPoints` est répété à l'identique dans `src-tauri/src/pattern.rs`.
 *  C'est la seule façon que l'aperçu et l'export dessinent le MÊME triangle :
 *  un angle de départ différent de part et d'autre donnerait une forme couchée
 *  à l'écran et debout dans le fichier.
 */

import type { Point, ShapeKind } from "./types";

export type Tool =
  | "select"
  | "pencil"
  | "line"
  | "rect"
  | "ellipse"
  | "polygon";

/** Un outil qui dessine, par opposition à la flèche de sélection. */
export function isDrawTool(tool: Tool): boolean {
  return tool !== "select";
}

/** Réglages du crayon, partagés par tous les outils de dessin : on choisit une
 *  couleur et une épaisseur une fois, pas à chaque changement d'outil. */
export interface Brush {
  color: string;
  /** épaisseur du trait, en fraction de la largeur de tuile */
  width: number;
  /** les formes sont-elles remplies ? sinon elles ne sont que contourées */
  filled: boolean;
  /** couleur de remplissage des formes */
  fill: string;
  /** nombre de côtés de l'outil polygone (3 = triangle) */
  sides: number;
  opacity: number;
}

export const DEFAULT_BRUSH: Brush = {
  color: "#2f3a2a",
  // 1,2 % de la tuile : un trait qui se voit sans écraser un motif de 480 px
  width: 0.012,
  filled: true,
  fill: "#8d9a6b",
  sides: 3,
  opacity: 1,
};

/** Épaisseurs proposées d'un clic, en fraction de tuile. Du trait de plume au
 *  gros feutre — au-delà, le curseur d'épaisseur prend le relais. */
export const BRUSH_SIZES = [0.004, 0.008, 0.016, 0.032, 0.064];

/** Sommets d'un polygone régulier inscrit dans la boîte `w × h`.
 *
 *  Le premier sommet est EN HAUT (angle de départ à -90°) : c'est ce qui donne
 *  un triangle posé sur sa base plutôt que couché sur le flanc. */
export function polygonPoints(
  sides: number,
  w: number,
  h: number,
): { x: number; y: number }[] {
  const n = Math.min(24, Math.max(3, Math.round(sides)));
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: (Math.cos(a) * w) / 2, y: (Math.sin(a) * h) / 2 };
  });
}

/** Suite de coordonnées à plat, telle que Konva l'attend pour une `Line`. */
export function flatten(points: { x: number; y: number }[]): number[] {
  return points.flatMap((p) => [p.x, p.y]);
}

/** Contraint un segment aux multiples de 15°.
 *
 *  Ce que Maj apporte à une ligne droite : l'horizontale, la verticale et les
 *  diagonales exactes, qu'on n'atteint jamais à la souris. La longueur est
 *  conservée, seule la direction est corrigée — arrondir aussi la longueur
 *  ferait sauter le point sous le curseur. */
export function snapAngle(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return to;
  const pas = Math.PI / 12;
  const a = Math.round(Math.atan2(dy, dx) / pas) * pas;
  return { x: from.x + Math.cos(a) * len, y: from.y + Math.sin(a) * len };
}

/** Lissage de Chaikin : chaque segment est remplacé par ses quarts.
 *
 *  Une main levée capturée à la souris est une suite de petits segments
 *  anguleux — visible dès qu'on épaissit le trait. Deux passes suffisent à
 *  arrondir les angles sans noyer le geste.
 *
 *  Le lissage est appliqué UNE FOIS, au moment où le tracé est validé, et le
 *  résultat est ce qui est stocké. Lisser au rendu obligerait le webview et
 *  Rust à s'accorder sur la même courbe ; lisser en amont leur donne les mêmes
 *  points, et la question ne se pose plus. */
export function smooth(points: Point[], passes = 2): Point[] {
  let out = points;
  for (let n = 0; n < passes && out.length > 2; n++) {
    const next: Point[] = [out[0]];
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i];
      const b = out[i + 1];
      next.push(
        { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 },
        { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 },
      );
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
}

/** Retire les points qu'on ne verrait pas.
 *
 *  Un pointeur émet des dizaines d'événements par seconde, souvent au même
 *  endroit : sans ce filtre un trait de deux secondes pèserait mille points,
 *  que la sérialisation, le rendu et l'annulation traîneraient ensuite tous. */
export function thin(points: Point[], mini: number): Point[] {
  if (points.length < 2) return points;
  const out = [points[0]];
  for (const p of points.slice(1)) {
    const last = out[out.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) >= mini) out.push(p);
  }
  // le dernier point est toujours gardé : c'est là que l'utilisateur a relâché
  const fin = points[points.length - 1];
  const last = out[out.length - 1];
  if (fin.x !== last.x || fin.y !== last.y) out.push(fin);
  return out;
}

/** Boîte englobante d'une suite de points. */
export function bounds(points: Point[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return {
    x: x0,
    y: y0,
    width: Math.max(...xs) - x0,
    height: Math.max(...ys) - y0,
  };
}

/** Nom donné d'office à une pièce dessinée. */
export const TOOL_LABEL: Record<Exclude<Tool, "select">, string> = {
  pencil: "Crayon",
  line: "Trait",
  rect: "Rectangle",
  ellipse: "Ellipse",
  polygon: "Polygone",
};

/** La forme que produit un outil. */
export function shapeOfTool(tool: Tool): ShapeKind | null {
  switch (tool) {
    case "rect":
      return "rect";
    case "ellipse":
      return "ellipse";
    case "polygon":
      return "polygon";
    default:
      return null;
  }
}
