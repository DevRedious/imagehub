import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import type { ToolsStatus } from "../lib/actions";
import type { OutputPrefs } from "../lib/output";
import { OutputSelect } from "./OutputSelect";

type Manager = "dnf" | "apt" | "pacman" | "zypper" | "winget" | "brew";

interface Engine {
  key: keyof ToolsStatus;
  name: string;
  role: string;
  url: string;
  // commande d'install : fixe (identique partout) ou variable par gestionnaire
  install: string | Partial<Record<Manager, string>>;
}

const ENGINES: Engine[] = [
  {
    key: "magick",
    name: "ImageMagick",
    role: "Packs d'icônes & conversions ICO",
    url: "https://imagemagick.org",
    install: {
      dnf: "dnf install ImageMagick",
      apt: "apt install imagemagick",
      pacman: "pacman -S imagemagick",
      zypper: "zypper install ImageMagick",
      winget: "winget install ImageMagick",
      brew: "brew install imagemagick",
    },
  },
  {
    key: "inkscape",
    name: "Inkscape",
    role: "Export SVG → PNG haute résolution",
    url: "https://inkscape.org",
    install: {
      dnf: "dnf install inkscape",
      apt: "apt install inkscape",
      pacman: "pacman -S inkscape",
      zypper: "zypper install inkscape",
      winget: "winget install Inkscape",
      brew: "brew install --cask inkscape",
    },
  },
  {
    key: "ffmpeg",
    name: "FFmpeg",
    role: "Conversions AVIF & vignettes",
    url: "https://ffmpeg.org",
    install: {
      dnf: "dnf install ffmpeg",
      apt: "apt install ffmpeg",
      pacman: "pacman -S ffmpeg",
      zypper: "zypper install ffmpeg",
      winget: "winget install ffmpeg",
      brew: "brew install ffmpeg",
    },
  },
  {
    key: "avifenc",
    name: "libavif-tools",
    role: "AVIF avec transparence",
    url: "https://github.com/AOMediaCodec/libavif",
    install: {
      dnf: "dnf install libavif-tools",
      apt: "apt install libavif-bin",
      pacman: "pacman -S libavif",
      zypper: "zypper install libavif-tools",
      brew: "brew install libavif",
    },
  },
  {
    key: "vtracer",
    name: "vtracer",
    role: "Vectorisation PNG → SVG",
    url: "https://github.com/visioncortex/vtracer",
    install: "cargo install vtracer",
  },
  {
    key: "realesrgan",
    name: "Real-ESRGAN",
    role: "Upscale ×4 (GPU Vulkan)",
    url: "https://github.com/xinntao/Real-ESRGAN",
    install: "Voir le README (binaire + modèles)",
  },
  {
    key: "rembg",
    name: "rembg",
    role: "Détourage (modèles ONNX)",
    url: "https://github.com/danielgatis/rembg",
    install: "Voir le README (venv Python dédié)",
  },
];

// Étiquette lisible du gestionnaire détecté.
const MANAGER_LABEL: Record<Manager, string> = {
  dnf: "Fedora / RHEL (dnf)",
  apt: "Debian / Ubuntu (apt)",
  pacman: "Arch (pacman)",
  zypper: "openSUSE (zypper)",
  winget: "Windows (winget)",
  brew: "macOS (brew)",
};

/** Commande pour le gestionnaire détecté, ou `null` si non couvert. */
function installCmd(
  install: Engine["install"],
  manager: string,
): string | null {
  if (typeof install === "string") return install;
  return install[manager as Manager] ?? null;
}

interface Props {
  tools: ToolsStatus | null;
  onRecheckTools: () => void;
  outputPrefs: OutputPrefs;
  onOutputChange: (prefs: OutputPrefs) => void;
  checkOnLaunch: boolean;
  onCheckOnLaunchChange: (on: boolean) => void;
  onReset: () => void;
}

/** Interrupteur on/off minimal, style pilule. */
function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer ${on ? "bg-accent" : "bg-zinc-700"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}

/** Page « Paramètres » : diagnostic des moteurs + réglages globaux. */
export function SettingsView({
  tools,
  onRecheckTools,
  outputPrefs,
  onOutputChange,
  checkOnLaunch,
  onCheckOnLaunchChange,
  onReset,
}: Props) {
  const [confirmReset, setConfirmReset] = useState(false);
  // gestionnaire de paquets détecté côté Rust (commandes d'install adaptées)
  const [manager, setManager] = useState("");

  useEffect(() => {
    invoke<{ os: string; manager: string }>("platform_info")
      .then((p) => setManager(p.manager))
      .catch(() => {});
  }, []);

  const managerLabel = MANAGER_LABEL[manager as Manager];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 py-4">
      {/* Moteurs */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wider text-zinc-600">
            MOTEURS
          </h2>
          <button
            type="button"
            onClick={onRecheckTools}
            className="rounded-lg bg-card px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-accent-soft cursor-pointer"
          >
            Revérifier
          </button>
        </div>
        {managerLabel && (
          <p className="text-[11px] text-zinc-500">
            Commandes d'installation pour{" "}
            <span className="text-zinc-300">{managerLabel}</span>
          </p>
        )}
        <div className="space-y-2">
          {ENGINES.map((e) => {
            const ok = tools?.[e.key];
            const cmd = installCmd(e.install, manager);
            return (
              <div
                key={e.key}
                className="flex items-center gap-3 rounded-xl bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openUrl(e.url).catch(() => {})}
                      title={e.url}
                      className="text-sm font-medium text-zinc-200 hover:text-accent cursor-pointer"
                    >
                      {e.name}
                    </button>
                    {tools === null ? (
                      <span className="text-[11px] text-zinc-500">
                        vérification…
                      </span>
                    ) : ok ? (
                      <span className="text-[11px] text-emerald-400">
                        ✓ installé
                      </span>
                    ) : (
                      <span className="text-[11px] text-amber-400">
                        ✗ manquant
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">{e.role}</p>
                  {tools !== null &&
                    !ok &&
                    (cmd ? (
                      <code className="mt-1.5 block select-all rounded-md bg-panel px-2 py-1 font-mono text-[11px] text-zinc-400">
                        {cmd}
                      </code>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openUrl(e.url).catch(() => {})}
                        className="mt-1.5 text-[11px] text-zinc-500 underline hover:text-zinc-300 cursor-pointer"
                      >
                        Voir les instructions d'installation
                      </button>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-zinc-600">
          Les actions dont le moteur manque sont grisées dans le Studio — rien
          ne plante.
        </p>
      </section>

      {/* Mises à jour */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold tracking-wider text-zinc-600">
          MISES À JOUR
        </h2>
        <div className="flex items-center gap-3 rounded-xl bg-card p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-zinc-200">Vérifier au démarrage</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Cherche une nouvelle version à chaque lancement. La vérification
              manuelle reste disponible dans « À propos ».
            </p>
          </div>
          <Toggle on={checkOnLaunch} onChange={onCheckOnLaunchChange} />
        </div>
      </section>

      {/* Sortie par défaut */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold tracking-wider text-zinc-600">
          SORTIE PAR DÉFAUT
        </h2>
        <div className="rounded-xl bg-card p-3">
          <OutputSelect prefs={outputPrefs} onChange={onOutputChange} />
          <p className="mt-2 text-xs text-zinc-500">
            Où atterrissent les fichiers générés (modifiable aussi depuis la
            barre du Studio).
          </p>
        </div>
      </section>

      {/* Réinitialiser */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold tracking-wider text-zinc-600">
          RÉINITIALISER
        </h2>
        <div className="flex items-center gap-3 rounded-xl bg-card p-3">
          <p className="min-w-0 flex-1 text-xs text-zinc-500">
            Remet les préférences (sortie, qualité, modèle, agressivité, MAJ) à
            leurs valeurs par défaut. Tes projets enregistrés sont conservés.
          </p>
          {confirmReset ? (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onReset();
                  setConfirmReset(false);
                }}
                className="rounded-lg bg-red-500/90 px-3 py-1.5 text-xs text-white transition-colors hover:bg-red-500 cursor-pointer"
              >
                Confirmer
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="rounded-lg bg-card px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-accent-soft cursor-pointer"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="shrink-0 rounded-lg bg-panel px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-card cursor-pointer"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
