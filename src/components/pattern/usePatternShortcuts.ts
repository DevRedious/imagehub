/** Les raccourcis clavier des Motifs.
 *
 *  Un seul écouteur, un seul ordre de priorité — et c'est tout l'intérêt de les
 *  rassembler. Dispersés dans les composants, deux raccourcis finissent par se
 *  disputer la même touche sans que rien ne le signale : ici l'ordre des
 *  branches EST la règle de priorité, et il se lit d'un coup d'œil.
 *
 *  Priorité : annulation, puis changement d'outil, puis actions sur la
 *  sélection. Un champ de saisie garde toujours ses frappes.
 */

import { useEffect } from "react";
import type { Tool } from "../../lib/pattern/draw";
import { wrapCenter } from "../../lib/pattern/tiling";
import type { Pattern } from "../../lib/pattern/types";

/** Pas d'un déplacement au clavier, en fraction de tuile. Un demi pour cent
 *  correspond à peu près au pixel sur une tuile de 480 — assez fin pour caler,
 *  assez gros pour que la touche serve à quelque chose. */
const STEP = 0.005;

/** Un outil par touche, comme dans tout logiciel de dessin : la main reste sur
 *  le canevas au lieu de faire l'aller-retour vers la palette. */
const OUTILS: Record<string, Tool> = {
  v: "select",
  b: "pencil",
  l: "line",
  r: "rect",
  o: "ellipse",
  p: "polygon",
};

interface Args {
  selected: string[];
  setSelected: (ids: string[]) => void;
  setTool: (tool: Tool) => void;
  setPattern: (next: (cur: Pattern) => Pattern) => void;
  commit: () => void;
  undo: () => void;
  removePieces: (ids: string[]) => void;
  duplicatePieces: (ids: string[]) => void;
}

export function usePatternShortcuts({
  selected,
  setSelected,
  setTool,
  setPattern,
  commit,
  undo,
  removePieces,
  duplicatePieces,
}: Args): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      // ne jamais voler une frappe à un champ de saisie
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;

      if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undo();
        return;
      }

      const outil = OUTILS[e.key.toLowerCase()];
      if (outil && !e.ctrlKey && !e.metaKey) {
        setTool(outil);
        return;
      }

      // Échap rend la flèche ET libère la sélection : la seule sortie évidente
      // quand on a un outil en main et qu'on ne sait plus comment revenir.
      if (e.key === "Escape") {
        setTool("select");
        setSelected([]);
        return;
      }
      if (selected.length === 0) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removePieces(selected);
      } else if (e.key === "d" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        duplicatePieces(selected);
      } else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        // un pas fin sous Maj : caler une pièce sur une couture demande de la
        // précision, la parcourir demande de la vitesse
        const pas = e.shiftKey ? STEP / 5 : STEP;
        const dx =
          (e.key === "ArrowRight" ? pas : 0) -
          (e.key === "ArrowLeft" ? pas : 0);
        const dy =
          (e.key === "ArrowDown" ? pas : 0) - (e.key === "ArrowUp" ? pas : 0);
        commit();
        setPattern((p) => ({
          ...p,
          pieces: p.pieces.map((x) =>
            selected.includes(x.id)
              ? wrapCenter({ ...x, x: x.x + dx, y: x.y + dy })
              : x,
          ),
        }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    selected,
    setSelected,
    setTool,
    setPattern,
    commit,
    undo,
    removePieces,
    duplicatePieces,
  ]);
}
