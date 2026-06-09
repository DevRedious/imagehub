export type ToastKind = "info" | "error" | "success";

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface Props {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

const STYLE: Record<ToastKind, string> = {
  info: "border-zinc-600 text-zinc-200",
  success: "border-emerald-500/50 text-emerald-300",
  error: "border-red-500/50 text-red-300",
};

const ICON: Record<ToastKind, string> = {
  info: "ℹ",
  success: "✓",
  error: "⚠",
};

/** Pile de messages éphémères en haut à droite (feedback non bloquant). */
export function Toaster({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-2 rounded-xl border bg-card/95 px-3.5 py-2.5 text-xs shadow-lg shadow-black/40 backdrop-blur ${STYLE[t.kind]}`}
        >
          <span className="shrink-0">{ICON[t.kind]}</span>
          <span className="min-w-0 flex-1 break-words">{t.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            title="Fermer"
            className="shrink-0 cursor-pointer text-zinc-500 hover:text-zinc-200"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
