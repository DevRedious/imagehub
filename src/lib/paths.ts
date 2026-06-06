/** Nom de fichier d'un chemin, séparateurs Linux (/) et Windows (\) confondus. */
export function basename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}
