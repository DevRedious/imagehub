/** Semis aléatoire assisté.
 *
 *  Poser trente feuilles à la main pour obtenir un fond « naturel » est un
 *  travail ingrat, et le résultat trahit toujours la main : on aligne sans le
 *  vouloir. Le semis tire les positions, les échelles et les angles, et laisse
 *  la retouche à la main sur ce qui dépasse.
 *
 *  Deux choix décident de l'utilité de la chose :
 *
 *  1. **Une graine.** Sans elle, un motif obtenu par hasard serait
 *     irreproductible : impossible de retrouver celui d'hier, ni de le
 *     retoucher légèrement sans tout perdre. La graine vit dans le document.
 *
 *  2. **La distance minimale se mesure SUR LE TORE.** Deux pièces posées de
 *     part et d'autre d'un bord sont voisines dans le motif répété, même si
 *     leurs coordonnées sont aux antipodes. Mesurer à plat laisserait des
 *     paquets sur les coutures — précisément là où l'œil cherche le raccord.
 */

import { createPiece } from "./factory";
import type { PatternPiece } from "./types";

export interface ScatterSettings {
  /** nombre de pièces visées */
  count: number;
  /** échelle, en fraction de la largeur de tuile */
  minScale: number;
  maxScale: number;
  /** amplitude de rotation, en degrés (0 = tout droit) */
  rotate: number;
  /** distance minimale entre deux centres, en fraction de tuile */
  spacing: number;
  /** miroir horizontal tiré au sort : casse la répétition d'un même élément */
  mirror: boolean;
}

export const DEFAULT_SCATTER: ScatterSettings = {
  count: 12,
  minScale: 0.1,
  maxScale: 0.22,
  rotate: 180,
  spacing: 0.12,
  mirror: true,
};

/** Générateur déterministe (mulberry32) : une graine, toujours la même suite.
 *  `Math.random` conviendrait au tirage mais rendrait le semis irreproductible,
 *  ce qui est exactement ce qu'on cherche à éviter. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Distance sur le tore : le plus court chemin, en passant par le bord si
 *  c'est plus court. */
function torusDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const wrap = (d: number) => {
    const v = Math.abs(d) % 1;
    return Math.min(v, 1 - v);
  };
  const dx = wrap(a.x - b.x);
  const dy = wrap(a.y - b.y);
  return Math.hypot(dx, dy);
}

/** Élément semable : ce que la bibliothèque fournit. */
export interface ScatterSource {
  path: string;
  name: string;
  width: number | null;
  height: number | null;
}

/** Sème `count` pièces tirées au sort parmi les sources.
 *
 *  L'espacement est obtenu par rejet : on tire une position, on la garde si
 *  elle respecte la distance minimale. Après une série d'échecs on relâche la
 *  contrainte plutôt que de boucler — un espacement trop grand pour la densité
 *  demandée doit rendre un semis un peu serré, pas une interface figée. */
export function scatter(
  sources: ScatterSource[],
  settings: ScatterSettings,
  seed: number,
): PatternPiece[] {
  if (sources.length === 0) return [];
  const random = rng(seed);
  const out: PatternPiece[] = [];
  const centres: { x: number; y: number }[] = [];
  const between = (min: number, max: number) => min + random() * (max - min);

  for (let i = 0; i < settings.count; i++) {
    let at = { x: random(), y: random() };
    for (let essai = 0; essai < 24; essai++) {
      const libre = centres.every(
        (c) => torusDistance(at, c) >= settings.spacing,
      );
      if (libre) break;
      at = { x: random(), y: random() };
    }
    centres.push(at);

    const source = sources[Math.floor(random() * sources.length)];
    const piece = createPiece(
      source.path,
      source.name,
      { width: source.width ?? 512, height: source.height ?? 512 },
      at,
    );
    // l'échelle s'applique à la taille de départ, dont le rapport est déjà
    // celui du fichier : on ne peut donc pas déformer la pièce ici
    const facteur = between(settings.minScale, settings.maxScale) / piece.width;
    out.push({
      ...piece,
      width: piece.width * facteur,
      height: piece.height * facteur,
      rotation: between(-settings.rotate, settings.rotate),
      flipX: settings.mirror && random() < 0.5,
    });
  }
  return out;
}
