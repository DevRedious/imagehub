import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** largeur de la carte ; défaut `max-w-md`. Une modale qui montre des
   *  images (aperçu d'une découpe) a besoin de plus de place qu'une
   *  confirmation. */
  width?: string;
}

/** Coquille commune des modales : overlay flouté + carte centrée. */
export function Modal({ children, width = "max-w-md" }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
      <div
        className={`w-full ${width} max-h-full overflow-y-auto rounded-2xl border border-zinc-700/50 bg-panel p-5 shadow-2xl shadow-black/50`}
      >
        {children}
      </div>
    </div>
  );
}
