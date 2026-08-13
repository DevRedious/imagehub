import type { Brush, Tool } from "../../lib/pattern/draw";
import { BRUSH_SIZES } from "../../lib/pattern/draw";
import { ColorField } from "../ColorPicker";

interface Props {
  tool: Tool;
  onTool: (tool: Tool) => void;
  brush: Brush;
  onBrush: (brush: Brush) => void;
}

const TOOLS: { id: Tool; glyphe: string; label: string; aide: string }[] = [
  {
    id: "select",
    glyphe: "↖",
    label: "Sélection",
    aide: "Déplacer, tourner, redimensionner les pièces",
  },
  {
    id: "pencil",
    glyphe: "✎",
    label: "Crayon",
    aide: "Tracer à main levée",
  },
  {
    id: "line",
    glyphe: "╱",
    label: "Trait",
    aide: "Tirer une ligne droite — Maj contraint l'angle à 15°",
  },
  {
    id: "rect",
    glyphe: "▭",
    label: "Rectangle",
    aide: "Tirer un rectangle — Maj pour un carré",
  },
  {
    id: "ellipse",
    glyphe: "◯",
    label: "Ellipse",
    aide: "Tirer une ellipse — Maj pour un cercle",
  },
  {
    id: "polygon",
    glyphe: "△",
    label: "Polygone",
    aide: "Triangle, pentagone, hexagone… — Maj pour un polygone régulier",
  },
];

/** La palette de dessin.
 *
 *  Elle est SÉPARÉE de la barre du document : ce qu'on y règle vaut pour le
 *  prochain trait, pas pour la tuile. Les mélanger aurait mis la taille du
 *  crayon à côté de la taille de la tuile — deux « tailles » qui n'ont rien à
 *  voir, et qu'on aurait confondues une fois sur deux.
 *
 *  Couleur et épaisseur sont partagées par tous les outils : on choisit un
 *  crayon, pas un crayon par forme. */
export function DrawToolbar({ tool, onTool, brush, onBrush }: Props) {
  const set = (patch: Partial<Brush>) => onBrush({ ...brush, ...patch });
  const dessin = tool !== "select";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-panel px-3 py-2 text-xs">
      <div className="flex gap-0.5 rounded-lg bg-card p-0.5">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTool(t.id)}
            title={`${t.label} — ${t.aide}`}
            aria-label={t.label}
            aria-pressed={tool === t.id}
            className={`flex h-7 w-8 cursor-pointer items-center justify-center rounded-md text-sm transition-colors ${
              tool === t.id
                ? "bg-accent-soft text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t.glyphe}
          </button>
        ))}
      </div>

      {dessin && (
        <>
          <ColorField
            label="Trait"
            color={brush.color}
            onChange={(color) => set({ color })}
          />

          {/* Épaisseurs d'un clic : les pastilles montrent le trait qu'elles
              produisent, ce qu'un nombre en pourcentage ne dira jamais. */}
          <div className="flex items-center gap-1 rounded-lg bg-card px-1.5 py-1">
            {BRUSH_SIZES.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => set({ width: w })}
                title={`Épaisseur ${(w * 100).toFixed(1)} % de la tuile`}
                aria-label={`Épaisseur ${(w * 100).toFixed(1)} %`}
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-accent-soft"
              >
                <span
                  className={`block rounded-full transition-colors ${
                    brush.width === w ? "bg-zinc-100" : "bg-zinc-500"
                  }`}
                  style={{
                    // le diamètre suit l'épaisseur, plafonné pour tenir dans
                    // la pastille
                    width: Math.min(18, 3 + w * 220),
                    height: Math.min(18, 3 + w * 220),
                  }}
                />
              </button>
            ))}
            <input
              type="range"
              min={0.1}
              max={12}
              step={0.1}
              value={brush.width * 100}
              onChange={(e) => set({ width: Number(e.target.value) / 100 })}
              title="Épaisseur du trait"
              aria-label="Épaisseur du trait"
              className="h-1.5 w-20 cursor-pointer accent-accent"
            />
          </div>

          {tool !== "pencil" && tool !== "line" && (
            <>
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-400">
                <input
                  type="checkbox"
                  checked={brush.filled}
                  onChange={(e) => set({ filled: e.target.checked })}
                  className="h-3.5 w-3.5 cursor-pointer accent-accent"
                />
                Remplir
              </label>
              {brush.filled && (
                <ColorField
                  label="Remplissage"
                  color={brush.fill}
                  onChange={(fill) => set({ fill })}
                />
              )}
            </>
          )}

          {tool === "polygon" && (
            <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
              Côtés
              <input
                type="number"
                min={3}
                max={24}
                value={brush.sides}
                onChange={(e) =>
                  set({
                    sides: Math.min(
                      24,
                      Math.max(3, Number(e.target.value) || 3),
                    ),
                  })
                }
                className="w-12 rounded-lg bg-card px-2 py-1 text-right tabular-nums text-zinc-200 outline-none focus:ring-1 focus:ring-accent"
              />
            </label>
          )}

          <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            Opacité
            <input
              type="range"
              min={5}
              max={100}
              value={brush.opacity * 100}
              onChange={(e) => set({ opacity: Number(e.target.value) / 100 })}
              className="h-1.5 w-20 cursor-pointer accent-accent"
            />
          </label>
        </>
      )}

      {!dessin && (
        <span className="text-[11px] text-zinc-600">
          Prends un crayon ou une forme pour dessiner directement dans la tuile.
        </span>
      )}
    </div>
  );
}
