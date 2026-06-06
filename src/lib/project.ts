export interface ImageStat {
  ext: string;
  count: number;
  bytes: number;
}

export interface HeavyImage {
  path: string;
  bytes: number;
}

export interface ProjectInfo {
  root: string;
  name: string;
  kind: string;
  asset_dir: string | null;
  /** icône réelle de l'app détectée par le backend, null si introuvable */
  icon: string | null;
  stats: ImageStat[];
  heavy: HeavyImage[];
  heavy_bytes: number;
  images: HeavyImage[];
}

export interface UsageRef {
  file: string;
  line: number;
}

export interface ImageUsages {
  path: string;
  role: string;
  usages: UsageRef[];
}

export interface ScanState {
  status: "idle" | "running" | "done";
  done: number;
  total: number;
}

const KEY = "imagehub.projectRoot";

export const KIND_LABEL: Record<string, string> = {
  nextjs: "Next.js",
  vite: "Vite",
  expo: "Expo",
  "react-native": "React Native",
  tauri: "Tauri",
  electron: "Electron",
  android: "Android",
  nuxt: "Nuxt",
  angular: "Angular",
  astro: "Astro",
  svelte: "Svelte",
  vue: "Vue",
  rust: "Rust",
  python: "Python",
  node: "Node.js",
  generic: "Générique",
};

/** Économie estimée d'une conversion PNG/JPG → AVIF. */
export const AVIF_SAVINGS_RATIO = 0.65;

export function fmtBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} Go`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} Mo`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} Ko`;
  return `${bytes} o`;
}

export function loadProjectRoot(): string | null {
  return localStorage.getItem(KEY);
}

export function saveProjectRoot(root: string | null): void {
  if (root) localStorage.setItem(KEY, root);
  else localStorage.removeItem(KEY);
}
