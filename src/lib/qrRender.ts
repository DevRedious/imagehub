/** Dessin d'un QR code stylisé sur un canvas.
 *
 *  Tout est peint à la main plutôt que délégué à une bibliothèque : les
 *  modules arrondis, les yeux d'une autre couleur, le logo au centre et le
 *  cadre avec sa légende sont des choix graphiques qu'aucun rendu générique
 *  n'expose ensemble. Et comme la sortie est un PNG, le texte est rasterisé —
 *  le fichier ne dépend plus de la police qui l'a produit.
 *
 *  La sortie est indépendante de la résolution : toutes les mesures dérivent
 *  de `size`, donc exporter en 4096 donne le même dessin qu'en 512. */

import type { ModuleShape, QrColors, QrMatrix } from "./qr";

/** Zone de silence imposée par la norme : sans elle, beaucoup de lecteurs
 *  décrochent. Exprimée en modules. */
const QUIET = 4;

/** Part du côté du QR occupée par le logo. Au-delà d'environ un quart, même
 *  la correction H ne suffit plus. */
const LOGO_RATIO = 0.22;

export interface QrStyle {
  colors: QrColors;
  shape: ModuleShape;
  /** légende sous le code (vide = aucune) */
  caption: string;
  /** famille de police chargée pour la légende */
  fontFamily: string;
  /** flèche courbe pointant vers le code */
  arrow: boolean;
  /** image centrale déjà chargée */
  logo: HTMLImageElement | null;
}

/** Tracé d'un rectangle à coins arrondis — `roundRect` n'est pas disponible
 *  partout, et on veut le même rendu quelle que soit la version du moteur. */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

/** Les trois motifs de repérage, 7×7 modules dans les coins. Ils portent leur
 *  propre couleur et ne sont pas dessinés comme des modules ordinaires. */
function isFinder(x: number, y: number, size: number): boolean {
  const inBox = (bx: number, by: number) =>
    x >= bx && x < bx + 7 && y >= by && y < by + 7;
  return inBox(0, 0) || inBox(size - 7, 0) || inBox(0, size - 7);
}

function moduleRadius(shape: ModuleShape, m: number): number {
  if (shape === "round") return m / 2;
  if (shape === "soft") return m * 0.28;
  return 0;
}

/** Proportions relevées sur le gabarit « arrow-frame » d'origine
 *  (ASSETS/qr_code.svg, viewBox 343.1 × 395.1). Exprimées en fraction de la
 *  LARGEUR, pour que tout se dérive d'une seule mesure.
 *
 *  Le panneau n'est ni carré dans l'image, ni centré : il est poussé à droite,
 *  et la bande laissée à gauche accueille la flèche. La légende, elle, est
 *  inclinée. Ces décalages font une bonne part de l'allure. */
const TPL = {
  aspect: 395.1 / 343.1,
  panelX: 63 / 343.1,
  panelY: 1 / 343.1,
  panelSide: 279.1 / 343.1,
  panelRadius: 13.7 / 343.1,
  captionX: 46 / 343.1,
  captionW: 290 / 343.1,
  captionAngle: (-5 * Math.PI) / 180,
};

export interface Layout {
  /** largeur totale de l'image */
  size: number;
  /** hauteur totale (l'image n'est carrée que sans habillage) */
  height: number;
  /** côté du panneau contenant le code */
  panel: number;
  panelX: number;
  panelY: number;
  radius: number;
  /** bas du panneau — rien d'autre ne doit être dessiné au-dessus */
  panelBottom: number;
  /** vrai si la mise en page réserve la bande gauche et la zone de légende */
  framed: boolean;
}

function layout(size: number, framed: boolean): Layout {
  if (!framed) {
    const margin = size * 0.06;
    const panel = size - margin * 2;
    return {
      size,
      height: size,
      panel,
      panelX: margin,
      panelY: margin,
      radius: panel * 0.06,
      panelBottom: margin + panel,
      framed,
    };
  }
  const panelY = size * TPL.panelY;
  const panel = size * TPL.panelSide;
  return {
    size,
    height: size * TPL.aspect,
    panel,
    panelX: size * TPL.panelX,
    panelY,
    radius: size * TPL.panelRadius,
    panelBottom: panelY + panel,
    framed,
  };
}

/** Hauteur de l'image pour une largeur donnée — l'UI en a besoin avant de
 *  dessiner (dimensionnement du canvas d'export). */
export function outputHeight(size: number, style: QrStyle): number {
  return isFramed(style) ? Math.round(size * TPL.aspect) : size;
}

function isFramed(style: QrStyle): boolean {
  return style.caption.trim() !== "" || style.arrow;
}

/** Dessine le code complet. Le canvas est redimensionné à `size`. */
export function drawQr(
  canvas: HTMLCanvasElement,
  matrix: QrMatrix,
  style: QrStyle,
  size: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  const box = layout(size, isFramed(style));
  canvas.width = size;
  canvas.height = box.height;
  ctx.clearRect(0, 0, size, box.height);

  const { colors, shape, caption, logo } = style;

  // panneau de fond, coins arrondis comme dans la référence
  ctx.fillStyle = colors.background;
  roundRectPath(ctx, box.panelX, box.panelY, box.panel, box.panel, box.radius);
  ctx.fill();

  // grille : la zone de silence fait partie du panneau
  const m = box.panel / (matrix.size + QUIET * 2);
  const originX = box.panelX + m * QUIET;
  const originY = box.panelY + m * QUIET;

  // dégradé vertical sur toute la hauteur du code (une seule teinte = uni)
  const grad = ctx.createLinearGradient(
    0,
    originY,
    0,
    originY + m * matrix.size,
  );
  for (const [pos, color] of colors.stops) grad.addColorStop(pos, color);
  ctx.fillStyle = colors.stops.length > 1 ? grad : colors.stops[0][1];

  // zone réservée au logo, en modules entiers : on n'y dessine rien plutôt
  // que de peindre puis recouvrir, ce qui laisserait des bords qui dépassent.
  const logoHalf = logo ? Math.ceil((matrix.size * LOGO_RATIO) / 2) + 1 : 0;
  const center = matrix.size / 2;

  const radius = moduleRadius(shape, m);
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (!matrix.modules[y * matrix.size + x]) continue;
      if (isFinder(x, y, matrix.size)) continue;
      if (
        logo &&
        Math.abs(x + 0.5 - center) < logoHalf &&
        Math.abs(y + 0.5 - center) < logoHalf
      ) {
        continue;
      }
      roundRectPath(ctx, originX + x * m, originY + y * m, m, m, radius);
      ctx.fill();
    }
  }

  drawFinders(ctx, matrix.size, originX, originY, m, colors);
  if (logo) drawLogo(ctx, logo, originX, originY, m, matrix.size, colors);
  if (box.framed && style.arrow) drawArrow(ctx, box, colors.frame);
  if (box.framed && caption.trim() !== "") drawCaption(ctx, style, box);
}

function drawFinders(
  ctx: CanvasRenderingContext2D,
  matrixSize: number,
  originX: number,
  originY: number,
  m: number,
  colors: QrColors,
): void {
  const corners: [number, number][] = [
    [0, 0],
    [matrixSize - 7, 0],
    [0, matrixSize - 7],
  ];
  for (const [cx, cy] of corners) {
    const x = originX + cx * m;
    const y = originY + cy * m;
    // anneau extérieur : 7×7 évidé de son centre 5×5
    ctx.fillStyle = colors.eyeOuter;
    roundRectPath(ctx, x, y, m * 7, m * 7, m * 2);
    ctx.fill();
    ctx.fillStyle = colors.background;
    roundRectPath(ctx, x + m, y + m, m * 5, m * 5, m * 1.4);
    ctx.fill();
    // pupille 3×3
    ctx.fillStyle = colors.eyeInner;
    roundRectPath(ctx, x + m * 2, y + m * 2, m * 3, m * 3, m * 0.9);
    ctx.fill();
  }
}

function drawLogo(
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement,
  originX: number,
  originY: number,
  m: number,
  matrixSize: number,
  colors: QrColors,
): void {
  const side = matrixSize * m * LOGO_RATIO;
  const cx = originX + (matrixSize * m) / 2;
  const cy = originY + (matrixSize * m) / 2;
  const pad = m * 0.8;

  // pastille de fond : détache le logo des modules voisins, ce qui aide
  // autant l'œil que le lecteur
  ctx.fillStyle = colors.background;
  roundRectPath(
    ctx,
    cx - side / 2 - pad,
    cy - side / 2 - pad,
    side + pad * 2,
    side + pad * 2,
    (side + pad * 2) * 0.22,
  );
  ctx.fill();

  // conserve les proportions de l'image
  const ratio = logo.naturalWidth / logo.naturalHeight || 1;
  const w = ratio >= 1 ? side : side * ratio;
  const h = ratio >= 1 ? side / ratio : side;
  ctx.drawImage(logo, cx - w / 2, cy - h / 2, w, h);
}

/** Légende sous le code, inclinée comme dans le gabarit.
 *
 *  La taille est cherchée par dichotomie plutôt que fixée : une police
 *  manuscrite et une grotesque n'occupent pas la même largeur pour le même
 *  corps, et la légende doit tenir dans sa zone quelle que soit la police
 *  chargée. */
function drawCaption(
  ctx: CanvasRenderingContext2D,
  style: QrStyle,
  box: Layout,
): void {
  const { caption, fontFamily, colors } = style;
  const maxWidth = box.size * TPL.captionW;
  const text = caption.trim();

  // la légende vit dans la bande SOUS le panneau : sa position se déduit du
  // bas du panneau, jamais d'une constante — sans quoi elle finit sur le code
  const band = box.height - box.panelBottom;
  const maxHeight = band * 0.62;

  let fontSize = Math.min(box.size * 0.15, maxHeight);
  for (let i = 0; i < 12; i++) {
    ctx.font = `${fontSize}px "${fontFamily}", cursive`;
    const w = ctx.measureText(text).width;
    if (w <= maxWidth) break;
    fontSize *= maxWidth / w;
  }

  ctx.save();
  ctx.translate(box.size * TPL.captionX, box.panelBottom + band * 0.52);
  ctx.rotate(TPL.captionAngle);
  ctx.fillStyle = colors.frame;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `${fontSize}px "${fontFamily}", cursive`;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** Flèche courbe dans la bande gauche, pointant vers le code.
 *
 *  Dessinée ici plutôt que reprise du gabarit d'origine : ce fichier est
 *  l'œuvre du service qui l'a produit, et ImageHub est publié sous licence
 *  libre. On en reprend les proportions — qui sont des mesures — pas le tracé.
 *
 *  Le trait s'épaissit vers la pointe : un `stroke` est d'épaisseur constante,
 *  on construit donc la forme en longeant la courbe aller puis retour. */
function drawArrow(
  ctx: CanvasRenderingContext2D,
  box: Layout,
  color: string,
): void {
  const s = box.size;
  // La flèche tient dans la bande gauche : le panneau commence à `panelX`, on
  // s'arrête avant. Elle part du niveau de la légende et remonte vers le code.
  const right = Math.min(box.panelX * 0.92, s * 0.17);
  const p0 = {
    x: right,
    y: box.panelBottom + (box.height - box.panelBottom) * 0.42,
  };
  const c1 = { x: s * 0.015, y: box.panelBottom + s * 0.02 };
  const c2 = { x: s * 0.02, y: box.panelBottom * 0.62 };
  const p3 = { x: right * 0.88, y: box.panelBottom * 0.52 };
  const maxWidth = s * 0.02;

  const at = (t: number) => {
    const u = 1 - t;
    return {
      x:
        u * u * u * p0.x +
        3 * u * u * t * c1.x +
        3 * u * t * t * c2.x +
        t ** 3 * p3.x,
      y:
        u * u * u * p0.y +
        3 * u * u * t * c1.y +
        3 * u * t * t * c2.y +
        t ** 3 * p3.y,
    };
  };
  const tangent = (t: number) => {
    const a = at(Math.max(0, t - 0.01));
    const b = at(Math.min(1, t + 0.01));
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  };
  // effilé à la queue, pleine épaisseur près de la pointe
  const halfWidth = (t: number) => (maxWidth * t ** 0.6) / 2;

  const STEPS = 40;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const p = at(t);
    const d = tangent(t);
    const w = halfWidth(t);
    const x = p.x - d.y * w;
    const y = p.y + d.x * w;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = STEPS; i >= 0; i--) {
    const t = i / STEPS;
    const p = at(t);
    const d = tangent(t);
    const w = halfWidth(t);
    ctx.lineTo(p.x + d.y * w, p.y - d.x * w);
  }
  ctx.closePath();
  ctx.fill();

  // pointe triangulaire, alignée sur la tangente finale
  const tip = at(1);
  const d = tangent(1);
  const head = s * 0.045;
  ctx.beginPath();
  ctx.moveTo(tip.x + d.x * head * 0.8, tip.y + d.y * head * 0.8);
  ctx.lineTo(tip.x - d.y * head * 0.42, tip.y + d.x * head * 0.42);
  ctx.lineTo(tip.x + d.y * head * 0.42, tip.y - d.x * head * 0.42);
  ctx.closePath();
  ctx.fill();
}

/** Charge une image depuis une URL utilisable par le webview. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Logo illisible"));
    img.src = src;
  });
}
