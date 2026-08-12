import type Konva from "konva";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Transformer } from "react-konva";
import type { Background, Layer } from "../../lib/editor/types";
import { CompositionStage } from "./CompositionStage";

interface Props {
  layers: Layer[];
  background: Background;
  width: number;
  height: number;
  images: Map<string, HTMLImageElement>;
  selected: string[];
  onSelect: (ids: string[]) => void;
  onChange: (layer: Layer) => void;
  onDropAsset: (path: string, at: { x: number; y: number }) => void;
}

/** Damier de transparence : sans lui, un fond éteint et un fond blanc se
 *  ressemblent, et on exporte un PNG opaque en croyant l'inverse. */
const CHECKER =
  "repeating-conic-gradient(#3a3a42 0% 25%, #2c2c33 0% 50%) 50% / 20px 20px";

export function EditorCanvas({
  layers,
  background,
  width,
  height,
  images,
  selected,
  onSelect,
  onChange,
  onDropAsset,
}: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const trRef = useRef<Konva.Transformer | null>(null);
  const nodes = useRef(new Map<string, Konva.Node>());
  const [box, setBox] = useState({ w: 0, h: 0 });

  // le canevas occupe la place disponible : on la mesure plutôt que de la
  // supposer, sinon replier la sidebar laisse une composition mal cadrée.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale =
    box.w > 0 && box.h > 0 ? Math.min(box.w / width, box.h / height) : 0;

  const registerNode = useCallback((id: string, node: Konva.Node | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  }, []);

  // Le Transformer se branche impérativement sur les nœuds sélectionnés.
  // `layers` et `images` ne sont pas lus dans l'effet mais doivent le
  // déclencher, car tous deux font apparaître ou disparaître des nœuds :
  //  — un calque remonté dans la pile est démonté puis remonté, et le
  //    Transformer resterait accroché à un nœud mort ;
  //  — une image tout juste posée ne rend RIEN tant que ses pixels ne sont
  //    pas lus. Sans ce réveil, la pièce apparaît sans ses poignées et
  //    paraît impossible à redimensionner.
  // biome-ignore lint/correctness/useExhaustiveDependencies: signaux de montage/démontage des nœuds
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const picked = selected
      .map((id) => nodes.current.get(id))
      .filter((n): n is Konva.Node => Boolean(n));
    tr.nodes(picked);
    tr.getLayer()?.batchDraw();
  }, [selected, layers, images]);

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
        // le point de dépôt est en pixels d'écran : on le ramène dans les
        // unités du canevas, sinon la pièce atterrit n'importe où dès que
        // l'aperçu n'est pas à l'échelle 1.
        const stageBox = e.currentTarget.getBoundingClientRect();
        const offX = (stageBox.width - width * scale) / 2;
        const offY = (stageBox.height - height * scale) / 2;
        onDropAsset(path, {
          x: (e.clientX - stageBox.left - offX) / scale,
          y: (e.clientY - stageBox.top - offY) / scale,
        });
      }}
    >
      {scale > 0 && (
        <div
          className="relative shadow-2xl"
          style={{
            width: width * scale,
            height: height * scale,
            background: CHECKER,
          }}
        >
          <CompositionStage
            layers={layers}
            background={background}
            width={width}
            height={height}
            scale={scale}
            images={images}
            onSelect={handleSelect}
            onChange={onChange}
            onBackgroundClick={() => onSelect([])}
            registerNode={registerNode}
          >
            <Transformer
              ref={trRef}
              rotateEnabled
              keepRatio
              flipEnabled={false}
              anchorSize={8 / scale}
              anchorStroke="#7c5cff"
              anchorFill="#ffffff"
              borderStroke="#7c5cff"
              borderStrokeWidth={1.5 / scale}
              rotateAnchorOffset={24 / scale}
              // en dessous de quelques pixels, un calque n'est plus
              // manipulable : on refuse la réduction plutôt que de le perdre
              boundBoxFunc={(oldBox, newBox) =>
                newBox.width < 8 || newBox.height < 8 ? oldBox : newBox
              }
            />
          </CompositionStage>
        </div>
      )}
    </div>
  );
}
