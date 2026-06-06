import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

/** Coquille commune des modales : overlay flouté + carte centrée. */
export function Modal({ children }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-zinc-700/50 bg-panel p-5 shadow-2xl shadow-black/50">
        {children}
      </div>
    </div>
  );
}
