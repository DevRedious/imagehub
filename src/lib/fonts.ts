/** Les trois provenances d'une police, rassemblées pour le sélecteur.
 *
 *  La convention de l'utilisateur est de garder le fichier de police DANS le
 *  projet qui s'en sert (voir `qr::read_font`) : on lit donc le projet
 *  connecté, la bibliothèque personnelle retenue d'une session à l'autre, et
 *  les fichiers ouverts à l'unité pendant la session.
 */

import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { basename } from "./paths";
import { type FontFile, findFonts, loadFontDir, saveFontDir } from "./qr";

export interface FontLibrary {
  /** polices trouvées dans le projet connecté */
  project: FontFile[];
  /** polices du dossier personnel retenu */
  library: FontFile[];
  /** fichiers ouverts à l'unité pendant la session */
  picked: FontFile[];
  dir: string | null;
  pickDir: () => Promise<void>;
  /** ouvre un fichier isolé et le fait entrer dans la liste */
  pickFile: () => Promise<FontFile | null>;
}

export function useFontLibrary(projectRoot: string | null): FontLibrary {
  const [project, setProject] = useState<FontFile[]>([]);
  const [library, setLibrary] = useState<FontFile[]>([]);
  const [picked, setPicked] = useState<FontFile[]>([]);
  const [dir, setDir] = useState<string | null>(loadFontDir);

  useEffect(() => {
    if (!projectRoot) {
      setProject([]);
      return;
    }
    findFonts(projectRoot)
      .then(setProject)
      .catch(() => setProject([]));
  }, [projectRoot]);

  useEffect(() => {
    if (!dir) {
      setLibrary([]);
      return;
    }
    findFonts(dir)
      .then(setLibrary)
      .catch(() => setLibrary([]));
  }, [dir]);

  const pickDir = useCallback(async () => {
    const chosen = await open({ directory: true });
    if (typeof chosen !== "string") return;
    setDir(chosen);
    saveFontDir(chosen);
  }, []);

  const pickFile = useCallback(async () => {
    const chosen = await open({
      multiple: false,
      filters: [
        { name: "Police", extensions: ["ttf", "otf", "woff", "woff2"] },
      ],
    });
    if (typeof chosen !== "string") return null;
    const file: FontFile = {
      path: chosen,
      name: basename(chosen).replace(/\.[^.]+$/, ""),
    };
    setPicked((prev) =>
      prev.some((f) => f.path === file.path) ? prev : [...prev, file],
    );
    return file;
  }, []);

  return { project, library, picked, dir, pickDir, pickFile };
}
