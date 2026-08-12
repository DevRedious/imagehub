import type { ReactNode } from "react";

/** Petites briques de réglage de l'inspecteur. Elles n'existent que pour que
 *  l'inspecteur lui-même se lise comme une liste de propriétés, sans être
 *  noyé sous les classes utilitaires. */

export function Section({
  title,
  children,
  right,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-xl bg-panel p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-semibold tracking-wider text-zinc-600">
          {title}
        </h4>
        {right}
      </div>
      {children}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 ${disabled ? "opacity-40" : ""}`}>
      <span className="w-20 shrink-0 text-[11px] text-zinc-500">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 min-w-0 flex-1 cursor-pointer accent-accent"
      />
      <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-zinc-400">
        {Math.round(value * 100) / 100}
        {suffix}
      </span>
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-400">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 cursor-pointer accent-accent"
      />
      {label}
    </label>
  );
}

export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[11px] text-zinc-500">{label}</span>
      <div className="flex flex-1 gap-0.5 rounded-lg bg-card p-0.5">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            title={o.title}
            onClick={() => onChange(o.id)}
            className={`flex-1 cursor-pointer rounded-md px-1.5 py-1 text-[11px] transition-colors ${
              value === o.id
                ? "bg-accent-soft text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
