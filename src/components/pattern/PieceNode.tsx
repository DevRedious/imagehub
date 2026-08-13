import type Konva from "konva";
import { useCallback, useRef } from "react";
import { Ellipse, Image as KonvaImage, Line, Rect } from "react-konva";
import { flatten, polygonPoints } from "../../lib/pattern/draw";
import {
  centerPx,
  copies,
  scalePiece,
  toPixels,
  unit,
  wrapCenter,
} from "../../lib/pattern/tiling";
import type { PatternPiece, TileSize } from "../../lib/pattern/types";

interface Props {
  piece: PatternPiece;
  tile: TileSize;
  /** pixels de la pièce ; absente tant qu'ils ne sont pas lus (images seules) */
  image: HTMLImageElement | undefined;
  onSelect?: (id: string, additive: boolean) => void;
  onChange?: (piece: PatternPiece) => void;
  onGesture?: () => void;
  registerNode?: (id: string, node: Konva.Node | null) => void;
}

/** Une pièce et toutes ses copies décalées.
 *
 *  UNE SEULE d'entre elles est manipulable : celle du décalage `(0, 0)`. Les
 *  autres ne sont que le reflet du tore, et les rendre saisissables ferait
 *  qu'on croirait déplacer deux objets. Le centre étant toujours ramené dans la
 *  tuile après un geste (`wrapCenter`), cette copie est aussi, par
 *  construction, celle qu'on a sous le curseur.
 *
 *  Le déplacement met à jour le modèle EN CONTINU, pas au relâchement : sans
 *  ça, les copies resteraient sur place pendant tout le glissement et le
 *  raccord ne se verrait qu'une fois la souris lâchée — c'est-à-dire trop tard
 *  pour ajuster.
 *
 *  Les trois natures de pièce passent par le même chemin : mêmes copies, même
 *  transformation, même écrêtage. Seul le nœud Konva final diffère. */
export function PieceNode({
  piece,
  tile,
  image,
  onSelect,
  onChange,
  onGesture,
  registerNode,
}: Props) {
  const node = useRef<Konva.Node | null>(null);

  const attach = useCallback(
    (n: Konva.Node | null) => {
      node.current = n;
      registerNode?.(piece.id, n);
    },
    [piece.id, registerNode],
  );

  /** Konva LAISSE l'échelle sur le nœud après un redimensionnement : on la
   *  reverse dans la géométrie et on remet le nœud à son échelle de repos
   *  (-1 sur un axe retourné). Sans ce remède — celui que documente Konva — le
   *  facteur resterait collé au nœud et se multiplierait à la taille qu'on
   *  vient d'en déduire : chaque poignée tirée agrandirait deux fois. */
  const handleTransformEnd = useCallback(() => {
    const n = node.current;
    if (!n || !onChange) return;
    const flipX = piece.kind === "image" && piece.flipX;
    const flipY = piece.kind === "image" && piece.flipY;
    const baseX = flipX ? -1 : 1;
    const baseY = flipY ? -1 : 1;
    const sx = n.scaleX() / baseX;
    const sy = n.scaleY() / baseY;
    n.scaleX(baseX);
    n.scaleY(baseY);

    const mis = scalePiece(piece, Math.abs(sx), Math.abs(sy));
    onChange(
      wrapCenter({
        ...mis,
        x: n.x() / tile.width,
        y: n.y() / tile.height,
        rotation: n.rotation(),
        ...(mis.kind === "image"
          ? { flipX: sx < 0 ? !flipX : flipX, flipY: sy < 0 ? !flipY : flipY }
          : {}),
      }),
    );
  }, [piece, tile, onChange]);

  if (!piece.visible) return null;
  if (piece.kind === "image" && !image) return null;

  const px = toPixels(piece, tile);
  const at = centerPx(piece, tile);
  const interactive = Boolean(onSelect);

  /** Ce que toute copie porte : la position, la rotation autour du centre, et
   *  la conduite du geste — mais seulement pour la copie pilote. */
  const commonFor = (dx: number, dy: number, pilote: boolean) => ({
    x: at.x + dx,
    y: at.y + dy,
    rotation: piece.rotation,
    opacity: piece.opacity,
    draggable: interactive && pilote,
    listening: interactive && pilote,
    ref: pilote ? attach : undefined,
    onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (pilote) onSelect?.(piece.id, e.evt.shiftKey || e.evt.ctrlKey);
    },
    onDragStart: onGesture,
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) =>
      onChange?.({
        ...piece,
        x: e.target.x() / tile.width,
        y: e.target.y() / tile.height,
      }),
    onDragEnd: () => onChange?.(wrapCenter(piece)),
    onTransformStart: onGesture,
    onTransformEnd: handleTransformEnd,
  });

  return (
    <>
      {copies(px, tile).map(({ dx, dy }) => {
        const pilote = dx === 0 && dy === 0;
        const common = commonFor(dx, dy, pilote);
        const key = `${dx}:${dy}`;

        if (piece.kind === "image") {
          const w = unit(piece.width, tile);
          const h = unit(piece.height, tile);
          return (
            <KonvaImage
              key={key}
              {...common}
              image={image}
              width={w}
              height={h}
              // `x`/`y` désignent le CENTRE : c'est autour de lui que la pièce
              // tourne, et c'est la seule convention qui se transpose telle
              // quelle au rendu Rust.
              offsetX={w / 2}
              offsetY={h / 2}
              scaleX={piece.flipX ? -1 : 1}
              scaleY={piece.flipY ? -1 : 1}
            />
          );
        }

        if (piece.kind === "stroke") {
          return (
            <Line
              key={key}
              {...common}
              points={flatten(
                piece.points.map((p) => ({
                  x: unit(p.x, tile),
                  y: unit(p.y, tile),
                })),
              )}
              stroke={piece.color}
              strokeWidth={unit(piece.width, tile)}
              // rondes des deux côtés : c'est ce qui fait qu'un trait à la main
              // n'a ni angles coupés ni bouts carrés. `tiny-skia` est réglé de
              // même côté export (`LineCap::Round`, `LineJoin::Round`).
              lineCap="round"
              lineJoin="round"
              closed={piece.closed}
              // Aucun lissage AU RENDU : la main levée est déjà lissée une fois
              // pour toutes à la validation du tracé (`smooth`). Laisser Konva
              // courber les points obligerait Rust à reproduire exactement la
              // même spline — l'aperçu et l'export divergeraient au premier
              // écart.
              tension={0}
              // un trait ne se saisit que sur son épaisseur, mais quelques
              // pixels de marge évitent de devoir viser un cheveu
              hitStrokeWidth={Math.max(unit(piece.width, tile), 12)}
            />
          );
        }

        const w = unit(piece.width, tile);
        const h = unit(piece.height, tile);
        const peinture = {
          fill: piece.fill ?? undefined,
          stroke: piece.stroke ?? undefined,
          strokeWidth: piece.stroke ? unit(piece.strokeWidth, tile) : 0,
          lineJoin: "round" as const,
        };

        if (piece.shape === "ellipse") {
          return (
            <Ellipse
              key={key}
              {...common}
              {...peinture}
              radiusX={w / 2}
              radiusY={h / 2}
            />
          );
        }
        if (piece.shape === "rect") {
          return (
            <Rect
              key={key}
              {...common}
              {...peinture}
              width={w}
              height={h}
              offsetX={w / 2}
              offsetY={h / 2}
            />
          );
        }
        // Polygone : les sommets sont calculés ici plutôt que délégués à
        // `RegularPolygon`, qui ne connaît qu'un rayon — donc jamais un
        // triangle étiré. C'est aussi la formule que Rust recopie.
        return (
          <Line
            key={key}
            {...common}
            {...peinture}
            points={flatten(polygonPoints(piece.sides, w, h))}
            closed
          />
        );
      })}
    </>
  );
}
