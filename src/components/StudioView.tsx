import type { ToolsStatus } from "../lib/actions";
import { basename } from "../lib/paths";
import type { ActionId } from "../types/job";
import { ActionBar } from "./ActionBar";
import { DropZone } from "./DropZone";
import { Thumb } from "./Thumb";

interface Props {
  staged: string[];
  onAddFiles: (paths: string[]) => void;
  onRemoveStaged: (path: string) => void;
  onRun: (action: ActionId) => void;
  onPreview: (path: string) => void;
  tools: ToolsStatus | null;
}

export function StudioView({
  staged,
  onAddFiles,
  onRemoveStaged,
  onRun,
  onPreview,
  tools,
}: Props) {
  return (
    <div className="space-y-4">
      <DropZone onFiles={onAddFiles} />

      {staged.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {staged.map((p) => (
            <div
              key={p}
              className="group relative flex w-24 flex-col items-center gap-1 rounded-xl bg-panel p-2"
            >
              <button
                type="button"
                onClick={() => onPreview(p)}
                title="Voir l'original"
                className="cursor-zoom-in"
              >
                <Thumb path={p} size={64} />
              </button>
              <span className="w-full truncate text-center text-[11px] text-zinc-400">
                {basename(p)}
              </span>
              <button
                type="button"
                className="absolute -top-1.5 -right-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-zinc-700 text-[10px] text-zinc-200 group-hover:flex hover:bg-red-500 cursor-pointer"
                onClick={() => onRemoveStaged(p)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <ActionBar disabled={staged.length === 0} tools={tools} onRun={onRun} />
    </div>
  );
}
