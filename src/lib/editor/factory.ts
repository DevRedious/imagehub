/** Création des calques : un seul endroit décide des valeurs de départ. */

import { deriveAnchor } from "./layout";
import {
  DEFAULT_RECOLOR,
  DEFAULT_SHADOW,
  type ImageLayer,
  type Layer,
  type ShapeLayer,
  type TextLayer,
} from "./types";

interface Size {
  width: number;
  height: number;
}

function base(
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  canvas: Size,
) {
  return {
    id: crypto.randomUUID(),
    name,
    x,
    y,
    width: w,
    height: h,
    rotation: 0,
    opacity: 1,
    flipX: false,
    flipY: false,
    visible: true,
    locked: false,
    anchor: deriveAnchor(x, y, canvas),
    anchorAuto: true,
    shadow: { ...DEFAULT_SHADOW },
    recolor: { ...DEFAULT_RECOLOR },
    blur: 0,
  };
}

/** Une pièce arrive à un tiers de la largeur du canevas au maximum : assez
 *  grande pour se voir, assez petite pour qu'on en pose plusieurs sans que la
 *  première mange tout l'écran. */
export function createImageLayer(
  src: string,
  name: string,
  natural: { width: number; height: number },
  canvas: Size,
  at?: { x: number; y: number },
): ImageLayer {
  const max = canvas.width / 3;
  const scale = Math.min(1, max / Math.max(natural.width, 1));
  const w = Math.max(8, natural.width * scale);
  const h = Math.max(8, natural.height * scale);
  const x = at?.x ?? canvas.width / 2;
  const y = at?.y ?? canvas.height / 2;
  return { ...base(name, x, y, w, h, canvas), kind: "image", src };
}

export function createTextLayer(
  canvas: Size,
  at?: { x: number; y: number },
): TextLayer {
  const fontSize = Math.round(canvas.height / 12);
  const w = canvas.width / 2;
  const h = fontSize * 1.4;
  const x = at?.x ?? canvas.width / 2;
  const y = at?.y ?? canvas.height / 2;
  return {
    ...base("Texte", x, y, w, h, canvas),
    kind: "text",
    text: "Votre titre",
    fontSize,
    fontFamily: "",
    fontPath: null,
    fill: "#f4f1ea",
    align: "center",
    lineHeight: 1.2,
    letterSpacing: 0,
  };
}

/** Préréglages de formes. Un « trait » n'est pas un type à part : c'est un
 *  rectangle mince. Un concept de moins à porter dans tout l'éditeur, pour un
 *  résultat que l'œil ne distingue pas. */
export type ShapePreset = "rect" | "ellipse" | "line";

const PRESET_NAME: Record<ShapePreset, string> = {
  rect: "Rectangle",
  ellipse: "Ellipse",
  line: "Trait",
};

export function createShapeLayer(
  preset: ShapePreset,
  canvas: Size,
  at?: { x: number; y: number },
): ShapeLayer {
  const line = preset === "line";
  const w = canvas.width / 4;
  const h = line ? Math.max(4, canvas.height / 200) : canvas.height / 4;
  const x = at?.x ?? canvas.width / 2;
  const y = at?.y ?? canvas.height / 2;
  return {
    ...base(PRESET_NAME[preset], x, y, w, h, canvas),
    kind: "shape",
    shape: preset === "ellipse" ? "ellipse" : "rect",
    fill: "#8d9a6b",
    stroke: "#e8e2d4",
    strokeWidth: 0,
    cornerRadius: line ? h / 2 : canvas.height / 60,
  };
}

/** Copie décalée : le double apparaît légèrement en biais, sinon il recouvre
 *  exactement l'original et on croit que rien ne s'est passé. */
export function duplicateLayer(layer: Layer, canvas: Size): Layer {
  const offset = Math.max(canvas.width, canvas.height) / 60;
  const x = layer.x + offset;
  const y = layer.y + offset;
  return {
    ...layer,
    id: crypto.randomUUID(),
    name: `${layer.name} (copie)`,
    x,
    y,
    anchor: layer.anchorAuto ? deriveAnchor(x, y, canvas) : layer.anchor,
  };
}

/** Miroir horizontal : le geste qui transforme une branche en sa jumelle de
 *  l'autre bord du cadre — exactement ce que fait la planche d'origine. */
export function mirrorLayer(layer: Layer, canvas: Size): Layer {
  const x = canvas.width - layer.x;
  return {
    ...layer,
    id: crypto.randomUUID(),
    name: `${layer.name} (miroir)`,
    x,
    flipX: !layer.flipX,
    anchor: layer.anchorAuto ? deriveAnchor(x, layer.y, canvas) : layer.anchor,
  };
}
