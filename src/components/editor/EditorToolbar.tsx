import { FORMATS } from "../../lib/editor/formats";
import type { Background } from "../../lib/editor/types";
import { ColorField } from "../ColorPicker";

interface Props {
  baseId: string;
  onBase: (id: string) => void;
  background: Background;
  onBackground: (bg: Background) => void;
  onAddText: () => void;
  onAddShape: (preset: "rect" | "ellipse" | "line") => void;
  onExport: () => void;
  onClear: () => void;
  layerCount: number;
}

const btn =
  "cursor-pointer rounded-lg bg-card px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-accent-soft";

export function EditorToolbar({
  baseId,
  onBase,
  background,
  onBackground,
  onAddText,
  onAddShape,
  onExport,
  onClear,
  layerCount,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-panel p-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-zinc-500">Plan de travail</span>
        <div className="flex gap-0.5 rounded-lg bg-card p-0.5">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onBase(f.id)}
              title={`${f.width}×${f.height}${f.note ? ` — ${f.note}` : ""}`}
              className={`cursor-pointer rounded-md px-2 py-1 text-[11px] transition-colors ${
                baseId === f.id
                  ? "bg-accent-soft text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <span className="h-5 w-px bg-zinc-800" />

      <button
        type="button"
        onClick={onAddText}
        className={btn}
        title="Ajouter du texte"
      >
        T Texte
      </button>
      <button
        type="button"
        onClick={() => onAddShape("rect")}
        className={btn}
        title="Rectangle"
      >
        ▭
      </button>
      <button
        type="button"
        onClick={() => onAddShape("ellipse")}
        className={btn}
        title="Ellipse"
      >
        ◯
      </button>
      <button
        type="button"
        onClick={() => onAddShape("line")}
        className={btn}
        title="Trait"
      >
        ▬
      </button>

      <span className="h-5 w-px bg-zinc-800" />

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
        <>
          <div className="flex gap-0.5 rounded-lg bg-card p-0.5">
            {(["solid", "linear"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onBackground({ ...background, kind: k })}
                className={`cursor-pointer rounded-md px-2 py-1 text-[11px] transition-colors ${
                  background.kind === k
                    ? "bg-accent-soft text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {k === "solid" ? "Uni" : "Dégradé"}
              </button>
            ))}
          </div>
          <div className="w-36">
            <ColorField
              label="A"
              color={background.colors[0]}
              onChange={(c) =>
                onBackground({
                  ...background,
                  colors: [c, background.colors[1]],
                })
              }
            />
          </div>
          {background.kind === "linear" && (
            <>
              <div className="w-36">
                <ColorField
                  label="B"
                  color={background.colors[1]}
                  onChange={(c) =>
                    onBackground({
                      ...background,
                      colors: [background.colors[0], c],
                    })
                  }
                />
              </div>
              <input
                type="range"
                min={0}
                max={360}
                value={background.angle}
                onChange={(e) =>
                  onBackground({ ...background, angle: Number(e.target.value) })
                }
                title="Orientation du dégradé"
                className="h-1.5 w-20 cursor-pointer accent-accent"
              />
            </>
          )}
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        {layerCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="cursor-pointer rounded-lg px-2 py-1.5 text-[11px] text-zinc-500 transition-colors hover:text-red-400"
            title="Vider le plan de travail"
          >
            Tout effacer
          </button>
        )}
        <button
          type="button"
          onClick={onExport}
          disabled={layerCount === 0}
          className="cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Exporter…
        </button>
      </div>
    </div>
  );
}
