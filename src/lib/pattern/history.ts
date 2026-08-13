/** Annulation (Ctrl+Z) du motif.
 *
 *  L'écueil d'un historique dans un éditeur au pointeur : un déplacement émet
 *  des dizaines de mises à jour par seconde, et les empiler toutes rendrait
 *  Ctrl+Z inutilisable — il faudrait le marteler cinquante fois pour défaire un
 *  seul glissement.
 *
 *  D'où deux verbes distincts. `commit()` marque un point de retour AVANT une
 *  modification ; `setPattern` modifie sans rien marquer. Un geste au pointeur
 *  n'appelle donc `commit()` qu'à son début, et une action discrète (poser,
 *  supprimer, semer) l'appelle une fois.
 */

import { useCallback, useRef, useState } from "react";
import type { Pattern } from "./types";

/** Au-delà, on oublie les états les plus anciens : un motif chargé pèse
 *  quelques dizaines de kilo-octets, et personne ne remonte cinquante gestes. */
const DEPTH = 50;

export interface PatternHistory {
  pattern: Pattern;
  setPattern: (next: Pattern | ((cur: Pattern) => Pattern)) => void;
  /** marque un point de retour sur l'état COURANT */
  commit: () => void;
  undo: () => void;
  canUndo: boolean;
  /** remplace tout, sans point de retour (ouverture d'un document) */
  replace: (next: Pattern) => void;
}

export function usePatternHistory(initial: () => Pattern): PatternHistory {
  const [pattern, setState] = useState<Pattern>(initial);
  const [depth, setDepth] = useState(0);
  const past = useRef<Pattern[]>([]);
  // l'état courant, lisible hors du rendu : `commit()` doit pouvoir empiler
  // sans dépendre de la fermeture dans laquelle il a été créé
  const current = useRef(pattern);
  current.current = pattern;

  const commit = useCallback(() => {
    past.current = [...past.current, current.current].slice(-DEPTH);
    setDepth(past.current.length);
  }, []);

  const undo = useCallback(() => {
    const previous = past.current[past.current.length - 1];
    if (!previous) return;
    past.current = past.current.slice(0, -1);
    setDepth(past.current.length);
    setState(previous);
  }, []);

  const replace = useCallback((next: Pattern) => {
    past.current = [];
    setDepth(0);
    setState(next);
  }, []);

  return {
    pattern,
    setPattern: setState,
    commit,
    undo,
    canUndo: depth > 0,
    replace,
  };
}
