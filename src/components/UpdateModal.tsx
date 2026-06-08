import { relaunch } from "@tauri-apps/plugin-process";
import { useState } from "react";
import type { Update } from "../lib/updater";
import { Modal } from "./Modal";

interface Props {
  update: Update;
  onDismiss: () => void;
}

type Phase = "idle" | "downloading" | "installing" | "error";

/** Propose d'installer une mise à jour téléchargée et signée, avec progression. */
export function UpdateModal({ update, onDismiss }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const busy = phase === "downloading" || phase === "installing";

  async function install() {
    setPhase("downloading");
    setError(null);
    let total = 0;
    let got = 0;
    try {
      await update.downloadAndInstall((e) => {
        switch (e.event) {
          case "Started":
            total = e.data.contentLength ?? 0;
            break;
          case "Progress":
            got += e.data.chunkLength;
            setPct(total ? Math.round((got / total) * 100) : 0);
            break;
          case "Finished":
            setPhase("installing");
            break;
        }
      });
      // Redémarre sur la nouvelle version.
      await relaunch();
    } catch (err) {
      setError(String(err));
      setPhase("error");
    }
  }

  return (
    <Modal>
      <h2 className="text-sm font-semibold">
        Mise à jour disponible — v{update.version}
      </h2>
      <p className="mt-1 text-xs text-zinc-500">
        Version actuelle : {update.currentVersion}
      </p>
      {update.body && (
        <p className="mt-3 max-h-40 overflow-y-auto whitespace-pre-line text-xs text-zinc-300">
          {update.body}
        </p>
      )}

      {phase === "downloading" && (
        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-card">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-zinc-400">Téléchargement… {pct}%</p>
        </div>
      )}
      {phase === "installing" && (
        <p className="mt-4 text-xs text-zinc-400">
          Installation, l'application va redémarrer…
        </p>
      )}
      {phase === "error" && (
        <p className="mt-4 text-xs text-red-400">
          Échec de la mise à jour : {error}
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onDismiss}
          disabled={busy}
          className="rounded-lg bg-card px-3.5 py-2 text-xs text-zinc-300 transition-colors hover:bg-zinc-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        >
          Plus tard
        </button>
        <button
          type="button"
          onClick={install}
          disabled={busy}
          className="rounded-lg bg-emerald-500/80 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        >
          {phase === "error" ? "Réessayer" : "Installer et redémarrer"}
        </button>
      </div>
    </Modal>
  );
}
