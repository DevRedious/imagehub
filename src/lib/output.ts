export type OutputMode = "depot" | "same" | "subfolder" | "custom";

export interface OutputPrefs {
  mode: OutputMode;
  customDir: string | null;
}

const KEY = "imagehub.output";

export const OUTPUT_MODES: { id: OutputMode; label: string; hint: string }[] = [
  {
    id: "depot",
    label: "Dépôt ImageHub",
    hint: "Dans ~/Images/ImageHub, rangé par type (icones/, sans-fond/, converti/…)",
  },
  {
    id: "same",
    label: "À côté de l'original",
    hint: "Le fichier généré arrive dans le même dossier",
  },
  {
    id: "subfolder",
    label: "Dossier par format",
    hint: "Rangé dans un dossier au nom du format (logo/png/x.png → logo/avif/x.avif)",
  },
  {
    id: "custom",
    label: "Dossier personnalisé",
    hint: "Tout va dans le dossier de ton choix",
  },
];

export function loadOutputPrefs(): OutputPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as OutputPrefs;
  } catch {
    // prefs corrompues : on repart sur le défaut
  }
  return { mode: "depot", customDir: null };
}

export function saveOutputPrefs(prefs: OutputPrefs): void {
  localStorage.setItem(KEY, JSON.stringify(prefs));
}
