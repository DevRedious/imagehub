/** Les mutations du motif.
 *
 *  Tout ce qui modifie le document passe par ici : poser, retirer, dupliquer,
 *  réordonner, semer, régler la tuile ou le fond. Le point commun n'est pas
 *  cosmétique — chacune de ces opérations doit poser un point d'annulation
 *  AVANT de modifier (`commit`), et oublier ce `commit` sur une seule d'entre
 *  elles rendrait Ctrl+Z incohérent d'une action à l'autre. Les rassembler,
 *  c'est n'avoir qu'un endroit où le vérifier.
 *
 *  La sélection est mise à jour ici aussi : supprimer une pièce sans la retirer
 *  de la sélection laisserait des poignées accrochées à un calque disparu.
 */

import { useCallback } from "react";
import type { Asset } from "../../lib/library";
import { basename } from "../../lib/paths";
import { patternSaveJson } from "../../lib/pattern/api";
import { createPiece, duplicatePiece } from "../../lib/pattern/factory";
import type { PatternHistory } from "../../lib/pattern/history";
import { type ScatterSettings, scatter } from "../../lib/pattern/scatter";
import { patternSlug } from "../../lib/pattern/store";
import { wrapCenter } from "../../lib/pattern/tiling";
import type { Pattern, PatternPiece, TileSize } from "../../lib/pattern/types";
import type { ToastKind } from "../Toaster";

interface Args {
  history: PatternHistory;
  setSelected: (ids: string[] | ((cur: string[]) => string[])) => void;
  onToast: (kind: ToastKind, message: string) => void;
}

export interface PatternDocument {
  updatePiece: (piece: PatternPiece) => void;
  addAsset: (asset: Asset, at?: { x: number; y: number }) => void;
  addDrawn: (piece: PatternPiece) => void;
  removePieces: (ids: string[]) => void;
  duplicatePieces: (ids: string[]) => void;
  raisePiece: (id: string, delta: number) => void;
  setTile: (tile: TileSize) => void;
  setBackground: (background: Pattern["background"]) => void;
  applyScatter: (
    settings: ScatterSettings,
    seed: number,
    remplacer: boolean,
    sources: Asset[],
  ) => void;
  save: () => Promise<void>;
}

export function usePatternDocument({
  history,
  setSelected,
  onToast,
}: Args): PatternDocument {
  const { pattern, setPattern, commit } = history;

  const updatePiece = useCallback(
    (next: PatternPiece) => {
      setPattern((p) => ({
        ...p,
        pieces: p.pieces.map((x) => (x.id === next.id ? next : x)),
      }));
    },
    [setPattern],
  );

  const addAsset = useCallback(
    (asset: Asset, at?: { x: number; y: number }) => {
      commit();
      const piece = wrapCenter(
        createPiece(
          asset.path,
          asset.name,
          { width: asset.width ?? 512, height: asset.height ?? 512 },
          at,
        ),
      );
      setPattern((p) => ({ ...p, pieces: [...p.pieces, piece] }));
      setSelected([piece.id]);
    },
    [commit, setPattern, setSelected],
  );

  /** Un tracé validé entre dans le document comme n'importe quelle pièce : même
   *  pile de calques, même annulation, même export. Le dessin n'est pas un
   *  second système, c'est une autre façon de remplir une pièce.
   *
   *  Il n'est PAS sélectionné au passage : on enchaîne les traits, et voir des
   *  poignées apparaître après chacun couperait le geste. */
  const addDrawn = useCallback(
    (piece: PatternPiece) => {
      commit();
      setPattern((p) => ({ ...p, pieces: [...p.pieces, piece] }));
    },
    [commit, setPattern],
  );

  const removePieces = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      commit();
      setPattern((p) => ({
        ...p,
        pieces: p.pieces.filter((x) => !ids.includes(x.id)),
      }));
      setSelected((sel) => sel.filter((x) => !ids.includes(x)));
    },
    [commit, setPattern, setSelected],
  );

  const duplicatePieces = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      commit();
      const copies = pattern.pieces
        .filter((x) => ids.includes(x.id))
        .map((x) => wrapCenter(duplicatePiece(x)));
      if (copies.length === 0) return;
      setPattern((p) => ({ ...p, pieces: [...p.pieces, ...copies] }));
      setSelected(copies.map((c) => c.id));
    },
    [commit, pattern.pieces, setPattern, setSelected],
  );

  const raisePiece = useCallback(
    (id: string, delta: number) => {
      commit();
      setPattern((p) => {
        const i = p.pieces.findIndex((x) => x.id === id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= p.pieces.length) return p;
        const pieces = [...p.pieces];
        [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
        return { ...p, pieces };
      });
    },
    [commit, setPattern],
  );

  const setTile = useCallback(
    (tile: TileSize) => {
      // les pièces sont rangées en fractions de tuile : changer l'échelle de
      // travail ne déplace et ne redimensionne rigoureusement rien.
      commit();
      setPattern((p) => ({ ...p, tile }));
    },
    [commit, setPattern],
  );

  const setBackground = useCallback(
    (background: Pattern["background"]) => {
      commit();
      setPattern((p) => ({ ...p, background }));
    },
    [commit, setPattern],
  );

  const applyScatter = useCallback(
    (
      settings: ScatterSettings,
      seed: number,
      remplacer: boolean,
      sources: Asset[],
    ) => {
      commit();
      const semees = scatter(sources, settings, seed);
      setPattern((p) => ({
        ...p,
        seed,
        pieces: remplacer ? semees : [...p.pieces, ...semees],
      }));
      setSelected([]);
      onToast("success", `${semees.length} pièce(s) semée(s) — graine ${seed}`);
    },
    [commit, setPattern, setSelected, onToast],
  );

  const save = useCallback(async () => {
    try {
      const path = await patternSaveJson(
        patternSlug(pattern.name),
        JSON.stringify(pattern, null, 2),
      );
      onToast("success", `Motif enregistré — ${basename(path)}`);
    } catch (e) {
      onToast("error", String(e));
    }
  }, [pattern, onToast]);

  return {
    updatePiece,
    addAsset,
    addDrawn,
    removePieces,
    duplicatePieces,
    raisePiece,
    setTile,
    setBackground,
    applyScatter,
    save,
  };
}
