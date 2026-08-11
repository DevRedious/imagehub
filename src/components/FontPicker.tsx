import { useEffect, useMemo, useRef, useState } from "react";
import { basename } from "../lib/paths";
import { type FontFile, groupFonts, loadFontFile } from "../lib/qr";

interface Props {
  /** bibliothèque personnelle (dossier retenu) */
  library: FontFile[];
  /** polices trouvées dans le projet connecté */
  project: FontFile[];
  /** fichiers ouverts à l'unité pendant la session */
  picked: FontFile[];
  dir: string | null;
  /** chemin de la police courante ; vide = police par défaut */
  value: string;
  /** texte de la légende : le meilleur aperçu possible, c'est le vrai texte */
  caption: string;
  onChoose: (file: FontFile | null) => void;
  onPickDir: () => void;
  onPickFile: () => void;
  onClose: () => void;
}

/** Mots d'aperçu : courts, accentués, avec des jambages et des boucles — de
 *  quoi juger une police en un coup d'œil. */
const WORDS = [
  "Aventure",
  "Zéphyr",
  "Grimoire",
  "Vertige",
  "Alchimie",
  "Éclipse",
  "Bravoure",
  "Météore",
  "Jardin",
  "Quinze",
  "Souffle",
  "Panache",
];

function randomWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

/** Un fichier de police pèse souvent plus d'un mégaoctet, lu puis transmis en
 *  base64 : lâcher trente chargements d'un coup en faisant défiler la grille
 *  fige l'interface. Trois à la fois suffisent à remplir l'écran sans à-coups. */
const MAX_PARALLEL = 3;
let running = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  running++;
  try {
    return await task();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

export function FontPicker({
  library,
  project,
  picked,
  dir,
  value,
  caption,
  onChoose,
  onPickDir,
  onPickFile,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [sample, setSample] = useState(() => caption.trim() || randomWord());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // les trois provenances, chacune sous son en-tête ; la bibliothèque est
  // découpée par famille parce qu'une fonderie livre quatorze graisses d'une
  // même police
  const sections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const keep = (fonts: FontFile[]) =>
      needle === ""
        ? fonts
        : fonts.filter((f) => f.name.toLowerCase().includes(needle));

    const out: { title: string; fonts: FontFile[] }[] = [];
    const add = (title: string, fonts: FontFile[]) => {
      const kept = keep(fonts);
      if (kept.length > 0) out.push({ title, fonts: kept });
    };
    add("Ouvertes", picked);
    add("Projet", project);
    for (const group of groupFonts(library)) add(group.family, group.fonts);
    return out;
  }, [picked, project, library, query]);

  const total = sections.reduce((n, s) => n + s.fonts.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      {/* le fond est un bouton, et non un `div` qui écoute le clic : il ferme
          aussi bien à la souris qu'au clavier, et la fenêtre n'a plus à
          arrêter la propagation puisqu'elle n'est pas son enfant */}
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/70"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choisir une police"
        className="relative flex max-h-[85vh] w-full max-w-4xl flex-col rounded-2xl border border-zinc-700/60 bg-surface shadow-2xl shadow-black/60"
      >
        <div className="space-y-2.5 border-b border-zinc-800 p-4">
          <div className="flex items-center gap-3">
            <h2 className="flex-1 text-sm font-semibold text-zinc-200">
              Choisir une police
              <span className="pl-2 font-normal text-zinc-600">{total}</span>
            </h2>
            <button
              type="button"
              onClick={onClose}
              title="Fermer"
              className="cursor-pointer px-1.5 text-zinc-500 hover:text-zinc-200"
            >
              ✕
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={searchRef}
              type="text"
              value={query}
              placeholder="Filtrer par nom…"
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 flex-1 rounded-lg bg-card px-2.5 py-2 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-accent"
            />
            <input
              type="text"
              value={sample}
              placeholder="Texte d'aperçu"
              spellCheck={false}
              onChange={(e) => setSample(e.target.value)}
              className="min-w-0 flex-1 rounded-lg bg-card px-2.5 py-2 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              type="button"
              onClick={() => setSample(randomWord())}
              title="Autre mot"
              className="shrink-0 cursor-pointer rounded-lg bg-card px-2.5 py-2 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
            >
              ⤺
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <span className="shrink-0 text-zinc-600">Bibliothèque</span>
            <button
              type="button"
              onClick={onPickDir}
              title={dir ?? "Aucun dossier choisi"}
              className="min-w-0 flex-1 truncate rounded-lg bg-card px-2.5 py-1.5 text-left text-zinc-400 transition-colors hover:bg-accent-soft"
            >
              {dir ? basename(dir) : "Choisir un dossier…"}
            </button>
            <button
              type="button"
              onClick={onPickFile}
              title="Charger un fichier de police isolé"
              className="shrink-0 cursor-pointer rounded-lg bg-card px-2.5 py-1.5 text-zinc-400 transition-colors hover:text-zinc-200"
            >
              Fichier…
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {query.trim() === "" && (
            <Card
              label="Par défaut"
              sample={sample}
              family="cursive"
              selected={value === ""}
              onClick={() => onChoose(null)}
            />
          )}

          {sections.map((section) => (
            <div key={section.title} className="space-y-2">
              <p className="text-[10px] font-semibold tracking-wider text-zinc-600">
                {section.title.toUpperCase()}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {section.fonts.map((file) => (
                  <FontCard
                    key={file.path}
                    file={file}
                    sample={sample}
                    selected={file.path === value}
                    onChoose={onChoose}
                  />
                ))}
              </div>
            </div>
          ))}

          {total === 0 && (
            <p className="py-8 text-center text-xs text-zinc-500">
              {library.length + project.length + picked.length === 0
                ? "Aucune police : choisis un dossier de bibliothèque."
                : "Aucun nom ne correspond au filtre."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Vignette d'aperçu. La police n'est demandée qu'une fois la vignette proche
 *  de l'écran : charger cent soixante fichiers d'un coup mobiliserait des
 *  centaines de mégaoctets pour montrer quatre lignes. */
function FontCard({
  file,
  sample,
  selected,
  onChoose,
}: {
  file: FontFile;
  sample: string;
  selected: boolean;
  onChoose: (file: FontFile) => void;
}) {
  const [family, setFamily] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || family || failed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        withSlot(() => loadFontFile(file))
          .then(setFamily)
          .catch(() => setFailed(true));
      },
      // un peu d'avance sur le défilement : la vignette est prête à l'arrivée
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [file, family, failed]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onChoose(file)}
      title={file.path}
      className={`rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer ${
        selected
          ? "border-accent bg-accent-soft"
          : "border-zinc-800 bg-panel hover:border-zinc-700 hover:bg-card"
      }`}
    >
      <p className="truncate text-[11px] text-zinc-500">{file.name}</p>
      <p
        style={family ? { fontFamily: family } : undefined}
        className={`truncate pt-1 text-2xl leading-tight ${
          family ? "text-zinc-100" : "text-zinc-700"
        }`}
      >
        {sample || "Aperçu"}
      </p>
      {failed && (
        <p className="text-[10px] text-red-400/80">Police illisible</p>
      )}
    </button>
  );
}

/** Même vignette, pour une police déjà chargée (ou la police par défaut). */
function Card({
  label,
  sample,
  family,
  selected,
  onClick,
}: {
  label: string;
  sample: string;
  family: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer ${
        selected
          ? "border-accent bg-accent-soft"
          : "border-zinc-800 bg-panel hover:border-zinc-700 hover:bg-card"
      }`}
    >
      <p className="truncate text-[11px] text-zinc-500">{label}</p>
      <p
        style={{ fontFamily: family }}
        className="truncate pt-1 text-2xl leading-tight text-zinc-100"
      >
        {sample || "Aperçu"}
      </p>
    </button>
  );
}
