import type { ActionId } from "../types/job";

export interface ActionDef {
  id: ActionId;
  label: string;
  icon: string;
  hint: string;
  /** extensions acceptées (vide = toutes les images) */
  accepts: string[];
  /** moteur déjà disponible sur la machine */
  ready: boolean;
}

export const ACTIONS: ActionDef[] = [
  {
    id: "upscale",
    label: "Upscale ×4",
    icon: "⬆",
    hint: "Real-ESRGAN (GPU)",
    accepts: ["png", "jpg", "jpeg", "webp", "avif"],
    ready: true,
  },
  {
    id: "removeBg",
    label: "Remove BG",
    icon: "✂",
    hint: "rembg",
    accepts: ["png", "jpg", "jpeg", "webp"],
    ready: true,
  },
  {
    id: "toIco",
    label: "→ ICO",
    icon: "🔷",
    hint: "ImageMagick",
    accepts: [],
    ready: true,
  },
  {
    id: "webIcons",
    label: "Icônes Web",
    icon: "🌐",
    hint: "SVG → pack favicon/PWA complet + prompt IA dans le presse-papier",
    accepts: ["svg"],
    ready: true,
  },
  {
    id: "appIcons",
    label: "Icônes Appli",
    icon: "📱",
    hint: "SVG → pack iOS/Android/Expo complet + prompt IA dans le presse-papier",
    accepts: ["svg"],
    ready: true,
  },
  {
    id: "desktopIcons",
    label: "Icônes Desktop",
    icon: "🖥",
    hint: "SVG → pack Tauri/Electron complet + prompt IA dans le presse-papier",
    accepts: ["svg"],
    ready: true,
  },
  {
    id: "svgToPng",
    label: "SVG → PNG",
    icon: "🖼",
    hint: "Inkscape",
    accepts: ["svg"],
    ready: true,
  },
  {
    id: "pngToSvg",
    label: "PNG → SVG",
    icon: "✒",
    hint: "vtracer",
    accepts: ["png", "jpg", "jpeg"],
    ready: true,
  },
  {
    id: "toAvif",
    label: "→ AVIF",
    icon: "📦",
    hint: "ffmpeg",
    accepts: [],
    ready: true,
  },
];

export function actionAccepts(action: ActionDef, path: string): boolean {
  if (action.accepts.length === 0) return true;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return action.accepts.includes(ext);
}
