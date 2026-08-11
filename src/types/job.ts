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

/** `cancelled` : retiré de la file avant d'avoir démarré. Un traitement déjà
 *  lancé va toujours à son terme (voir src-tauri/src/queue.rs). */
export type JobStatus = "pending" | "running" | "done" | "error" | "cancelled";

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
  /** Ordre de soumission, strictement croissant. Les jobs sont empilés du plus
   *  récent au plus ancien pour l'affichage : c'est ce compteur, et non la
   *  position dans la liste, qui donne l'ordre réel de passage dans la file. */
  seq: number;
}

/** Job enrichi, à l'affichage, de son rang dans la file d'attente (calculé
 *  depuis les jobs `pending`, jamais stocké dans l'état). */
export interface QueuedJob extends Job {
  /** 1 = prochain à démarrer dans son couloir. Absent si le job a déjà démarré. */
  queueRank?: number;
}

export interface JobProgressEvent {
  job_id: string;
  status: JobStatus;
  progress: number;
  output?: string;
  error?: string;
}
