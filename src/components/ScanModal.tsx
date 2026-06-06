import { useEffect, useState } from "react";
import { stackIcon } from "../lib/icons";
import { KIND_LABEL } from "../lib/project";
import { Modal } from "./Modal";

interface Props {
  name: string;
  /** stack détectée (null tant que l'analyse n'a pas répondu) */
  kind: string | null;
  /** analyse + scan des usages réellement terminés */
  done: boolean;
  onClose: () => void;
}

/** (libellé, fin de l'étape en ms) — timeline ~5 s */
const STEPS: [string, number][] = [
  ["Détection du type d'application…", 700],
  ["Lecture de la configuration du projet…", 1250],
  ["Parcours des dossiers assets/ et public/…", 1850],
  ["Indexation des images (png, jpg, svg, webp, avif)…", 2500],
  ["Scan des composants…", 3150],
  ["Scan des pages, layouts et modales…", 3750],
  ["Analyse des feuilles de style…", 4200],
  ["Recherche des références d'images (ligne par ligne)…", 4650],
  ["Déduction du rôle des visuels…", 4950],
  ["Finalisation du rapport…", 5200],
];

const TOTAL_MS = 5200;

function appType(kind: string): string {
  if (["expo", "react-native", "android"].includes(kind))
    return "Application mobile";
  if (["tauri", "electron"].includes(kind)) return "Application desktop";
  return "Application web";
}

export function ScanModal({ name, kind, done, onClose }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((e) => e + 100), 100);
    return () => clearInterval(timer);
  }, []);

  const kindKnown = kind !== null;
  const isStepDone = (i: number) => {
    const end = STEPS[i][1];
    if (i === 0) return elapsed >= end && kindKnown;
    if (i === STEPS.length - 1) return elapsed >= TOTAL_MS && done && kindKnown;
    return elapsed >= end && kindKnown;
  };
  const isStepStarted = (i: number) => (i === 0 ? true : isStepDone(i - 1));
  const allDone = isStepDone(STEPS.length - 1);
  const pct = allDone
    ? 100
    : Math.min(99, Math.round((elapsed / TOTAL_MS) * 100));

  useEffect(() => {
    if (allDone) {
      const t = setTimeout(onClose, 650);
      return () => clearTimeout(t);
    }
  }, [allDone, onClose]);

  return (
    <Modal>
      <div className="flex items-center gap-3">
        <img src="/logo-solo.svg" alt="" className="h-8 w-8" />
        <div>
          <h2 className="text-sm font-semibold">Analyse de {name}</h2>
          <p className="text-xs text-zinc-500">
            Scan complet du projet en cours
          </p>
        </div>
        <span className="ml-auto font-mono text-sm text-zinc-400">{pct}%</span>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-accent transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="mt-4 min-h-56 space-y-1.5 text-xs">
        {STEPS.map(([label], i) => {
          if (!isStepStarted(i)) return null;
          const stepDone = isStepDone(i);
          return (
            <li key={label} className="flex items-center gap-2">
              {stepDone ? (
                <span className="w-3.5 shrink-0 text-center font-bold text-emerald-400">
                  ✓
                </span>
              ) : (
                <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              )}
              {i === 0 && stepDone && kind ? (
                <span className="flex items-center gap-1.5 text-emerald-300">
                  {appType(kind)} — {KIND_LABEL[kind] ?? kind}
                  {stackIcon(kind) && (
                    <img
                      src={stackIcon(kind) ?? ""}
                      alt=""
                      className="h-3.5 w-3.5"
                    />
                  )}
                </span>
              ) : (
                <span className={stepDone ? "text-zinc-500" : "text-zinc-200"}>
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
