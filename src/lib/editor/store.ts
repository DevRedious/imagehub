/** Persistance de la composition en cours.
 *
 *  L'Atelier est une vue parmi d'autres : passer au Studio puis revenir la
 *  démonterait et perdrait tout le travail. On garde donc la composition en
 *  local, et on la relit au montage.
 */

import { DEFAULT_FORMAT } from "./formats";
import type { Composition } from "./types";

const KEY = "imagehub.composition";

export function emptyComposition(): Composition {
  return {
    name: "composition",
    base: { width: DEFAULT_FORMAT.width, height: DEFAULT_FORMAT.height },
    // éteint par défaut : une compo sert d'abord d'asset réutilisable, et un
    // fond incrusté la rendrait inutilisable par-dessus un autre visuel.
    background: {
      on: false,
      kind: "linear",
      colors: ["#efe6d6", "#d9cdb6"],
      angle: 90,
    },
    layers: [],
  };
}

export function loadComposition(): Composition {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyComposition();
    const parsed = JSON.parse(raw) as Composition;
    // une composition écrite par une version antérieure peut manquer de
    // champs : on la complète plutôt que de faire planter le canevas.
    return { ...emptyComposition(), ...parsed };
  } catch {
    return emptyComposition();
  }
}

export function saveComposition(c: Composition): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* quota plein : la session continue, seule la reprise est perdue */
  }
}

export function clearComposition(): void {
  localStorage.removeItem(KEY);
}
