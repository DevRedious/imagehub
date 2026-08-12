import type Konva from "konva";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Line, Transformer } from "react-konva";
import { type Snap, snapResize } from "../../lib/editor/layout";
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
  const [centered, setCentered] = useState(false);
  const [guides, setGuides] = useState<Snap["guides"]>({ x: null, y: null });

  /** L'aimant appelle à chaque pixel parcouru : on ne réveille React que
   *  lorsque le repère CHANGE, sinon un simple déplacement redessinerait la
   *  scène des dizaines de fois pour rien. */
  const showGuides = useCallback((next: Snap["guides"]) => {
    setGuides((cur) =>
      cur.x === next.x && cur.y === next.y ? cur : { ...next },
    );
  }, []);

  /** Maj enfoncée : le calque grandit et rétrécit autour de son centre.
   *
   *  Sans elle, tirer une poignée fixe le coin opposé — la pièce grossit bien,
   *  mais elle GLISSE, et on repositionne à la main après chaque essai. Konva
   *  offre déjà ce mode sous Alt ; Maj le double parce que c'est la touche que
   *  tout le monde essaie, et parce qu'Alt est happée par le gestionnaire de
   *  fenêtres sous KDE, où elle déplace la fenêtre entière.
   *
   *  L'attribut est lu à chaque déplacement de souris : le régler en cours de
   *  geste prend effet immédiatement, sans relâcher le bouton. */
  useEffect(() => {
    const sync = (e: KeyboardEvent) => setCentered(e.shiftKey);
    // une fenêtre qui perd le focus ne verra jamais le relâchement : sans ce
    // filet, Maj resterait « enfoncée » indéfiniment après un Alt+Tab.
    const release = () => setCentered(false);
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
      window.removeEventListener("blur", release);
    };
  }, []);

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
            onGuides={showGuides}
            registerNode={registerNode}
          >
            {/* Repères de l'aimant : ils n'apparaissent que le temps où la
                pièce est effectivement accrochée, sinon ce sont des lignes de
                plus à ignorer en permanence. */}
            {guides.x !== null && (
              <Line
                points={[guides.x, 0, guides.x, height]}
                stroke="#ff4d6d"
                strokeWidth={1 / scale}
                dash={[6 / scale, 6 / scale]}
                listening={false}
              />
            )}
            {guides.y !== null && (
              <Line
                points={[0, guides.y, width, guides.y]}
                stroke="#ff4d6d"
                strokeWidth={1 / scale}
                dash={[6 / scale, 6 / scale]}
                listening={false}
              />
            )}
            <Transformer
              ref={trRef}
              rotateEnabled
              // les poignées d'angle tiennent le rapport largeur/hauteur ; les
              // poignées de côté, elles, étirent un seul axe — c'est ce qu'on
              // vient y chercher.
              keepRatio
              centeredScaling={centered}
              flipEnabled={false}
              anchorSize={8 / scale}
              anchorStroke="#7c5cff"
              anchorFill="#ffffff"
              borderStroke="#7c5cff"
              borderStrokeWidth={1.5 / scale}
              rotateAnchorOffset={24 / scale}
              onTransformEnd={() => showGuides({ x: null, y: null })}
              // Konva livre la boîte en pixels d'écran ; l'aimant, lui, parle
              // en unités du canevas — celles où « le bord » veut dire quelque
              // chose. D'où l'aller-retour par l'échelle d'affichage.
              boundBoxFunc={(oldBox, newBox) => {
                // en dessous de quelques pixels, un calque n'est plus
                // manipulable : on refuse la réduction plutôt que de le perdre
                if (newBox.width < 8 || newBox.height < 8) return oldBox;
                if (newBox.rotation !== 0) return newBox;
                const vers = (b: typeof newBox) => ({
                  x: b.x / scale,
                  y: b.y / scale,
                  width: b.width / scale,
                  height: b.height / scale,
                });
                const { box, guides: g } = snapResize(
                  vers(oldBox),
                  vers(newBox),
                  { width, height },
                  10 / scale,
                );
                showGuides(g);
                return {
                  x: box.x * scale,
                  y: box.y * scale,
                  width: box.width * scale,
                  height: box.height * scale,
                  rotation: newBox.rotation,
                };
              }}
            />
          </CompositionStage>
        </div>
      )}

      {/* Un raccourci que rien n'annonce n'existe pas : le rappel ne s'affiche
          qu'avec une sélection, et s'allume quand la touche est tenue. */}
      {selected.length > 0 && (
        <p
          className={`pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-1 text-[10px] transition-colors ${
            centered
              ? "bg-accent-soft text-zinc-100"
              : "bg-black/40 text-zinc-500"
          }`}
        >
          Coins : proportions tenues · <kbd>Maj</kbd> : depuis le centre
        </p>
      )}
    </div>
  );
}
