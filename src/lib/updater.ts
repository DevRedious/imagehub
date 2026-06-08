import { check, type Update } from "@tauri-apps/plugin-updater";

export type { Update };

/**
 * Vérifie auprès de l'endpoint GitHub si une mise à jour est disponible.
 * Renvoie l'objet `Update` à proposer, ou `null` si l'app est à jour ou si
 * la vérification échoue (hors-ligne, endpoint indisponible…) — l'échec est
 * silencieux pour ne pas gêner le démarrage.
 */
export async function checkForUpdate(): Promise<Update | null> {
  try {
    return await check();
  } catch (e) {
    console.warn("Vérification de mise à jour impossible :", e);
    return null;
  }
}
