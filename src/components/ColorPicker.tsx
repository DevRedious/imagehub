import {
  ColorArea,
  ColorSlider,
  ColorSwatch,
  ColorSwatchPicker,
  ColorField as HeroColorField,
  ColorPicker as HeroColorPicker,
  Label,
} from "@heroui/react";
/* Import CIBLÉ, et non depuis la racine du paquet : le barrel de
   `@heroui-pro/react` charge ses 70 composants, dont des cartes, des graphiques
   et un éditeur de texte riche — soit une vingtaine de dépendances pair
   (maplibre-gl, shiki, tiptap…) pour un seul sélecteur de couleur. */
import { CellColorPicker } from "@heroui-pro/react/cell-color-picker";

interface Props {
  color: string;
  onChange: (color: string) => void;
  /** couleurs récemment utilisées, proposées en rappel */
  recent: string[];
}

/** Palette de départ : des teintes qui tiennent sur fond sombre comme clair,
 *  puisqu'un emoji atterrit aussi bien dans un Discord sombre que dans un
 *  Slack clair. */
const PRESETS = [
  "#ffffff",
  "#a1a1aa",
  "#7c5cff",
  "#3b82f6",
  "#06b6d4",
  "#22c55e",
  "#eab308",
  "#f97316",
  "#ef4444",
  "#ec4899",
];

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Pastille cliquable ouvrant le sélecteur de HeroUI : aire
 *  saturation/luminosité et curseur de teinte dans un popover.
 *
 *  Remplace le `<input type="color">` natif, qui déléguait à la boîte de
 *  dialogue du système — dépendante du bureau, hors du thème de l'app, et sans
 *  aperçu de la teinte pendant le réglage. */
/** Contenu du popover, calqué sur la démo « cell-color-picker-with-presets »
 *  de HeroUI Pro : préréglages, aire saturation/luminosité, curseur de teinte,
 *  puis champ hexadécimal.
 *
 *  La démo n'utilise `@heroui-pro/react` que pour l'enveloppe `CellColorPicker`
 *  (le déclencheur en cellule) ; tout ce qui suit vient du paquet gratuit. */
function PickerBody({ onChange }: { onChange: (c: string) => void }) {
  const hex = (c: { toString: (f: "hex") => string }) =>
    onChange(c.toString("hex").toLowerCase());
  return (
    <>
      {/* `ColorSwatchPicker` porte sa propre valeur : on le contrôle
          explicitement plutôt que de compter sur un contexte hérité. */}
      <ColorSwatchPicker
        className="justify-center pt-2"
        size="xs"
        onChange={hex}
      >
        {PRESETS.map((preset) => (
          <ColorSwatchPicker.Item key={preset} color={preset}>
            <ColorSwatchPicker.Swatch />
          </ColorSwatchPicker.Item>
        ))}
      </ColorSwatchPicker>

      {/* pas de hauteur imposée : l'aire est déjà en `aspect-ratio: 1/1` */}
      <ColorArea
        aria-label="Aire de couleur"
        className="max-w-full"
        colorSpace="hsb"
        xChannel="saturation"
        yChannel="brightness"
      >
        <ColorArea.Thumb />
      </ColorArea>

      {/* le curseur se dispose en grille « label / valeur » : sans le Label,
          la ligne perd sa moitié gauche */}
      <ColorSlider
        aria-label="Teinte"
        channel="hue"
        className="gap-1 px-1"
        colorSpace="hsb"
      >
        <Label>Teinte</Label>
        <ColorSlider.Output className="text-muted" />
        <ColorSlider.Track>
          <ColorSlider.Thumb />
        </ColorSlider.Track>
      </ColorSlider>

      <HeroColorField aria-label="Valeur hexadécimale">
        <HeroColorField.Group variant="secondary">
          <HeroColorField.Prefix>
            <ColorSwatch size="xs" />
          </HeroColorField.Prefix>
          <HeroColorField.Input />
        </HeroColorField.Group>
      </HeroColorField>
    </>
  );
}

/** Pastille seule ouvrant le sélecteur — pour les endroits sans libellé. */
function Swatch({
  color,
  onChange,
  className,
}: {
  color: string;
  onChange: (c: string) => void;
  className: string;
}) {
  return (
    <HeroColorPicker
      value={color}
      // `onChange` livre un objet Color ; l'app ne manipule que de l'hexa
      onChange={(c) => onChange(c.toString("hex").toLowerCase())}
    >
      <HeroColorPicker.Trigger
        className={`shrink-0 cursor-pointer rounded-md border border-zinc-700 p-0.5 ${className}`}
      >
        <ColorSwatch className="h-full w-full rounded" />
      </HeroColorPicker.Trigger>
      <HeroColorPicker.Popover>
        <PickerBody onChange={onChange} />
      </HeroColorPicker.Popover>
    </HeroColorPicker>
  );
}

/** Cellule « libellé · valeur · pastille » — le `CellColorPicker` de HeroUI
 *  Pro, qui fournit le déclencheur ; le contenu du popover reste composé de
 *  briques du paquet gratuit. */
export function ColorField({
  label,
  color,
  onChange,
  disabled = false,
}: {
  label: string;
  color: string;
  onChange: (c: string) => void;
  disabled?: boolean;
}) {
  return (
    <CellColorPicker
      aria-label={label}
      value={color}
      onChange={(c) => onChange(c.toString("hex").toLowerCase())}
    >
      {/* comme pour le ColorPicker de base, l'état désactivé va sur le
          déclencheur (un bouton), pas sur la racine */}
      <CellColorPicker.Trigger isDisabled={disabled}>
        <CellColorPicker.Label>{label}</CellColorPicker.Label>
        <CellColorPicker.ValueDisplay />
        <CellColorPicker.Swatch />
      </CellColorPicker.Trigger>
      <CellColorPicker.Popover>
        <PickerBody onChange={onChange} />
      </CellColorPicker.Popover>
    </CellColorPicker>
  );
}

export function ColorPicker({ color, onChange, recent }: Props) {
  const swatch = (value: string) => (
    <button
      key={value}
      type="button"
      onClick={() => onChange(value)}
      title={value}
      style={{ backgroundColor: value }}
      className={`h-6 w-6 cursor-pointer rounded-full border transition-transform hover:scale-110 ${
        value.toLowerCase() === color.toLowerCase()
          ? "border-zinc-100"
          : "border-zinc-700"
      }`}
    />
  );

  return (
    <div className="space-y-3 rounded-xl bg-panel p-3">
      <h3 className="text-xs font-semibold tracking-wider text-zinc-600">
        COULEUR
      </h3>

      <div className="flex items-center gap-2">
        <Swatch color={color} onChange={onChange} className="h-9 w-12" />
        <input
          type="text"
          value={color}
          spellCheck={false}
          onChange={(e) => {
            const v = e.target.value.trim();
            // on n'applique que si c'est un hex complet : sinon chaque
            // caractère tapé repeindrait la galerie avec une couleur partielle
            if (HEX.test(v)) onChange(v.toLowerCase());
          }}
          className="w-28 rounded-lg bg-card px-2.5 py-2 font-mono text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">{PRESETS.map(swatch)}</div>

      {recent.length > 0 && (
        <div>
          <p className="pb-1.5 text-[11px] text-zinc-500">Récentes</p>
          <div className="flex flex-wrap gap-1.5">{recent.map(swatch)}</div>
        </div>
      )}
    </div>
  );
}
