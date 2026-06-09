import type { ActionId } from "../types/job";

/** Disponibilité des moteurs CLI sur la machine (commande check_tools). */
export interface ToolsStatus {
  magick: boolean;
  inkscape: boolean;
  ffmpeg: boolean;
  realesrgan: boolean;
  rembg: boolean;
  vtracer: boolean;
  avifenc: boolean;
}

/** Presets de qualité AVIF (valeur 0..100 passée à avifenc). */
export type QualityPreset = "high" | "balanced" | "light";

export const QUALITY_PRESETS: {
  id: QualityPreset;
  label: string;
  value: number;
}[] = [
  { id: "high", label: "Haute", value: 85 },
  { id: "balanced", label: "Équilibrée", value: 70 },
  { id: "light", label: "Léger", value: 55 },
];

export function qualityValue(preset: QualityPreset): number {
  return QUALITY_PRESETS.find((p) => p.id === preset)?.value ?? 70;
}

/** Modèles de détourage rembg (du plus rapide au plus précis). */
export type BgModel = "u2net" | "isnet-general-use" | "birefnet-general";

export const BG_MODELS: { id: BgModel; label: string; note: string }[] = [
  { id: "u2net", label: "Standard", note: "rapide, déjà installé" },
  {
    id: "isnet-general-use",
    label: "Précis",
    note: "meilleurs détails · ~178 Mo au 1er usage",
  },
  {
    id: "birefnet-general",
    label: "Haute précision",
    note: "cheveux / détails fins · ~900 Mo au 1er usage",
  },
];

export interface ActionDef {
  id: ActionId;
  label: string;
  icon: string;
  hint: string;
  /** extensions acceptées (vide = toutes les images) */
  accepts: string[];
  /** moteurs requis (clés de ToolsStatus) */
  engines: (keyof ToolsStatus)[];
}

export const ACTIONS: ActionDef[] = [
  {
    id: "upscale",
    label: "Upscale ×4",
    icon: "⬆",
    hint: "Real-ESRGAN (GPU)",
    accepts: ["png", "jpg", "jpeg", "webp", "avif"],
    engines: ["realesrgan"],
  },
  {
    id: "removeBg",
    label: "Remove BG",
    icon: "✂",
    hint: "rembg",
    accepts: ["png", "jpg", "jpeg", "webp"],
    engines: ["rembg"],
  },
  {
    id: "bgToAvif",
    label: "Détourage + AVIF",
    icon: "🪄",
    hint: "rembg → AVIF transparent (avifenc) — qualité selon le preset",
    accepts: ["png", "jpg", "jpeg", "webp"],
    engines: ["rembg", "avifenc"],
  },
  {
    id: "toIco",
    label: "→ ICO",
    icon: "🔷",
    hint: "ImageMagick",
    accepts: [],
    engines: ["magick"],
  },
  {
    id: "webIcons",
    label: "Icônes Web",
    icon: "🌐",
    hint: "SVG → pack favicon/PWA complet + prompt IA dans le presse-papier",
    accepts: ["svg"],
    engines: ["magick", "inkscape"],
  },
  {
    id: "appIcons",
    label: "Icônes Appli",
    icon: "📱",
    hint: "SVG → pack iOS/Android/Expo complet + prompt IA dans le presse-papier",
    accepts: ["svg"],
    engines: ["magick", "inkscape"],
  },
  {
    id: "desktopIcons",
    label: "Icônes Desktop",
    icon: "🖥",
    hint: "SVG → pack Tauri/Electron complet + prompt IA dans le presse-papier",
    accepts: ["svg"],
    engines: ["magick", "inkscape"],
  },
  {
    id: "svgToPng",
    label: "SVG → PNG",
    icon: "🖼",
    hint: "Inkscape",
    accepts: ["svg"],
    engines: ["inkscape"],
  },
  {
    id: "pngToSvg",
    label: "PNG → SVG",
    icon: "✒",
    hint: "vtracer",
    accepts: ["png", "jpg", "jpeg"],
    engines: ["vtracer"],
  },
  {
    id: "toAvif",
    label: "→ AVIF",
    icon: "📦",
    hint: "ffmpeg",
    accepts: [],
    engines: ["ffmpeg"],
  },
];

/** Moteurs manquants pour une action (vide = action utilisable).
 *  Tant que le statut n'est pas chargé (null), rien n'est bloqué. */
export function missingEngines(
  action: ActionDef,
  tools: ToolsStatus | null,
): string[] {
  if (!tools) return [];
  return action.engines.filter((e) => !tools[e]);
}

export function actionAccepts(action: ActionDef, path: string): boolean {
  if (action.accepts.length === 0) return true;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return action.accepts.includes(ext);
}
