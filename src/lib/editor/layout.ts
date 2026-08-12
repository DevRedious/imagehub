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

/** Ce à quoi un calque déplacé vient se coller, et la ligne à montrer. */
export interface Snap {
  x: number;
  y: number;
  guides: { x: number | null; y: number | null };
}

/** Repères d'un axe : les deux bords du plan de travail et son milieu, exprimés
 *  en positions de CENTRE du calque. Coller un bord gauche sur le bord gauche,
 *  c'est placer le centre à une demi-largeur. */
function targets(size: number, span: number): { at: number; guide: number }[] {
  return [
    { at: size / 2, guide: 0 },
    { at: span / 2, guide: span / 2 },
    { at: span - size / 2, guide: span },
  ];
}

function pull(
  value: number,
  size: number,
  span: number,
  tolerance: number,
): { value: number; guide: number | null } {
  let best: { value: number; guide: number | null; ecart: number } = {
    value,
    guide: null,
    ecart: tolerance,
  };
  for (const t of targets(size, span)) {
    const ecart = Math.abs(value - t.at);
    if (ecart <= best.ecart) best = { value: t.at, guide: t.guide, ecart };
  }
  return { value: best.value, guide: best.guide };
}

/** Aimant vers les bords et le milieu du plan de travail.
 *
 *  L'aimant retient, il n'enferme pas : au-delà de la tolérance le calque
 *  reprend sa liberté et peut déborder autant qu'on veut. C'est ce qui sépare
 *  un repère d'une contrainte — on veut caler une pièce au bord sans avoir à
 *  viser le pixel, et pouvoir tout de même la laisser mordre sur le vide.
 *
 *  La boîte prise en compte est celle du calque non tourné : sur un calque
 *  incliné le repère devient approximatif, ce qui vaut mieux qu'un aimant qui
 *  s'accroche à une boîte englobante que l'œil ne voit pas. */
export function snapToEdges(
  center: { x: number; y: number },
  size: Size,
  canvas: Size,
  tolerance: number,
): Snap {
  if (tolerance <= 0) return { ...center, guides: { x: null, y: null } };
  const h = pull(center.x, size.width, canvas.width, tolerance);
  const v = pull(center.y, size.height, canvas.height, tolerance);
  return { x: h.value, y: v.value, guides: { x: h.guide, y: v.guide } };
}

/** Une boîte alignée sur les axes, en unités du canevas. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Cherche, pour un axe, le bord qui bouge et la cible qu'il peut atteindre.
 *  Le résultat est un ÉCART DE TAILLE : c'est la seule grandeur qui se
 *  transpose ensuite à l'autre axe pour tenir le rapport. */
function edgeSnap(
  start: number,
  size: number,
  span: number,
  tolerance: number,
  movedStart: boolean,
  movedEnd: boolean,
): { delta: number; guide: number } | null {
  const lignes = [0, span / 2, span];
  const bords: { at: number; sens: number }[] = [];
  // un bord de début qui recule agrandit la boîte, d'où le sens inversé
  if (movedStart) bords.push({ at: start, sens: -1 });
  if (movedEnd) bords.push({ at: start + size, sens: 1 });

  let best: { delta: number; guide: number; ecart: number } | null = null;
  for (const bord of bords) {
    for (const ligne of lignes) {
      const ecart = Math.abs(bord.at - ligne);
      if (ecart > tolerance || (best && ecart >= best.ecart)) continue;
      // les deux bords bougent (grossissement centré) : la boîte grandit des
      // deux côtés à la fois, donc de deux fois l'écart rattrapé.
      const facteur = movedStart && movedEnd ? 2 : 1;
      best = {
        delta: (ligne - bord.at) * bord.sens * facteur,
        guide: ligne,
        ecart,
      };
    }
  }
  return best && { delta: best.delta, guide: best.guide };
}

/** Repositionne un axe après un changement de taille, en gardant fixe ce qui
 *  ne bougeait pas : le bord opposé s'il était immobile, le centre si les deux
 *  bords se déplaçaient. */
function place(
  start: number,
  size: number,
  taille: number,
  movedStart: boolean,
  movedEnd: boolean,
): number {
  if (movedStart && movedEnd) return start + (size - taille) / 2;
  if (movedStart) return start + size - taille;
  return start;
}

/** Aimant du REDIMENSIONNEMENT.
 *
 *  Déplacer une pièce et l'agrandir jusqu'au bord sont le même geste vu de
 *  l'utilisateur : dans les deux cas on veut que le bord se pose exactement,
 *  sans viser le pixel. L'aimant du déplacement ne suffisait donc pas.
 *
 *  Deux précautions. D'abord le rapport : quand on tire un COIN, les poignées
 *  tiennent déjà les proportions, et corriger un seul axe les casserait — on
 *  applique donc le même facteur aux deux. Ensuite la rotation : sur un calque
 *  incliné la boîte alignée sur les axes ne correspond plus à ce qu'on voit,
 *  et l'aimant est simplement mis en sommeil. */
export function snapResize(
  old: Box,
  next: Box,
  canvas: Size,
  tolerance: number,
): { box: Box; guides: Snap["guides"] } {
  const rien = { box: next, guides: { x: null, y: null } };
  if (tolerance <= 0) return rien;

  /** Quel bord l'utilisateur est-il en train de tirer ?
   *
   *  « Celui qui a bougé » ne suffit pas : le bord censé rester fixe dérive
   *  d'une fraction d'unité à chaque image, et s'il se trouve par hasard près
   *  d'un repère — cas très courant, puisqu'on part souvent d'une pièce déjà
   *  calée sur un bord — c'est LUI que l'aimant attrapait, en annulant le
   *  déplacement voulu. On exige donc qu'un bord ait bougé d'au moins la
   *  moitié de son vis-à-vis pour être considéré comme tiré. Les deux le sont
   *  quand ils s'écartent ensemble : c'est le grossissement centré. */
  const bouge = (d: number, autre: number) =>
    Math.abs(d) > 0.01 && Math.abs(d) >= Math.abs(autre) / 2;

  const dLeft = next.x - old.x;
  const dRight = next.x + next.width - (old.x + old.width);
  const dTop = next.y - old.y;
  const dBottom = next.y + next.height - (old.y + old.height);

  const movedLeft = bouge(dLeft, dRight);
  const movedRight = bouge(dRight, dLeft);
  const movedTop = bouge(dTop, dBottom);
  const movedBottom = bouge(dBottom, dTop);

  const h = edgeSnap(
    next.x,
    next.width,
    canvas.width,
    tolerance,
    movedLeft,
    movedRight,
  );
  const v = edgeSnap(
    next.y,
    next.height,
    canvas.height,
    tolerance,
    movedTop,
    movedBottom,
  );
  if (!h && !v) return rien;

  // Un coin tiré fait bouger un bord sur CHAQUE axe : c'est le signe que les
  // proportions sont tenues, et qu'il faut choisir un seul aimant puis y
  // soumettre l'autre axe.
  const coin = (movedLeft || movedRight) && (movedTop || movedBottom);

  let largeur = next.width + (h?.delta ?? 0);
  let hauteur = next.height + (v?.delta ?? 0);
  let guides: Snap["guides"] = { x: h?.guide ?? null, y: v?.guide ?? null };

  if (coin) {
    // le plus proche des deux l'emporte, en proportion de sa taille
    const fh = h ? Math.abs(h.delta) / Math.max(next.width, 1) : Infinity;
    const fv = v ? Math.abs(v.delta) / Math.max(next.height, 1) : Infinity;
    const facteur =
      fh <= fv
        ? (next.width + (h?.delta ?? 0)) / Math.max(next.width, 1)
        : (next.height + (v?.delta ?? 0)) / Math.max(next.height, 1);
    largeur = next.width * facteur;
    hauteur = next.height * facteur;
    guides =
      fh <= fv
        ? { x: h?.guide ?? null, y: null }
        : { x: null, y: v?.guide ?? null };
  }

  return {
    box: {
      x: place(next.x, next.width, largeur, movedLeft, movedRight),
      y: place(next.y, next.height, hauteur, movedTop, movedBottom),
      width: largeur,
      height: hauteur,
    },
    guides,
  };
}

/** Redimensionne un calque à des dimensions données, en gardant son centre.
 *
 *  Les grandeurs qui suivent la taille suivent aussi : le corps du texte se met
 *  à l'échelle de la hauteur, comme lorsqu'on tire une poignée. Les grandeurs
 *  de style — flou, ombre — ne bougent pas : on redimensionne un calque, on ne
 *  décline pas la composition. */
export function resizeLayer(
  layer: Layer,
  width: number,
  height: number,
): Layer {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const common = { ...layer, width: w, height: h };
  if (common.kind === "text") {
    return {
      ...common,
      fontSize: Math.max(1, common.fontSize * (h / Math.max(layer.height, 1))),
    };
  }
  if (common.kind === "shape") {
    // au-delà de la moitié du petit côté, un arrondi n'a plus de sens : le
    // rectangle est déjà devenu une gélule.
    return {
      ...common,
      cornerRadius: Math.min(common.cornerRadius, Math.min(w, h) / 2),
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
