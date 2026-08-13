/** Ce que le canevas doit savoir de son environnement : la place disponible, et
 *  l'état de la touche Maj.
 *
 *  Deux capteurs, aucune logique de motif — et c'est justement pourquoi ils
 *  sont ici : mêlés au canevas, ils y ajoutaient deux effets et trois états qui
 *  n'avaient rien à voir avec le dessin d'une tuile.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TileSize } from "../../lib/pattern/types";

export interface CanvasFit {
  /** à poser sur le conteneur dont on mesure la place */
  ref: React.RefObject<HTMLDivElement | null>;
  /** facteur d'affichage de la tuile ; 0 tant que rien n'est mesuré */
  scale: number;
  /** Maj est-elle enfoncée ? */
  shift: boolean;
}

export function useCanvasFit(tile: TileSize): CanvasFit {
  const ref = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [shift, setShift] = useState(false);

  // la place disponible est MESURÉE, pas supposée : sans ça, replier la
  // sidebar laisserait une tuile mal cadrée jusqu'au prochain rendu
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Maj est lue à chaque frappe, pas seulement au clic : contraindre un angle,
   *  un carré ou un grossissement centré doit prendre effet immédiatement, sans
   *  relâcher le bouton.
   *
   *  Le relâchement sur `blur` n'est pas un détail : une fenêtre qui perd le
   *  focus ne verra jamais le `keyup`, et Maj resterait « enfoncée »
   *  indéfiniment après un Alt+Tab. */
  useEffect(() => {
    const sync = (e: KeyboardEvent) => setShift(e.shiftKey);
    const release = () => setShift(false);
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
      window.removeEventListener("blur", release);
    };
  }, []);

  const scale =
    box.w > 0 && box.h > 0
      ? Math.min(box.w / tile.width, box.h / tile.height)
      : 0;

  return { ref, scale, shift };
}
