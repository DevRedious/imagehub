import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { basename } from "../lib/paths";

interface Props {
  path: string;
  onClose: () => void;
  onReveal: (path: string) => void;
}

/** Aperçu plein écran de l'original (vraie qualité), chargé à la demande.
 *  Fermeture : Échap, clic sur le fond ou sur ✕. */
export function Lightbox({ path, onClose, onReveal }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const name = basename(path);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: fond cliquable de lightbox
    // biome-ignore lint/a11y/useKeyWithClickEvents: Échap est géré au niveau fenêtre
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation seulement, Échap gère le clavier */}
      <img
        src={convertFileSrc(path)}
        alt={name}
        className="max-h-[82vh] max-w-[92vw] rounded-lg object-contain shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      />
      <div className="flex max-w-[92vw] items-center gap-3 text-sm text-zinc-300">
        <span className="truncate font-medium">{name}</span>
        <span className="hidden truncate text-xs text-zinc-500 sm:block">
          {path}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onReveal(path);
          }}
          title="Ouvrir le dossier (fichier sélectionné)"
          className="shrink-0 cursor-pointer rounded-lg bg-card px-3.5 py-2 text-sm text-zinc-200 transition-colors hover:bg-accent-soft"
        >
          📂 Ouvrir le dossier
        </button>
      </div>
      <button
        type="button"
        onClick={onClose}
        title="Fermer (Échap)"
        className="absolute top-4 right-5 rounded-full bg-zinc-900/80 px-3 py-1.5 text-sm text-zinc-300 transition-transform hover:scale-110 hover:text-zinc-100 cursor-pointer"
      >
        ✕
      </button>
    </div>
  );
}
