import type { Job } from "../types/job";
import { JobList } from "./JobList";

interface Props {
  jobs: Job[];
  onClear: () => void;
  onReveal: (path: string) => void;
  onPreview: (path: string) => void;
}

/** Page dédiée : aperçu et historique des traitements, avec accès au dossier. */
export function HistoryView({ jobs, onClear, onReveal, onPreview }: Props) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-zinc-800 bg-panel p-12 text-center">
        <p className="text-sm text-zinc-500">
          Aucun traitement pour l'instant.
        </p>
        <p className="mt-1 text-xs text-zinc-600">
          Les images traitées depuis le Studio apparaîtront ici.
        </p>
      </div>
    );
  }
  return (
    <JobList
      jobs={jobs}
      onClear={onClear}
      onReveal={onReveal}
      onPreview={onPreview}
    />
  );
}
