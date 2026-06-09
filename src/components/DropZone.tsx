import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { IMAGE_EXTS } from "../lib/paths";
import type { Job } from "../types/job";
import { CanvasTile } from "./CanvasTile";

interface Props {
  staged: string[];
  jobByPath: Map<string, Job>;
  onAddFiles: (paths: string[]) => void;
  onRemoveStaged: (path: string) => void;
  onPreview: (path: string) => void;
  onReveal: (path: string) => void;
  onClearStaged: () => void;
}

/** Grande zone de dépôt : reçoit les images (drag-drop global ou clic) et
 *  affiche chaque fichier en tuile « IA » animée (scan → génération). */
export function DropZone({
  staged,
  jobByPath,
  onAddFiles,
  onRemoveStaged,
  onPreview,
  onReveal,
  onClearStaged,
}: Props) {
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "over") setHovering(true);
      else if (event.payload.type === "drop") {
        setHovering(false);
        onAddFiles(event.payload.paths);
      } else setHovering(false);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [onAddFiles]);

  async function pickFiles() {
    const picked = await open({
      multiple: true,
      filters: [{ name: "Images", extensions: IMAGE_EXTS }],
    });
    if (picked) onAddFiles(Array.isArray(picked) ? picked : [picked]);
  }

  return (
    <div
      className={`flex h-full min-h-[60vh] flex-col rounded-2xl border-2 border-dashed transition-colors ${
        hovering ? "border-accent bg-accent-soft" : "border-zinc-700 bg-panel"
      }`}
    >
      {staged.length === 0 ? (
        <button
          type="button"
          onClick={pickFiles}
          className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 p-10 text-center"
        >
          <p className="text-lg font-medium">Glisse tes images ici</p>
          <p className="text-sm text-zinc-500">ou clique pour parcourir</p>
        </button>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-3">
            <div className="grid grid-flow-dense grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
              {staged.map((p) => (
                <CanvasTile
                  key={p}
                  path={p}
                  job={jobByPath.get(p)}
                  onRemove={onRemoveStaged}
                  onPreview={onPreview}
                  onReveal={onReveal}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-zinc-800/60 px-3 py-2.5">
            <span className="text-sm text-zinc-500">
              {staged.length} image{staged.length > 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClearStaged}
                className="cursor-pointer rounded-lg bg-card px-3.5 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700"
              >
                Tout effacer
              </button>
              <button
                type="button"
                onClick={pickFiles}
                className="cursor-pointer rounded-lg bg-card px-3.5 py-2 text-sm text-zinc-200 transition-colors hover:bg-accent-soft"
              >
                + Ajouter
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
