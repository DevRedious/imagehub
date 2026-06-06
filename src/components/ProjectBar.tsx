import {
  AVIF_SAVINGS_RATIO,
  fmtBytes,
  KIND_LABEL,
  type ProjectInfo,
} from "../lib/project";

interface Props {
  project: ProjectInfo | null;
  optimizing: boolean;
  onConnect: () => void;
  onRefresh: () => void;
  onClose: () => void;
  onOptimize: () => void;
}

export function ProjectBar({
  project,
  optimizing,
  onConnect,
  onRefresh,
  onClose,
  onOptimize,
}: Props) {
  if (!project) {
    return (
      <button
        type="button"
        onClick={onConnect}
        className="w-full rounded-xl bg-panel px-4 py-2.5 text-left text-sm text-zinc-400 transition-colors hover:bg-card hover:text-zinc-200 cursor-pointer"
      >
        📂 Connecter un projet — détection de la stack, scan des images, prompts
        contextuels
      </button>
    );
  }

  const totalImages = project.stats.reduce((n, s) => n + s.count, 0);
  const totalBytes = project.stats.reduce((n, s) => n + s.bytes, 0);
  const savings = Math.round(project.heavy_bytes * AVIF_SAVINGS_RATIO);

  return (
    <div className="space-y-2 rounded-xl bg-panel p-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold">📂 {project.name}</span>
        <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs text-zinc-200">
          {KIND_LABEL[project.kind] ?? project.kind}
        </span>
        <span className="text-xs text-zinc-500">
          {totalImages} images · {fmtBytes(totalBytes)}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            title="Réanalyser le projet"
            className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-card hover:text-zinc-200 cursor-pointer"
          >
            ⟳
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Déconnecter le projet"
            className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-card hover:text-red-400 cursor-pointer"
          >
            ✕
          </button>
        </div>
      </div>

      {project.heavy.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-card p-2.5 text-xs">
          <span className="text-zinc-300">
            💡 {project.heavy.length} PNG/JPG lourds (
            {fmtBytes(project.heavy_bytes)}) — l'AVIF économiserait ~
            {fmtBytes(savings)}
          </span>
          <button
            type="button"
            disabled={optimizing}
            onClick={onOptimize}
            className="ml-auto shrink-0 rounded-lg bg-accent-soft px-3 py-1.5 font-medium text-zinc-100 transition-colors hover:bg-accent disabled:opacity-50 cursor-pointer"
          >
            {optimizing ? "Optimisation…" : "⚡ Optimiser en AVIF"}
          </button>
        </div>
      )}
    </div>
  );
}
