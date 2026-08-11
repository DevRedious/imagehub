import { invoke } from "@tauri-apps/api/core";

export interface SvgItem {
  path: string;
  name: string;
  source: string;
  animated: boolean;
  /** écrit en `currentColor` → une seule couleur le recolore intégralement */
  themeable: boolean;
}

export interface SvgLibrary {
  items: SvgItem[];
  skipped: number;
  truncated: boolean;
}

export type EmojiFormat = "svg" | "png" | "gif" | "webp";

export const EMOJI_FORMATS: {
  id: EmojiFormat;
  label: string;
  note: string;
  animated: boolean;
}[] = [
  {
    id: "gif",
    label: "GIF animé",
    note: "emoji animé Discord / Slack",
    animated: true,
  },
  {
    id: "png",
    label: "PNG",
    note: "emoji statique, première image",
    animated: false,
  },
  {
    id: "webp",
    label: "WebP animé",
    note: "plus léger que le GIF — Slack oui, Discord non",
    animated: true,
  },
  {
    id: "svg",
    label: "SVG",
    note: "vectoriel et animé, pour réutiliser dans du code",
    animated: false,
  },
];

/** Poids maximum d'un emoji Discord (Slack est à 128 Ko). */
export const DISCORD_MAX_BYTES = 256 * 1024;

/** Tailles proposées : 128 est la valeur attendue par Discord et Slack. */
export const EMOJI_SIZES = [64, 128, 256];

/** Fonds proposés pour le GIF. `null` = vraie transparence (bords tranchés,
 *  fondus perdus) ; une couleur = image opaque, rendu fidèle. Les valeurs
 *  correspondent aux fonds réels des applications visées. */
export const GIF_BACKGROUNDS: {
  id: string;
  label: string;
  color: string | null;
}[] = [
  { id: "none", label: "Transparent", color: null },
  { id: "discord", label: "Discord sombre", color: "#313338" },
  { id: "light", label: "Blanc", color: "#ffffff" },
];

const LIB_KEY = "imagehub.emojiLibrary";
const COLOR_KEY = "imagehub.emojiColor";
const RECENT_COLORS_KEY = "imagehub.emojiRecentColors";

export function loadLibraryDir(): string | null {
  return localStorage.getItem(LIB_KEY);
}

export function saveLibraryDir(dir: string | null): void {
  if (dir) localStorage.setItem(LIB_KEY, dir);
  else localStorage.removeItem(LIB_KEY);
}

export function loadColor(): string {
  return localStorage.getItem(COLOR_KEY) ?? "#7c5cff";
}

export function saveColor(color: string): void {
  localStorage.setItem(COLOR_KEY, color);
}

export function loadRecentColors(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_COLORS_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((c) => typeof c === "string") : [];
  } catch {
    return [];
  }
}

/** Mémorise une couleur utilisée (les 8 dernières, sans doublon). */
export function pushRecentColor(color: string): string[] {
  const next = [color, ...loadRecentColors().filter((c) => c !== color)].slice(
    0,
    8,
  );
  localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(next));
  return next;
}

export function listSvgs(dir: string): Promise<SvgLibrary> {
  return invoke<SvgLibrary>("list_svgs", { dir });
}

export function emojiDir(): Promise<string> {
  return invoke<string>("emoji_dir");
}

export interface SavedEmoji {
  path: string;
  bytes: number;
}

export function saveEmojiSvg(
  name: string,
  source: string,
): Promise<SavedEmoji> {
  return invoke<SavedEmoji>("save_emoji_svg", { name, source });
}

export function saveEmojiPng(name: string, data: string): Promise<SavedEmoji> {
  return invoke<SavedEmoji>("save_emoji_png", { name, data });
}

export function saveEmojiAnimation(
  name: string,
  format: "gif" | "webp",
  frames: string[],
  fps: number,
  size: number,
  /** `null` = transparence réelle ; sinon les images sont composées sur cette
   *  couleur (indispensable pour qu'un fondu survive au GIF) */
  background: string | null,
): Promise<SavedEmoji> {
  return invoke<SavedEmoji>("save_emoji_animation", {
    name,
    format,
    frames,
    fps,
    size,
    background,
  });
}

/** Poids approximatif d'une data URL PNG (le base64 gonfle de ~4/3). */
export function dataUrlBytes(dataUrl: string): number {
  const payload = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.round((payload.length * 3) / 4);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
