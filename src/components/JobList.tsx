import { type Job, PACK_ACTIONS, type QueuedJob } from "../types/job";
import { Thumb } from "./Thumb";

interface Props {
  jobs: QueuedJob[];
  onClear: () => void;
  /** retire de la file des jobs pas encore démarrés (ids) */
  onCancel: (ids: string[]) => void;
  onReveal: (path: string) => void;
  onPreview: (path: string) => void;
}

const STATUS_STYLE: Record<Job["status"], string> = {
  pending: "text-zinc-400",
  running: "text-accent",
  done: "text-emerald-400",
  error: "text-red-400",
  cancelled: "text-zinc-500",
};

const STATUS_LABEL: Record<Job["status"], string> = {
  pending: "en attente",
  running: "en cours",
  done: "terminé",
  error: "erreur",
  cancelled: "annulé",
};

export function JobList({
  jobs,
  onClear,
  onCancel,
  onReveal,
  onPreview,
}: Props) {
  if (jobs.length === 0) return null;

  const waitingIds = jobs
    .filter((j) => j.status === "pending")
    .map((j) => j.id);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-400">
          File de traitement
        </h2>
        <div className="flex items-center gap-3">
          {waitingIds.length > 0 && (
            <button
              type="button"
              onClick={() => onCancel(waitingIds)}
              title="Retire de la file ce qui n'a pas encore démarré (le traitement en cours va à son terme)"
              className="cursor-pointer text-xs text-zinc-500 hover:text-red-300"
            >
              ⏹ Annuler la file ({waitingIds.length})
            </button>
          )}
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer"
          >
            Vider les terminés
          </button>
        </div>
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
                <span className="flex shrink-0 items-center gap-2">
                  <span className={`text-xs ${STATUS_STYLE[job.status]}`}>
                    {job.status === "pending" && job.queueRank
                      ? `en file · n° ${job.queueRank}`
                      : STATUS_LABEL[job.status]}
                  </span>
                  {job.status === "pending" && (
                    <button
                      type="button"
                      onClick={() => onCancel([job.id])}
                      title="Annuler ce traitement"
                      className="cursor-pointer rounded-full px-1.5 text-[11px] text-zinc-500 hover:bg-red-500/20 hover:text-red-300"
                    >
                      ✕
                    </button>
                  )}
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
