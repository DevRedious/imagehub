import { invoke } from "@tauri-apps/api/core";

export interface QrMatrix {
  size: number;
  /** modules sombres, ligne par ligne (`size * size`) */
  modules: boolean[];
  ecc: string;
}

export interface QrCheck {
  readable: boolean;
  decoded: string;
}

export interface FontFile {
  path: string;
  name: string;
}

export interface SavedFile {
  path: string;
  bytes: number;
}

/** Niveaux de correction d'erreur. `H` répare 30 % du code : c'est ce qui
 *  permet à un logo de masquer le centre sans rendre le QR illisible. */
export type Ecc = "L" | "M" | "Q" | "H";

export const ECC_LEVELS: { id: Ecc; label: string; note: string }[] = [
  { id: "L", label: "L", note: "7 % — le plus dense, sans logo" },
  { id: "M", label: "M", note: "15 % — usage courant" },
  { id: "Q", label: "Q", note: "25 %" },
  { id: "H", label: "H", note: "30 % — requis avec un logo" },
];

export type ModuleShape = "round" | "soft" | "square";

export const MODULE_SHAPES: { id: ModuleShape; label: string }[] = [
  { id: "round", label: "Rond" },
  { id: "soft", label: "Arrondi" },
  { id: "square", label: "Carré" },
];

/** Toutes les couleurs du code, chacune réglable séparément — même découpage
 *  que le configurateur de référence (modules, fond, œil extérieur, œil
 *  intérieur, cadre). */
export interface QrColors {
  /** dégradé vertical des modules, de haut en bas ; une seule étape = uni */
  stops: [number, string][];
  background: string;
  eyeOuter: string;
  eyeInner: string;
  /** flèche et légende */
  frame: string;
}

export interface Preset {
  id: string;
  label: string;
  colors: QrColors;
}

/** Préréglages — tous en modules SOMBRES sur fond CLAIR.
 *
 *  Ce n'est pas un choix esthétique mais une contrainte de lecture : ISO/IEC
 *  18004 décrit des modules sombres sur fond clair, et un code inversé n'est
 *  rattrapé que par certains lecteurs (l'appareil photo d'iOS ré-inverse,
 *  beaucoup d'Android et d'applis tierces non). Mesuré ici même : le décodeur
 *  de vérification refuse purement et simplement un code inversé.
 *
 *  Heureux effet de bord : sur fond clair, la moitié SOMBRE du dégradé cristal
 *  de Primal Ascension devient utilisable telle quelle — y compris l'indigo
 *  `#24135b`, qui disparaissait sur du noir. */
export const PRESETS: Preset[] = [
  {
    id: "primal",
    label: "Primal cristal",
    colors: {
      stops: [
        [0, "#7c4fe0"],
        [0.5, "#5b29b0"],
        [1, "#24135b"],
      ],
      background: "#ffffff",
      eyeOuter: "#24135b",
      eyeInner: "#5b29b0",
      frame: "#5b29b0",
    },
  },
  {
    id: "violet",
    label: "Violet uni",
    colors: {
      stops: [[0, "#7800ff"]],
      background: "#ffffff",
      eyeOuter: "#7800ff",
      eyeInner: "#7800ff",
      frame: "#7800ff",
    },
  },
  {
    id: "classic",
    label: "Noir sur blanc",
    colors: {
      stops: [[0, "#000000"]],
      background: "#ffffff",
      eyeOuter: "#000000",
      eyeInner: "#000000",
      frame: "#000000",
    },
  },
];

/** Un dégradé à quatre étapes réparties régulièrement, à partir des couleurs
 *  déjà présentes — sert quand on bascule « uni → dégradé ». */
export function spreadStops(colors: string[]): [number, string][] {
  if (colors.length === 1) return [[0, colors[0]]];
  return colors.map((c, i) => [i / (colors.length - 1), c] as [number, string]);
}

/** Tailles d'export. 1024 suffit à l'écran, 2048 à l'impression courante. */
export const QR_SIZES = [512, 1024, 2048, 4096];

export function qrMatrix(text: string, ecc: Ecc): Promise<QrMatrix> {
  return invoke<QrMatrix>("qr_matrix", { text, ecc });
}

export function verifyQr(data: string): Promise<QrCheck> {
  return invoke<QrCheck>("verify_qr", { data });
}

export function findFonts(root: string): Promise<FontFile[]> {
  return invoke<FontFile[]>("find_fonts", { root });
}

export function readFont(path: string): Promise<string> {
  return invoke<string>("read_font", { path });
}

/** Image en data URL. Indispensable pour le logo : une image servie par le
 *  protocole `asset` vient d'une autre origine et contamine le canvas, ce qui
 *  rend l'export impossible (`toDataURL` lève une erreur de sécurité). */
export function readImageDataUrl(path: string): Promise<string> {
  return invoke<string>("read_image_data_url", { path });
}

export function qrDir(): Promise<string> {
  return invoke<string>("qr_dir");
}

export function saveQrPng(name: string, data: string): Promise<SavedFile> {
  return invoke<SavedFile>("save_qr_png", { name, data });
}

/** Charge un fichier de police dans le webview et renvoie le nom de famille à
 *  utiliser côté canvas. On passe par les octets plutôt qu'une URL : pas de
 *  question d'origine, et aucune installation système nécessaire. */
export async function loadFontFile(file: FontFile): Promise<string> {
  const b64 = await readFont(file.path);
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const family = `ih-font-${file.name.replace(/[^a-zA-Z0-9]/g, "-")}`;
  const face = new FontFace(family, bytes.buffer as ArrayBuffer);
  await face.load();
  document.fonts.add(face);
  return family;
}

/** Nom de fichier lisible tiré de l'URL encodée. */
export function nameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "").replace(/\//g, "-");
    return `qr-${u.hostname}${path}`.slice(0, 60);
  } catch {
    return "qr-code";
  }
}

export interface ThemeColor {
  name: string;
  /** toujours normalisé en `#rrggbb` par le backend */
  value: string;
  source: string;
  /** "primary", "secondary" ou "" */
  role: string;
}

export function detectThemeColors(root: string): Promise<ThemeColor[]> {
  return invoke<ThemeColor[]>("detect_theme_colors", { root });
}

/** Luminance relative — sert à décider si une couleur de marque tient sur un
 *  fond sombre ou clair. */
function luminance(hex: string): number {
  const v = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map(
    (i) => Number.parseInt(v.slice(i, i + 2), 16) / 255,
  );
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Couleurs de départ tirées du thème du projet.
 *
 *  La primaire porte les modules, la secondaire la flèche et la légende. Le
 *  fond suit le contraste : une marque claire va sur du noir, une marque
 *  sombre sur du blanc — un QR ne se lit que si ses modules tranchent. */
export function colorsFromTheme(theme: ThemeColor[]): QrColors | null {
  const primary = theme.find((c) => c.role === "primary");
  if (!primary) return null;
  const secondary = theme.find((c) => c.role === "secondary") ?? primary;
  return {
    stops: [[0, darkenUntilReadable(primary.value)]],
    background: "#ffffff",
    eyeOuter: darkenUntilReadable(primary.value),
    eyeInner: darkenUntilReadable(primary.value),
    frame: secondary.value,
  };
}

/** Assombrit une couleur de marque jusqu'à ce qu'elle tranche sur du blanc.
 *
 *  Une marque claire ne peut pas porter les modules telle quelle : la mettre
 *  sur du noir donnerait un code inversé, la laisser sur du blanc un code sans
 *  contraste. On la fonce donc juste assez — la teinte est conservée, seule la
 *  clarté baisse. */
function darkenUntilReadable(hex: string, target = 4.5): string {
  const v = hex.replace("#", "");
  let [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(v.slice(i, i + 2), 16));
  for (
    let i = 0;
    i < 24 && contrastRatio(rgbHex(r, g, b), "#ffffff") < target;
    i++
  ) {
    r = Math.round(r * 0.88);
    g = Math.round(g * 0.88);
    b = Math.round(b * 0.88);
  }
  return rgbHex(r, g, b);
}

function rgbHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

const URL_KEY = "imagehub.qrUrl";

/** L'adresse encodée est retenue PAR PROJET : on la saisit une fois, elle
 *  revient à chaque ouverture. Hors projet (Studio libre), une entrée commune
 *  sert de mémoire du dernier code produit. */
export function loadQrUrl(projectRoot: string | null): string {
  return localStorage.getItem(`${URL_KEY}.${projectRoot ?? "_libre"}`) ?? "";
}

export function saveQrUrl(projectRoot: string | null, url: string): void {
  const key = `${URL_KEY}.${projectRoot ?? "_libre"}`;
  if (url.trim() === "") localStorage.removeItem(key);
  else localStorage.setItem(key, url.trim());
}

/** Rapport de contraste WCAG entre deux couleurs (1 = identiques, 21 = max). */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export interface Scannability {
  /** modules plus CLAIRS que le fond : polarité inversée */
  inverted: boolean;
  /** le pire rapport de contraste module/fond du dégradé */
  ratio: number;
  /** couleur responsable du pire rapport */
  worst: string;
  verdict: "bon" | "limite" | "mauvais";
}

/** Diagnostic de lisibilité, indépendant de la relecture.
 *
 *  La relecture ne suffit pas : le décodeur travaille sur une image parfaite
 *  et accepte des contrastes qu'un téléphone, visant de biais sous un néon,
 *  refuserait. On mesure donc le contraste nous-mêmes.
 *
 *  Les deux critères viennent de la norme et de la pratique des lecteurs :
 *  - polarité — ISO/IEC 18004 décrit des modules SOMBRES sur fond CLAIR. Un
 *    code inversé n'est rattrapé que par certains lecteurs (l'appareil photo
 *    d'iOS ré-inverse ; beaucoup d'Android et d'applis tierces, non) ;
 *  - contraste — le plancher est d'environ 3:1, mais viser 7:1 ou plus est ce
 *    qui tient en conditions réelles. Le noir sur blanc est à 21:1.
 *
 *  Sur un dégradé, c'est l'étape la PIRE qui décide : c'est exactement par là
 *  qu'un code à dégradé décroche. */
export function analyzeScannability(colors: QrColors): Scannability {
  const bg = luminance(colors.background);
  let worst = colors.stops[0][1];
  let ratio = Number.POSITIVE_INFINITY;
  for (const [, color] of colors.stops) {
    const r = contrastRatio(color, colors.background);
    if (r < ratio) {
      ratio = r;
      worst = color;
    }
  }
  // inversé si TOUTES les étapes sont plus claires que le fond
  const inverted = colors.stops.every(([, c]) => luminance(c) > bg);
  const verdict =
    inverted || ratio < 3 ? "mauvais" : ratio < 7 ? "limite" : "bon";
  return { inverted, ratio, worst, verdict };
}

/** Remet le code à l'endroit : modules sombres sur fond clair.
 *
 *  L'ancien fond (sombre) devient la couleur des modules, et la teinte la plus
 *  claire du dégradé devient le fond. Le dégradé est aplati : sur un code
 *  remis à l'endroit, il ferait retomber une extrémité dans le fond. */
export function invertPolarity(colors: QrColors): QrColors {
  const lightest = colors.stops.reduce((a, b) =>
    luminance(a[1]) > luminance(b[1]) ? a : b,
  )[1];
  return {
    ...colors,
    stops: [[0, colors.background]],
    background: lightest,
    eyeOuter: colors.background,
    eyeInner: colors.background,
  };
}
