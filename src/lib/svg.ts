/** Recoloration des SVG et capture d'images d'une animation SMIL.
 *
 *  Tout se passe dans le webview, et pas côté Rust, pour une raison simple :
 *  aucun outil installé ne sait rasteriser du SMIL. Inkscape et ImageMagick
 *  rendent l'instant t=0 et rien d'autre. Le moteur du webview, lui, exécute
 *  l'animation, sait se placer à un instant donné (`setCurrentTime`) et peut
 *  dessiner dans un canvas — c'est le seul rasteriseur d'animation de la
 *  machine. */

const SVG_NS = "http://www.w3.org/2000/svg";
const HOST_ID = "ih-svg-bake-host";

/** Valeurs de `fill`/`stroke` qui ne sont pas des couleurs à remplacer. */
const NOT_A_COLOR = new Set(["none", "transparent", "inherit", "currentcolor"]);

/** Attributs animés exposés par le DOM SVG en tant que longueur animée.
 *  Les autres (opacity, stroke-*…) sont des propriétés CSS, lues via
 *  `getComputedStyle`. `transform` est un cas à part. */
const LENGTH_PROPS = new Set([
  "r",
  "cx",
  "cy",
  "x",
  "y",
  "width",
  "height",
  "rx",
  "ry",
  "x1",
  "y1",
  "x2",
  "y2",
]);

function parse(source: string): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return null;
  const root = doc.documentElement;
  return root.namespaceURI === SVG_NS && root.tagName === "svg"
    ? (root as unknown as SVGSVGElement)
    : null;
}

function serialize(el: Element): string {
  return new XMLSerializer().serializeToString(el);
}

/** Retire d'un SVG tout ce qui peut s'exécuter.
 *
 *  Ces fichiers viennent d'un dossier quelconque du disque et sont injectés
 *  tels quels dans le DOM du webview pour que leur animation soit jouée. Un
 *  SVG est un document : il peut porter un `<script>` ou un `onload=`, qui
 *  s'exécuteraient avec tous les droits de l'application. On les enlève. */
export function sanitize(source: string): string {
  const svg = parse(source);
  if (!svg) return "";
  for (const el of Array.from(svg.querySelectorAll("script, foreignObject"))) {
    el.remove();
  }
  for (const el of Array.from(svg.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const isHandler = name.startsWith("on");
      const isRemoteHref =
        (name === "href" || name === "xlink:href") &&
        !attr.value.trim().startsWith("#");
      if (isHandler || isRemoteHref) el.removeAttribute(attr.name);
    }
  }
  for (const attr of Array.from(svg.attributes)) {
    if (attr.name.toLowerCase().startsWith("on"))
      svg.removeAttribute(attr.name);
  }
  return serialize(svg);
}

/** Applique une couleur à un SVG.
 *
 *  Deux cas, choisis automatiquement : une icône écrite en `currentColor` se
 *  recolore intégralement en posant la propriété `color` à la racine (l'usage
 *  prévu par ses auteurs) ; une icône aux couleurs écrites en dur voit chacun
 *  de ses `fill`/`stroke` remplacé. */
export function recolor(source: string, color: string): string {
  const svg = parse(source);
  if (!svg) return source;

  if (source.includes("currentColor")) {
    svg.setAttribute("color", color);
    return serialize(svg);
  }

  let touched = 0;
  for (const el of Array.from(svg.querySelectorAll("*"))) {
    for (const attr of ["fill", "stroke"]) {
      const value = el.getAttribute(attr)?.trim();
      if (!value || value.startsWith("url(")) continue;
      if (NOT_A_COLOR.has(value.toLowerCase())) continue;
      el.setAttribute(attr, color);
      touched++;
    }
  }
  // aucune couleur explicite : le SVG s'appuie sur le noir par défaut, donc
  // une couleur de remplissage héritée à la racine suffit à tout teinter.
  if (touched === 0) svg.setAttribute("fill", color);
  return serialize(svg);
}

/** Réécrit les couleurs en dur d'un SVG en `currentColor`.
 *
 *  C'est ce qui permet à la galerie de changer de couleur sans jamais être
 *  reconstruite : une fois toutes les icônes normalisées, la teinte n'est plus
 *  qu'une propriété CSS héritée. Le balisage, lui, ne bouge plus — donc les
 *  animations en cours ne sont jamais interrompues. */
export function toCurrentColor(source: string): string {
  if (source.includes("currentColor")) return source;
  const svg = parse(source);
  if (!svg) return source;

  let touched = 0;
  for (const el of Array.from(svg.querySelectorAll("*"))) {
    for (const attr of ["fill", "stroke"]) {
      const value = el.getAttribute(attr)?.trim();
      if (!value || value.startsWith("url(")) continue;
      if (NOT_A_COLOR.has(value.toLowerCase())) continue;
      el.setAttribute(attr, "currentColor");
      touched++;
    }
  }
  // aucune couleur explicite : l'icône s'appuie sur le noir par défaut
  if (touched === 0) svg.setAttribute("fill", "currentColor");
  return serialize(svg);
}

/** Durée d'une boucle, déduite du plus long `dur` des animations.
 *
 *  C'est une estimation, pas une vérité : des animations chaînées les unes aux
 *  autres (`begin="autre.end-0.5s"`) ont une période réelle que seul un
 *  déroulement complet du graphe donnerait. D'où le réglage manuel dans l'UI,
 *  avec cette valeur comme point de départ. */
export function detectDuration(source: string): number {
  const durations = [...source.matchAll(/\bdur="([\d.]+)(ms|s)"/g)]
    .map(([, value, unit]) =>
      unit === "ms" ? Number(value) / 1000 : Number(value),
    )
    .filter((n) => Number.isFinite(n) && n > 0);
  if (durations.length === 0) return 1;
  return Math.min(6, Math.max(0.3, Math.max(...durations)));
}

export function isAnimated(source: string): boolean {
  return source.includes("<animate");
}

/** L'icône joue-t-elle sur la translucidité ?
 *
 *  C'est la question qui décide de la qualité d'un GIF : ce format n'a qu'un
 *  bit de transparence, donc un fondu y devient un clignotement — à moins de
 *  composer sur un fond opaque. Autant le signaler avant l'export. */
export function hasFade(source: string): boolean {
  return /attributeName="(fill-|stroke-)?opacity"/.test(source);
}

/** Conteneur hors écran où les SVG sont joués pour être échantillonnés.
 *  Surtout pas `display:none` : un SVG non rendu n'a pas d'horloge, donc pas
 *  de valeur animée à lire. On le pousse hors du champ de vision à la place. */
function bakeHost(): HTMLElement {
  const existing = document.getElementById(HOST_ID);
  if (existing) return existing;
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;opacity:0;pointer-events:none";
  document.body.appendChild(host);
  return host;
}

/** Valeur courante d'un attribut animé, à l'instant où l'horloge est arrêtée. */
function animatedValue(el: Element, attr: string): string | null {
  if (attr === "transform") {
    const list = (el as SVGGraphicsElement).transform?.animVal;
    if (!list) return null;
    // `consolidate()` écrirait dans la liste — interdit sur `animVal`, qui est
    // en lecture seule. On multiplie donc les matrices à la main.
    let m = new DOMMatrix();
    for (let i = 0; i < list.numberOfItems; i++) {
      const t = list.getItem(i).matrix;
      m = m.multiply(new DOMMatrix([t.a, t.b, t.c, t.d, t.e, t.f]));
    }
    return `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;
  }

  if (LENGTH_PROPS.has(attr)) {
    const animated = (el as unknown as Record<string, unknown>)[attr] as
      | { animVal?: { value?: number } }
      | undefined;
    const value = animated?.animVal?.value;
    if (typeof value === "number" && Number.isFinite(value))
      return String(value);
  }

  const computed = getComputedStyle(el).getPropertyValue(attr).trim();
  return computed === "" ? null : computed;
}

/** Écrit les valeurs animées courantes en attributs statiques, puis retire les
 *  animations : le SVG obtenu est une photographie de l'instant, rendable par
 *  n'importe quoi — y compris un `<img>`, qui ne sait pas remonter le temps. */
function bake(svg: SVGSVGElement): void {
  const animations = Array.from(
    svg.querySelectorAll("animate, animateTransform, animateMotion, set"),
  );
  const targets = new Map<Element, Set<string>>();
  for (const animation of animations) {
    const target = animation.parentElement;
    if (!target) continue;
    const attr =
      animation.getAttribute("attributeName") ??
      (animation.tagName === "animateMotion" ? "transform" : null);
    if (!attr) continue;
    const attrs = targets.get(target) ?? new Set<string>();
    attrs.add(attr);
    targets.set(target, attrs);
  }
  for (const [el, attrs] of targets) {
    for (const attr of attrs) {
      const value = animatedValue(el, attr);
      if (value !== null) el.setAttribute(attr, value);
    }
  }
  for (const animation of animations) animation.remove();
}

/** SVG figé à l'instant `t` (en secondes), sous forme de source statique. */
export function frameAt(source: string, t: number, size: number): string {
  const host = bakeHost();
  host.innerHTML = source;
  const svg = host.firstElementChild as SVGSVGElement | null;
  if (!svg) {
    host.innerHTML = "";
    throw new Error("SVG illisible");
  }
  try {
    svg.pauseAnimations();
    svg.setCurrentTime(t);
    // force un recalcul avant de lire les valeurs animées
    svg.getBoundingClientRect();
    bake(svg);
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    return serialize(svg);
  } finally {
    host.innerHTML = "";
  }
}

/** Rasterise une source SVG en PNG (data URL) à la taille demandée.
 *  Passe par une data URL et non un blob : une image SVG chargée depuis un
 *  blob peut « teinter » le canvas sur WebKit, et `toDataURL` échouerait. */
export function rasterize(source: string, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas indisponible"));
        return;
      }
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch (e) {
        reject(new Error(`Lecture du canvas refusée : ${e}`));
      }
    };
    img.onerror = () => reject(new Error("Rendu du SVG impossible"));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  });
}

export interface CaptureOptions {
  duration: number;
  fps: number;
  size: number;
  onProgress?: (done: number, total: number) => void;
}

/** Images d'une boucle complète, prêtes pour ffmpeg.
 *  `t` va de 0 à `duration` EXCLU : la dernière image ne duplique pas la
 *  première, et la boucle se referme sans à-coup. */
export async function captureFrames(
  source: string,
  { duration, fps, size, onProgress }: CaptureOptions,
): Promise<string[]> {
  const count = Math.max(1, Math.round(duration * fps));
  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    frames.push(
      await rasterize(frameAt(source, (i / count) * duration, size), size),
    );
    onProgress?.(i + 1, count);
  }
  return frames;
}

/** Vrai si toutes les images sont identiques — le signe que le moteur n'a pas
 *  joué l'animation, et donc qu'un export animé n'aurait aucun intérêt. */
export function framesAreStill(frames: string[]): boolean {
  return frames.length > 1 && frames.every((f) => f === frames[0]);
}
