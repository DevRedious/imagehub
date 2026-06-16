export type ActionId =
  | "upscale"
  | "removeBg"
  | "toIco"
  | "webIcons"
  | "appIcons"
  | "desktopIcons"
  | "svgToPng"
  | "pngToSvg"
  | "toAvif"
  | "optimizeAvif"
  | "bgToAvif";

/** Actions dont la sortie est un dossier (pack) et l'entrée du SVG uniquement. */
export const PACK_ACTIONS: ActionId[] = [
  "webIcons",
  "appIcons",
  "desktopIcons",
];

export type JobStatus = "pending" | "running" | "done" | "error";

export interface Job {
  id: string;
  path: string;
  name: string;
  action: ActionId;
  status: JobStatus;
  progress: number;
  output?: string;
  error?: string;
  /** Pack à deux variantes fournies : SVG « light » apparié au `path` (« dark »).
   *  Présent uniquement pour les PACK_ACTIONS quand un duo nommé a été détecté. */
  lightPath?: string;
}

export interface JobProgressEvent {
  job_id: string;
  status: JobStatus;
  progress: number;
  output?: string;
  error?: string;
}
