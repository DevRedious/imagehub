import type { SavedProject } from "../lib/projectsStore";
import { Modal } from "./Modal";

interface Props {
  project: SavedProject;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDeleteModal({ project, onCancel, onConfirm }: Props) {
  return (
    <Modal>
      <h2 className="text-sm font-semibold">Retirer ce projet ?</h2>
      <p className="mt-2 text-sm text-zinc-300">📁 {project.name}</p>
      <p className="truncate text-xs text-zinc-500">{project.root}</p>
      <p className="mt-3 text-xs text-zinc-400">
        Il sera seulement retiré de la liste des projets enregistrés — rien
        n'est supprimé sur le disque.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-card px-3.5 py-2 text-xs text-zinc-300 transition-colors hover:bg-zinc-700 cursor-pointer"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-lg bg-red-500/80 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-red-500 cursor-pointer"
        >
          Retirer
        </button>
      </div>
    </Modal>
  );
}
