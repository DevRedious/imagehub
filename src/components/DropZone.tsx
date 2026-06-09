import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { basename, IMAGE_EXTS } from "../lib/paths";
import { Thumb } from "./Thumb";

interface Props {
  staged: string[];
  onAddFiles: (paths: string[]) => void;
  onRemoveStaged: (path: string) => void;
  onPreview: (path: string) => void;
}

/** Grande zone de dépôt : reçoit les images (drag-drop global ou clic) et
 *  affiche les fichiers déposés en galerie à l'intérieur. */
export function DropZone({
  staged,
  onAddFiles,
  onRemoveStaged,
  onPreview,
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
            <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
              {staged.map((p) => (
                <div
                  key={p}
                  className="group relative flex flex-col items-center gap-1 rounded-xl bg-card p-2"
                >
                  <button
                    type="button"
                    onClick={() => onPreview(p)}
                    title="Voir l'original"
                    className="cursor-zoom-in"
                  >
                    <Thumb path={p} size={72} />
                  </button>
                  <span className="w-full truncate text-center text-[11px] text-zinc-400">
                    {basename(p)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveStaged(p)}
                    className="absolute -top-1.5 -right-1.5 hidden h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-zinc-700 text-[10px] text-zinc-200 hover:bg-red-500 group-hover:flex"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-zinc-800/60 px-3 py-2 text-xs text-zinc-500">
            <span>
              {staged.length} image{staged.length > 1 ? "s" : ""}
            </span>
            <button
              type="button"
              onClick={pickFiles}
              className="cursor-pointer text-zinc-400 hover:text-zinc-200"
            >
              + ajouter
            </button>
          </div>
        </>
      )}
    </div>
  );
}
