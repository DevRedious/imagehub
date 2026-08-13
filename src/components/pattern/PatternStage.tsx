import type Konva from "konva";
import { forwardRef } from "react";
import { Group, Layer as KonvaLayer, Rect, Stage } from "react-konva";
import type { Pattern, PatternPiece } from "../../lib/pattern/types";
import { PieceNode } from "./PieceNode";

interface Props {
  pattern: Pattern;
  images: Map<string, HTMLImageElement>;
  /** facteur d'affichage (1 = taille réelle de la tuile) */
  scale: number;
  onSelect?: (id: string, additive: boolean) => void;
  onChange?: (piece: PatternPiece) => void;
  /** début d'un geste : le moment où poser un point d'annulation */
  onGesture?: () => void;
  /** pièce en cours de tracé, dessinée mais pas encore dans le document */
  draft?: PatternPiece | null;
  onBackgroundClick?: () => void;
  registerNode?: (id: string, node: Konva.Node | null) => void;
  children?: React.ReactNode;
}

/** Rendu d'une tuile de motif — la même règle des neuf copies que le rendu
 *  Rust, écrite ici pour l'écran.
 *
 *  L'écrêtage est porté par un `Group` unique : tout ce qui déborde de la tuile
 *  disparaît, y compris pour la détection de clic. C'est ce qui donne au
 *  canevas son sens physique — une pièce n'est saisissable que par la part
 *  d'elle-même qui appartient à la tuile, exactement comme dans le fichier
 *  exporté.
 *
 *  Ce qu'on passe en `children` (poignées, repères de bord) reste HORS du
 *  groupe : des poignées écrêtées au ras du cadre seraient inatteignables
 *  précisément sur les pièces qui débordent, celles qu'on manipule le plus. */
export const PatternStage = forwardRef<Konva.Stage, Props>(
  function PatternStage(
    {
      pattern,
      images,
      scale,
      onSelect,
      onChange,
      onGesture,
      draft,
      onBackgroundClick,
      registerNode,
      children,
    },
    ref,
  ) {
    const { tile } = pattern;
    return (
      <Stage
        ref={ref}
        width={tile.width * scale}
        height={tile.height * scale}
        scaleX={scale}
        scaleY={scale}
        onMouseDown={(e) => {
          if (e.target === e.target.getStage()) onBackgroundClick?.();
        }}
      >
        <KonvaLayer>
          <Group
            clipX={0}
            clipY={0}
            clipWidth={tile.width}
            clipHeight={tile.height}
          >
            {pattern.background.on && (
              <Rect
                x={0}
                y={0}
                width={tile.width}
                height={tile.height}
                fill={pattern.background.color}
                listening={false}
              />
            )}
            {pattern.pieces.map((piece) => (
              <PieceNode
                key={piece.id}
                piece={piece}
                tile={tile}
                image={
                  piece.kind === "image" ? images.get(piece.src) : undefined
                }
                onSelect={onSelect}
                onChange={onChange}
                onGesture={onGesture}
                registerNode={registerNode}
              />
            ))}
            {/* Le tracé en cours n'est pas encore dans le document : il vit à
                part le temps du geste, et suit pourtant les mêmes neuf copies —
                c'est ce qui fait qu'un trait tiré vers le bord se voit ressortir
                de l'autre côté PENDANT qu'on le dessine. */}
            {draft && (
              // Clé CONSTANTE, et non `draft.id` : le brouillon est reconstruit
              // à chaque échantillon du pointeur, avec un identifiant neuf à
              // chaque fois. S'y accrocher démonterait et remonterait les nœuds
              // Konva soixante fois par seconde pendant tout le tracé.
              <PieceNode
                key="draft"
                piece={draft}
                tile={tile}
                image={undefined}
              />
            )}
          </Group>
          {children}
        </KonvaLayer>
      </Stage>
    );
  },
);
