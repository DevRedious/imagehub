// Préférences globales de l'app (au-delà des réglages d'action du Studio).
// Persistées en localStorage, clés `imagehub.*`.

const LAUNCH_CHECK_KEY = "imagehub.checkUpdatesOnLaunch";

/** Vérifier les mises à jour au démarrage (défaut : oui). */
export function loadCheckOnLaunch(): boolean {
  return localStorage.getItem(LAUNCH_CHECK_KEY) !== "0";
}

export function saveCheckOnLaunch(on: boolean): void {
  localStorage.setItem(LAUNCH_CHECK_KEY, on ? "1" : "0");
}

// Préférences réinitialisables — volontairement PAS les projets enregistrés
// (`imagehub.projects` / `imagehub.projectRoot`) ni le marqueur de MAJ.
const PREF_KEYS = [
  "imagehub.output",
  "imagehub.avifQuality",
  "imagehub.bgAggressiveness",
  "imagehub.bgModel",
  "imagehub.sidebarCollapsed",
  LAUNCH_CHECK_KEY,
];

/** Efface les préférences réglables (laisse intacts projets et données). */
export function resetPrefs(): void {
  for (const k of PREF_KEYS) localStorage.removeItem(k);
}
