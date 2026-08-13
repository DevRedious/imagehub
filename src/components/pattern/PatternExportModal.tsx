import { useState } from "react";
import type { ToolsStatus } from "../../lib/actions";
import type { Written } from "../../lib/library";
import {
  type PatternFormat,
  patternExport,
  toSpec,
} from "../../lib/pattern/api";
import { EXPORT_FORMATS, EXPORT_SIZES } from "../../lib/pattern/formats";
import { patternSlug } from "../../lib/pattern/store";
import type { Pattern } from "../../lib/pattern/types";
import { Toggle } from "../editor/controls";
import { Modal } from "../Modal";

interface Props {
  pattern: Pattern;
  /** dossier de destination ; null = dépôt des motifs */
  dir: string | null;
  destination: string;
  /** moteurs CLI disponibles : sans avifenc l'AVIF n'est pas proposé, sans
   *  inkscape les éléments SVG ne peuvent pas être rendus */
  tools: ToolsStatus | null;
  onClose: () => void;
  onDone: (written: Written[]) => void;
  onError: (message: string) => void;
}

export function PatternExportModal({
  pattern,
  dir,
  destination,
  tools,
  onClose,
  onDone,
  onError,
}: Props) {
  const [name, setName] = useState(pattern.name);
  const [size, setSize] = useState(2048);
  const [format, setFormat] = useState<PatternFormat>("png");
  const [quality, setQuality] = useState(85);
  const [repeat, setRepeat] = useState(false);
  const [running, setRunning] = useState(false);

  const hauteur = Math.round((size * pattern.tile.height) / pattern.tile.width);
  const sansFond = !pattern.background.on;
  // Un SVG n'a pas de pixels : le rendu Rust le rasterise par Inkscape, à la
  // taille où la pièce est posée. Sans Inkscape, l'export échouerait au milieu
  // du travail — autant le dire avant de cliquer.
  const svgSansMoteur =
    !tools?.inkscape &&
    pattern.pieces.some((p) => p.kind === "image" && /\.svg$/i.test(p.src));
  const bloque = (format === "jpg" && sansFond) || svgSansMoteur;

  const lancer = async () => {
    setRunning(true);
    try {
      const written = await patternExport({
        jobId: crypto.randomUUID(),
        spec: toSpec(pattern),
        name: patternSlug(name),
        size,
        format,
        quality,
        repeat,
        dir,
      });
      onDone(written);
    } catch (e) {
      onError(String(e));
      setRunning(false);
    }
  };

  return (
    <Modal width="max-w-lg">
      <h2 className="text-sm font-semibold text-zinc-200">Exporter la tuile</h2>

      <label className="mt-4 block text-[11px] text-zinc-500">
        Nom du fichier
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg bg-card px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-accent"
        />
      </label>

      <div className="mt-4">
        <p className="text-[11px] font-semibold tracking-wider text-zinc-600">
          RÉSOLUTION
        </p>
        <div className="mt-1.5 flex gap-0.5 rounded-lg bg-card p-0.5">
          {EXPORT_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              className={`flex-1 cursor-pointer rounded-md px-2 py-1.5 text-[11px] tabular-nums transition-colors ${
                size === s
                  ? "bg-accent-soft text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <p className="mt-1.5 px-0.5 text-[11px] text-zinc-600">
          {size}×{hauteur} px — rendu depuis les fichiers d'origine, sans passer
          par l'aperçu (édition en {pattern.tile.width} px).
        </p>
      </div>

      <div className="mt-4 space-y-1.5">
        <p className="text-[11px] font-semibold tracking-wider text-zinc-600">
          FORMAT
        </p>
        {EXPORT_FORMATS.map((f) => {
          const absent = f.id === "avif" && !tools?.avifenc;
          return (
            <label
              key={f.id}
              className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${
                absent
                  ? "cursor-not-allowed opacity-40"
                  : "cursor-pointer hover:bg-card"
              }`}
            >
              <input
                type="radio"
                name="format"
                checked={format === f.id}
                disabled={absent}
                onChange={() => setFormat(f.id)}
                className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-accent"
              />
              <span className="min-w-0 flex-1 text-xs text-zinc-300">
                {f.label}
                <span className="block text-[10px] leading-snug text-zinc-600">
                  {absent
                    ? "avifenc introuvable — installe libavif-tools"
                    : f.note}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {(format === "jpg" || format === "avif") && (
        <label className="mt-3 block text-[11px] text-zinc-500">
          Qualité
          <input
            type="range"
            min={40}
            max={100}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="mt-1 h-1.5 w-full cursor-pointer accent-accent"
          />
          <span className="tabular-nums text-zinc-400">{quality}</span>
        </label>
      )}

      <div className="mt-4">
        <Toggle
          label="Exporter aussi la répétition 3×3 (présentation)"
          checked={repeat}
          onChange={setRepeat}
        />
      </div>

      <p className="mt-4 rounded-lg bg-card px-2.5 py-2 text-[11px] leading-relaxed text-zinc-500">
        {svgSansMoteur ? (
          <>
            Des éléments <span className="text-amber-500/90">SVG</span> sont
            posés, mais Inkscape est introuvable — c'est lui qui les rasterise à
            la résolution demandée. Installe-le, ou remplace ces pièces par des
            PNG.
          </>
        ) : format === "jpg" && sansFond ? (
          <>
            Le JPG n'a pas de transparence :{" "}
            <span className="text-amber-500/90">active un fond</span> avant
            d'exporter, sinon tout ce qui est transparent sortirait noir.
          </>
        ) : sansFond ? (
          <>
            Fond éteint — la tuile sortira{" "}
            <span className="text-zinc-300">transparente</span>, prête à se
            poser sur n'importe quoi.
          </>
        ) : (
          <>
            Fond <span className="text-amber-500/90">activé</span> — la tuile
            sera opaque.
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
          onClick={lancer}
          disabled={running || bloque}
          className="cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? "Rendu…" : "Exporter"}
        </button>
      </div>
    </Modal>
  );
}
