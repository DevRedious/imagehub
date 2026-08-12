import Konva from "konva";
import type { Filter } from "konva/lib/Node";
import { useCallback, useEffect, useState } from "react";
import { Ellipse, Image as KonvaImage, Rect, Text } from "react-konva";
import type { Layer } from "../../lib/editor/types";

interface Props {
  layer: Layer;
  images: Map<string, HTMLImageElement>;
  /** absent en export : rien n'est ni sélectionnable ni déplaçable */
  onSelect?: (id: string, additive: boolean) => void;
  onChange?: (layer: Layer) => void;
  registerNode?: (id: string, node: Konva.Node | null) => void;
}

/** Les filtres Konva ne s'appliquent qu'à un nœud MIS EN CACHE : sans appel à
 *  `cache()`, régler un flou ou une teinte ne produit rigoureusement rien. Et
 *  le cache doit être refait dès que la géométrie ou un réglage change, sinon
 *  l'écran garde l'image précédente.
 *
 *  Le `offset` n'est pas décoratif : le cache est un rendu hors écran aux
 *  dimensions du nœud, et un flou déborde de ces dimensions. Sans marge, le
 *  halo serait tranché net au ras de la forme. */
function useFilterCache(
  node: Konva.Node | null,
  layer: Layer,
  loaded: boolean,
): void {
  const active = layer.blur > 0 || layer.recolor.on;
  // les réglages de recoloration ne sont pas lus ici : ils sont passés en
  // attributs au nœud, et c'est le CACHE qu'il faut refaire quand ils bougent.
  // Sans eux dans la liste, tourner la teinte ne changerait rien à l'écran.
  // biome-ignore lint/correctness/useExhaustiveDependencies: réglages déclencheurs du recalcul de cache
  useEffect(() => {
    if (!node) return;
    if (!active || !loaded || layer.width < 1 || layer.height < 1) {
      node.clearCache();
      node.getLayer()?.batchDraw();
      return;
    }
    const margin = Math.ceil(layer.blur * 2) + 2;
    node.cache({ offset: margin, pixelRatio: 1 });
    node.getLayer()?.batchDraw();
  }, [
    node,
    active,
    loaded,
    layer.width,
    layer.height,
    layer.blur,
    layer.recolor.on,
    layer.recolor.hue,
    layer.recolor.saturation,
    layer.recolor.luminance,
  ]);
}

export function LayerNode({
  layer,
  images,
  onSelect,
  onChange,
  registerNode,
}: Props) {
  // une `ref` ne déclenche pas de rendu : sans état, l'effet de cache ne
  // verrait jamais le nœud arriver et aucun filtre ne s'appliquerait.
  const [node, setNode] = useState<Konva.Node | null>(null);
  const loaded = layer.kind !== "image" || images.has(layer.src);

  useFilterCache(node, layer, loaded);

  const attach = useCallback(
    (n: Konva.Node | null) => {
      setNode(n);
      registerNode?.(layer.id, n);
    },
    [layer.id, registerNode],
  );

  const handleTransformEnd = useCallback(() => {
    if (!node || !onChange) return;
    const sx = node.scaleX();
    const sy = node.scaleY();
    // Le Transformer travaille en échelle ; on la reverse dans les dimensions
    // pour que le modèle reste lisible — une largeur reste une largeur, et un
    // calque agrandi ne traîne pas un facteur caché qui fausserait la
    // déclinaison vers les autres formats.
    const next: Layer = {
      ...layer,
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      width: Math.max(1, layer.width * Math.abs(sx)),
      height: Math.max(1, layer.height * Math.abs(sy)),
      flipX: sx < 0 ? !layer.flipX : layer.flipX,
      flipY: sy < 0 ? !layer.flipY : layer.flipY,
    };
    if (next.kind === "text") {
      next.fontSize = Math.max(1, next.fontSize * Math.abs(sy));
    }
    onChange(next);
  }, [node, layer, onChange]);

  if (!layer.visible || !loaded) return null;

  const filters: Filter[] = [];
  if (layer.blur > 0) filters.push(Konva.Filters.Blur);
  if (layer.recolor.on) filters.push(Konva.Filters.HSL);

  const interactive = Boolean(onSelect) && !layer.locked;

  const common = {
    x: layer.x,
    y: layer.y,
    rotation: layer.rotation,
    opacity: layer.opacity,
    scaleX: layer.flipX ? -1 : 1,
    scaleY: layer.flipY ? -1 : 1,
    draggable: interactive,
    listening: interactive,
    filters: filters.length > 0 ? filters : undefined,
    blurRadius: layer.blur,
    hue: layer.recolor.hue,
    saturation: layer.recolor.saturation,
    luminance: layer.recolor.luminance,
    shadowEnabled: layer.shadow.on,
    shadowBlur: layer.shadow.blur,
    shadowOffsetX: layer.shadow.offsetX,
    shadowOffsetY: layer.shadow.offsetY,
    shadowColor: layer.shadow.color,
    shadowOpacity: layer.shadow.opacity,
    onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
      onSelect?.(layer.id, e.evt.shiftKey || e.evt.ctrlKey);
    },
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      onChange?.({ ...layer, x: e.target.x(), y: e.target.y() });
    },
    onTransformEnd: handleTransformEnd,
    ref: attach,
  };

  /** Les nœuds rectangulaires se posent par leur coin : on les décale d'une
   *  demi-taille pour que `x`/`y` désignent partout le CENTRE, ce qui fait
   *  aussi tourner le calque autour de lui-même. L'ellipse, elle, se pose déjà
   *  par son centre. */
  const boxed = {
    ...common,
    width: layer.width,
    height: layer.height,
    offsetX: layer.width / 2,
    offsetY: layer.height / 2,
  };

  if (layer.kind === "image") {
    const img = images.get(layer.src);
    if (!img) return null;
    return <KonvaImage {...boxed} image={img} />;
  }

  if (layer.kind === "text") {
    return (
      <Text
        {...boxed}
        text={layer.text}
        fontSize={layer.fontSize}
        fontFamily={layer.fontFamily || "sans-serif"}
        fill={layer.fill}
        align={layer.align}
        verticalAlign="middle"
        lineHeight={layer.lineHeight}
        letterSpacing={layer.letterSpacing}
        wrap="word"
      />
    );
  }

  if (layer.shape === "ellipse") {
    return (
      <Ellipse
        {...common}
        radiusX={layer.width / 2}
        radiusY={layer.height / 2}
        fill={layer.fill}
        stroke={layer.strokeWidth > 0 ? layer.stroke : undefined}
        strokeWidth={layer.strokeWidth}
      />
    );
  }

  return (
    <Rect
      {...boxed}
      fill={layer.fill}
      stroke={layer.strokeWidth > 0 ? layer.stroke : undefined}
      strokeWidth={layer.strokeWidth}
      cornerRadius={layer.cornerRadius}
    />
  );
}
