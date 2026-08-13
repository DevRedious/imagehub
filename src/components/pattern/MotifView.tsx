import { useEffect, useMemo, useState } from "react";
import type { ToolsStatus } from "../../lib/actions";
import { useImages } from "../../lib/editor/useImages";
import type { Written } from "../../lib/library";
import { basename } from "../../lib/paths";
import { patternDir } from "../../lib/pattern/api";
import { type Brush, DEFAULT_BRUSH, type Tool } from "../../lib/pattern/draw";
import { usePatternHistory } from "../../lib/pattern/history";
import { loadPattern, savePattern } from "../../lib/pattern/store";
import { AssetPanel } from "../editor/AssetPanel";
import { SheetModal } from "../editor/SheetModal";
import { Modal } from "../Modal";
import type { ToastKind } from "../Toaster";
import { DrawToolbar } from "./DrawToolbar";
import { OpenPatternModal } from "./OpenPatternModal";
import { PatternCanvas } from "./PatternCanvas";
import { PatternExportModal } from "./PatternExportModal";
import { PatternToolbar, type PreviewMode } from "./PatternToolbar";
import { PieceInspector } from "./PieceInspector";
import { PieceList } from "./PieceList";
import { RepeatPreview } from "./RepeatPreview";
import { ScatterModal } from "./ScatterModal";
import { useAssetLibrary } from "./useAssetLibrary";
import { usePatternDocument } from "./usePatternDocument";
import { usePatternShortcuts } from "./usePatternShortcuts";

interface Props {
  /** dossier d'assets du projet connecté, visé à l'export (null = dépôt) */
  projectAssetDir: string | null;
  /** moteurs CLI disponibles : conditionnent l'AVIF (avifenc) et le rendu des
   *  éléments SVG (inkscape) */
  tools: ToolsStatus | null;
  onReveal: (path: string) => void;
  onToast: (kind: ToastKind, message: string) => void;
}

/** Le générateur de motifs raccordables.
 *
 *  Une vue à part, et pas un onglet de l'Atelier : celui-ci raisonne en pages,
 *  formats et ancrages — un cadre fini, dont on décline le cadrage. Une tuile
 *  de motif est un TORE : il n'y a ni bord ni cadrage, les ancrages n'y veulent
 *  rien dire, et ce qui déborde n'est pas à recadrer mais à reporter de l'autre
 *  côté. Deux modèles mentaux opposés dans une même vue auraient fait de chaque
 *  réglage un cas particulier.
 *
 *  Ce qui est partagé l'est vraiment : la bibliothèque d'éléments, la découpe
 *  de planches, le sélecteur de couleur, les briques de l'inspecteur et le
 *  dépôt du Studio.
 *
 *  Ce fichier ne fait plus que DISPOSER : les mutations du document vivent dans
 *  `usePatternDocument`, le stock de pièces dans `useAssetLibrary`, le clavier
 *  dans `usePatternShortcuts`. */
export function MotifView({
  projectAssetDir,
  tools,
  onReveal,
  onToast,
}: Props) {
  const history = usePatternHistory(loadPattern);
  const { pattern, setPattern, commit, undo, canUndo, replace } = history;
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<PreviewMode>("tile");
  const [tool, setTool] = useState<Tool>("select");
  const [brush, setBrush] = useState<Brush>(DEFAULT_BRUSH);
  const [zoom, setZoom] = useState(160);
  const [exporting, setExporting] = useState(false);
  const [scattering, setScattering] = useState(false);
  const [opening, setOpening] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [depot, setDepot] = useState("");

  const library = useAssetLibrary(onToast);
  const doc = usePatternDocument({ history, setSelected, onToast });

  // reprise de la session précédente
  useEffect(() => {
    savePattern(pattern);
  }, [pattern]);

  useEffect(() => {
    patternDir()
      .then(setDepot)
      .catch(() => {});
  }, []);

  // seules les pièces IMAGE ont des pixels à lire ; un tracé se dessine
  const paths = useMemo(
    () => pattern.pieces.flatMap((p) => (p.kind === "image" ? [p.src] : [])),
    [pattern.pieces],
  );
  const images = useImages(paths);

  usePatternShortcuts({
    selected,
    setSelected,
    setTool,
    setPattern,
    commit,
    undo,
    removePieces: doc.removePieces,
    duplicatePieces: doc.duplicatePieces,
  });

  const current =
    selected.length === 1
      ? (pattern.pieces.find((p) => p.id === selected[0]) ?? null)
      : null;

  return (
    <div className="flex min-h-0 flex-col gap-3" style={{ height: "78vh" }}>
      <PatternToolbar
        pattern={pattern}
        onTile={doc.setTile}
        onBackground={doc.setBackground}
        mode={mode}
        onMode={setMode}
        zoom={zoom}
        onZoom={setZoom}
        onScatter={() => setScattering(true)}
        onExport={() => setExporting(true)}
        onSave={doc.save}
        onOpen={() => setOpening(true)}
        onUndo={undo}
        canUndo={canUndo}
        pieceCount={pattern.pieces.length}
      />

      <DrawToolbar
        tool={tool}
        onTool={setTool}
        brush={brush}
        onBrush={setBrush}
      />

      <div className="flex min-h-0 flex-1 gap-3">
        <AssetPanel
          assets={library.assets}
          loading={library.loading}
          onAdd={(a) => doc.addAsset(a)}
          onDelete={library.deleteAsset}
          onImport={library.importAssets}
          onSplitSheet={library.pickSheet}
          onClear={() => setConfirmClear(true)}
        />

        {mode === "tile" ? (
          <PatternCanvas
            pattern={pattern}
            images={images}
            selected={selected}
            onSelect={setSelected}
            onChange={doc.updatePiece}
            onGesture={commit}
            onDropAsset={(path, at) => {
              const asset = library.assets.find((a) => a.path === path);
              if (asset) doc.addAsset(asset, at);
            }}
            tool={tool}
            brush={brush}
            onDraw={doc.addDrawn}
          />
        ) : (
          <div className="min-h-0 flex-1 rounded-xl bg-panel p-4">
            <RepeatPreview
              pattern={pattern}
              images={images}
              cell={zoom}
              className="h-full w-full"
            />
          </div>
        )}

        <div className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto">
          {/* La répétition reste sous les yeux pendant qu'on compose : une
              tuile isolée ne dit rien de sa qualité, c'est la répétition qui
              révèle les coutures et les alignements involontaires. */}
          {mode === "tile" && (
            <div>
              <h3 className="px-0.5 pb-2 text-xs font-semibold tracking-wider text-zinc-600">
                RÉPÉTITION
              </h3>
              <RepeatPreview
                pattern={pattern}
                images={images}
                cell={80}
                className="h-40 w-full"
              />
            </div>
          )}
          <PieceList
            pieces={pattern.pieces}
            selected={selected}
            onSelect={setSelected}
            onChange={doc.updatePiece}
            onRaise={doc.raisePiece}
            onDelete={(id) => doc.removePieces([id])}
            onDuplicate={(id) => doc.duplicatePieces([id])}
          />
          <PieceInspector
            piece={current}
            onChange={(next) => {
              commit();
              doc.updatePiece(next);
            }}
          />
        </div>
      </div>

      {confirmClear && (
        <Modal>
          <h2 className="text-sm font-semibold text-zinc-200">
            Vider la bibliothèque ?
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-zinc-400">
            Les {library.assets.length} pièces seront supprimées du disque. Les
            motifs qui les utilisent perdront leurs images.
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
              onClick={() => {
                setConfirmClear(false);
                library.clear();
              }}
              className="cursor-pointer rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              Tout retirer
            </button>
          </div>
        </Modal>
      )}

      {library.sheetPath && (
        <SheetModal
          path={library.sheetPath}
          onClose={() => library.setSheetPath(null)}
          onError={(m) => onToast("error", m)}
          onDone={(added) => {
            library.setSheetPath(null);
            library.push(added);
            onToast("success", `${added.length} pièce(s) ajoutée(s)`);
          }}
        />
      )}

      {scattering && (
        <ScatterModal
          sources={library.assets}
          seed={pattern.seed}
          onClose={() => setScattering(false)}
          onApply={(settings, seed, remplacer) => {
            setScattering(false);
            doc.applyScatter(settings, seed, remplacer, library.assets);
          }}
        />
      )}

      {opening && (
        <OpenPatternModal
          onClose={() => setOpening(false)}
          onOpen={(next) => {
            setOpening(false);
            replace(next);
            setSelected([]);
          }}
          onError={(m) => onToast("error", m)}
        />
      )}

      {exporting && (
        <PatternExportModal
          pattern={pattern}
          dir={projectAssetDir}
          destination={projectAssetDir ?? depot}
          tools={tools}
          onClose={() => setExporting(false)}
          onDone={(written: Written[]) => {
            setExporting(false);
            onToast(
              "success",
              `${written.length} fichier(s) écrit(s) — ${basename(written[0]?.path ?? "")}`,
            );
            if (written[0]) onReveal(written[0].path);
          }}
          onError={(m) => onToast("error", m)}
        />
      )}
    </div>
  );
}
