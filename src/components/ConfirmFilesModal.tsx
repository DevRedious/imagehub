import { basename } from "../lib/paths";
import { fmtBytes, type HeavyImage } from "../lib/project";
import { Modal } from "./Modal";

interface Props {
  items: HeavyImage[];
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmFilesModal({ items, onCancel, onConfirm }: Props) {
  const bytes = items.reduce((n, i) => n + i.bytes, 0);

  return (
    <Modal>
      <h2 className="text-sm font-semibold">
        Supprimer{" "}
        {items.length > 1 ? `ces ${items.length} fichiers` : "ce fichier"} ?
      </h2>
      <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs text-zinc-400">
        {items.map((i) => (
          <li key={i.path} className="truncate font-mono">
            {basename(i.path)} · {fmtBytes(i.bytes)}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-zinc-400">
        Aucune référence n'a été trouvée dans le projet, mais la suppression est{" "}
        <span className="text-red-300">définitive</span> — assure-toi d'avoir un
        git propre pour pouvoir revenir en arrière. Gain : {fmtBytes(bytes)}.
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
          Supprimer définitivement
        </button>
      </div>
    </Modal>
  );
}
