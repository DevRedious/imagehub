import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";

interface Props {
  onFiles: (paths: string[]) => void;
}

const IMAGE_EXTS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "avif",
  "svg",
  "bmp",
  "gif",
  "tiff",
  "ico",
];

export function DropZone({ onFiles }: Props) {
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "over") setHovering(true);
      else if (event.payload.type === "drop") {
        setHovering(false);
        onFiles(event.payload.paths);
      } else setHovering(false);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [onFiles]);

  async function pickFiles() {
    const picked = await open({
      multiple: true,
      filters: [{ name: "Images", extensions: IMAGE_EXTS }],
    });
    if (picked) onFiles(Array.isArray(picked) ? picked : [picked]);
  }

  return (
    <button
      type="button"
      onClick={pickFiles}
      className={`w-full rounded-2xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer
        ${hovering ? "border-accent bg-accent-soft" : "border-zinc-700 bg-panel hover:border-zinc-500"}`}
    >
      <p className="text-lg font-medium">Glisse tes images ici</p>
      <p className="mt-1 text-sm text-zinc-500">ou clique pour parcourir</p>
    </button>
  );
}
