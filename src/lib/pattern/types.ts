/** Modèle d'un motif raccordable.
 *
 *  # Unités
 *
 *  Tout est NORMALISÉ, jamais en pixels. C'est ce qui rend la résolution
 *  d'export indépendante de la taille d'édition : composer en 480 px et sortir
 *  en 2048 px revient à multiplier ces nombres par une autre constante, et les
 *  images sont rééchantillonnées depuis leur fichier d'origine (voir
 *  `src-tauri/src/pattern.rs`). Stocker des pixels d'édition obligerait à
 *  agrandir un rendu déjà fait, avec la perte que ça suppose.
 *
 *  Deux unités, et une seule règle pour s'en souvenir :
 *
 *  - le **centre** `(x, y)` est une fraction de chaque axe — `(1, 1)` est le
 *    coin bas-droit, quelle que soit la forme de la tuile ;
 *  - **toute étendue** (taille, points d'un tracé, épaisseur de trait) est une
 *    fraction de la LARGEUR de la tuile.
 *
 *  Rapporter les étendues à un seul axe est ce qui garde une rotation
 *  isotrope : normaliser la hauteur sur la hauteur ferait pencher un cercle dès
 *  qu'on sortirait du carré.
 *
 *  Ce document est la forme sérialisée en JSON, telle qu'elle est enregistrée
 *  et relue pour ré-édition, et telle que Rust la reçoit.
 */

/** Taille de la tuile, en pixels d'ÉDITION : elle ne fixe que le rapport et
 *  l'échelle de travail, pas la résolution d'export.
 *
 *  `Tw × Th` dès la structure de données, alors que l'interface ne propose que
 *  du carré : une tuile en bandeau ou en brique ne demandera pas de refonte. */
export interface TileSize {
  width: number;
  height: number;
}

/** Un point d'un tracé, RELATIF au centre de la pièce. */
export interface Point {
  x: number;
  y: number;
}

/** Ce que toute pièce porte, quelle que soit sa nature. */
interface PieceBase {
  id: string;
  name: string;
  /** centre, en fraction de chaque axe de la tuile */
  x: number;
  y: number;
  /** angle libre, en degrés (sens horaire, convention Konva) */
  rotation: number;
  /** 0..1 */
  opacity: number;
  visible: boolean;
}

/** Un fichier posé : PNG à fond transparent, WebP, ou SVG. */
export interface ImagePiece extends PieceBase {
  kind: "image";
  /** chemin sur disque ; les pixels sont chargés en data URL (voir `useImages`) */
  src: string;
  width: number;
  height: number;
  flipX: boolean;
  flipY: boolean;
}

/** Un trait : main levée, ligne droite, ou polyligne.
 *
 *  Les trois ne diffèrent que par le nombre de points — en faire trois types
 *  aurait multiplié par trois l'inspecteur, le rendu et la sérialisation, pour
 *  une distinction que seul le geste de tracé connaît. */
export interface StrokePiece extends PieceBase {
  kind: "stroke";
  points: Point[];
  color: string;
  /** épaisseur, en fraction de la largeur de tuile */
  width: number;
  closed: boolean;
}

export type ShapeKind = "rect" | "ellipse" | "polygon";

/** Une forme géométrique, remplie et/ou contourée. Le triangle n'est pas un
 *  type à part : c'est un polygone régulier à trois côtés, comme l'hexagone en
 *  a six. Un concept de moins à porter dans tout l'éditeur. */
export interface ShapePiece extends PieceBase {
  kind: "shape";
  shape: ShapeKind;
  /** nombre de côtés, pour `polygon` (3 = triangle) */
  sides: number;
  width: number;
  height: number;
  /** null = non rempli */
  fill: string | null;
  /** null = sans contour */
  stroke: string | null;
  strokeWidth: number;
}

export type PatternPiece = ImagePiece | StrokePiece | ShapePiece;

/** Fond de la tuile. Transparent par défaut : un motif sert le plus souvent de
 *  couche à poser sur autre chose, et un aplat incrusté le rendrait
 *  inutilisable — même raisonnement que pour les compositions de l'Atelier. */
export interface PatternBackground {
  on: boolean;
  color: string;
}

export interface Pattern {
  name: string;
  tile: TileSize;
  background: PatternBackground;
  /** du fond vers le premier plan */
  pieces: PatternPiece[];
  /** graine du semis aléatoire : sans elle, un motif obtenu par hasard serait
   *  irreproductible, et rouvrir le document donnerait autre chose */
  seed: number;
}

/** Tailles de tuile proposées. 480 par défaut : assez grand pour que les
 *  éléments gardent du détail à l'écran, assez petit pour que les neuf copies
 *  se redessinent sans latence pendant qu'on déplace une pièce. */
export const TILE_PRESETS = [256, 480, 512, 1024] as const;

export const DEFAULT_TILE = 480;
