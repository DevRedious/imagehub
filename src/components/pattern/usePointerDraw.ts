/** Le geste de dessin sur le canevas.
 *
 *  Trois familles de gestes, un seul cycle appuyer → glisser → relâcher :
 *
 *  - le **crayon** accumule les points au fil du déplacement ;
 *  - le **trait** ne retient que le départ et l'arrivée, avec contrainte à 15°
 *    sous Maj ;
 *  - les **formes** se tirent d'un coin à l'autre, en carré parfait sous Maj.
 *
 *  Rien n'est écrit dans le document avant le relâchement : tant que le geste
 *  dure, la pièce vit dans un brouillon local, rendu par le même composant que
 *  les autres — donc avec ses neuf copies. C'est ce qui fait qu'un trait tiré
 *  vers le bord se voit ressortir de l'autre côté PENDANT qu'on le dessine, et
 *  pas seulement une fois lâché.
 *
 *  Le brouillon est aussi ce qui rend l'annulation propre : un geste avorté
 *  (touche Échap, sortie de fenêtre) ne laisse rien derrière lui, et
 *  l'historique ne connaît que des tracés terminés.
 */

import { useCallback, useRef, useState } from "react";
import type { Brush, Tool } from "../../lib/pattern/draw";
import {
  shapeOfTool,
  snapAngle,
  TOOL_LABEL,
  thin,
} from "../../lib/pattern/draw";
import { createShape, createStroke } from "../../lib/pattern/factory";
import { wrapCenter } from "../../lib/pattern/tiling";
import type { PatternPiece, Point } from "../../lib/pattern/types";

/** Distance minimale entre deux points retenus du crayon, en fraction de
 *  tuile. Un pointeur émet des dizaines d'événements par seconde, souvent au
 *  même endroit : sans ce filtre un trait de deux secondes pèserait mille
 *  points, que la sérialisation, le rendu et l'annulation traîneraient. */
const PAS_CRAYON = 0.004;

export interface DrawHandlers {
  /** la pièce en cours de tracé, ou null hors geste */
  draft: PatternPiece | null;
  /** `at` est en fraction de tuile ; `shift` contraint angle ou proportions */
  start: (at: Point, shift: boolean) => void;
  move: (at: Point, shift: boolean) => void;
  /** rend la pièce à ajouter au document, ou null si le geste n'a rien produit */
  end: () => PatternPiece | null;
  cancel: () => void;
  drawing: boolean;
}

export function usePointerDraw(tool: Tool, brush: Brush): DrawHandlers {
  const [draft, setDraft] = useState<PatternPiece | null>(null);
  // les points bruts vivent dans une `ref` : ils changent à chaque pixel
  // parcouru, et les passer par l'état ferait un rendu React par échantillon
  const points = useRef<Point[]>([]);
  const origin = useRef<Point | null>(null);

  const build = useCallback(
    (at: Point, shift: boolean): PatternPiece | null => {
      const from = origin.current;
      if (!from) return null;

      if (tool === "pencil") {
        return createStroke(points.current, brush, TOOL_LABEL.pencil);
      }
      if (tool === "line") {
        const to = shift ? snapAngle(from, at) : at;
        return createStroke([from, to], brush, TOOL_LABEL.line);
      }

      const shape = shapeOfTool(tool);
      if (!shape) return null;
      let w = at.x - from.x;
      let h = at.y - from.y;
      if (shift) {
        // carré, cercle, polygone régulier : le plus grand côté commande, en
        // gardant le sens dans lequel on tire
        const cote = Math.max(Math.abs(w), Math.abs(h));
        w = Math.sign(w || 1) * cote;
        h = Math.sign(h || 1) * cote;
      }
      // La forme se tire d'un COIN à l'autre : son centre est le milieu de la
      // diagonale. C'est le geste qu'on attend d'un outil de dessin, alors que
      // partir du centre demanderait de deviner où l'on veut aboutir.
      return createShape(
        shape,
        { x: from.x + w / 2, y: from.y + h / 2 },
        { width: w, height: h },
        brush,
      );
    },
    [tool, brush],
  );

  const start = useCallback(
    (at: Point, shift: boolean) => {
      origin.current = at;
      points.current = [at];
      setDraft(build(at, shift));
    },
    [build],
  );

  const move = useCallback(
    (at: Point, shift: boolean) => {
      if (!origin.current) return;
      if (tool === "pencil") {
        const last = points.current[points.current.length - 1];
        if (Math.hypot(at.x - last.x, at.y - last.y) < PAS_CRAYON) return;
        points.current = [...points.current, at];
      }
      setDraft(build(at, shift));
    },
    [tool, build],
  );

  const end = useCallback((): PatternPiece | null => {
    const from = origin.current;
    origin.current = null;
    setDraft(null);
    if (!from) return null;

    if (tool === "pencil") {
      const bruts = thin(points.current, PAS_CRAYON);
      points.current = [];
      // Le lissage n'intervient qu'ICI, sur le tracé validé : le résultat est
      // ce qui est stocké, donc l'aperçu et l'export partent des mêmes points.
      // Lisser au rendu obligerait Konva et `tiny-skia` à s'accorder sur la
      // même courbe, et ils divergeraient au premier écart.
      return wrapCenter(
        createStroke(bruts, brush, TOOL_LABEL.pencil, { lisser: true }),
      );
    }

    points.current = [];
    if (!draft) return null;
    // Un clic sans glissement ne produit pas de forme : une ellipse de taille
    // nulle serait un calque invisible de plus dans la liste, et l'utilisateur
    // croirait avoir raté son geste.
    if (draft.kind === "shape" && draft.width < 0.004 && draft.height < 0.004) {
      return null;
    }
    if (draft.kind === "stroke") {
      const [a, b] = draft.points;
      if (b && Math.hypot(b.x - a.x, b.y - a.y) < 0.004) return null;
    }
    return wrapCenter(draft);
  }, [tool, brush, draft]);

  const cancel = useCallback(() => {
    origin.current = null;
    points.current = [];
    setDraft(null);
  }, []);

  return { draft, start, move, end, cancel, drawing: origin.current !== null };
}
