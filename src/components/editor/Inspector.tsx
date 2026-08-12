import { useState } from "react";
import { resizeLayer } from "../../lib/editor/layout";
import type { AnchorX, AnchorY, Layer } from "../../lib/editor/types";
import { ColorField } from "../ColorPicker";
import { Choice, NumberField, Section, Slider, Toggle } from "./controls";

interface Props {
  layer: Layer | null;
  /** dimensions du canevas de référence, pour borner les réglages */
  canvas: { width: number; height: number };
  onChange: (layer: Layer) => void;
  onPickFont: () => void;
}

const ANCHOR_X: { id: AnchorX; label: string }[] = [
  { id: "left", label: "◧" },
  { id: "center", label: "◫" },
  { id: "right", label: "◨" },
];
const ANCHOR_Y: { id: AnchorY; label: string }[] = [
  { id: "top", label: "⬒" },
  { id: "middle", label: "⬓" },
  { id: "bottom", label: "⬔" },
];

export function Inspector({ layer, canvas, onChange, onPickFont }: Props) {
  /** Verrou de proportions, allumé par défaut : neuf fois sur dix on veut une
   *  pièce plus grande, pas une pièce écrasée. Il vit ici plutôt que dans le
   *  calque — c'est une façon de travailler, pas une propriété du document. */
  const [ratioLock, setRatioLock] = useState(true);

  if (!layer) {
    return (
      <div className="rounded-xl bg-panel p-4">
        <p className="text-center text-[11px] leading-relaxed text-zinc-600">
          Sélectionne un calque
          <br />
          pour régler son apparence.
        </p>
      </div>
    );
  }

  const set = <K extends keyof Layer>(key: K, value: Layer[K]) =>
    onChange({ ...layer, [key]: value } as Layer);
  const long = Math.max(canvas.width, canvas.height);

  /** Rapport à conserver quand le verrou est mis. Il est relu à chaque saisie
   *  plutôt que mémorisé : le calque a pu être redimensionné à la souris
   *  entre-temps, et un rapport figé le ferait sauter à sa forme d'avant. */
  const ratio = layer.width / Math.max(layer.height, 1);
  const resize = (w: number, h: number) => onChange(resizeLayer(layer, w, h));

  return (
    <div className="space-y-2">
      <Section
        title="TAILLE"
        right={
          <Toggle
            label="proportions"
            checked={ratioLock}
            onChange={setRatioLock}
          />
        }
      >
        <NumberField
          label="Largeur"
          value={layer.width}
          suffix="px"
          onChange={(w) => resize(w, ratioLock ? w / ratio : layer.height)}
        />
        <NumberField
          label="Hauteur"
          value={layer.height}
          suffix="px"
          onChange={(h) => resize(ratioLock ? h * ratio : layer.width, h)}
        />
        {/* Le même verrou existe à la souris, sans réglage : les poignées
            d'angle tiennent déjà le rapport, et Maj fait grandir depuis le
            centre. */}
        <p className="text-[10px] leading-snug text-zinc-600">
          À la souris : coins = proportions tenues, <kbd>Maj</kbd> = depuis le
          centre.
        </p>
      </Section>

      <Section title="DISPOSITION">
        <Slider
          label="Rotation"
          value={layer.rotation}
          min={-180}
          max={180}
          suffix="°"
          onChange={(v) => set("rotation", v)}
        />
        <Slider
          label="Opacité"
          value={layer.opacity}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => set("opacity", v)}
        />
        <div className="flex gap-2">
          <Toggle
            label="Miroir ⇋"
            checked={layer.flipX}
            onChange={(v) => set("flipX", v)}
          />
          <Toggle
            label="Miroir ⇵"
            checked={layer.flipY}
            onChange={(v) => set("flipY", v)}
          />
          <Toggle
            label="Verrouillé"
            checked={layer.locked}
            onChange={(v) => set("locked", v)}
          />
        </div>
      </Section>

      <Section
        title="ANCRAGE"
        right={
          <Toggle
            label="auto"
            checked={layer.anchorAuto}
            onChange={(v) => set("anchorAuto", v)}
          />
        }
      >
        {/* L'ancrage décide de ce que devient ce calque quand la composition
            est déclinée dans un autre format : accroché à gauche, il restera
            à la même distance du bord gauche en portrait comme en bandeau. */}
        <Choice
          label="Horizontal"
          value={layer.anchor.x}
          options={ANCHOR_X}
          onChange={(v) =>
            onChange({
              ...layer,
              anchor: { ...layer.anchor, x: v },
              anchorAuto: false,
            })
          }
        />
        <Choice
          label="Vertical"
          value={layer.anchor.y}
          options={ANCHOR_Y}
          onChange={(v) =>
            onChange({
              ...layer,
              anchor: { ...layer.anchor, y: v },
              anchorAuto: false,
            })
          }
        />
      </Section>

      {layer.kind === "text" && (
        <Section title="TEXTE">
          <textarea
            value={layer.text}
            onChange={(e) => onChange({ ...layer, text: e.target.value })}
            rows={2}
            className="w-full resize-none rounded-lg bg-card px-2 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="button"
            onClick={onPickFont}
            className="w-full cursor-pointer truncate rounded-lg bg-card px-2 py-1.5 text-left text-[11px] text-zinc-300 transition-colors hover:bg-accent-soft"
            title="Choisir une police"
          >
            🅰 {layer.fontPath ? layer.name : "Police par défaut"}
          </button>
          <ColorField
            label="Couleur"
            color={layer.fill}
            onChange={(c) => onChange({ ...layer, fill: c })}
          />
          <Slider
            label="Corps"
            value={layer.fontSize}
            min={8}
            max={long / 3}
            onChange={(v) => onChange({ ...layer, fontSize: v })}
          />
          <Slider
            label="Interligne"
            value={layer.lineHeight}
            min={0.7}
            max={2.5}
            step={0.05}
            onChange={(v) => onChange({ ...layer, lineHeight: v })}
          />
          <Slider
            label="Interlettre"
            value={layer.letterSpacing}
            min={-long / 200}
            max={long / 50}
            onChange={(v) => onChange({ ...layer, letterSpacing: v })}
          />
          <Choice
            label="Alignement"
            value={layer.align}
            options={[
              { id: "left", label: "⬅" },
              { id: "center", label: "⬌" },
              { id: "right", label: "➡" },
            ]}
            onChange={(v) => onChange({ ...layer, align: v })}
          />
        </Section>
      )}

      {layer.kind === "shape" && (
        <Section title="FORME">
          <ColorField
            label="Remplissage"
            color={layer.fill}
            onChange={(c) => onChange({ ...layer, fill: c })}
          />
          <ColorField
            label="Contour"
            color={layer.stroke}
            onChange={(c) => onChange({ ...layer, stroke: c })}
          />
          <Slider
            label="Épaisseur"
            value={layer.strokeWidth}
            min={0}
            max={long / 40}
            onChange={(v) => onChange({ ...layer, strokeWidth: v })}
          />
          {layer.shape === "rect" && (
            /* En pourcentage et non en pixels : 100 % vaut la moitié du petit
               côté, c'est-à-dire le quart de cercle — l'angle le plus rond
               qu'un rectangle puisse porter. Un réglage en pixels dépendait de
               la taille du moment et ne disait jamais où était la butée. */
            <Slider
              label="Arrondi"
              value={Math.round(
                (layer.cornerRadius /
                  (Math.min(layer.width, layer.height) / 2)) *
                  100,
              )}
              min={0}
              max={100}
              suffix="%"
              onChange={(v) =>
                onChange({
                  ...layer,
                  cornerRadius:
                    (v / 100) * (Math.min(layer.width, layer.height) / 2),
                })
              }
            />
          )}
        </Section>
      )}

      <Section
        title="COULEUR"
        right={
          <Toggle
            label=""
            checked={layer.recolor.on}
            onChange={(v) =>
              onChange({ ...layer, recolor: { ...layer.recolor, on: v } })
            }
          />
        }
      >
        {/* Une rotation de teinte plutôt qu'un aplat : le modelé des éléments
            en relief survit au changement de couleur. */}
        <Slider
          label="Teinte"
          value={layer.recolor.hue}
          min={0}
          max={360}
          suffix="°"
          disabled={!layer.recolor.on}
          onChange={(v) =>
            onChange({ ...layer, recolor: { ...layer.recolor, hue: v } })
          }
        />
        <Slider
          label="Saturation"
          value={layer.recolor.saturation}
          min={-1.5}
          max={1.5}
          step={0.05}
          disabled={!layer.recolor.on}
          onChange={(v) =>
            onChange({ ...layer, recolor: { ...layer.recolor, saturation: v } })
          }
        />
        <Slider
          label="Luminosité"
          value={layer.recolor.luminance}
          min={-1}
          max={1}
          step={0.02}
          disabled={!layer.recolor.on}
          onChange={(v) =>
            onChange({ ...layer, recolor: { ...layer.recolor, luminance: v } })
          }
        />
      </Section>

      <Section
        title="OMBRE PORTÉE"
        right={
          <Toggle
            label=""
            checked={layer.shadow.on}
            onChange={(v) =>
              onChange({ ...layer, shadow: { ...layer.shadow, on: v } })
            }
          />
        }
      >
        <ColorField
          label="Couleur"
          color={layer.shadow.color}
          disabled={!layer.shadow.on}
          onChange={(c) =>
            onChange({ ...layer, shadow: { ...layer.shadow, color: c } })
          }
        />
        <Slider
          label="Flou"
          value={layer.shadow.blur}
          min={0}
          max={long / 8}
          disabled={!layer.shadow.on}
          onChange={(v) =>
            onChange({ ...layer, shadow: { ...layer.shadow, blur: v } })
          }
        />
        <Slider
          label="Décalage X"
          value={layer.shadow.offsetX}
          min={-long / 12}
          max={long / 12}
          disabled={!layer.shadow.on}
          onChange={(v) =>
            onChange({ ...layer, shadow: { ...layer.shadow, offsetX: v } })
          }
        />
        <Slider
          label="Décalage Y"
          value={layer.shadow.offsetY}
          min={-long / 12}
          max={long / 12}
          disabled={!layer.shadow.on}
          onChange={(v) =>
            onChange({ ...layer, shadow: { ...layer.shadow, offsetY: v } })
          }
        />
        <Slider
          label="Intensité"
          value={layer.shadow.opacity}
          min={0}
          max={1}
          step={0.01}
          disabled={!layer.shadow.on}
          onChange={(v) =>
            onChange({ ...layer, shadow: { ...layer.shadow, opacity: v } })
          }
        />
      </Section>

      <Section title="FLOU">
        <Slider
          label="Rayon"
          value={layer.blur}
          min={0}
          max={long / 20}
          onChange={(v) => set("blur", v)}
        />
      </Section>
    </div>
  );
}
