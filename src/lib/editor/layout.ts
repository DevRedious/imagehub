/** Déclinaison d'une composition d'un format à l'autre.
 *
 *  Le problème : une même composition doit sortir en 16:9, en 9:16 et en
 *  bandeau 17:6. Redimensionner bêtement écraserait les proportions ; garder
 *  les positions absolues laisserait les branches flotter au milieu du vide en
 *  portrait, au lieu de border le cadre.
 *
 *  La réponse tient en deux règles :
 *
 *  1. **L'échelle suit le PLUS PETIT côté.** Une branche garde ainsi la même
 *     taille apparente d'un format à l'autre : c'est ce qu'on attend d'un
 *     décor, alors qu'une échelle suivant la largeur ferait enfler les motifs
 *     dès qu'on passe en bandeau.
 *
 *  2. **Chaque calque est accroché à un bord.** Ce qui est en haut à gauche
 *     reste à distance constante du coin haut-gauche ; ce qui est centré reste
 *     centré. Le cadre se resserre ou s'écarte, le décor continue de le border.
 */

import type { Anchor, Layer } from "./types";

export interface Size {
  width: number;
  height: number;
}

/** Facteur d'échelle entre le canevas de référence et le format visé. */
export function scaleBetween(base: Size, target: Size): number {
  const short = Math.min(base.width, base.height);
  if (short <= 0) return 1;
  return Math.min(target.width, target.height) / short;
}

/** Bord le plus proche, par tiers du canevas : c'est l'ancrage qu'on devine
 *  pour un calque qu'on vient de poser ou de déplacer. */
export function deriveAnchor(x: number, y: number, base: Size): Anchor {
  const ax: Anchor["x"] =
    x < base.width / 3 ? "left" : x > (base.width * 2) / 3 ? "right" : "center";
  const ay: Anchor["y"] =
    y < base.height / 3
      ? "top"
      : y > (base.height * 2) / 3
        ? "bottom"
        : "middle";
  return { x: ax, y: ay };
}

/** Position d'un centre, transposée du canevas de référence vers le format
 *  visé, en respectant l'ancrage. */
export function placeCenter(
  x: number,
  y: number,
  anchor: Anchor,
  base: Size,
  target: Size,
  scale: number,
): { x: number; y: number } {
  let nx: number;
  switch (anchor.x) {
    case "left":
      nx = x * scale;
      break;
    case "right":
      nx = target.width - (base.width - x) * scale;
      break;
    default:
      nx = target.width / 2 + (x - base.width / 2) * scale;
  }
  let ny: number;
  switch (anchor.y) {
    case "top":
      ny = y * scale;
      break;
    case "bottom":
      ny = target.height - (base.height - y) * scale;
      break;
    default:
      ny = target.height / 2 + (y - base.height / 2) * scale;
  }
  return { x: nx, y: ny };
}

/** Transpose un calque entier vers le format visé : position, taille, et
 *  toutes les grandeurs exprimées en unités du canevas (flou, ombre, corps du
 *  texte). Oublier l'une d'elles produirait une ombre deux fois trop dure en
 *  portrait — le genre de détail qui trahit une déclinaison automatique. */
export function relayout(layer: Layer, base: Size, target: Size): Layer {
  const scale = scaleBetween(base, target);
  const at = placeCenter(layer.x, layer.y, layer.anchor, base, target, scale);
  const common = {
    ...layer,
    x: at.x,
    y: at.y,
    width: layer.width * scale,
    height: layer.height * scale,
    blur: layer.blur * scale,
    shadow: {
      ...layer.shadow,
      blur: layer.shadow.blur * scale,
      offsetX: layer.shadow.offsetX * scale,
      offsetY: layer.shadow.offsetY * scale,
    },
  };
  if (common.kind === "text") {
    return {
      ...common,
      fontSize: common.fontSize * scale,
      letterSpacing: common.letterSpacing * scale,
    };
  }
  if (common.kind === "shape") {
    return {
      ...common,
      strokeWidth: common.strokeWidth * scale,
      cornerRadius: common.cornerRadius * scale,
    };
  }
  return common;
}

/** Toute la composition, transposée. */
export function relayoutAll(
  layers: Layer[],
  base: Size,
  target: Size,
): Layer[] {
  return layers.map((l) => relayout(l, base, target));
}
