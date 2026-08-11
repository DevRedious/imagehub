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

/** Une ligne « libellé + pastille + hexadécimal », pour régler une couleur
 *  précise d'un visuel qui en compte plusieurs. */
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
    <div className={`flex items-center gap-2 ${disabled ? "opacity-40" : ""}`}>
      <span className="w-24 shrink-0 text-xs text-zinc-500">{label}</span>
      <input
        type="color"
        value={color}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-9 shrink-0 cursor-pointer rounded-md border border-zinc-700 bg-card p-0.5 disabled:cursor-not-allowed"
      />
      <input
        type="text"
        value={color}
        spellCheck={false}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value.trim();
          if (HEX.test(v)) onChange(v.toLowerCase());
        }}
        className="w-24 rounded-lg bg-card px-2 py-1.5 font-mono text-[11px] text-zinc-200 outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed"
      />
    </div>
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
        <input
          type="color"
          value={color}
          onChange={(e) => onChange(e.target.value)}
          title="Choisir une couleur"
          className="h-9 w-12 cursor-pointer rounded-lg border border-zinc-700 bg-card p-1"
        />
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
