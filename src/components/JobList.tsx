import { type Job, PACK_ACTIONS } from "../types/job";
import { Thumb } from "./Thumb";

interface Props {
  jobs: Job[];
  onClear: () => void;
  onReveal: (path: string) => void;
  onPreview: (path: string) => void;
}

const STATUS_STYLE: Record<Job["status"], string> = {
  pending: "text-zinc-400",
  running: "text-accent",
  done: "text-emerald-400",
  error: "text-red-400",
};

const STATUS_LABEL: Record<Job["status"], string> = {
  pending: "en attente",
  running: "en cours",
  done: "terminé",
  error: "erreur",
};

export function JobList({ jobs, onClear, onReveal, onPreview }: Props) {
  if (jobs.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-400">
          File de traitement
        </h2>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer"
        >
          Vider les terminés
        </button>
      </div>

      {jobs.map((job) => {
        const thumbPath =
          job.status === "done" &&
          job.output &&
          !PACK_ACTIONS.includes(job.action)
            ? job.output
            : job.path;
        return (
          <div key={job.id} className="flex gap-3 rounded-xl bg-card p-3">
            <button
              type="button"
              onClick={() => onPreview(thumbPath)}
              title="Aperçu"
              className="cursor-zoom-in"
            >
              <Thumb path={thumbPath} size={52} />
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm">{job.name}</span>
                <span
                  className={`shrink-0 text-xs ${STATUS_STYLE[job.status]}`}
                >
                  {STATUS_LABEL[job.status]}
                </span>
              </div>

              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full rounded-full transition-all duration-300
                ${job.status === "error" ? "bg-red-500" : job.status === "done" ? "bg-emerald-500" : "bg-accent"}`}
                  style={{ width: `${job.progress}%` }}
                />
              </div>

              {job.output && (
                <div className="mt-1.5 flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-xs text-zinc-500">
                    → {job.output}
                  </p>
                  {job.status === "done" && (
                    <button
                      type="button"
                      onClick={() => onReveal(job.output ?? "")}
                      title="Ouvrir le dossier (fichier sélectionné)"
                      className="shrink-0 cursor-pointer rounded-lg bg-card px-3.5 py-2 text-sm text-zinc-200 transition-colors hover:bg-accent-soft"
                    >
                      📂 Ouvrir le dossier
                    </button>
                  )}
                </div>
              )}
              {job.error && (
                <p className="mt-1.5 text-xs text-red-400">{job.error}</p>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
