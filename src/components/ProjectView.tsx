import { useState } from "react";
import { fileIcon, stackIcon } from "../lib/icons";
import {
  AVIF_SAVINGS_RATIO,
  fmtBytes,
  type HeavyImage,
  type ImageUsages,
  KIND_LABEL,
  type ProjectInfo,
  type ScanState,
} from "../lib/project";
import { OptimizedBanner } from "./OptimizedBanner";
import { QualityScore } from "./QualityScore";
import { Thumb } from "./Thumb";
import { UnusedSection } from "./UnusedSection";

interface Props {
  project: ProjectInfo;
  scan: ScanState;
  usages: Record<string, ImageUsages> | null;
  selected: Set<string>;
  optimizing: boolean;
  score: number;
  optimized: HeavyImage[];
  unused: HeavyImage[];
  onDeleteUnused: (items: HeavyImage[]) => void;
  onToggle: (path: string) => void;
  onSelectAll: (all: boolean) => void;
  onOptimize: () => void;
  /** secours quand le watcher temps réel est indisponible, null sinon */
  onRefresh: (() => void) | null;
  onPreview: (path: string) => void;
}

const HEAVY_PAGE = 30;

export function ProjectView({
  project,
  scan,
  usages,
  selected,
  optimizing,
  score,
  optimized,
  unused,
  onDeleteUnused,
  onToggle,
  onSelectAll,
  onOptimize,
  onRefresh,
  onPreview,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [heavyVisible, setHeavyVisible] = useState(HEAVY_PAGE);

  const totalImages = project.stats.reduce((n, s) => n + s.count, 0);
  const totalBytes = project.stats.reduce((n, s) => n + s.bytes, 0);
  const selectedBytes = project.heavy
    .filter((h) => selected.has(h.path))
    .reduce((n, h) => n + h.bytes, 0);
  const rel = (p: string) =>
    p.startsWith(project.root) ? p.slice(project.root.length + 1) : p;

  function toggleExpand(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold">📂 {project.name}</h1>
        <span className="flex items-center gap-1.5 rounded-md bg-accent-soft px-2 py-0.5 text-xs">
          {stackIcon(project.kind) && (
            <img
              src={stackIcon(project.kind) ?? ""}
              alt=""
              className="h-3.5 w-3.5"
            />
          )}
          {KIND_LABEL[project.kind] ?? project.kind}
        </span>
        <span className="text-xs text-zinc-500">
          {totalImages} images · {fmtBytes(totalBytes)}
        </span>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <QualityScore score={score} />
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              title="Surveillance temps réel indisponible — réanalyse manuelle"
              className="rounded-lg bg-panel px-2.5 py-1.5 text-amber-400/80 hover:text-amber-300 cursor-pointer"
            >
              ⟳ Réanalyser
            </button>
          )}
        </div>
      </header>

      <OptimizedBanner items={optimized} rel={rel} />

      <div className="flex flex-wrap gap-1.5 text-xs">
        {project.stats.map((s) => (
          <span
            key={s.ext}
            className="flex items-center gap-1.5 rounded-lg bg-panel px-2.5 py-1 text-zinc-400"
          >
            {fileIcon(`x.${s.ext}`) && (
              <img
                src={fileIcon(`x.${s.ext}`) ?? ""}
                alt=""
                className="h-3.5 w-3.5"
              />
            )}
            .{s.ext} × {s.count} · {fmtBytes(s.bytes)}
          </span>
        ))}
      </div>

      {scan.status === "running" && (
        <div className="rounded-xl bg-panel p-3 text-xs text-zinc-400">
          🔬 Scan chirurgical du code en cours… {scan.done}/{scan.total}{" "}
          fichiers
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{
                width: `${scan.total ? Math.round((100 * scan.done) / scan.total) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {project.heavy.length === 0 ? (
        <div className="rounded-xl bg-panel p-4 text-sm text-zinc-400">
          ✅ Aucun PNG/JPG lourd détecté — rien à optimiser.
        </div>
      ) : (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold text-zinc-300">
              Images à optimiser ({project.heavy.length})
            </h2>
            <button
              type="button"
              onClick={() => onSelectAll(true)}
              className="text-xs text-zinc-500 hover:text-zinc-200 cursor-pointer"
            >
              Tout sélectionner
            </button>
            <button
              type="button"
              onClick={() => onSelectAll(false)}
              className="text-xs text-zinc-500 hover:text-zinc-200 cursor-pointer"
            >
              Tout ignorer
            </button>
            <button
              type="button"
              disabled={optimizing || selected.size === 0}
              onClick={onOptimize}
              className="ml-auto rounded-lg bg-accent-soft px-3 py-1.5 text-xs font-medium text-zinc-100 transition-colors hover:bg-accent disabled:opacity-40 cursor-pointer"
            >
              {optimizing
                ? "Optimisation…"
                : `⚡ Optimiser ${selected.size} image${selected.size > 1 ? "s" : ""} (~−${fmtBytes(Math.round(selectedBytes * AVIF_SAVINGS_RATIO))})`}
            </button>
          </div>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(380px,1fr))] items-start gap-2">
            {project.heavy.slice(0, heavyVisible).map((img) => {
              const info = usages?.[img.path];
              const isOpen = expanded.has(img.path);
              const checked = selected.has(img.path);
              return (
                <div
                  key={img.path}
                  className={`rounded-xl bg-card p-3 transition-opacity ${checked ? "" : "opacity-50"}`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(img.path)}
                      className="h-4 w-4 shrink-0 accent-(--color-accent) cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => onPreview(img.path)}
                      title="Voir l'original"
                      className="shrink-0 cursor-zoom-in"
                    >
                      <Thumb path={img.path} size={44} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm">
                          {img.path.split("/").pop()}
                        </span>
                        {info && (
                          <span className="shrink-0 rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px]">
                            {info.role}
                          </span>
                        )}
                        <span className="shrink-0 text-xs text-zinc-500">
                          {fmtBytes(img.bytes)}
                        </span>
                      </div>
                      <p className="truncate text-xs text-zinc-500">
                        {rel(img.path)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleExpand(img.path)}
                      className="shrink-0 rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-panel cursor-pointer"
                    >
                      {info
                        ? info.usages.length === 0
                          ? "⚠ non référencée"
                          : `${info.usages.length} usage${info.usages.length > 1 ? "s" : ""} ${isOpen ? "▴" : "▾"}`
                        : "…"}
                    </button>
                  </div>

                  {isOpen && info && info.usages.length > 0 && (
                    <ul className="mt-2 space-y-1 border-zinc-700/50 border-l-2 pl-3 text-xs text-zinc-400">
                      {info.usages.map((u) => (
                        <li
                          key={`${u.file}:${u.line}`}
                          className="flex items-center gap-1.5 truncate font-mono"
                        >
                          {fileIcon(u.file) ? (
                            <img
                              src={fileIcon(u.file) ?? ""}
                              alt=""
                              className="h-3.5 w-3.5 shrink-0"
                            />
                          ) : (
                            <span className="w-3.5 shrink-0 text-center text-zinc-600">
                              ·
                            </span>
                          )}
                          <span className="truncate">
                            {u.file}:{u.line}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {isOpen && info && info.usages.length === 0 && (
                    <p className="mt-2 pl-3 text-xs text-amber-400/80">
                      Aucune référence trouvée dans le code — asset possiblement
                      inutilisé (la conversion reste sans risque pour le build).
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {project.heavy.length > heavyVisible && (
            <button
              type="button"
              onClick={() => setHeavyVisible((v) => v + 50)}
              className="w-full rounded-xl bg-panel py-2 text-xs text-zinc-400 transition-colors hover:text-zinc-100 cursor-pointer"
            >
              Afficher plus ({project.heavy.length - heavyVisible} restantes)
            </button>
          )}
        </section>
      )}

      {scan.status === "done" && (
        <UnusedSection
          items={unused}
          rel={rel}
          onDelete={onDeleteUnused}
          onPreview={onPreview}
        />
      )}
    </div>
  );
}
