import type Konva from "konva";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FORMATS, type Format } from "../../lib/editor/formats";
import { relayoutAll } from "../../lib/editor/layout";
import { pageLabel, pageSlug } from "../../lib/editor/store";
import type { Composition, Page } from "../../lib/editor/types";
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

/** Un fichier à produire : une page vue dans un format. */
interface Shot {
  page: Page;
  index: number;
  format: Format;
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
  const [formats, setFormats] = useState<string[]>(["16x9"]);
  const [pages, setPages] = useState<string[]>(() =>
    composition.pages.map((p) => p.id),
  );
  const [running, setRunning] = useState(false);
  const [queue, setQueue] = useState<Shot[]>([]);
  const [index, setIndex] = useState(0);
  const shots = useRef<{ suffix: string; data: string }[]>([]);
  const stageRef = useRef<Konva.Stage | null>(null);

  /** Les fonctions reçues en propriété changent d'identité à chaque rendu du
   *  parent : les garder hors des dépendances évite de relancer une capture
   *  en cours, qui ajouterait deux fois le même fichier au lot. */
  const done = useRef(onDone);
  const report = useRef(onError);
  done.current = onDone;
  report.current = onError;

  const multiPage = composition.pages.length > 1;
  const current = queue[index] ?? null;

  /** Tous les fichiers que produirait l'export courant : chaque page retenue,
   *  dans chaque format retenu. */
  const planned = useMemo<Shot[]>(() => {
    const chosen = FORMATS.filter((f) => formats.includes(f.id));
    return composition.pages
      .map((page, i) => ({ page, i }))
      .filter(({ page }) => pages.includes(page.id))
      .flatMap(({ page, i }) =>
        chosen.map((format) => ({ page, index: i, format })),
      );
  }, [composition.pages, pages, formats]);

  /** Le suffixe distingue les fichiers entre eux. La page n'y figure que si le
   *  document en compte plusieurs : sinon `-16x9` suffit, et les noms d'une
   *  composition d'une seule page ne changent pas. */
  const suffixOf = useCallback(
    (shot: Shot) =>
      multiPage
        ? `${pageSlug(pageLabel(shot.page.name, shot.index), shot.index)}-${shot.format.suffix}`
        : shot.format.suffix,
    [multiPage],
  );

  const start = useCallback(async () => {
    if (planned.length === 0) return;
    setRunning(true);
    try {
      // l'export ne doit jamais partir sur un canevas à moitié peuplé
      await preloadImages(
        composition.pages.flatMap((p) =>
          p.layers.flatMap((l) => (l.kind === "image" ? [l.src] : [])),
        ),
      );
    } catch {
      /* une pièce illisible sera simplement absente du rendu */
    }
    shots.current = [];
    setIndex(0);
    setQueue(planned);
  }, [planned, composition.pages]);

  // capture le fichier courant, puis passe au suivant
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
          suffix: suffixOf(current),
          data: stage.toDataURL({ pixelRatio: 1 }),
        });
      } catch (e) {
        report.current(
          `Rendu de « ${pageLabel(current.page.name, current.index)} » en ${current.format.label} impossible : ${e}`,
        );
        setRunning(false);
        setQueue([]);
        return;
      }
      if (index + 1 < queue.length) {
        setIndex(index + 1);
        return;
      }
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
  }, [running, current, index, queue.length, name, dir, suffixOf]);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

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

      {multiPage && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] font-semibold tracking-wider text-zinc-600">
              PAGES
            </p>
            <button
              type="button"
              onClick={() =>
                setPages(
                  pages.length === composition.pages.length
                    ? []
                    : composition.pages.map((p) => p.id),
                )
              }
              className="cursor-pointer text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
            >
              {pages.length === composition.pages.length
                ? "Tout décocher"
                : "Tout cocher"}
            </button>
          </div>
          <div className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
            {composition.pages.map((p, i) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1 transition-colors hover:bg-card"
              >
                <input
                  type="checkbox"
                  checked={pages.includes(p.id)}
                  onChange={() => toggle(pages, setPages, p.id)}
                  className="h-3.5 w-3.5 cursor-pointer accent-accent"
                />
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">
                  {pageLabel(p.name, i)}
                </span>
                <span className="shrink-0 text-[10px] text-zinc-600">
                  {p.layers.length} calque{p.layers.length > 1 ? "s" : ""}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

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
              checked={formats.includes(f.id)}
              onChange={() => toggle(formats, setFormats, f.id)}
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

      <div className="mt-4 flex items-center justify-end gap-2">
        {/* un fichier par page ET par format : le compte évite la surprise
            d'un export à quarante fichiers */}
        {planned.length > 0 && !running && (
          <span className="mr-auto text-[11px] text-zinc-600">
            {planned.length} fichier{planned.length > 1 ? "s" : ""} à écrire
          </span>
        )}
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
          disabled={running || planned.length === 0}
          className="cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? `Rendu ${index + 1}/${queue.length}…` : "Exporter"}
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
            layers={relayoutAll(
              current.page.layers,
              composition.base,
              current.format,
            )}
            background={composition.background}
            width={current.format.width}
            height={current.format.height}
            scale={1}
            images={images}
          />
        </div>
      )}
    </Modal>
  );
}
