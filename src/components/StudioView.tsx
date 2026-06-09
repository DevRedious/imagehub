import {
  ACTIONS,
  actionApplies,
  BG_MODELS,
  type BgModel,
  QUALITY_PRESETS,
  type QualityPreset,
  type ToolsStatus,
} from "../lib/actions";
import { basename, extOf } from "../lib/paths";
import type { ActionId } from "../types/job";
import { ActionBar } from "./ActionBar";
import { DropZone } from "./DropZone";
import { Thumb } from "./Thumb";

interface Props {
  staged: string[];
  onAddFiles: (paths: string[]) => void;
  onRemoveStaged: (path: string) => void;
  onRun: (action: ActionId) => void;
  onPreview: (path: string) => void;
  tools: ToolsStatus | null;
  quality: QualityPreset;
  onQualityChange: (q: QualityPreset) => void;
  aggressiveness: number;
  onAggressivenessChange: (v: number) => void;
  bgModel: BgModel;
  onBgModelChange: (m: BgModel) => void;
}

export function StudioView({
  staged,
  onAddFiles,
  onRemoveStaged,
  onRun,
  onPreview,
  tools,
  quality,
  onQualityChange,
  aggressiveness,
  onAggressivenessChange,
  bgModel,
  onBgModelChange,
}: Props) {
  const stagedExts = new Set(staged.map(extOf));
  // les options de détourage ne concernent que les actions de détourage :
  // on ne les montre que si l'une d'elles s'applique aux fichiers présents.
  const showDetour = ACTIONS.filter((a) => a.category === "detour").some((a) =>
    actionApplies(a, stagedExts),
  );

  return (
    <div className="space-y-4">
      <DropZone onFiles={onAddFiles} />

      {staged.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {staged.map((p) => (
            <div
              key={p}
              className="group relative flex w-24 flex-col items-center gap-1 rounded-xl bg-panel p-2"
            >
              <button
                type="button"
                onClick={() => onPreview(p)}
                title="Voir l'original"
                className="cursor-zoom-in"
              >
                <Thumb path={p} size={64} />
              </button>
              <span className="w-full truncate text-center text-[11px] text-zinc-400">
                {basename(p)}
              </span>
              <button
                type="button"
                className="absolute -top-1.5 -right-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-zinc-700 text-[10px] text-zinc-200 group-hover:flex hover:bg-red-500 cursor-pointer"
                onClick={() => onRemoveStaged(p)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {showDetour && (
        <div className="space-y-3 rounded-xl bg-panel p-3">
          <h3 className="text-xs font-semibold tracking-wider text-zinc-600">
            OPTIONS DE DÉTOURAGE
          </h3>

          <div className="flex items-center gap-2">
            <span className="w-28 text-xs text-zinc-500">Modèle</span>
            <div className="flex gap-1 rounded-lg bg-card p-0.5">
              {BG_MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onBgModelChange(m.id)}
                  title={m.note}
                  className={`cursor-pointer rounded-md px-2.5 py-1 text-xs transition-colors ${
                    bgModel === m.id
                      ? "bg-accent-soft text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="w-28 text-xs text-zinc-500">Agressivité</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={aggressiveness}
              onChange={(e) => onAggressivenessChange(Number(e.target.value))}
              title="Plus c'est bas, plus les petits détails sont conservés ; plus c'est haut, plus le détourage est franc."
              className="h-1.5 w-44 cursor-pointer accent-accent"
            />
            <span className="w-9 text-right text-xs tabular-nums text-zinc-400">
              {aggressiveness}%
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-28 text-xs text-zinc-500">Qualité AVIF</span>
            <div className="flex gap-1 rounded-lg bg-card p-0.5">
              {QUALITY_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onQualityChange(p.id)}
                  title={`Qualité ${p.value}/100 (Détourage + AVIF)`}
                  className={`cursor-pointer rounded-md px-2.5 py-1 text-xs transition-colors ${
                    quality === p.id
                      ? "bg-accent-soft text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <ActionBar tools={tools} stagedExts={stagedExts} onRun={onRun} />
    </div>
  );
}
