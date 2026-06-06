import { open } from "@tauri-apps/plugin-dialog";
import { OUTPUT_MODES, type OutputPrefs } from "../lib/output";
import { basename } from "../lib/paths";
import { Select } from "./Select";

interface Props {
  prefs: OutputPrefs;
  onChange: (prefs: OutputPrefs) => void;
}

export function OutputSelect({ prefs, onChange }: Props) {
  async function pickDir() {
    const dir = await open({ directory: true });
    if (typeof dir === "string") onChange({ mode: "custom", customDir: dir });
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-zinc-500">Sortie :</span>
      <Select
        value={prefs.mode}
        options={OUTPUT_MODES.map((m) => ({
          value: m.id,
          label: m.label,
          hint: m.hint,
        }))}
        onChange={async (mode) => {
          if (mode === "custom" && !prefs.customDir) await pickDir();
          else onChange({ ...prefs, mode: mode as OutputPrefs["mode"] });
        }}
      />
      {prefs.mode === "custom" && (
        <button
          type="button"
          onClick={pickDir}
          title={prefs.customDir ?? ""}
          className="max-w-48 truncate rounded-lg bg-panel px-2.5 py-1.5 text-zinc-400 transition-colors hover:bg-card hover:text-zinc-200 cursor-pointer"
        >
          📁 {prefs.customDir ? basename(prefs.customDir) : "choisir…"}
        </button>
      )}
    </div>
  );
}
