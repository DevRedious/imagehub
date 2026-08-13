import type { PatternPiece } from "../../lib/pattern/types";
import { ColorField } from "../ColorPicker";
import { NumberField, Section, Slider, Toggle } from "../editor/controls";

interface Props {
  piece: PatternPiece | null;
  onChange: (piece: PatternPiece) => void;
}

/** Réglages de la pièce sélectionnée.
 *
 *  Position et taille sont montrées en POURCENTAGE de la tuile, pas en pixels :
 *  c'est l'unité dans laquelle le modèle raisonne, celle qui ne change pas
 *  quand on exporte en 2048 px, et celle qui rend lisible le fait qu'une pièce
 *  à 100 % soit exactement sur la couture.
 *
 *  Les réglages propres à la nature de la pièce viennent APRÈS les réglages
 *  communs : la position et la rotation se règlent de la même façon sur une
 *  photo, un coup de crayon ou un triangle, et les séparer par nature aurait
 *  forcé à réapprendre l'inspecteur à chaque sélection. */
export function PieceInspector({ piece, onChange }: Props) {
  if (!piece) {
    return (
      <div className="rounded-xl bg-panel p-3">
        <p className="py-4 text-center text-[11px] leading-relaxed text-zinc-600">
          Sélectionne une pièce
          <br />
          pour la régler.
        </p>
      </div>
    );
  }

  const set = (patch: Partial<PatternPiece>) =>
    onChange({ ...piece, ...patch } as PatternPiece);

  return (
    <div className="space-y-2">
      <Section title="POSITION">
        <Slider
          label="Horizontal"
          value={piece.x * 100}
          min={-20}
          max={120}
          step={0.5}
          suffix="%"
          onChange={(v) => set({ x: v / 100 })}
        />
        <Slider
          label="Vertical"
          value={piece.y * 100}
          min={-20}
          max={120}
          step={0.5}
          suffix="%"
          onChange={(v) => set({ y: v / 100 })}
        />
        <Slider
          label="Rotation"
          value={piece.rotation}
          min={-180}
          max={180}
          suffix="°"
          onChange={(v) => set({ rotation: v })}
        />
      </Section>

      {piece.kind !== "stroke" && (
        <Section title="TAILLE">
          <Slider
            label="Largeur"
            value={piece.width * 100}
            min={1}
            max={200}
            step={0.5}
            suffix="%"
            onChange={(v) => {
              // le rapport est tenu : une pièce écrasée d'un seul axe est
              // presque toujours un accident, et les poignées de côté restent
              // là pour le faire exprès
              const facteur = v / 100 / Math.max(piece.width, 0.001);
              onChange({
                ...piece,
                width: v / 100,
                height: piece.height * facteur,
              });
            }}
          />
          <Slider
            label="Hauteur"
            value={piece.height * 100}
            min={1}
            max={200}
            step={0.5}
            suffix="%"
            onChange={(v) => set({ height: v / 100 })}
          />
        </Section>
      )}

      {piece.kind === "stroke" && (
        <Section title="TRAIT">
          <ColorField
            label="Couleur"
            color={piece.color}
            onChange={(color) => set({ color })}
          />
          <Slider
            label="Épaisseur"
            value={piece.width * 100}
            min={0.1}
            max={20}
            step={0.1}
            suffix="%"
            onChange={(v) => set({ width: v / 100 })}
          />
          <Toggle
            label="Refermer le tracé"
            checked={piece.closed}
            onChange={(closed) => set({ closed })}
          />
          <p className="text-[10px] leading-snug text-zinc-600">
            {piece.points.length} point{piece.points.length > 1 ? "s" : ""}
          </p>
        </Section>
      )}

      {piece.kind === "shape" && (
        <Section title="FORME">
          {piece.shape === "polygon" && (
            <NumberField
              label="Côtés"
              value={piece.sides}
              min={3}
              onChange={(v) => set({ sides: Math.min(24, Math.round(v)) })}
            />
          )}
          <Toggle
            label="Remplir"
            checked={piece.fill !== null}
            onChange={(on) =>
              set({ fill: on ? (piece.fill ?? "#8d9a6b") : null })
            }
          />
          {piece.fill !== null && (
            <ColorField
              label="Remplissage"
              color={piece.fill}
              onChange={(fill) => set({ fill })}
            />
          )}
          <Toggle
            label="Contourer"
            checked={piece.stroke !== null}
            onChange={(on) =>
              set({
                stroke: on ? (piece.stroke ?? "#2f3a2a") : null,
                // un contour d'épaisseur nulle est un contour absent : on lui
                // en donne une plutôt que de laisser croire à une panne
                strokeWidth: piece.strokeWidth || 0.008,
              })
            }
          />
          {piece.stroke !== null && (
            <>
              <ColorField
                label="Contour"
                color={piece.stroke}
                onChange={(stroke) => set({ stroke })}
              />
              <Slider
                label="Épaisseur"
                value={piece.strokeWidth * 100}
                min={0.1}
                max={20}
                step={0.1}
                suffix="%"
                onChange={(v) => set({ strokeWidth: v / 100 })}
              />
            </>
          )}
        </Section>
      )}

      <Section title="APPARENCE">
        <Slider
          label="Opacité"
          value={piece.opacity}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => set({ opacity: v })}
        />
        {piece.kind === "image" && (
          <div className="flex gap-4 pt-1">
            <Toggle
              label="Miroir ↔"
              checked={piece.flipX}
              onChange={(flipX) => set({ flipX })}
            />
            <Toggle
              label="Miroir ↕"
              checked={piece.flipY}
              onChange={(flipY) => set({ flipY })}
            />
          </div>
        )}
      </Section>
    </div>
  );
}
