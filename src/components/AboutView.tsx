import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import type { UpdateCheck } from "../lib/updater";

interface Engine {
  name: string;
  role: string;
  url: string;
}

interface Props {
  onCheckForUpdates: () => Promise<UpdateCheck>;
}

type CheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "upToDate" }
  | { kind: "available"; version: string }
  | { kind: "error" };

const ENGINES: Engine[] = [
  {
    name: "Real-ESRGAN",
    role: "Upscale ×4 des graphiques (GPU Vulkan)",
    url: "https://github.com/xinntao/Real-ESRGAN",
  },
  {
    name: "rembg",
    role: "Suppression d'arrière-plan (u2net)",
    url: "https://github.com/danielgatis/rembg",
  },
  {
    name: "vtracer",
    role: "Vectorisation PNG → SVG",
    url: "https://github.com/visioncortex/vtracer",
  },
  {
    name: "FFmpeg",
    role: "Conversions AVIF & vignettes",
    url: "https://ffmpeg.org",
  },
  {
    name: "ImageMagick",
    role: "Icônes ICO multi-tailles",
    url: "https://imagemagick.org",
  },
  {
    name: "Inkscape",
    role: "Export SVG → PNG haute résolution",
    url: "https://inkscape.org",
  },
];

/** Page « à propos » : identité, version, mises à jour et crédits des moteurs. */
export function AboutView({ onCheckForUpdates }: Props) {
  const [version, setVersion] = useState("");
  const [check, setCheck] = useState<CheckState>({ kind: "idle" });

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => {});
  }, []);

  async function runCheck() {
    setCheck({ kind: "checking" });
    const r = await onCheckForUpdates();
    if (r.status === "available") {
      setCheck({ kind: "available", version: r.update.version });
    } else if (r.status === "upToDate") {
      setCheck({ kind: "upToDate" });
    } else {
      setCheck({ kind: "error" });
    }
  }

  return (
    <div className="flex flex-col items-center gap-8 py-10">
      <div className="flex flex-col items-center gap-4">
        <img src="/logo-solo.svg" alt="" className="h-20 w-20" />
        <img src="/name.svg" alt="ImageHub" className="h-7" />
        {version && (
          <span className="rounded-full bg-accent-soft px-3 py-1 text-xs text-zinc-300">
            v{version}
          </span>
        )}
        <p className="max-w-md text-center text-sm text-zinc-400">
          Boîte à outils locale de traitement d'images : conversions,
          optimisation AVIF de projets, upscale, détourage et vectorisation — le
          tout sur ta machine, rien ne sort.
        </p>

        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={runCheck}
            disabled={check.kind === "checking"}
            className="rounded-lg bg-card px-4 py-2 text-xs text-zinc-200 transition-colors hover:bg-accent-soft cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          >
            {check.kind === "checking"
              ? "Recherche…"
              : "Rechercher des mises à jour"}
          </button>
          {check.kind === "upToDate" && (
            <p className="text-xs text-emerald-400">✓ ImageHub est à jour</p>
          )}
          {check.kind === "available" && (
            <p className="text-xs text-emerald-400">
              Mise à jour disponible : v{check.version}
            </p>
          )}
          {check.kind === "error" && (
            <p className="text-xs text-zinc-500">
              Vérification impossible (connexion ?)
            </p>
          )}
        </div>
      </div>

      <section className="w-full max-w-3xl space-y-2">
        <h2 className="text-center text-xs font-semibold tracking-wider text-zinc-600">
          MOTEURS EMBARQUÉS
        </h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2">
          {ENGINES.map((e) => (
            <button
              key={e.name}
              type="button"
              onClick={() => openUrl(e.url).catch(() => {})}
              title={e.url}
              className="rounded-xl bg-card p-3 text-left transition-colors hover:bg-accent-soft cursor-pointer"
            >
              <p className="text-sm font-medium text-zinc-200">{e.name}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{e.role}</p>
            </button>
          ))}
        </div>
      </section>

      <p className="text-xs text-zinc-600">
        Construit avec Tauri 2 · React · Rust — fait maison par Redious
      </p>
    </div>
  );
}
