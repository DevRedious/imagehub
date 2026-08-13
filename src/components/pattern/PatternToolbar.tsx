import type { Pattern, TileSize } from "../../lib/pattern/types";
import { TILE_PRESETS } from "../../lib/pattern/types";
import { ColorField } from "../ColorPicker";

export type PreviewMode = "tile" | "repeat";

interface Props {
  pattern: Pattern;
  onTile: (tile: TileSize) => void;
  onBackground: (background: Pattern["background"]) => void;
  mode: PreviewMode;
  onMode: (mode: PreviewMode) => void;
  zoom: number;
  onZoom: (zoom: number) => void;
  onScatter: () => void;
  onExport: () => void;
  onSave: () => void;
  onOpen: () => void;
  onUndo: () => void;
  canUndo: boolean;
  pieceCount: number;
}

const btn =
  "cursor-pointer rounded-lg bg-card px-2.5 py-1.5 text-zinc-300 transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40";

/** Réglages du document et bascule d'aperçu.
 *
 *  La taille de tuile ne touche QUE l'échelle de travail : les pièces étant
 *  rangées en fractions de tuile, passer de 480 à 1024 ne déplace rien et ne
 *  redimensionne rien — ce qui serait impossible avec des coordonnées en
 *  pixels, où il faudrait tout remettre à l'échelle et accepter les arrondis. */
export function PatternToolbar({
  pattern,
  onTile,
  onBackground,
  mode,
  onMode,
  zoom,
  onZoom,
  onScatter,
  onExport,
  onSave,
  onOpen,
  onUndo,
  canUndo,
  pieceCount,
}: Props) {
  const { background } = pattern;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-panel px-3 py-2 text-xs">
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-zinc-500">Tuile</span>
        <div className="flex gap-0.5 rounded-lg bg-card p-0.5">
          {TILE_PRESETS.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => onTile({ width: size, height: size })}
              className={`cursor-pointer rounded-md px-2 py-1 text-[11px] tabular-nums transition-colors ${
                pattern.tile.width === size && pattern.tile.height === size
                  ? "bg-accent-soft text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-400">
          <input
            type="checkbox"
            checked={background.on}
            onChange={(e) =>
              onBackground({ ...background, on: e.target.checked })
            }
            className="h-3.5 w-3.5 cursor-pointer accent-accent"
          />
          Fond
        </label>
        {background.on && (
          <ColorField
            label="Fond"
            color={background.color}
            onChange={(color) => onBackground({ ...background, color })}
          />
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="flex gap-0.5 rounded-lg bg-card p-0.5">
          <button
            type="button"
            onClick={() => onMode("tile")}
            className={`cursor-pointer rounded-md px-2 py-1 text-[11px] transition-colors ${
              mode === "tile"
                ? "bg-accent-soft text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Tuile
          </button>
          <button
            type="button"
            onClick={() => onMode("repeat")}
            title="Voir le motif répété — la seule vue qui révèle un raccord raté"
            className={`cursor-pointer rounded-md px-2 py-1 text-[11px] transition-colors ${
              mode === "repeat"
                ? "bg-accent-soft text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Répétition
          </button>
        </div>

        {mode === "repeat" && (
          <input
            type="range"
            min={60}
            max={480}
            step={10}
            value={zoom}
            onChange={(e) => onZoom(Number(e.target.value))}
            title="Zoom de la répétition"
            className="h-1.5 w-24 cursor-pointer accent-accent"
          />
        )}

        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title="Annuler (Ctrl+Z)"
          className={btn}
        >
          ↶
        </button>
        <button type="button" onClick={onScatter} className={btn}>
          🎲 Semer…
        </button>
        <button type="button" onClick={onOpen} className={btn}>
          Ouvrir…
        </button>
        <button type="button" onClick={onSave} className={btn}>
          Enregistrer
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={pieceCount === 0}
          className="cursor-pointer rounded-lg bg-accent px-3 py-1.5 font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Exporter
        </button>
      </div>
    </div>
  );
}
