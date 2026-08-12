import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createImageLayer,
  createShapeLayer,
  createTextLayer,
  duplicateLayer,
  mirrorLayer,
  type ShapePreset,
} from "../../lib/editor/factory";
import { formatById } from "../../lib/editor/formats";
import { deriveAnchor, relayoutAll } from "../../lib/editor/layout";
import {
  clearComposition,
  emptyComposition,
  loadComposition,
  saveComposition,
} from "../../lib/editor/store";
import type { Background, Composition, Layer } from "../../lib/editor/types";
import { useImages } from "../../lib/editor/useImages";
import { useFontLibrary } from "../../lib/fonts";
import {
  type Asset,
  libraryDelete,
  libraryImport,
  libraryList,
} from "../../lib/library";
import { basename } from "../../lib/paths";
import { type FontFile, loadFontFile } from "../../lib/qr";
import { FontPicker } from "../FontPicker";
import type { ToastKind } from "../Toaster";
import { AssetPanel } from "./AssetPanel";
import { EditorCanvas } from "./EditorCanvas";
import { EditorToolbar } from "./EditorToolbar";
import { ExportModal } from "./ExportModal";
import { Inspector } from "./Inspector";
import { LayerList } from "./LayerList";
import { SheetModal } from "./SheetModal";

interface Props {
  /** projet connecté : sert à trouver ses polices et à viser son dossier
   *  d'assets à l'export */
  projectRoot: string | null;
  projectAssetDir: string | null;
  destination: string;
  onReveal: (path: string) => void;
  onToast: (kind: ToastKind, message: string) => void;
}

export function EditorView({
  projectRoot,
  projectAssetDir,
  destination,
  onReveal,
  onToast,
}: Props) {
  const [comp, setComp] = useState<Composition>(loadComposition);
  const [selected, setSelected] = useState<string[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [sheetPath, setSheetPath] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [fontPickerFor, setFontPickerFor] = useState<string | null>(null);

  const fonts = useFontLibrary(projectRoot);

  // reprise de la session précédente
  useEffect(() => {
    saveComposition(comp);
  }, [comp]);

  const refreshAssets = useCallback(() => {
    setLoadingAssets(true);
    libraryList()
      .then(setAssets)
      .catch(() => setAssets([]))
      .finally(() => setLoadingAssets(false));
  }, []);

  useEffect(refreshAssets, [refreshAssets]);

  const paths = useMemo(
    () => comp.layers.flatMap((l) => (l.kind === "image" ? [l.src] : [])),
    [comp.layers],
  );
  const images = useImages(paths);

  /* ---------- calques ---------- */

  const updateLayer = useCallback((next: Layer) => {
    setComp((c) => ({
      ...c,
      layers: c.layers.map((l) =>
        l.id !== next.id
          ? l
          : // l'ancrage suit le calque tant qu'on ne l'a pas figé à la main
            next.anchorAuto
            ? { ...next, anchor: deriveAnchor(next.x, next.y, c.base) }
            : next,
      ),
    }));
  }, []);

  const addLayer = useCallback((layer: Layer) => {
    setComp((c) => ({ ...c, layers: [...c.layers, layer] }));
    setSelected([layer.id]);
  }, []);

  const addAsset = useCallback(
    (asset: Asset, at?: { x: number; y: number }) => {
      const natural = {
        width: asset.width ?? 512,
        height: asset.height ?? 512,
      };
      addLayer(
        createImageLayer(asset.path, asset.name, natural, comp.base, at),
      );
    },
    [addLayer, comp.base],
  );

  const removeLayer = useCallback((id: string) => {
    setComp((c) => ({ ...c, layers: c.layers.filter((l) => l.id !== id) }));
    setSelected((s) => s.filter((x) => x !== id));
  }, []);

  /** Monte ou descend un calque d'un cran dans la pile de dessin. */
  const raiseLayer = useCallback((id: string, delta: number) => {
    setComp((c) => {
      const i = c.layers.findIndex((l) => l.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= c.layers.length) return c;
      const layers = [...c.layers];
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...c, layers };
    });
  }, []);

  const duplicate = useCallback(
    (id: string) => {
      const src = comp.layers.find((l) => l.id === id);
      if (src) addLayer(duplicateLayer(src, comp.base));
    },
    [comp.layers, comp.base, addLayer],
  );

  const mirror = useCallback(
    (id: string) => {
      const src = comp.layers.find((l) => l.id === id);
      if (src) addLayer(mirrorLayer(src, comp.base));
    },
    [comp.layers, comp.base, addLayer],
  );

  /* ---------- plan de travail ---------- */

  /** Changer de plan de travail ne recommence pas la composition : elle est
   *  transposée dans le nouveau format, ancrages compris. C'est la même
   *  opération que l'export multi-formats, appliquée à l'écran. */
  const changeBase = useCallback((id: string) => {
    const f = formatById(id);
    if (!f) return;
    setComp((c) => ({
      ...c,
      base: { width: f.width, height: f.height },
      layers: relayoutAll(c.layers, c.base, f),
    }));
  }, []);

  const setBackground = useCallback((background: Background) => {
    setComp((c) => ({ ...c, background }));
  }, []);

  /* ---------- bibliothèque ---------- */

  const importAssets = useCallback(async () => {
    const chosen = await open({
      multiple: true,
      filters: [{ name: "Éléments", extensions: ["png", "webp", "svg"] }],
    });
    const list = Array.isArray(chosen) ? chosen : chosen ? [chosen] : [];
    if (list.length === 0) return;
    try {
      const added = await libraryImport(list);
      setAssets((prev) => [...added, ...prev]);
      onToast("success", `${added.length} élément(s) ajouté(s)`);
    } catch (e) {
      onToast("error", String(e));
    }
  }, [onToast]);

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

  /* ---------- polices ---------- */

  const applyFont = useCallback(
    async (file: FontFile | null) => {
      const id = fontPickerFor;
      setFontPickerFor(null);
      if (!id) return;
      const layer = comp.layers.find((l) => l.id === id);
      if (layer?.kind !== "text") return;
      if (!file) {
        updateLayer({ ...layer, fontFamily: "", fontPath: null });
        return;
      }
      try {
        const family = await loadFontFile(file);
        updateLayer({
          ...layer,
          fontFamily: family,
          fontPath: file.path,
          name: file.name,
        });
      } catch (e) {
        onToast("error", `Police illisible : ${e}`);
      }
    },
    [fontPickerFor, comp.layers, updateLayer, onToast],
  );

  /* ---------- raccourcis ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      // ne jamais voler une frappe à un champ de saisie
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (selected.length === 0) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        for (const id of selected) removeLayer(id);
      } else if (e.key === "d" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        for (const id of selected) duplicate(id);
      } else if (e.key === "Escape") {
        setSelected([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, removeLayer, duplicate]);

  const current =
    selected.length === 1
      ? (comp.layers.find((l) => l.id === selected[0]) ?? null)
      : null;

  const baseId =
    formatById(
      ["16x9", "9x16", "191x100", "17x6", "1x1"].find((id) => {
        const f = formatById(id);
        return f?.width === comp.base.width && f?.height === comp.base.height;
      }) ?? "",
    )?.id ?? "";

  return (
    <div className="flex min-h-0 flex-col gap-3" style={{ height: "78vh" }}>
      <EditorToolbar
        baseId={baseId}
        onBase={changeBase}
        background={comp.background}
        onBackground={setBackground}
        onAddText={() => addLayer(createTextLayer(comp.base))}
        onAddShape={(preset: ShapePreset) =>
          addLayer(createShapeLayer(preset, comp.base))
        }
        onExport={() => setExporting(true)}
        onClear={() => {
          setComp((c) => ({
            ...emptyComposition(),
            base: c.base,
            name: c.name,
          }));
          setSelected([]);
          clearComposition();
        }}
        layerCount={comp.layers.length}
      />

      <div className="flex min-h-0 flex-1 gap-3">
        <AssetPanel
          assets={assets}
          loading={loadingAssets}
          onAdd={(a) => addAsset(a)}
          onDelete={deleteAsset}
          onImport={importAssets}
          onSplitSheet={pickSheet}
        />

        <EditorCanvas
          layers={comp.layers}
          background={comp.background}
          width={comp.base.width}
          height={comp.base.height}
          images={images}
          selected={selected}
          onSelect={setSelected}
          onChange={updateLayer}
          onDropAsset={(path, at) => {
            const asset = assets.find((a) => a.path === path);
            if (asset) addAsset(asset, at);
          }}
        />

        <div className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto">
          <LayerList
            layers={comp.layers}
            selected={selected}
            onSelect={setSelected}
            onChange={updateLayer}
            onRaise={raiseLayer}
            onDelete={removeLayer}
            onDuplicate={duplicate}
            onMirror={mirror}
          />
          <Inspector
            layer={current}
            canvas={comp.base}
            onChange={updateLayer}
            onPickFont={() => current && setFontPickerFor(current.id)}
          />
        </div>
      </div>

      {sheetPath && (
        <SheetModal
          path={sheetPath}
          onClose={() => setSheetPath(null)}
          onError={(m) => onToast("error", m)}
          onDone={(added) => {
            setSheetPath(null);
            setAssets((prev) => [...added, ...prev]);
            onToast(
              "success",
              `${added.length} pièce(s) ajoutée(s) à la bibliothèque`,
            );
          }}
        />
      )}

      {exporting && (
        <ExportModal
          composition={comp}
          images={images}
          dir={projectAssetDir}
          destination={destination}
          onClose={() => setExporting(false)}
          onError={(m) => onToast("error", m)}
          onDone={(written) => {
            setExporting(false);
            onToast(
              "success",
              `${written.length} fichier(s) écrit(s) — ${basename(written[0]?.path ?? "")}`,
            );
            if (written[0]) onReveal(written[0].path);
          }}
        />
      )}

      {fontPickerFor && (
        <FontPicker
          library={fonts.library}
          project={fonts.project}
          picked={fonts.picked}
          dir={fonts.dir}
          value={
            comp.layers.find((l) => l.id === fontPickerFor)?.kind === "text"
              ? ((
                  comp.layers.find((l) => l.id === fontPickerFor) as {
                    fontPath: string | null;
                  }
                ).fontPath ?? "")
              : ""
          }
          caption={
            (
              comp.layers.find((l) => l.id === fontPickerFor) as {
                text?: string;
              }
            )?.text || "Votre titre"
          }
          onChoose={applyFont}
          onPickDir={fonts.pickDir}
          onPickFile={async () => {
            const file = await fonts.pickFile();
            if (file) await applyFont(file);
          }}
          onClose={() => setFontPickerFor(null)}
        />
      )}
    </div>
  );
}
