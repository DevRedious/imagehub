import { type Job, PACK_ACTIONS } from "../types/job";
import { Thumb } from "./Thumb";

interface Props {
  jobs: Job[];
  onClear: () => void;
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

export function JobList({ jobs, onClear }: Props) {
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

      {jobs.map((job) => (
        <div key={job.id} className="flex gap-3 rounded-xl bg-card p-3">
          <Thumb
            path={
              job.status === "done" &&
              job.output &&
              !PACK_ACTIONS.includes(job.action)
                ? job.output
                : job.path
            }
            size={52}
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-sm">{job.name}</span>
              <span className={`shrink-0 text-xs ${STATUS_STYLE[job.status]}`}>
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
              <p className="mt-1.5 truncate text-xs text-zinc-500">
                → {job.output}
              </p>
            )}
            {job.error && (
              <p className="mt-1.5 text-xs text-red-400">{job.error}</p>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
