import { useEffect, useState } from "react";
import {
  patternListJson,
  patternReadJson,
  type SavedPattern,
} from "../../lib/pattern/api";
import { revivePattern } from "../../lib/pattern/store";
import type { Pattern } from "../../lib/pattern/types";
import { Modal } from "../Modal";

interface Props {
  onClose: () => void;
  onOpen: (pattern: Pattern) => void;
  onError: (message: string) => void;
}

/** Reprise d'un motif enregistré.
 *
 *  Le document relu passe par `revivePattern` : un JSON venu du disque peut
 *  avoir été écrit par une version antérieure, ou retouché à la main, et on
 *  préfère combler ce qui manque plutôt que de planter sur une propriété
 *  absente. */
export function OpenPatternModal({ onClose, onOpen, onError }: Props) {
  const [items, setItems] = useState<SavedPattern[] | null>(null);

  useEffect(() => {
    patternListJson()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  const ouvrir = async (item: SavedPattern) => {
    try {
      const json = await patternReadJson(item.path);
      onOpen(revivePattern(JSON.parse(json)));
    } catch (e) {
      onError(`Motif illisible : ${e}`);
    }
  };

  return (
    <Modal>
      <h2 className="text-sm font-semibold text-zinc-200">Ouvrir un motif</h2>

      <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
        {items === null && (
          <p className="py-6 text-center text-[11px] text-zinc-600">Lecture…</p>
        )}
        {items?.length === 0 && (
          <p className="py-6 text-center text-[11px] leading-relaxed text-zinc-600">
            Aucun motif enregistré.
            <br />« Enregistrer » en pose un à côté des tuiles rendues.
          </p>
        )}
        {items?.map((item) => (
          <button
            key={item.path}
            type="button"
            onClick={() => ouvrir(item)}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-card"
            title={item.path}
          >
            <span className="truncate">{item.name}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-lg px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
        >
          Fermer
        </button>
      </div>
    </Modal>
  );
}
