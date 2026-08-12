/** Modèle d'une composition de l'Atelier.
 *
 *  Tout est exprimé dans les unités d'un canevas de RÉFÉRENCE (`base`), jamais
 *  en pixels d'écran : c'est ce qui permet de décliner la même composition en
 *  16:9, 9:16 ou 17:6 sans la refaire (voir `layout.ts`).
 */

export type LayerKind = "image" | "text" | "shape";

/** Bord auquel un calque reste accroché quand le format change. Une branche
 *  posée en haut à gauche doit rester en haut à gauche en portrait comme en
 *  bannière — c'est l'ancrage qui le garantit, pas une position absolue. */
export type AnchorX = "left" | "center" | "right";
export type AnchorY = "top" | "middle" | "bottom";

export interface Anchor {
  x: AnchorX;
  y: AnchorY;
}

export interface Shadow {
  on: boolean;
  blur: number;
  offsetX: number;
  offsetY: number;
  color: string;
  opacity: number;
}

/** Recoloration d'un calque : ce qui permet de reteinter une branche sauge en
 *  terracotta sans repasser par un générateur d'images.
 *
 *  On fait tourner la teinte plutôt que de peindre une couleur par-dessus. La
 *  nuance est décisive sur des éléments en relief : recouvrir aplatirait le
 *  modelé et rendrait la branche en silhouette, alors qu'une rotation de
 *  teinte déplace la couleur en laissant intacts les ombrés qui donnent le
 *  volume. */
export interface Recolor {
  on: boolean;
  /** rotation de teinte, en degrés (0..360) */
  hue: number;
  /** exposant : 0 laisse la saturation d'origine, +1 la double, -1 la moitié */
  saturation: number;
  /** -1..1, décalage de luminosité */
  luminance: number;
}

export interface LayerBase {
  id: string;
  name: string;
  kind: LayerKind;
  /** centre du calque, en unités du canevas de référence */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  /** 0..1 */
  opacity: number;
  flipX: boolean;
  flipY: boolean;
  visible: boolean;
  locked: boolean;
  anchor: Anchor;
  /** l'ancrage suit-il automatiquement les déplacements ? */
  anchorAuto: boolean;
  shadow: Shadow;
  recolor: Recolor;
  /** flou gaussien, en unités du canevas de référence */
  blur: number;
}

export interface ImageLayer extends LayerBase {
  kind: "image";
  /** chemin sur disque ; les pixels sont chargés en data URL (voir `useImages`) */
  src: string;
}

export interface TextLayer extends LayerBase {
  kind: "text";
  text: string;
  fontSize: number;
  /** famille CSS résolue (rendue par `loadFontFile`) */
  fontFamily: string;
  /** fichier de police d'origine, pour recharger la famille à la réouverture */
  fontPath: string | null;
  fill: string;
  align: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing: number;
}

export type ShapeKind = "rect" | "ellipse";

export interface ShapeLayer extends LayerBase {
  kind: "shape";
  shape: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
}

export type Layer = ImageLayer | TextLayer | ShapeLayer;

/** Fond de la composition. Il est ÉTEINT par défaut : une compo sert d'abord
 *  d'asset réutilisable, et un fond incrusté la rendrait inutilisable
 *  par-dessus un autre visuel. */
export interface Background {
  on: boolean;
  kind: "solid" | "linear";
  colors: [string, string];
  /** degrés, 0 = de gauche à droite */
  angle: number;
}

/** Une page : un plan de travail parmi d'autres au sein d'une même
 *  composition. Chaque page a ses propres calques ; le format et le fond,
 *  eux, valent pour le document entier — une série se décline dans un seul
 *  gabarit, et devoir régler le ratio page par page serait un piège à
 *  incohérences. */
export interface Page {
  id: string;
  name: string;
  layers: Layer[];
}

export interface Composition {
  name: string;
  base: { width: number; height: number };
  background: Background;
  pages: Page[];
  /** page en cours d'édition ; retombe sur la première si l'identifiant
   *  ne correspond plus à rien */
  activePageId: string;
}

export const DEFAULT_SHADOW: Shadow = {
  on: false,
  blur: 24,
  offsetX: 0,
  offsetY: 12,
  color: "#000000",
  opacity: 0.35,
};

export const DEFAULT_RECOLOR: Recolor = {
  on: false,
  hue: 0,
  saturation: 0,
  luminance: 0,
};
