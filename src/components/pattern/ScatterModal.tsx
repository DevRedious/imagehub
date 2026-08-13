import { useState } from "react";
import {
  DEFAULT_SCATTER,
  type ScatterSettings,
  type ScatterSource,
} from "../../lib/pattern/scatter";
import { Slider, Toggle } from "../editor/controls";
import { Modal } from "../Modal";

interface Props {
  sources: ScatterSource[];
  seed: number;
  onClose: () => void;
  onApply: (
    settings: ScatterSettings,
    seed: number,
    remplacer: boolean,
  ) => void;
}

/** Semis assisté : densité, échelle, rotation, espacement — et une graine.
 *
 *  La graine est mise en avant plutôt que cachée : c'est elle qui transforme
 *  « un hasard » en « ce hasard-là », le seul qu'on puisse retrouver demain ou
 *  retoucher sans tout perdre. Le dé la retire au sort, le champ permet de
 *  revenir à une valeur qu'on avait aimée. */
export function ScatterModal({ sources, seed, onClose, onApply }: Props) {
  const [settings, setSettings] = useState<ScatterSettings>(DEFAULT_SCATTER);
  const [graine, setGraine] = useState(seed);
  const [remplacer, setRemplacer] = useState(true);

  const set = (patch: Partial<ScatterSettings>) =>
    setSettings((s) => ({ ...s, ...patch }));

  return (
    <Modal>
      <h2 className="text-sm font-semibold text-zinc-200">
        Semer des éléments
      </h2>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
        Les pièces sont tirées au sort parmi les {sources.length} éléments de la
        bibliothèque. Ce qui tombe près d'un bord déborde — et revient de
        l'autre côté.
      </p>

      <div className="mt-4 space-y-2 rounded-xl bg-card p-3">
        <Slider
          label="Nombre"
          value={settings.count}
          min={1}
          max={80}
          onChange={(v) => set({ count: Math.round(v) })}
        />
        <Slider
          label="Taille min"
          value={settings.minScale * 100}
          min={2}
          max={60}
          suffix="%"
          onChange={(v) =>
            set({
              minScale: v / 100,
              maxScale: Math.max(settings.maxScale, v / 100),
            })
          }
        />
        <Slider
          label="Taille max"
          value={settings.maxScale * 100}
          min={2}
          max={60}
          suffix="%"
          onChange={(v) =>
            set({
              maxScale: v / 100,
              minScale: Math.min(settings.minScale, v / 100),
            })
          }
        />
        <Slider
          label="Rotation"
          value={settings.rotate}
          min={0}
          max={180}
          suffix="°"
          onChange={(v) => set({ rotate: v })}
        />
        <Slider
          label="Écartement"
          value={settings.spacing * 100}
          min={0}
          max={40}
          suffix="%"
          onChange={(v) => set({ spacing: v / 100 })}
        />
        <div className="pt-1">
          <Toggle
            label="Retourner au hasard (casse la répétition d'un même élément)"
            checked={settings.mirror}
            onChange={(v) => set({ mirror: v })}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-xl bg-card px-3 py-2">
        <span className="text-[11px] text-zinc-500">Graine</span>
        <input
          type="number"
          value={graine}
          onChange={(e) => setGraine(Number(e.target.value) || 1)}
          className="w-24 rounded-lg bg-panel px-2 py-1 text-right text-[11px] tabular-nums text-zinc-200 outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="button"
          onClick={() => setGraine(Math.floor(Math.random() * 1e6) + 1)}
          title="Retirer une graine au sort"
          className="cursor-pointer rounded-lg bg-panel px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:bg-accent-soft"
        >
          🎲
        </button>
        <span className="ml-auto text-[10px] text-zinc-600">
          même graine → même semis
        </span>
      </div>

      <div className="mt-3">
        <Toggle
          label="Remplacer les pièces existantes"
          checked={remplacer}
          onChange={setRemplacer}
        />
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-lg px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={() => onApply(settings, graine, remplacer)}
          disabled={sources.length === 0}
          className="cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Semer
        </button>
      </div>
    </Modal>
  );
}
