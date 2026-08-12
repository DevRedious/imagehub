import { useEffect, useRef, useState } from "react";
import type { Page } from "../../lib/editor/types";

interface Props {
  pages: Page[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onMove: (id: string, delta: number) => void;
}

function PlusIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Bande des pages, sous le plan de travail.
 *
 *  Des pastilles nommées plutôt que des vignettes : une vignette fidèle
 *  demanderait de rendre chaque page hors écran à chaque modification, pour un
 *  gain douteux sur des compositions qui se ressemblent souvent beaucoup. Le
 *  nom, lui, se lit et se change. */
export function PageStrip({
  pages,
  activeId,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onRename,
  onMove,
}: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    if (editing) onRename(editing, draft.trim() || "Page");
    setEditing(null);
  };

  return (
    <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto rounded-xl bg-panel p-2">
      <span className="shrink-0 pr-1 text-[11px] font-semibold tracking-wider text-zinc-600">
        PAGES
      </span>

      {pages.map((p, i) => {
        const active = p.id === activeId;
        return (
          <div
            key={p.id}
            className={`group flex shrink-0 items-center gap-1 rounded-lg border px-1.5 py-1 transition-colors ${
              active
                ? "border-accent/60 bg-accent-soft text-zinc-100"
                : "border-zinc-800 bg-card text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <span className="w-4 shrink-0 text-center text-[10px] tabular-nums text-zinc-500">
              {i + 1}
            </span>

            {editing === p.id ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") setEditing(null);
                }}
                className="w-24 rounded bg-zinc-900 px-1 py-0.5 text-[11px] text-zinc-100 outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                onDoubleClick={() => {
                  setDraft(p.name);
                  setEditing(p.id);
                }}
                title={`${p.name} — ${p.layers.length} calque(s)\nDouble-clic pour renommer`}
                className="cursor-pointer whitespace-nowrap px-0.5 text-[11px]"
              >
                {p.name}
              </button>
            )}

            <div className="hidden items-center gap-0.5 group-hover:flex">
              <button
                type="button"
                onClick={() => onMove(p.id, -1)}
                disabled={i === 0}
                title="Déplacer vers la gauche"
                className="cursor-pointer px-0.5 text-zinc-600 transition-transform hover:scale-125 hover:text-zinc-200 disabled:cursor-default disabled:opacity-30 disabled:hover:scale-100"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => onMove(p.id, 1)}
                disabled={i === pages.length - 1}
                title="Déplacer vers la droite"
                className="cursor-pointer px-0.5 text-zinc-600 transition-transform hover:scale-125 hover:text-zinc-200 disabled:cursor-default disabled:opacity-30 disabled:hover:scale-100"
              >
                ›
              </button>
              <button
                type="button"
                onClick={() => onDuplicate(p.id)}
                title="Dupliquer la page"
                className="cursor-pointer px-0.5 text-zinc-600 transition-transform hover:scale-125 hover:text-zinc-200"
              >
                ⧉
              </button>
              {/* la dernière page ne se supprime pas : un document sans page
                  n'aurait plus rien à montrer ni où poser un calque */}
              {pages.length > 1 && (
                <button
                  type="button"
                  onClick={() => onDelete(p.id)}
                  title="Supprimer la page"
                  className="cursor-pointer px-0.5 text-zinc-600 transition-transform hover:scale-125 hover:text-red-400"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={onAdd}
        title="Ajouter une page"
        className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-zinc-700 bg-card px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:border-accent/60 hover:bg-accent-soft hover:text-zinc-100"
      >
        <PlusIcon />
        Page
      </button>
    </div>
  );
}
