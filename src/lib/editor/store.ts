/** Persistance de la composition en cours.
 *
 *  L'Atelier est une vue parmi d'autres : passer au Studio puis revenir la
 *  démonterait et perdrait tout le travail. On garde donc la composition en
 *  local, et on la relit au montage.
 */

import { DEFAULT_FORMAT } from "./formats";
import type { Composition, Layer, Page } from "./types";

const KEY = "imagehub.composition";

export function newPage(name: string, layers: Layer[] = []): Page {
  return { id: crypto.randomUUID(), name, layers };
}

export function emptyComposition(): Composition {
  const first = newPage("Page 1");
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
    pages: [first],
    activePageId: first.id,
  };
}

/** Forme antérieure : une composition n'avait qu'un jeu de calques, sans
 *  notion de page. */
interface LegacyComposition {
  layers?: Layer[];
}

export function loadComposition(): Composition {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyComposition();
    const parsed = JSON.parse(raw) as Composition & LegacyComposition;
    const base = emptyComposition();

    // Une composition enregistrée avant les pages porte ses calques à la
    // racine : on la promeut en document d'une seule page plutôt que de la
    // jeter — c'est le travail en cours de l'utilisateur.
    const pages =
      Array.isArray(parsed.pages) && parsed.pages.length > 0
        ? parsed.pages
        : [newPage("Page 1", parsed.layers ?? [])];

    const activePageId = pages.some((p) => p.id === parsed.activePageId)
      ? parsed.activePageId
      : pages[0].id;

    return { ...base, ...parsed, pages, activePageId };
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

/** Nom de fichier tiré du nom d'une page : « Page 2 » → `page-2`. */
export function pageSlug(name: string, index: number): string {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || `page-${index + 1}`;
}
