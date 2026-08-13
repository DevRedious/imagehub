/** La bibliothèque d'éléments, vue depuis les Motifs.
 *
 *  Le stock de pièces détachées vit sur le disque, sous le dépôt du Studio, et
 *  il est PARTAGÉ avec l'Atelier : ce qu'une découpe de planche y dépose se
 *  retrouve dans les deux vues. Ce qui est regroupé ici, c'est donc tout ce qui
 *  touche au disque — lister, importer, retirer — par opposition au motif
 *  lui-même, qui ne fait que référencer des chemins.
 *
 *  Les erreurs remontent en messages éphémères plutôt qu'en exceptions : une
 *  pièce qu'on n'a pas pu retirer ne doit pas emporter la composition en cours.
 */

import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import {
  type Asset,
  libraryDelete,
  libraryImport,
  libraryList,
} from "../../lib/library";
import type { ToastKind } from "../Toaster";

export interface AssetLibrary {
  assets: Asset[];
  loading: boolean;
  /** planche choisie, en attente de découpe ; null quand la modale est fermée */
  sheetPath: string | null;
  setSheetPath: (path: string | null) => void;
  /** ajoute des pièces à la liste sans relire le disque (retour de découpe) */
  push: (added: Asset[]) => void;
  importAssets: () => Promise<void>;
  pickSheet: () => Promise<void>;
  deleteAsset: (asset: Asset) => Promise<void>;
  clear: () => Promise<void>;
}

export function useAssetLibrary(
  onToast: (kind: ToastKind, message: string) => void,
): AssetLibrary {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetPath, setSheetPath] = useState<string | null>(null);

  useEffect(() => {
    libraryList()
      .then(setAssets)
      .catch(() => setAssets([]))
      .finally(() => setLoading(false));
  }, []);

  const push = useCallback((added: Asset[]) => {
    setAssets((prev) => [...added, ...prev]);
  }, []);

  const importAssets = useCallback(async () => {
    const chosen = await open({
      multiple: true,
      filters: [{ name: "Éléments", extensions: ["png", "webp", "svg"] }],
    });
    const list = Array.isArray(chosen) ? chosen : chosen ? [chosen] : [];
    if (list.length === 0) return;
    try {
      const added = await libraryImport(list);
      push(added);
      onToast("success", `${added.length} élément(s) ajouté(s)`);
    } catch (e) {
      onToast("error", String(e));
    }
  }, [push, onToast]);

  const pickSheet = useCallback(async () => {
    const chosen = await open({
      multiple: false,
      filters: [
        { name: "Planche", extensions: ["png", "jpg", "jpeg", "webp"] },
      ],
    });
    if (typeof chosen === "string") setSheetPath(chosen);
  }, []);

  const deleteAsset = useCallback(
    async (asset: Asset) => {
      try {
        await libraryDelete([asset.path]);
        setAssets((prev) => prev.filter((a) => a.path !== asset.path));
      } catch (e) {
        onToast("error", String(e));
      }
    },
    [onToast],
  );

  const clear = useCallback(async () => {
    if (assets.length === 0) return;
    try {
      await libraryDelete(assets.map((a) => a.path));
      setAssets([]);
      onToast("info", "Bibliothèque vidée");
    } catch (e) {
      onToast("error", String(e));
    }
  }, [assets, onToast]);

  return {
    assets,
    loading,
    sheetPath,
    setSheetPath,
    push,
    importAssets,
    pickSheet,
    deleteAsset,
    clear,
  };
}
