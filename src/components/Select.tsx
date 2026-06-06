import { useEffect, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

interface Props {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}

/** Menu déroulant custom (le <select> natif n'est pas thémable). */
export function Select({ value, options, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg bg-panel px-2.5 py-1.5 text-zinc-300 transition-colors hover:bg-card cursor-pointer"
      >
        {selected?.label ?? "—"}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"
          className={`text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M1 3l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full right-0 z-50 mt-1.5 w-64 rounded-xl border border-zinc-700/60 bg-card p-1 shadow-xl shadow-black/40">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={`block w-full rounded-lg px-2.5 py-2 text-left transition-colors cursor-pointer
                ${o.value === value ? "bg-accent-soft text-zinc-100" : "text-zinc-300 hover:bg-panel"}`}
            >
              {o.label}
              {o.hint && (
                <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">
                  {o.hint}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
