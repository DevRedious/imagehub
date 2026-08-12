import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createCenteredImageLayer,
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
  autoName,
  loadComposition,
  newPage,
  pageLabel,
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
import { Modal } from "../Modal";
import type { ToastKind } from "../Toaster";
import { AssetPanel } from "./AssetPanel";
import { EditorCanvas } from "./EditorCanvas";
import { EditorToolbar } from "./EditorToolbar";
import { ExportModal } from "./ExportModal";
import { Inspector } from "./Inspector";
import { LayerList } from "./LayerList";
import { PageStrip } from "./PageStrip";
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
  /** vidage complet en attente de confirmation : la bibliothèque est un
   *  travail de découpe, on ne l'efface pas sur un clic malheureux */
  const [confirmClear, setConfirmClear] = useState(false);

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

  /** Page en cours. Retomber sur la première plutôt que de rendre du vide :
   *  un identifiant orphelin (page supprimée, reprise d'une session
   *  antérieure) ne doit pas laisser l'éditeur sans plan de travail. */
  const page = useMemo(
    () => comp.pages.find((p) => p.id === comp.activePageId) ?? comp.pages[0],
    [comp.pages, comp.activePageId],
  );

  /** Toutes les images du document, pas seulement celles de la page ouverte :
   *  changer de page devient instantané, et l'export ne part jamais sur une
   *  page dont les pixels ne sont pas encore lus. */
  const paths = useMemo(
    () =>
      comp.pages.flatMap((p) =>
        p.layers.flatMap((l) => (l.kind === "image" ? [l.src] : [])),
      ),
    [comp.pages],
  );
  const images = useImages(paths);

  /* ---------- calques (sur la page ouverte) ---------- */

  /** Toute modification de calque passe par ici : elle ne touche que la page
   *  active, les autres restent intactes. */
  const editPage = useCallback(
    (fn: (layers: Layer[], c: Composition) => Layer[]) => {
      setComp((c) => ({
        ...c,
        pages: c.pages.map((p) =>
          p.id === c.activePageId ? { ...p, layers: fn(p.layers, c) } : p,
        ),
      }));
    },
    [],
  );

  const updateLayer = useCallback(
    (next: Layer) => {
      editPage((layers, c) =>
        layers.map((l) =>
          l.id !== next.id
            ? l
            : // l'ancrage suit le calque tant qu'on ne l'a pas figé à la main
              next.anchorAuto
              ? { ...next, anchor: deriveAnchor(next.x, next.y, c.base) }
              : next,
        ),
      );
    },
    [editPage],
  );

  const addLayer = useCallback(
    (layer: Layer) => {
      editPage((layers) => [...layers, layer]);
      setSelected([layer.id]);
    },
    [editPage],
  );

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

  const removeLayer = useCallback(
    (id: string) => {
      editPage((layers) => layers.filter((l) => l.id !== id));
      setSelected((sel) => sel.filter((x) => x !== id));
    },
    [editPage],
  );

  /** Monte ou descend un calque d'un cran dans la pile de dessin. */
  const raiseLayer = useCallback(
    (id: string, delta: number) => {
      editPage((layers) => {
        const i = layers.findIndex((l) => l.id === id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= layers.length) return layers;
        const next = [...layers];
        [next[i], next[j]] = [next[j], next[i]];
        return next;
      });
    },
    [editPage],
  );

  const duplicate = useCallback(
    (id: string) => {
      const src = page?.layers.find((l) => l.id === id);
      if (src) addLayer(duplicateLayer(src, comp.base));
    },
    [page, comp.base, addLayer],
  );

  const mirror = useCallback(
    (id: string) => {
      const src = page?.layers.find((l) => l.id === id);
      if (src) addLayer(mirrorLayer(src, comp.base));
    },
    [page, comp.base, addLayer],
  );

  /* ---------- pages ---------- */

  const addPage = useCallback(() => {
    setComp((c) => {
      const created = newPage(autoName(c.pages.length));
      return { ...c, pages: [...c.pages, created], activePageId: created.id };
    });
    setSelected([]);
  }, []);

  const duplicatePage = useCallback((id: string) => {
    setComp((c) => {
      const src = c.pages.find((p) => p.id === id);
      if (!src) return c;
      const at = c.pages.findIndex((p) => p.id === id);
      // les calques sont recopiés avec de NOUVEAUX identifiants : deux pages
      // qui partageraient les mêmes ferait bouger l'une en éditant l'autre.
      // La copie d'une page anonyme prend le numéro de sa nouvelle place ;
      // seule une page nommée à la main mérite qu'on traîne un « (copie) ».
      const copy = newPage(
        pageLabel(src.name, at) === autoName(at)
          ? autoName(at + 1)
          : `${src.name} (copie)`,
        src.layers.map((l) => ({ ...l, id: crypto.randomUUID() })),
      );
      const pages = [...c.pages];
      pages.splice(at + 1, 0, copy);
      return { ...c, pages, activePageId: copy.id };
    });
    setSelected([]);
  }, []);

  const deletePage = useCallback((id: string) => {
    setComp((c) => {
      if (c.pages.length <= 1) return c;
      const at = c.pages.findIndex((p) => p.id === id);
      const pages = c.pages.filter((p) => p.id !== id);
      const fallback = pages[Math.min(at, pages.length - 1)];
      return {
        ...c,
        pages,
        activePageId: c.activePageId === id ? fallback.id : c.activePageId,
      };
    });
    setSelected([]);
  }, []);

  const renamePage = useCallback((id: string, name: string) => {
    setComp((c) => ({
      ...c,
      pages: c.pages.map((p) => (p.id === id ? { ...p, name } : p)),
    }));
  }, []);

  const movePage = useCallback((id: string, delta: number) => {
    setComp((c) => {
      const i = c.pages.findIndex((p) => p.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= c.pages.length) return c;
      const pages = [...c.pages];
      [pages[i], pages[j]] = [pages[j], pages[i]];
      return { ...c, pages };
    });
  }, []);

  /** Transforme un lot de pièces en autant de pages, chacune portant son
   *  élément centré. C'est la suite naturelle d'une découpe de planche : huit
   *  visuels donnent huit pages, et l'export en sort huit fichiers propres. */
  const pagesFromAssets = useCallback((added: Asset[]) => {
    if (added.length === 0) return;
    setComp((c) => {
      // Un document encore vierge (une seule page, sans calque) est remplacé
      // plutôt que gardé en tête : sinon la première page resterait blanche
      // et polluerait l'export.
      const vierge = c.pages.length === 1 && c.pages[0].layers.length === 0;
      const first = vierge ? 0 : c.pages.length;
      // La page prend son NUMÉRO, pas le nom du fichier découpé : « Page 4 »
      // se lit sur un onglet, « chatgpt-image-12-aout-2026-3 » non. Le nom de
      // la pièce reste sur son calque, où il sert encore à quelque chose.
      const created = added.map((a, i) =>
        newPage(autoName(first + i), [
          createCenteredImageLayer(
            a.path,
            a.name,
            { width: a.width ?? 512, height: a.height ?? 512 },
            c.base,
          ),
        ]),
      );
      return {
        ...c,
        pages: vierge ? created : [...c.pages, ...created],
        activePageId: created[0].id,
      };
    });
    setSelected([]);
  }, []);

  const selectPage = useCallback((id: string) => {
    setComp((c) => ({ ...c, activePageId: id }));
    setSelected([]);
  }, []);

  /* ---------- plan de travail ---------- */

  /** Changer de plan de travail ne recommence pas la composition : TOUTES les
   *  pages sont transposées dans le nouveau format, ancrages compris. C'est la
   *  même opération que l'export multi-formats, appliquée à l'écran. */
  const changeBase = useCallback((id: string) => {
    const f = formatById(id);
    if (!f) return;
    setComp((c) => ({
      ...c,
      base: { width: f.width, height: f.height },
      pages: c.pages.map((p) => ({
        ...p,
        layers: relayoutAll(p.layers, c.base, f),
      })),
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

  const clearLibrary = useCallback(async () => {
    setConfirmClear(false);
    if (assets.length === 0) return;
    try {
      await libraryDelete(assets.map((a) => a.path));
      setAssets([]);
      onToast("info", "Bibliothèque vidée");
    } catch (e) {
      onToast("error", String(e));
    }
  }, [assets, onToast]);

  /* ---------- polices ---------- */

  const applyFont = useCallback(
    async (file: FontFile | null) => {
      const id = fontPickerFor;
      setFontPickerFor(null);
      if (!id) return;
      const layer = page?.layers.find((l) => l.id === id);
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
    [fontPickerFor, page, updateLayer, onToast],
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
      ? (page?.layers.find((l) => l.id === selected[0]) ?? null)
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
          // uniquement la page ouverte : effacer les autres au passage serait
          // une perte silencieuse, et le bouton siège parmi les outils de
          // calque, pas parmi ceux du document.
          editPage(() => []);
          setSelected([]);
        }}
        layerCount={page?.layers.length ?? 0}
      />

      <div className="flex min-h-0 flex-1 gap-3">
        <AssetPanel
          assets={assets}
          loading={loadingAssets}
          onAdd={(a) => addAsset(a)}
          onDelete={deleteAsset}
          onImport={importAssets}
          onSplitSheet={pickSheet}
          onClear={() => setConfirmClear(true)}
        />

        <EditorCanvas
          layers={page?.layers ?? []}
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
            layers={page?.layers ?? []}
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

      <PageStrip
        pages={comp.pages}
        activeId={page?.id ?? ""}
        onSelect={selectPage}
        onAdd={addPage}
        onDuplicate={duplicatePage}
        onDelete={deletePage}
        onRename={renamePage}
        onMove={movePage}
      />

      {confirmClear && (
        <Modal>
          <h2 className="text-sm font-semibold text-zinc-200">
            Vider la bibliothèque ?
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-zinc-400">
            Les {assets.length} pièces seront supprimées du disque. Les
            compositions qui les utilisent perdront leurs images.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="cursor-pointer rounded-lg px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={clearLibrary}
              className="cursor-pointer rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              Tout retirer
            </button>
          </div>
        </Modal>
      )}

      {sheetPath && (
        <SheetModal
          path={sheetPath}
          onClose={() => setSheetPath(null)}
          onError={(m) => onToast("error", m)}
          onDone={(added, perPage) => {
            setSheetPath(null);
            setAssets((prev) => [...added, ...prev]);
            if (perPage) pagesFromAssets(added);
            onToast(
              "success",
              perPage
                ? `${added.length} pièce(s) — autant de pages créées`
                : `${added.length} pièce(s) ajoutée(s) à la bibliothèque`,
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
            page?.layers.find((l) => l.id === fontPickerFor)?.kind === "text"
              ? ((
                  page?.layers.find((l) => l.id === fontPickerFor) as {
                    fontPath: string | null;
                  }
                ).fontPath ?? "")
              : ""
          }
          caption={
            (
              page?.layers.find((l) => l.id === fontPickerFor) as {
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
