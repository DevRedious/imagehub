export interface SavedProject {
  root: string;
  name: string;
  kind: string;
  /** icône réelle de l'app (absente sur les entrées d'avant la v0.6) */
  icon?: string | null;
}

const KEY = "imagehub.projects";

export function loadProjects(): SavedProject[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as SavedProject[];
  } catch {
    return [];
  }
}

export function saveProject(project: SavedProject): SavedProject[] {
  const list = loadProjects();
  const existing = list.findIndex((p) => p.root === project.root);
  if (existing >= 0) {
    list[existing] = project; // mise à jour sur place : l'ordre reste stable
  } else {
    list.unshift(project);
  }
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 30)));
  return loadProjects();
}

export function removeProject(root: string): SavedProject[] {
  const list = loadProjects().filter((p) => p.root !== root);
  localStorage.setItem(KEY, JSON.stringify(list));
  return list;
}
