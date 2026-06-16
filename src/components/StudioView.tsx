import {
  ACTIONS,
  actionApplies,
  BG_MODELS,
  type BgModel,
  QUALITY_PRESETS,
  type QualityPreset,
  type ToolsStatus,
} from "../lib/actions";
import { extOf } from "../lib/paths";
import type { ActionId, Job } from "../types/job";
import { ActionBar } from "./ActionBar";
import { DropZone } from "./DropZone";

interface Props {
  staged: string[];
  jobByPath: Map<string, Job>;
  onAddFiles: (paths: string[]) => void;
  onRemoveStaged: (path: string) => void;
  onClearStaged: () => void;
  onReveal: (path: string) => void;
  onRun: (action: ActionId) => void;
  onPreview: (path: string) => void;
  tools: ToolsStatus | null;
  quality: QualityPreset;
  onQualityChange: (q: QualityPreset) => void;
  aggressiveness: number;
  onAggressivenessChange: (v: number) => void;
  bgModel: BgModel;
  onBgModelChange: (m: BgModel) => void;
  dualTheme: boolean;
  onDualThemeChange: (on: boolean) => void;
  /** Destination des fichiers générés, affichée en clair (anti-erreur silencieuse). */
  destination: string;
}

export function StudioView({
  staged,
  jobByPath,
  onAddFiles,
  onRemoveStaged,
  onClearStaged,
  onReveal,
  onRun,
  onPreview,
  tools,
  quality,
  onQualityChange,
  aggressiveness,
  onAggressivenessChange,
  bgModel,
  onBgModelChange,
  dualTheme,
  onDualThemeChange,
  destination,
}: Props) {
  const stagedExts = new Set(staged.map(extOf));
  // les options de détourage ne concernent que les actions de détourage :
  // on ne les montre que si l'une d'elles s'applique aux fichiers présents.
  const showDetour = ACTIONS.filter((a) => a.category === "detour").some((a) =>
    actionApplies(a, stagedExts),
  );
  // idem pour les options des packs d'icônes (entrée SVG attendue).
  const showIcons = ACTIONS.filter((a) => a.category === "icons").some((a) =>
    actionApplies(a, stagedExts),
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Gauche : grande zone de dépôt + galerie « IA » des fichiers déposés */}
      <DropZone
        staged={staged}
        jobByPath={jobByPath}
        onAddFiles={onAddFiles}
        onRemoveStaged={onRemoveStaged}
        onClearStaged={onClearStaged}
        onReveal={onReveal}
        onPreview={onPreview}
      />

      {/* Droite : options contextuelles + actions par catégorie */}
      <div className="space-y-4 lg:max-h-[78vh] lg:overflow-y-auto lg:pr-1">
        {/* destination explicite : on sait toujours où atterrissent les fichiers */}
        <div className="flex items-center gap-2 rounded-xl bg-panel px-3 py-2 text-xs">
          <span className="shrink-0 text-zinc-500">→ Sortie :</span>
          <span
            className="truncate font-medium text-zinc-300"
            title={destination}
          >
            {destination}
          </span>
        </div>

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

        {showIcons && (
          <div className="space-y-3 rounded-xl bg-panel p-3">
            <h3 className="text-xs font-semibold tracking-wider text-zinc-600">
              OPTIONS DES PACKS D'ICÔNES
            </h3>

            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={dualTheme}
                onChange={(e) => onDualThemeChange(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-accent"
              />
              <span className="text-xs text-zinc-400">
                Variantes dark / light
                <span className="block text-[11px] leading-snug text-zinc-500">
                  Si le logo est monochrome, génère une paire claire/sombre
                  (recolorisation noir/blanc auto). Deux SVG nommés{" "}
                  <code className="text-zinc-400">nom-dark</code> /{" "}
                  <code className="text-zinc-400">nom-light</code> sont utilisés
                  tels quels (sans recolorisation). Décoché : un seul set.
                </span>
              </span>
            </label>
          </div>
        )}

        <ActionBar tools={tools} stagedExts={stagedExts} onRun={onRun} />
      </div>
    </div>
  );
}
