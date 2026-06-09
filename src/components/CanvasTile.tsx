import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { basename } from "../lib/paths";
import { type Job, PACK_ACTIONS } from "../types/job";

interface Props {
  path: string;
  job?: Job;
  onRemove: (path: string) => void;
  onPreview: (path: string) => void;
  onReveal: (path: string) => void;
}

type Phase = "idle" | "scan" | "process" | "reveal" | "result" | "error";

const SCAN_MS = 1100;
const REVEAL_MS = 700;
// durée minimale avant de révéler (depuis le début du job) : garantit que le
// scan + le « traitement » sont visibles même pour une action quasi instantanée.
const MIN_BEFORE_REVEAL = SCAN_MS + 250;

/** Tuile « IA » : carrée au repos, puis carte avant → après une fois lancée.
 *  L'original (gauche) est scanné, le résultat (droite) se génère par balayage. */
export function CanvasTile({
  path,
  job,
  onRemove,
  onPreview,
  onReveal,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const startRef = useRef<number | null>(null);

  const jobId = job?.id;
  const jobStatus = job?.status;

  // démarrage : un job apparaît → scan puis traitement (dépend de l'identité
  // du job seulement, pas du statut, pour ne pas relancer l'animation).
  useEffect(() => {
    if (jobId === undefined) {
      setPhase("idle");
      startRef.current = null;
      return;
    }
    if (startRef.current === null) startRef.current = performance.now();
    setPhase("scan");
    const t = setTimeout(
      () => setPhase((p) => (p === "scan" ? "process" : p)),
      SCAN_MS,
    );
    return () => clearTimeout(t);
  }, [jobId]);

  // fin du job → révélation (après la durée mini) ou erreur
  useEffect(() => {
    if (jobId === undefined || startRef.current === null) return;
    if (jobStatus === "error") {
      setPhase("error");
      return;
    }
    if (jobStatus !== "done") return;
    const elapsed = performance.now() - startRef.current;
    const wait = Math.max(0, MIN_BEFORE_REVEAL - elapsed);
    const t1 = setTimeout(() => setPhase("reveal"), wait);
    const t2 = setTimeout(() => setPhase("result"), wait + REVEAL_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [jobId, jobStatus]);

  const original = convertFileSrc(path);

  // --- Au repos : petit carré ---
  if (phase === "idle") {
    return (
      <div className="group relative aspect-square overflow-hidden rounded-xl border border-zinc-800 bg-card">
        <button
          type="button"
          onClick={() => onPreview(path)}
          title="Aperçu"
          className="absolute inset-0 cursor-zoom-in"
        >
          <img
            src={original}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain"
          />
        </button>
        <button
          type="button"
          onClick={() => onRemove(path)}
          title="Retirer"
          className="absolute top-1 right-1 hidden h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-zinc-900/80 text-[10px] text-zinc-200 hover:bg-red-500 group-hover:flex"
        >
          ✕
        </button>
        <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-surface/80 to-transparent px-1.5 pb-1 pt-3 text-center text-[10px] text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100">
          {basename(path)}
        </span>
      </div>
    );
  }

  // --- En traitement / terminé : carte avant → après (2 colonnes) ---
  const isPack = job ? PACK_ACTIONS.includes(job.action) : false;
  const showResult = phase === "reveal" || phase === "result";
  const resultSrc =
    showResult && !isPack && job?.output ? convertFileSrc(job.output) : null;

  return (
    <div className="group relative col-span-2 flex h-36 items-center gap-2 rounded-xl border border-zinc-800 bg-card p-2">
      {/* AVANT : original + scan */}
      <button
        type="button"
        onClick={() => onPreview(path)}
        title="Original"
        className="relative h-full flex-1 cursor-zoom-in overflow-hidden rounded-lg"
      >
        <img
          src={original}
          alt=""
          decoding="async"
          className="h-full w-full object-contain"
        />
        {phase === "scan" && (
          <span className="pointer-events-none absolute inset-0 block bg-surface/20">
            <span className="ih-scan-line" />
          </span>
        )}
      </button>

      <span className="shrink-0 text-zinc-600">→</span>

      {/* APRÈS : génération du résultat */}
      <div className="relative h-full flex-1 overflow-hidden rounded-lg bg-panel">
        {(phase === "scan" || phase === "process") && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="ih-shimmer absolute inset-0" />
            <span className="z-10 flex items-center gap-1.5 text-[11px] text-accent">
              <span className="inline-block animate-spin">↻</span>
              génération…
            </span>
          </div>
        )}
        {resultSrc && (
          <button
            type="button"
            onClick={() => onPreview(job?.output ?? path)}
            title="Aperçu du résultat"
            className="absolute inset-0 cursor-zoom-in"
          >
            <img
              src={resultSrc}
              alt=""
              decoding="async"
              className={`h-full w-full object-contain ${
                phase === "reveal" ? "ih-reveal" : ""
              }`}
            />
          </button>
        )}
        {isPack && showResult && (
          <button
            type="button"
            onClick={() => onReveal(job?.output ?? "")}
            title="Ouvrir le dossier généré"
            className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 text-sm text-zinc-300"
          >
            <span className="text-2xl">📦</span>
            Pack généré
          </button>
        )}
        {phase === "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-500/15 text-xs font-medium text-red-300">
            échec
          </div>
        )}
      </div>

      {/* badges & actions */}
      {phase === "result" && (
        <span className="pointer-events-none absolute top-1.5 left-1.5 rounded-full bg-emerald-500/90 px-1.5 text-[10px] font-medium text-white">
          ✓
        </span>
      )}
      {(showResult || phase === "error") && (
        <button
          type="button"
          onClick={() => onRemove(path)}
          title="Retirer"
          className="absolute top-1 right-1 hidden h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-zinc-900/80 text-[10px] text-zinc-200 hover:bg-red-500 group-hover:flex"
        >
          ✕
        </button>
      )}
    </div>
  );
}
