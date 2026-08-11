import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { basename } from "../lib/paths";
import {
  analyzeScannability,
  colorsFromTheme,
  detectThemeColors,
  ECC_LEVELS,
  type Ecc,
  type FontFile,
  findFonts,
  invertPolarity,
  loadFontDir,
  loadFontFile,
  loadQrUrl,
  MODULE_SHAPES,
  type ModuleShape,
  nameFromUrl,
  PRESETS,
  QR_SIZES,
  type QrCheck,
  type QrColors,
  type QrMatrix,
  qrDir,
  qrMatrix,
  readImageDataUrl,
  saveFontDir,
  saveQrPng,
  saveQrUrl,
  type ThemeColor,
  verifyQr,
} from "../lib/qr";
import { drawQr, loadImage, type QrStyle } from "../lib/qrRender";
import { ColorField } from "./ColorPicker";
import { FontPicker } from "./FontPicker";

interface Props {
  /** racine du projet connecté, pour y détecter URL et polices (null = aucun) */
  projectRoot: string | null;
  onReveal: (path: string) => void;
  onToast: (kind: "success" | "error" | "info", message: string) => void;
}

const PREVIEW = 512;

export function QrView({ projectRoot, onReveal, onToast }: Props) {
  const [url, setUrl] = useState(() => loadQrUrl(null));
  const [colors, setColors] = useState<QrColors>(PRESETS[0].colors);
  const [theme, setTheme] = useState<ThemeColor[]>([]);
  // une fois que l'utilisateur a touché une couleur, on ne réécrit plus rien
  // par-dessus : la détection ne sert qu'à donner le point de départ
  const touched = useRef(false);
  // yeux calés sur la couleur des modules (comme le « Use QR Code color »
  // du configurateur) : pratique, mais le contraste des repères en pâtit
  const [eyesFollow, setEyesFollow] = useState(false);
  const [shape, setShape] = useState<ModuleShape>("round");
  const [caption, setCaption] = useState("Scanne moi !");
  const [arrow, setArrow] = useState(true);
  // trois provenances pour la légende : les polices posées dans le projet
  // connecté, la bibliothèque personnelle (un dossier retenu d'une session à
  // l'autre) et les fichiers ouverts à l'unité
  const [fonts, setFonts] = useState<FontFile[]>([]);
  const [fontDir, setFontDir] = useState<string | null>(loadFontDir);
  const [libFonts, setLibFonts] = useState<FontFile[]>([]);
  const [pickedFonts, setPickedFonts] = useState<FontFile[]>([]);
  const [fontFamily, setFontFamily] = useState("cursive");
  // chemin de la police courante ; vide = police par défaut du rendu
  const [fontPath, setFontPath] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [ecc, setEcc] = useState<Ecc>("H");
  const [size, setSize] = useState(1024);
  const [matrix, setMatrix] = useState<QrMatrix | null>(null);
  const [check, setCheck] = useState<QrCheck | null>(null);
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  // raison précise d'un export refusé, pour proposer de passer outre
  const [blocked, setBlocked] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    qrDir()
      .then(setDestination)
      .catch(() => {});
  }, []);

  // un projet connecté fournit ses URL publiées et ses polices embarquées
  useEffect(() => {
    // l'adresse saisie pour CE projet revient telle quelle
    setUrl(loadQrUrl(projectRoot));
    if (!projectRoot) {
      setFonts([]);
      return;
    }
    findFonts(projectRoot)
      .then(setFonts)
      .catch(() => setFonts([]));
    // le premier QR d'un projet part de SES couleurs, pas d'une teinte
    // arbitraire ; tout reste modifiable ensuite
    detectThemeColors(projectRoot)
      .then((found) => {
        setTheme(found);
        if (touched.current) return;
        const derived = colorsFromTheme(found);
        if (derived) setColors(derived);
      })
      .catch(() => setTheme([]));
  }, [projectRoot]);

  // la bibliothèque ne dépend pas du projet ouvert : elle est relue quand son
  // dossier change, pas à chaque changement de contexte
  useEffect(() => {
    if (!fontDir) {
      setLibFonts([]);
      return;
    }
    findFonts(fontDir)
      .then(setLibFonts)
      .catch(() => setLibFonts([]));
  }, [fontDir]);

  // un logo masque le centre : seule la correction H tient le coup
  useEffect(() => {
    if (logo) setEcc("H");
  }, [logo]);

  // encodage (débounce : on ne recalcule pas à chaque frappe)
  useEffect(() => {
    const text = url.trim();
    if (text === "") {
      setMatrix(null);
      setCheck(null);
      return;
    }
    const t = setTimeout(() => {
      qrMatrix(text, ecc)
        .then(setMatrix)
        .catch((e) => {
          setMatrix(null);
          onToast("error", `Encodage impossible : ${e}`);
        });
    }, 250);
    return () => clearTimeout(t);
  }, [url, ecc, onToast]);

  // mémoïsé : l'effet de dessin en dépend, un objet neuf à chaque rendu le
  // relancerait en boucle
  const effective = useMemo<QrColors>(() => {
    if (!eyesFollow) return colors;
    const dark = colors.stops[0][1];
    return { ...colors, eyeOuter: dark, eyeInner: dark };
  }, [colors, eyesFollow]);

  const style = useMemo<QrStyle>(
    () => ({ colors: effective, shape, caption, fontFamily, arrow, logo }),
    [effective, shape, caption, fontFamily, arrow, logo],
  );

  const setColor = (key: keyof QrColors, value: string) => {
    touched.current = true;
    setColors((c) => ({ ...c, [key]: value }));
  };
  const setStop = (i: number, value: string) => {
    touched.current = true;
    setColors((c) => ({
      ...c,
      stops: c.stops.map((s, j) => (j === i ? [s[0], value] : s)),
    }));
  };

  // aperçu + relecture : on vérifie sur le rendu réel, à la taille d'export,
  // parce que c'est la densité de pixels qui décide de la lisibilité
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !matrix) return;
    drawQr(canvas, matrix, style, PREVIEW);

    const t = setTimeout(() => {
      const probe = document.createElement("canvas");
      try {
        drawQr(probe, matrix, style, size);
        verifyQr(probe.toDataURL("image/png"))
          .then(setCheck)
          .catch(() => setCheck(null));
      } catch {
        setCheck(null);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [matrix, style, size]);

  async function pickLogo() {
    const picked = await open({
      multiple: false,
      filters: [
        { name: "Image", extensions: ["png", "svg", "jpg", "jpeg", "webp"] },
      ],
    });
    if (typeof picked !== "string") return;
    try {
      // data URL et non `convertFileSrc` : sinon le canvas est contaminé
      // et l'export échoue sur une erreur de sécurité
      setLogo(await loadImage(await readImageDataUrl(picked)));
      setLogoPath(picked);
    } catch (e) {
      onToast("error", `Logo illisible : ${e}`);
    }
  }

  const applyFont = useCallback(
    async (file: FontFile) => {
      try {
        setFontFamily(await loadFontFile(file));
        setFontPath(file.path);
      } catch (e) {
        onToast("error", `Police illisible : ${e}`);
      }
    },
    [onToast],
  );

  const currentFont = useMemo(
    () =>
      [...pickedFonts, ...fonts, ...libFonts].find((f) => f.path === fontPath),
    [pickedFonts, fonts, libFonts, fontPath],
  );

  const chooseFont = useCallback(
    (file: FontFile | null) => {
      setPickerOpen(false);
      if (!file) {
        setFontFamily("cursive");
        setFontPath("");
        return;
      }
      void applyFont(file);
    },
    [applyFont],
  );

  /** Fichier isolé, hors bibliothèque : il rejoint la liste pour rester
   *  atteignable sans repasser par la boîte de dialogue. */
  async function pickFont() {
    const picked = await open({
      multiple: false,
      filters: [
        { name: "Police", extensions: ["ttf", "otf", "woff", "woff2"] },
      ],
    });
    if (typeof picked !== "string") return;
    const file = {
      path: picked,
      name: basename(picked).replace(/\.[^.]+$/, ""),
    };
    setPickedFonts((prev) =>
      prev.some((f) => f.path === file.path) ? prev : [...prev, file],
    );
    await applyFont(file);
    setPickerOpen(false);
  }

  async function pickFontDir() {
    const picked = await open({ directory: true });
    if (typeof picked !== "string") return;
    setFontDir(picked);
    saveFontDir(picked);
  }

  async function exportPng(force = false) {
    if (!matrix || busy) return;
    setBusy(true);
    setBlocked(null);
    try {
      const out = document.createElement("canvas");
      drawQr(out, matrix, style, size);
      const data = out.toDataURL("image/png");
      const verdict = await verifyQr(data);
      if (!verdict.readable && !force) {
        // nommer la VRAIE cause : conseiller d'agrandir face à une inversion
        // envoie dans le mur, la taille n'y change rien (test de non-régression
        // `un_code_inverse_echoue_a_toute_taille`)
        const reason = scan.inverted
          ? "Code inversé : les modules sont plus clairs que le fond. La plupart des lecteurs Android échouent dessus (l'appareil photo d'iOS, lui, rattrape). Utilise « Remettre à l'endroit »."
          : scan.ratio < 3
            ? `Contraste insuffisant (${scan.ratio.toFixed(1)}:1, plancher 3:1) — éclaircis le fond ou fonce les modules.`
            : logo
              ? "Le logo masque trop de données — réduis-le ou retire-le."
              : "Le code ne se relit pas — adoucis le style (modules carrés, couleur unie).";
        setBlocked(reason);
        onToast("error", reason);
        return;
      }
      const saved = await saveQrPng(nameFromUrl(url), data);
      onToast(
        verdict.readable ? "success" : "info",
        verdict.readable
          ? `${basename(saved.path)} — ${Math.round(saved.bytes / 1024)} Ko, relu et conforme`
          : `${basename(saved.path)} — écrit SANS vérification, teste-le avant diffusion`,
      );
      onReveal(saved.path);
    } catch (e) {
      // un canvas « contaminé » refuse d'être relu : ça ne peut venir que
      // d'une image chargée depuis une autre origine que la nôtre
      const tainted = e instanceof DOMException && e.name === "SecurityError";
      onToast(
        "error",
        tainted
          ? "Le logo empêche la lecture de l'image — recharge-le, il doit être lu depuis le disque et non via une URL."
          : `Export échoué : ${e}`,
      );
    } finally {
      setBusy(false);
    }
  }

  const matches = check?.readable && check.decoded === url.trim();
  // diagnostic indépendant de la relecture : le décodeur travaille sur une
  // image parfaite, un téléphone non (voir analyzeScannability)
  const scan = analyzeScannability(effective);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
      {/* Aperçu */}
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-2xl border border-zinc-800 bg-panel p-6">
        {matrix ? (
          <>
            <canvas
              ref={canvasRef}
              className="max-h-[52vh] w-auto max-w-full rounded-xl"
            />
            <div className="text-center text-xs">
              {check === null ? (
                <span className="text-zinc-500">vérification…</span>
              ) : matches ? (
                <span className="text-emerald-400">
                  ✓ relu correctement — {matrix.size}×{matrix.size} modules,
                  correction {matrix.ecc}
                </span>
              ) : check.readable ? (
                <span className="text-amber-400">
                  ⚠ le code se lit mais renvoie « {check.decoded.slice(0, 60)} »
                </span>
              ) : scan.inverted ? (
                <span className="text-red-400">
                  ✕ code inversé — modules clairs sur fond sombre
                </span>
              ) : (
                <span className="text-red-400">
                  ✕ illisible à {size} px — réduis le logo ou change de style
                </span>
              )}
            </div>

            {/* Mesure du contraste : la relecture seule ne suffit pas, le
                décodeur accepte des écarts qu'un téléphone refuserait. */}
            <div className="flex flex-col items-center gap-1.5 text-xs">
              <span
                // la couleur suit le SEUL contraste : la polarité est un
                // problème distinct, annoncé sur sa propre ligne
                className={
                  scan.ratio >= 7
                    ? "text-emerald-400"
                    : scan.ratio >= 3
                      ? "text-amber-400"
                      : "text-red-400"
                }
              >
                contraste {scan.ratio.toFixed(1)}:1
                {scan.ratio >= 7
                  ? " — confortable"
                  : scan.ratio >= 3
                    ? " — passe à l'écran, risqué à l'impression (viser 7:1)"
                    : " — sous le plancher de 3:1"}
              </span>
              {scan.inverted && (
                <span className="text-red-400">
                  polarité inversée — modules plus clairs que le fond, la taille
                  n'y changera rien
                </span>
              )}
              {scan.inverted && (
                <button
                  type="button"
                  onClick={() => {
                    touched.current = true;
                    setColors(invertPolarity(colors));
                  }}
                  className="cursor-pointer rounded-lg bg-card px-3 py-1.5 text-zinc-200 transition-colors hover:bg-accent-soft"
                >
                  ↔ Remettre à l'endroit (sombre sur clair)
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="max-w-sm text-center text-sm text-zinc-500">
            Colle une adresse, ou connecte un projet : ses URL publiées seront
            proposées automatiquement.
          </p>
        )}
      </div>

      {/* Réglages */}
      <div className="space-y-4 lg:max-h-[78vh] lg:overflow-y-auto lg:pr-1">
        <div className="flex items-center gap-2 rounded-xl bg-panel px-3 py-2 text-xs">
          <span className="shrink-0 text-zinc-500">→ Sortie :</span>
          <span
            className="truncate font-medium text-zinc-300"
            title={destination}
          >
            {destination}
          </span>
        </div>

        <div className="space-y-2 rounded-xl bg-panel p-3">
          <h3 className="text-xs font-semibold tracking-wider text-zinc-600">
            ADRESSE
          </h3>
          <input
            type="text"
            value={url}
            spellCheck={false}
            placeholder="https://…"
            onChange={(e) => {
              setUrl(e.target.value);
              saveQrUrl(projectRoot, e.target.value);
            }}
            className="w-full rounded-lg bg-card px-2.5 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-accent"
          />
          <p className="text-[11px] leading-snug text-zinc-500">
            {projectRoot
              ? "Retenue pour ce projet : tu la saisis une fois. Encodée telle quelle dans les pixels, ce code n'expire pas et ne dépend d'aucun service."
              : "Encodée telle quelle dans les pixels : ce code n'expire pas et ne dépend d'aucun service."}
          </p>
        </div>

        <div className="space-y-3 rounded-xl bg-panel p-3">
          <h3 className="text-xs font-semibold tracking-wider text-zinc-600">
            STYLE
          </h3>
          {/* les préréglages ne verrouillent rien : ils remplissent les
              couleurs, qui restent toutes modifiables ensuite */}
          <div className="flex flex-wrap gap-1 rounded-lg bg-card p-0.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  touched.current = true;
                  setColors(p.colors);
                }}
                className="cursor-pointer rounded-md px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:bg-accent-soft hover:text-zinc-100"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-zinc-500">Modules</span>
            <div className="flex gap-1 rounded-lg bg-card p-0.5">
              {MODULE_SHAPES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setShape(s.id)}
                  className={`cursor-pointer rounded-md px-2.5 py-1 text-xs transition-colors ${
                    shape === s.id
                      ? "bg-accent-soft text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {theme.length > 0 && (
            <div className="space-y-1.5 border-t border-zinc-800/60 pt-3">
              <p className="text-[11px] text-zinc-500">
                Couleurs du site — clic pour teinter les modules
              </p>
              <div className="flex flex-wrap gap-1.5">
                {theme.slice(0, 12).map((c) => (
                  <button
                    key={`${c.source}${c.name}`}
                    type="button"
                    onClick={() => setStop(0, c.value)}
                    title={`${c.name} — ${c.value} (${c.source})`}
                    style={{ backgroundColor: c.value }}
                    className={`h-6 w-6 cursor-pointer rounded-full border transition-transform hover:scale-110 ${
                      c.role === "primary"
                        ? "border-zinc-100"
                        : "border-zinc-700"
                    }`}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2 border-t border-zinc-800/60 pt-3">
            {colors.stops.length === 1 ? (
              <ColorField
                label="Modules"
                color={colors.stops[0][1]}
                onChange={(c) => setStop(0, c)}
              />
            ) : (
              colors.stops.map((stop, i) => (
                <ColorField
                  key={stop[0]}
                  label={
                    i === 0
                      ? "Dégradé haut"
                      : i === colors.stops.length - 1
                        ? "Dégradé bas"
                        : `Étape ${i + 1}`
                  }
                  color={stop[1]}
                  onChange={(c) => setStop(i, c)}
                />
              ))
            )}
            <button
              type="button"
              onClick={() =>
                setColors((c) => ({
                  ...c,
                  stops:
                    c.stops.length === 1
                      ? [
                          [0, "#ffffff"],
                          [1, c.stops[0][1]],
                        ]
                      : [[0, c.stops[c.stops.length - 1][1]]],
                }))
              }
              className="cursor-pointer text-[11px] text-zinc-500 hover:text-zinc-300"
            >
              {colors.stops.length === 1
                ? "→ passer en dégradé"
                : "→ revenir à une couleur unie"}
            </button>

            <ColorField
              label="Fond"
              color={colors.background}
              onChange={(c) => setColor("background", c)}
            />
            <ColorField
              label="Œil extérieur"
              color={colors.eyeOuter}
              disabled={eyesFollow}
              onChange={(c) => setColor("eyeOuter", c)}
            />
            <ColorField
              label="Œil intérieur"
              color={colors.eyeInner}
              disabled={eyesFollow}
              onChange={(c) => setColor("eyeInner", c)}
            />
            <label className="flex cursor-pointer items-center gap-2 pl-24">
              <input
                type="checkbox"
                checked={eyesFollow}
                onChange={(e) => setEyesFollow(e.target.checked)}
                className="h-3.5 w-3.5 cursor-pointer accent-accent"
              />
              <span className="text-[11px] text-zinc-500">
                suivre la couleur des modules
              </span>
            </label>
            <ColorField
              label="Cadre"
              color={colors.frame}
              onChange={(c) => setColor("frame", c)}
            />
          </div>

          <div className="flex items-center gap-2 border-t border-zinc-800/60 pt-3">
            <span className="w-20 shrink-0 text-xs text-zinc-500">Logo</span>
            <button
              type="button"
              onClick={pickLogo}
              className="flex-1 truncate rounded-lg bg-card px-2.5 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-accent-soft"
            >
              {logoPath ? basename(logoPath) : "Choisir une image…"}
            </button>
            {logo && (
              <button
                type="button"
                onClick={() => {
                  setLogo(null);
                  setLogoPath(null);
                }}
                title="Retirer le logo"
                className="cursor-pointer px-1.5 text-xs text-zinc-500 hover:text-red-300"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3 rounded-xl bg-panel p-3">
          <h3 className="text-xs font-semibold tracking-wider text-zinc-600">
            LÉGENDE
          </h3>
          <input
            type="text"
            value={caption}
            placeholder="Aucune légende"
            onChange={(e) => setCaption(e.target.value)}
            className="w-full rounded-lg bg-card px-2.5 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="flex items-center gap-2 text-xs">
            <span className="w-20 shrink-0 text-zinc-500">Police</span>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="min-w-0 flex-1 truncate rounded-lg bg-card px-2.5 py-1.5 text-left text-zinc-300 transition-colors hover:bg-accent-soft"
            >
              {/* le nom est écrit avec la police elle-même : le panneau dit
                  déjà de quoi il s'agit sans ouvrir la fenêtre */}
              <span style={{ fontFamily }}>
                {currentFont?.name ?? "Par défaut"}
              </span>
            </button>
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={arrow}
              onChange={(e) => setArrow(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-accent"
            />
            <span className="text-xs text-zinc-400">Flèche vers le code</span>
          </label>
        </div>

        <div className="space-y-3 rounded-xl bg-panel p-3">
          <h3 className="text-xs font-semibold tracking-wider text-zinc-600">
            EXPORT
          </h3>
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-zinc-500">Taille</span>
            <div className="flex gap-1 rounded-lg bg-card p-0.5">
              {QR_SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  className={`cursor-pointer rounded-md px-2 py-1 text-xs transition-colors ${
                    size === s
                      ? "bg-accent-soft text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-zinc-500">
              Correction
            </span>
            <div className="flex gap-1 rounded-lg bg-card p-0.5">
              {ECC_LEVELS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  disabled={logo !== null && l.id !== "H"}
                  onClick={() => setEcc(l.id)}
                  title={
                    logo !== null && l.id !== "H"
                      ? "Un logo masque le centre : la correction H est obligatoire"
                      : l.note
                  }
                  className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                    logo !== null && l.id !== "H"
                      ? "cursor-not-allowed text-zinc-700"
                      : ecc === l.id
                        ? "cursor-pointer bg-accent-soft text-zinc-100"
                        : "cursor-pointer text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => exportPng()}
            disabled={!matrix || busy}
            className={`w-full rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
              !matrix || busy
                ? "cursor-not-allowed bg-card text-zinc-600"
                : "cursor-pointer bg-accent text-white hover:bg-accent/90"
            }`}
          >
            {busy ? "Export…" : `Créer le PNG ${size}px`}
          </button>
          {blocked && (
            <button
              type="button"
              onClick={() => exportPng(true)}
              className="w-full cursor-pointer rounded-lg bg-card px-3.5 py-2 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
            >
              Exporter quand même, sans vérification
            </button>
          )}
          <p className="text-[11px] leading-snug text-zinc-500">
            Le code est relu avant d'être écrit : s'il n'est pas déchiffrable,
            l'export est refusé plutôt que de te laisser imprimer un code mort.
          </p>
        </div>
      </div>

      {pickerOpen && (
        <FontPicker
          library={libFonts}
          project={fonts}
          picked={pickedFonts}
          dir={fontDir}
          value={fontPath}
          caption={caption}
          onChoose={chooseFont}
          onPickDir={pickFontDir}
          onPickFile={pickFont}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
