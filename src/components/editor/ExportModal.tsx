import type Konva from "konva";
import { useCallback, useEffect, useRef, useState } from "react";
import { FORMATS, type Format } from "../../lib/editor/formats";
import { relayoutAll } from "../../lib/editor/layout";
import type { Composition } from "../../lib/editor/types";
import { preloadImages } from "../../lib/editor/useImages";
import { saveComposition, type Written } from "../../lib/library";
import { Modal } from "../Modal";
import { CompositionStage } from "./CompositionStage";

interface Props {
  composition: Composition;
  images: Map<string, HTMLImageElement>;
  /** dossier de destination ; null = dépôt du Studio */
  dir: string | null;
  destination: string;
  onClose: () => void;
  onDone: (written: Written[]) => void;
  onError: (message: string) => void;
}

/** Deux images successives laissent au navigateur le temps de peindre la
 *  scène ET d'appliquer les caches de filtres, qui sont posés dans un effet.
 *  Capturer plus tôt rendrait un calque flouté… sans son flou. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export function ExportModal({
  composition,
  images,
  dir,
  destination,
  onClose,
  onDone,
  onError,
}: Props) {
  const [name, setName] = useState(composition.name);
  const [picked, setPicked] = useState<string[]>(["16x9"]);
  const [running, setRunning] = useState(false);
  const [queue, setQueue] = useState<Format[]>([]);
  const [index, setIndex] = useState(0);
  const shots = useRef<{ suffix: string; data: string }[]>([]);
  const stageRef = useRef<Konva.Stage | null>(null);
  /** Mêmes précautions que dans la modale de découpe : une fonction reçue en
   *  propriété change d'identité à chaque rendu du parent, et la mettre en
   *  dépendance relancerait la capture en cours — ajoutant le même format
   *  plusieurs fois au lot à écrire. */
  const done = useRef(onDone);
  const report = useRef(onError);
  done.current = onDone;
  report.current = onError;

  const current = queue[index] ?? null;

  const start = useCallback(async () => {
    const formats = FORMATS.filter((f) => picked.includes(f.id));
    if (formats.length === 0) return;
    setRunning(true);
    try {
      // l'export ne doit jamais partir sur un canevas à moitié peuplé
      await preloadImages(
        composition.layers
          .filter((l) => l.kind === "image")
          .map((l) => (l.kind === "image" ? l.src : "")),
      );
    } catch {
      /* une pièce illisible sera simplement absente du rendu */
    }
    shots.current = [];
    setIndex(0);
    setQueue(formats);
  }, [picked, composition.layers]);

  // capture le format courant, puis passe au suivant
  useEffect(() => {
    if (!running || !current) return;
    let alive = true;
    (async () => {
      await nextPaint();
      if (!alive) return;
      const stage = stageRef.current;
      if (!stage) return;
      try {
        shots.current.push({
          suffix: current.suffix,
          data: stage.toDataURL({ pixelRatio: 1 }),
        });
      } catch (e) {
        report.current(`Rendu du format ${current.label} impossible : ${e}`);
        setRunning(false);
        setQueue([]);
        return;
      }
      if (index + 1 < queue.length) {
        setIndex(index + 1);
        return;
      }
      // dernier format : on écrit tout
      try {
        const written = await saveComposition({
          name: name.trim() || "composition",
          shots: shots.current,
          dir,
        });
        done.current(written);
      } catch (e) {
        report.current(String(e));
      } finally {
        setRunning(false);
        setQueue([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [running, current, index, queue.length, name, dir]);

  const toggle = (id: string) =>
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );

  return (
    <Modal width="max-w-lg">
      <h2 className="text-sm font-semibold text-zinc-200">Exporter</h2>

      <label className="mt-4 block text-[11px] text-zinc-500">
        Nom du fichier
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg bg-card px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-accent"
        />
      </label>

      <div className="mt-4 space-y-1.5">
        <p className="text-[11px] font-semibold tracking-wider text-zinc-600">
          FORMATS
        </p>
        {FORMATS.map((f) => (
          <label
            key={f.id}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-card"
          >
            <input
              type="checkbox"
              checked={picked.includes(f.id)}
              onChange={() => toggle(f.id)}
              className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-accent"
            />
            <span className="min-w-0 flex-1 text-xs text-zinc-300">
              {f.label}
              <span className="ml-1.5 tabular-nums text-zinc-600">
                {f.width}×{f.height}
              </span>
              {f.note && (
                <span className="block text-[10px] leading-snug text-zinc-600">
                  {f.note}
                </span>
              )}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-zinc-600">
              -{f.suffix}
            </span>
          </label>
        ))}
      </div>

      <p className="mt-4 rounded-lg bg-card px-2.5 py-2 text-[11px] text-zinc-500">
        {composition.background.on ? (
          <>
            Fond <span className="text-amber-500/90">activé</span> — le PNG sera
            opaque. Éteins-le pour garder un asset réutilisable.
          </>
        ) : (
          <>
            Fond éteint — les PNG sortiront{" "}
            <span className="text-zinc-300">transparents</span>.
          </>
        )}
      </p>
      <p
        className="mt-1.5 truncate px-2.5 text-[11px] text-zinc-600"
        title={destination}
      >
        → {destination}
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={running}
          className="cursor-pointer rounded-lg px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-200 disabled:opacity-40"
        >
          Fermer
        </button>
        <button
          type="button"
          onClick={start}
          disabled={running || picked.length === 0}
          className="cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running
            ? `Rendu ${index + 1}/${queue.length}…`
            : `Exporter ${picked.length} format${picked.length > 1 ? "s" : ""}`}
        </button>
      </div>

      {/* Scène de rendu, hors écran et à la taille réelle du format visé.
          C'est le MÊME composant qu'à l'écran : ce qui sort est ce qui a été
          vu, à l'échelle près. */}
      {current && (
        <div
          aria-hidden
          className="pointer-events-none fixed opacity-0"
          style={{ left: -99999, top: 0 }}
        >
          <CompositionStage
            ref={stageRef}
            layers={relayoutAll(composition.layers, composition.base, current)}
            background={composition.background}
            width={current.width}
            height={current.height}
            scale={1}
            images={images}
          />
        </div>
      )}
    </Modal>
  );
}
