import type Konva from "konva";
import { forwardRef } from "react";
import { Layer as KonvaLayer, Rect, Stage } from "react-konva";
import type { Snap } from "../../lib/editor/layout";
import type { Background, Layer } from "../../lib/editor/types";
import { LayerNode } from "./LayerNode";

interface Props {
  layers: Layer[];
  background: Background;
  /** dimensions du canevas, dans ses propres unités */
  width: number;
  height: number;
  /** facteur d'affichage (1 à l'export : on rend à la taille réelle) */
  scale: number;
  images: Map<string, HTMLImageElement>;
  onSelect?: (id: string, additive: boolean) => void;
  onChange?: (layer: Layer) => void;
  onBackgroundClick?: () => void;
  onGuides?: (guides: Snap["guides"]) => void;
  registerNode?: (id: string, node: Konva.Node | null) => void;
  children?: React.ReactNode;
}

/** Deux points opposés d'un rectangle, pour un dégradé orienté. */
function gradientPoints(angle: number, w: number, h: number) {
  const rad = (angle * Math.PI) / 180;
  const dx = (Math.cos(rad) * w) / 2;
  const dy = (Math.sin(rad) * h) / 2;
  return {
    start: { x: w / 2 - dx, y: h / 2 - dy },
    end: { x: w / 2 + dx, y: h / 2 + dy },
  };
}

/** Rendu d'une composition. Le même composant sert à l'écran et à l'export :
 *  ce qui est exporté est donc, par construction, ce qui a été vu. */
export const CompositionStage = forwardRef<Konva.Stage, Props>(
  function CompositionStage(
    {
      layers,
      background,
      width,
      height,
      scale,
      images,
      onSelect,
      onChange,
      onBackgroundClick,
      onGuides,
      registerNode,
      children,
    },
    ref,
  ) {
    const g = gradientPoints(background.angle, width, height);
    // Portée de l'aimant : une dizaine de pixels À L'ÉCRAN, quel que soit le
    // zoom. Exprimée en unités du canevas, elle serait ridicule sur un plan de
    // travail en 2560 de large et envahissante sur une vignette.
    const snap = onGuides ? 10 / scale : 0;
    return (
      <Stage
        ref={ref}
        width={width * scale}
        height={height * scale}
        scaleX={scale}
        scaleY={scale}
        onMouseDown={(e) => {
          // un clic dans le vide désélectionne ; sur un calque, c'est le
          // calque qui a déjà intercepté l'événement.
          if (e.target === e.target.getStage()) onBackgroundClick?.();
        }}
      >
        <KonvaLayer>
          {background.on &&
            (background.kind === "linear" ? (
              <Rect
                x={0}
                y={0}
                width={width}
                height={height}
                fillLinearGradientStartPoint={g.start}
                fillLinearGradientEndPoint={g.end}
                fillLinearGradientColorStops={[
                  0,
                  background.colors[0],
                  1,
                  background.colors[1],
                ]}
                listening={false}
              />
            ) : (
              <Rect
                x={0}
                y={0}
                width={width}
                height={height}
                fill={background.colors[0]}
                listening={false}
              />
            ))}
          {layers.map((layer) => (
            <LayerNode
              key={layer.id}
              layer={layer}
              images={images}
              canvas={{ width, height }}
              snap={snap}
              onSelect={onSelect}
              onChange={onChange}
              onGuides={onGuides}
              registerNode={registerNode}
            />
          ))}
          {children}
        </KonvaLayer>
      </Stage>
    );
  },
);
