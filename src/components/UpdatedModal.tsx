import { Modal } from "./Modal";

interface Props {
  version: string;
  onClose: () => void;
}

/** Confirmation affichée une seule fois après un redémarrage de mise à jour. */
export function UpdatedModal({ version, onClose }: Props) {
  return (
    <Modal>
      <h2 className="text-sm font-semibold">Application à jour 🎉</h2>
      <p className="mt-2 text-sm text-zinc-300">
        ImageHub a été mis à jour vers la version <b>v{version}</b>.
      </p>
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-emerald-500/80 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-500 cursor-pointer"
        >
          OK
        </button>
      </div>
    </Modal>
  );
}
