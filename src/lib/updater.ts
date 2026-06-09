import { check, type Update } from "@tauri-apps/plugin-updater";

export type { Update };

/** Résultat d'une vérification de mise à jour, exploitable par l'UI. */
export type UpdateCheck =
  | { status: "available"; update: Update }
  | { status: "upToDate" }
  | { status: "error"; error: string };

/**
 * Vérifie auprès de l'endpoint GitHub si une mise à jour est disponible.
 * Distingue les trois cas (disponible / à jour / erreur) pour permettre un
 * retour visuel lors d'une vérification manuelle. Au démarrage, l'appelant
 * ignore simplement `upToDate` et `error`.
 */
export async function checkForUpdate(): Promise<UpdateCheck> {
  try {
    const update = await check();
    return update ? { status: "available", update } : { status: "upToDate" };
  } catch (e) {
    console.warn("Vérification de mise à jour impossible :", e);
    return { status: "error", error: String(e) };
  }
}

// Marqueur de mise à jour fraîchement installée, persisté avant le redémarrage.
// localStorage survit à la mise à jour (même identifiant d'app → même WebView).
const JUST_UPDATED_KEY = "imagehub.justUpdatedTo";

/** Mémorise la version installée, juste avant le redémarrage automatique. */
export function markJustUpdated(version: string): void {
  localStorage.setItem(JUST_UPDATED_KEY, version);
}

/** Version installée en attente de confirmation au prochain démarrage, ou null. */
export function pendingUpdatedVersion(): string | null {
  return localStorage.getItem(JUST_UPDATED_KEY);
}

/** Efface le marqueur : la confirmation « à jour » ne réapparaîtra plus jamais. */
export function clearJustUpdated(): void {
  localStorage.removeItem(JUST_UPDATED_KEY);
}
