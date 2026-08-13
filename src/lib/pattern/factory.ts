/** Création des pièces d'un motif : un seul endroit décide des valeurs de
 *  départ. */

import type { Brush } from "./draw";
import { bounds, smooth, TOOL_LABEL } from "./draw";
import type {
  ImagePiece,
  PatternPiece,
  Point,
  ShapeKind,
  ShapePiece,
  StrokePiece,
} from "./types";

function base(name: string, x: number, y: number) {
  return {
    id: crypto.randomUUID(),
    name,
    x,
    y,
    rotation: 0,
    opacity: 1,
    visible: true,
  };
}

/** Une pièce arrive à un quart de la tuile au maximum : assez grande pour se
 *  voir, assez petite pour qu'on en sème une dizaine sans que la première mange
 *  toute la tuile. Le rapport du fichier est conservé — les deux étendues étant
 *  rapportées à la largeur de tuile, il suffit de le recopier. */
export function createPiece(
  src: string,
  name: string,
  natural: { width: number; height: number },
  at?: { x: number; y: number },
): ImagePiece {
  const ratio = Math.max(natural.height, 1) / Math.max(natural.width, 1);
  const width = 0.25;
  return {
    ...base(name, at?.x ?? 0.5, at?.y ?? 0.5),
    kind: "image",
    src,
    width,
    height: width * ratio,
    flipX: false,
    flipY: false,
  };
}

/** Un tracé validé.
 *
 *  Les points arrivent en coordonnées de tuile ; on les recentre sur leur
 *  barycentre de boîte pour que la pièce ait un centre qui veuille dire quelque
 *  chose — c'est autour de lui qu'elle tournera, et c'est lui qu'on ramène dans
 *  la tuile quand le trait déborde. */
export function createStroke(
  points: Point[],
  brush: Brush,
  label: string,
  options: { closed?: boolean; lisser?: boolean } = {},
): StrokePiece {
  const lissés = options.lisser ? smooth(points) : points;
  const b = bounds(lissés);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  return {
    ...base(label, cx, cy),
    kind: "stroke",
    points: lissés.map((p) => ({ x: p.x - cx, y: p.y - cy })),
    color: brush.color,
    width: brush.width,
    closed: options.closed ?? false,
    opacity: brush.opacity,
  };
}

/** Une forme géométrique tirée à la souris. */
export function createShape(
  shape: ShapeKind,
  at: { x: number; y: number },
  size: { width: number; height: number },
  brush: Brush,
): ShapePiece {
  return {
    ...base(TOOL_LABEL[shape === "polygon" ? "polygon" : shape], at.x, at.y),
    kind: "shape",
    shape,
    sides: brush.sides,
    width: Math.abs(size.width),
    height: Math.abs(size.height),
    // Une forme non remplie doit tout de même se voir : quand le remplissage
    // est éteint, le contour est forcé, sinon on tirerait une forme invisible
    // et on croirait l'outil cassé.
    fill: brush.filled ? brush.fill : null,
    stroke: brush.filled ? null : brush.color,
    strokeWidth: brush.filled ? 0 : brush.width,
    opacity: brush.opacity,
  };
}

/** Copie décalée : le double apparaît légèrement en biais, sinon il recouvre
 *  exactement l'original et on croit que rien ne s'est passé. */
export function duplicatePiece(piece: PatternPiece): PatternPiece {
  return {
    ...piece,
    id: crypto.randomUUID(),
    name: `${piece.name} (copie)`,
    x: piece.x + 0.06,
    y: piece.y + 0.06,
  };
}
