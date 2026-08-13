import type Konva from "konva";
import { useCallback, useEffect, useRef } from "react";
import { Rect, Transformer } from "react-konva";
import type { Brush, Tool } from "../../lib/pattern/draw";
import { isDrawTool } from "../../lib/pattern/draw";
import type { Pattern, PatternPiece } from "../../lib/pattern/types";
import { PatternStage } from "./PatternStage";
import { useCanvasFit } from "./useCanvasFit";
import { usePointerDraw } from "./usePointerDraw";

interface Props {
  pattern: Pattern;
  images: Map<string, HTMLImageElement>;
  selected: string[];
  onSelect: (ids: string[]) => void;
  onChange: (piece: PatternPiece) => void;
  onGesture: () => void;
  onDropAsset: (path: string, at: { x: number; y: number }) => void;
  /** outil courant et réglages du crayon */
  tool: Tool;
  brush: Brush;
  /** un tracé vient d'être terminé : à verser dans le document */
  onDraw: (piece: PatternPiece) => void;
}

/** Damier de transparence : sans lui, un fond éteint et un fond blanc se
 *  ressemblent, et on exporte un PNG opaque en croyant l'inverse. */
const CHECKER =
  "repeating-conic-gradient(#3a3a42 0% 25%, #2c2c33 0% 50%) 50% / 20px 20px";

/** La tuile seule, manipulable, avec ses limites matérialisées.
 *
 *  Le cadre n'est pas décoratif : c'est la seule chose qui dise où passe la
 *  couture. Une pièce à cheval dessus est le cas NORMAL, et voir la ligne la
 *  traverser est ce qui permet de comprendre pourquoi la moitié manquante
 *  apparaît de l'autre côté. */
export function PatternCanvas({
  pattern,
  images,
  selected,
  onSelect,
  onChange,
  onGesture,
  onDropAsset,
  tool,
  brush,
  onDraw,
}: Props) {
  const trRef = useRef<Konva.Transformer | null>(null);
  const nodes = useRef(new Map<string, Konva.Node>());

  const { tile } = pattern;
  const dessin = isDrawTool(tool);
  const trace = usePointerDraw(tool, brush);
  // Maj sert deux fois : elle fait grandir une pièce depuis son centre, et elle
  // contraint un tracé. Même touche que dans l'Atelier — Alt, l'équivalent
  // natif de Konva, est happée par le gestionnaire de fenêtres sous KDE.
  const { ref: boxRef, scale, shift } = useCanvasFit(tile);

  const registerNode = useCallback((id: string, node: Konva.Node | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  }, []);

  // Le Transformer se branche impérativement sur les nœuds sélectionnés.
  // `pattern.pieces` et `images` ne sont pas lus ici mais doivent déclencher
  // l'effet : tous deux font apparaître ou disparaître des nœuds — une pièce
  // dont les pixels viennent d'arriver rendrait sinon sans ses poignées, et
  // paraîtrait impossible à redimensionner.
  // biome-ignore lint/correctness/useExhaustiveDependencies: signaux de montage/démontage des nœuds
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    tr.nodes(
      selected
        .map((id) => nodes.current.get(id))
        .filter((n): n is Konva.Node => Boolean(n)),
    );
    tr.getLayer()?.batchDraw();
  }, [selected, pattern.pieces, images]);

  /** Point du pointeur, en fraction de tuile.
   *
   *  On mesure sur la BOÎTE de la tuile plutôt que sur le conteneur : celle-ci
   *  est centrée dans l'espace disponible, et ignorer la marge ferait dessiner
   *  à côté du curseur dès que la fenêtre n'a pas le rapport de la tuile. */
  const pointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
    };
  }, []);

  const handleSelect = useCallback(
    (id: string, additive: boolean) => {
      if (!additive) {
        onSelect([id]);
        return;
      }
      onSelect(
        selected.includes(id)
          ? selected.filter((s) => s !== id)
          : [...selected, id],
      );
    },
    [onSelect, selected],
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: cible de dépôt ; la bibliothèque pose aussi au clic, accessible au clavier
    <div
      ref={boxRef}
      className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-panel p-4"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        const path = e.dataTransfer.getData("imagehub/asset");
        if (!path || scale <= 0) return;
        // le point de dépôt est en pixels d'écran : on le ramène en fraction de
        // tuile, la seule unité que connaisse le modèle
        const stageBox = e.currentTarget.getBoundingClientRect();
        const offX = (stageBox.width - tile.width * scale) / 2;
        const offY = (stageBox.height - tile.height * scale) / 2;
        onDropAsset(path, {
          x: (e.clientX - stageBox.left - offX) / scale / tile.width,
          y: (e.clientY - stageBox.top - offY) / scale / tile.height,
        });
      }}
    >
      {scale > 0 && (
        <div
          className="relative shadow-2xl"
          style={{
            width: tile.width * scale,
            height: tile.height * scale,
            background: CHECKER,
            cursor: dessin ? "crosshair" : undefined,
            // pendant un tracé, le pointeur reste capté même s'il sort du
            // cadre : on dessine volontiers au-delà du bord, c'est justement ce
            // qui fait le raccord
            touchAction: dessin ? "none" : undefined,
          }}
          onPointerDown={(e) => {
            if (!dessin) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            onSelect([]);
            trace.start(pointer(e), e.shiftKey);
          }}
          onPointerMove={(e) => {
            if (dessin) trace.move(pointer(e), e.shiftKey || shift);
          }}
          onPointerUp={(e) => {
            if (!dessin) return;
            e.currentTarget.releasePointerCapture(e.pointerId);
            const piece = trace.end();
            if (piece) onDraw(piece);
          }}
          onPointerCancel={trace.cancel}
        >
          <PatternStage
            pattern={pattern}
            images={images}
            scale={scale}
            draft={trace.draft}
            onSelect={dessin ? undefined : handleSelect}
            onChange={dessin ? undefined : onChange}
            onGesture={onGesture}
            onBackgroundClick={() => onSelect([])}
            registerNode={registerNode}
          >
            {/* les limites de la tuile, par-dessus tout le reste */}
            <Rect
              x={0}
              y={0}
              width={tile.width}
              height={tile.height}
              stroke="#7c5cff"
              strokeWidth={1 / scale}
              dash={[8 / scale, 6 / scale]}
              listening={false}
            />
            {/* Les poignées disparaissent dès qu'un outil de dessin est en
                main : elles interceptent les clics là où l'on veut tracer, et
                une sélection qu'on ne peut plus manipuler n'a rien à annoncer. */}
            <Transformer
              ref={trRef}
              visible={!dessin}
              rotateEnabled
              // les poignées d'angle tiennent le rapport ; les poignées de côté
              // étirent un seul axe — c'est ce qu'on vient y chercher
              keepRatio
              centeredScaling={shift}
              flipEnabled={false}
              anchorSize={8 / scale}
              anchorStroke="#7c5cff"
              anchorFill="#ffffff"
              borderStroke="#7c5cff"
              borderStrokeWidth={1.5 / scale}
              rotateAnchorOffset={24 / scale}
              boundBoxFunc={(oldBox, newBox) =>
                // en dessous de quelques pixels, une pièce n'est plus
                // manipulable : on refuse la réduction plutôt que de la perdre
                newBox.width < 8 || newBox.height < 8 ? oldBox : newBox
              }
            />
          </PatternStage>
        </div>
      )}

      {(selected.length > 0 || dessin) && (
        <p
          className={`pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-1 text-[10px] transition-colors ${
            shift ? "bg-accent-soft text-zinc-100" : "bg-black/40 text-zinc-500"
          }`}
        >
          {dessin ? (
            <>
              Déborder est voulu — le trait ressort de l'autre côté
              {/* Le crayon ne fait RIEN de Maj : annoncer un raccourci qui
                  n'existe pas est pire que de n'en annoncer aucun. */}
              {tool === "line" && (
                <>
                  {" "}
                  · <kbd>Maj</kbd> : angles à 15°
                </>
              )}
              {tool !== "line" && tool !== "pencil" && (
                <>
                  {" "}
                  · <kbd>Maj</kbd> : forme régulière
                </>
              )}
            </>
          ) : (
            <>
              Déborder est voulu · <kbd>Maj</kbd> : depuis le centre · flèches :
              déplacer
            </>
          )}
        </p>
      )}
    </div>
  );
}
