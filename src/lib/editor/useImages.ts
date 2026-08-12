/** Chargement des images du canevas.
 *
 *  ⚠️ Les pixels passent par `read_image_data_url`, JAMAIS par
 *  `convertFileSrc`. L'URL d'un asset relève d'une autre origine : dessiner
 *  une telle image « contamine » le canevas, et l'export par `toDataURL`
 *  échoue alors sur une erreur de sécurité. Une data URL est de même origine
 *  par construction. La leçon avait déjà été payée côté QR codes
 *  (`src-tauri/src/qr.rs`), on ne la repaie pas ici.
 */

import { useEffect, useState } from "react";
import { readImageDataUrl } from "../qr";

/** Cache de session : une même pièce posée dix fois n'est lue qu'une fois. */
const cache = new Map<string, Promise<HTMLImageElement>>();

function load(path: string): Promise<HTMLImageElement> {
  const hit = cache.get(path);
  if (hit) return hit;
  const pending = readImageDataUrl(path).then(
    (url) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Image illisible : ${path}`));
        img.src = url;
      }),
  );
  // un échec ne doit pas rester en cache, sinon l'image n'est plus jamais
  // réessayée de la session
  pending.catch(() => cache.delete(path));
  cache.set(path, pending);
  return pending;
}

/** Charge les chemins demandés et rend celles qui sont prêtes. Le rendu se
 *  rafraîchit au fur et à mesure : une composition lourde s'affiche par
 *  morceaux plutôt que de rester blanche jusqu'au dernier octet. */
export function useImages(paths: string[]): Map<string, HTMLImageElement> {
  const [ready, setReady] = useState<Map<string, HTMLImageElement>>(new Map());
  // Clé stable pour l'effet : dépendre du tableau le relancerait à chaque
  // rendu, puisqu'un nouveau tableau est une nouvelle référence. On sérialise
  // plutôt qu'on ne concatène — un chemin contient très souvent des espaces
  // (« ChatGPT Image 12 août 2026.png »), et un séparateur naïf découperait
  // ces chemins en morceaux illisibles.
  const key = JSON.stringify(paths);

  useEffect(() => {
    let alive = true;
    for (const path of JSON.parse(key) as string[]) {
      load(path)
        .then((img) => {
          if (!alive) return;
          setReady((prev) => {
            if (prev.get(path) === img) return prev;
            const next = new Map(prev);
            next.set(path, img);
            return next;
          });
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [key]);

  return ready;
}

/** Attend explicitement toutes les images : l'export ne doit jamais partir
 *  sur un canevas à moitié peuplé. */
export function preloadImages(paths: string[]): Promise<HTMLImageElement[]> {
  return Promise.all(paths.map(load));
}
