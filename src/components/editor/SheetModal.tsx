import { useCallback, useEffect, useRef, useState } from "react";
import { BG_MODELS, type BgModel } from "../../lib/actions";
import {
  type Asset,
  type Piece,
  SHEET_DEFAULTS,
  sheetCommit,
  sheetCutout,
  sheetPreview,
} from "../../lib/library";
import { basename } from "../../lib/paths";
import { Modal } from "../Modal";
import { Slider } from "./controls";

interface Props {
  /** planche à découper */
  path: string;
  onDone: (assets: Asset[]) => void;
  onClose: () => void;
  onError: (message: string) => void;
}

/** Découpe d'une planche, en trois temps : détourer (lent, mis en cache),
 *  régler et voir (instantané), puis écrire ce qu'on garde.
 *
 *  L'aperçu n'est pas un confort : aucun réglage automatique ne sépare
 *  correctement toutes les planches — deux éléments qui se touchent vraiment
 *  sortiront ensemble quoi qu'on fasse. Mieux vaut le montrer et laisser
 *  trancher que d'écrire en silence des pièces fausses. */
export function SheetModal({ path, onDone, onClose, onError }: Props) {
  const stem = basename(path).replace(/\.[^.]+$/, "");
  const [model, setModel] = useState<BgModel>("isnet-general-use");
  const [aggressiveness, setAggressiveness] = useState(
    SHEET_DEFAULTS.aggressiveness,
  );
  const [gap, setGap] = useState(SHEET_DEFAULTS.gap);
  const [minSize, setMinSize] = useState(SHEET_DEFAULTS.minSize);

  const [cutout, setCutout] = useState<string | null>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [dropped, setDropped] = useState<Set<number>>(new Set());
  const [detouring, setDetouring] = useState(true);
  const [slicing, setSlicing] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Un premier découpage est-il revenu ? Sans ce témoin, l'instant qui sépare
   *  la fin du détourage de l'arrivée du premier aperçu afficherait « aucune
   *  pièce détectée » — un échec annoncé alors que le calcul n'a pas encore eu
   *  lieu, qui pousserait à trafiquer les réglages pour rien. */
  const [settled, setSettled] = useState(false);
  /** Détourage impossible (rembg absent, image illisible…). Sans cet état, la
   *  modale tournerait indéfiniment sur un échec dont seul un toast fugace
   *  aurait parlé — et rembg n'est PAS livré avec l'application. */
  const [failed, setFailed] = useState<string | null>(null);

  // détourage : relancé seulement quand ses propres paramètres changent
  useEffect(() => {
    let alive = true;
    setDetouring(true);
    setSettled(false);
    setFailed(null);
    sheetCutout({ jobId: crypto.randomUUID(), path, model, aggressiveness })
      .then((c) => {
        if (alive) setCutout(c);
      })
      .catch((e) => {
        if (!alive) return;
        setFailed(String(e));
        onError(String(e));
      })
      .finally(() => {
        if (alive) setDetouring(false);
      });
    return () => {
      alive = false;
    };
  }, [path, model, aggressiveness, onError]);

  // découpe : rejouée à chaque cran de curseur, sur le détourage déjà calculé
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!cutout) return;
    if (timer.current) window.clearTimeout(timer.current);
    setSlicing(true);
    timer.current = window.setTimeout(() => {
      sheetPreview({ cutout, gap, minSize })
        .then((p) => {
          setPieces(p);
          setDropped(new Set());
          setSettled(true);
        })
        .catch((e) => onError(String(e)))
        .finally(() => setSlicing(false));
    }, 120);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [cutout, gap, minSize, onError]);

  const keep = pieces.filter((p) => !dropped.has(p.index));

  const commit = useCallback(async () => {
    if (!cutout || keep.length === 0) return;
    setSaving(true);
    try {
      const assets = await sheetCommit({
        cutout,
        stem,
        gap,
        minSize,
        keep: keep.map((p) => p.index),
      });
      onDone(assets);
    } catch (e) {
      onError(String(e));
    } finally {
      setSaving(false);
    }
  }, [cutout, keep, stem, gap, minSize, onDone, onError]);

  return (
    <Modal width="max-w-4xl">
      <h2 className="text-sm font-semibold text-zinc-200">
        ✂️ Découper une planche
      </h2>
      <p className="mt-1 truncate text-[11px] text-zinc-500" title={path}>
        {basename(path)}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-[240px_1fr]">
        <div className="space-y-3">
          <div className="space-y-2 rounded-xl bg-card p-3">
            <h4 className="text-[11px] font-semibold tracking-wider text-zinc-600">
              DÉTOURAGE
            </h4>
            <div className="flex flex-col gap-1">
              {BG_MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModel(m.id)}
                  title={m.note}
                  className={`cursor-pointer rounded-md px-2 py-1 text-left text-[11px] transition-colors ${
                    model === m.id
                      ? "bg-accent-soft text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {/* Une planche n'a pas un sujet unique mais plusieurs objets à
                égalité : le modèle « Standard » y rend un masque hésitant. */}
            {model === "u2net" && (
              <p className="text-[10px] leading-snug text-amber-500/80">
                Sur une planche, « Précis » donne presque toujours un bien
                meilleur découpage.
              </p>
            )}
            <Slider
              label="Agressivité"
              value={aggressiveness}
              min={0}
              max={100}
              suffix=" %"
              onChange={setAggressiveness}
            />
          </div>

          <div className="space-y-2 rounded-xl bg-card p-3">
            <h4 className="text-[11px] font-semibold tracking-wider text-zinc-600">
              DÉCOUPE
            </h4>
            <Slider
              label="Groupement"
              value={gap}
              min={-100}
              max={100}
              onChange={setGap}
            />
            <p className="text-[10px] leading-snug text-zinc-600">
              À droite, ce qui se frôle est réuni (une baie et sa tige). À
              gauche, ce qui se touche est séparé.
            </p>
            <Slider
              label="Miettes"
              value={minSize}
              min={0}
              max={100}
              onChange={setMinSize}
            />
          </div>
        </div>

        <div className="min-h-[16rem] rounded-xl bg-card p-3">
          {failed ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
              <p className="text-[11px] text-red-400">Détourage impossible</p>
              <p className="text-[10px] leading-snug text-zinc-500">{failed}</p>
              <p className="text-[10px] leading-snug text-zinc-600">
                La découpe de planche repose sur rembg, qui n'est pas livré avec
                l'application — la page Paramètres indique comment l'installer.
              </p>
            </div>
          ) : detouring || !settled ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-500">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
              <p className="text-[11px]">
                {detouring ? "Détourage de la planche…" : "Découpage…"}
              </p>
              {detouring && (
                <p className="text-[10px] text-zinc-600">
                  C'est l'étape lente — les réglages de découpe, ensuite, sont
                  instantanés.
                </p>
              )}
            </div>
          ) : pieces.length === 0 ? (
            <p className="py-12 text-center text-[11px] text-zinc-500">
              Aucune pièce détectée. Essaie un autre modèle, ou baisse le filtre
              « Miettes ».
            </p>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] text-zinc-400">
                  {keep.length} pièce{keep.length > 1 ? "s" : ""} retenue
                  {keep.length > 1 ? "s" : ""} sur {pieces.length}
                </p>
                {slicing && (
                  <span className="text-[10px] text-zinc-600">calcul…</span>
                )}
              </div>
              <div className="grid max-h-[22rem] grid-cols-4 gap-2 overflow-y-auto">
                {pieces.map((p) => {
                  const off = dropped.has(p.index);
                  return (
                    <button
                      key={p.index}
                      type="button"
                      onClick={() =>
                        setDropped((prev) => {
                          const next = new Set(prev);
                          if (off) next.delete(p.index);
                          else next.add(p.index);
                          return next;
                        })
                      }
                      title={`${p.width}×${p.height} — clic pour ${off ? "reprendre" : "écarter"}`}
                      className={`relative aspect-square cursor-pointer rounded-lg p-1.5 transition-all ${
                        off
                          ? "bg-zinc-900/60 opacity-30 grayscale"
                          : "bg-panel ring-1 ring-accent/40 hover:ring-accent"
                      }`}
                    >
                      <img
                        src={p.thumb}
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-lg px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={commit}
          disabled={keep.length === 0 || saving || detouring}
          className="cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving
            ? "Écriture…"
            : `Ajouter ${keep.length} pièce${keep.length > 1 ? "s" : ""}`}
        </button>
      </div>
    </Modal>
  );
}
