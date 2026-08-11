import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ToolsStatus } from "../lib/actions";
import {
  DISCORD_MAX_BYTES,
  EMOJI_FORMATS,
  EMOJI_SIZES,
  type EmojiFormat,
  emojiDir,
  formatBytes,
  GIF_BACKGROUNDS,
  listSvgs,
  loadColor,
  loadLibraryDir,
  loadRecentColors,
  pushRecentColor,
  type SvgItem,
  saveColor,
  saveEmojiAnimation,
  saveEmojiPng,
  saveEmojiSvg,
  saveLibraryDir,
} from "../lib/emoji";
import { basename } from "../lib/paths";
import {
  captureFrames,
  detectDuration,
  frameAt,
  framesAreStill,
  hasFade,
  rasterize,
  recolor,
  sanitize,
  toCurrentColor,
} from "../lib/svg";
import { ColorPicker } from "./ColorPicker";

interface Props {
  tools: ToolsStatus | null;
  onReveal: (path: string) => void;
  onToast: (kind: "success" | "error" | "info", message: string) => void;
}

interface Busy {
  label: string;
  done: number;
  total: number;
}

export function EmojiView({ tools, onReveal, onToast }: Props) {
  const [dir, setDir] = useState<string | null>(loadLibraryDir);
  const [items, setItems] = useState<SvgItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [destination, setDestination] = useState("");
  const [color, setColor] = useState(loadColor);
  const [recent, setRecent] = useState(loadRecentColors);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [format, setFormat] = useState<EmojiFormat>("gif");
  const [size, setSize] = useState(128);
  const [fps, setFps] = useState(20);
  const [duration, setDuration] = useState(1);
  // fond du GIF : null = transparence réelle (voir GIF_BACKGROUNDS)
  const [background, setBackground] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);

  useEffect(() => {
    emojiDir()
      .then(setDestination)
      .catch(() => {});
  }, []);

  const load = useCallback(
    async (target: string) => {
      setLoading(true);
      try {
        const lib = await listSvgs(target);
        // Deux traitements une fois pour toutes, au chargement :
        // 1. sanitize — ces sources sont injectées dans le DOM pour être
        //    animées, on les désarme avant de les laisser approcher du webview ;
        // 2. toCurrentColor — normalise les couleurs en dur, pour que changer
        //    de teinte plus tard soit une simple propriété CSS et ne touche
        //    jamais au balisage (voir le mémo sur `htmlOf`).
        setItems(
          lib.items
            .map((i) => ({ ...i, source: toCurrentColor(sanitize(i.source)) }))
            .filter((i) => i.source !== ""),
        );
        setSelectedPath(null);
        if (lib.items.length === 0) {
          onToast("info", "Aucun SVG dans ce dossier");
        } else if (lib.skipped > 0 || lib.truncated) {
          const reasons = [
            lib.skipped > 0 ? `${lib.skipped} écarté(s)` : null,
            lib.truncated ? "liste tronquée" : null,
          ].filter(Boolean);
          onToast(
            "info",
            `${lib.items.length} SVG chargés — ${reasons.join(", ")}`,
          );
        }
      } catch (e) {
        onToast("error", `Bibliothèque illisible : ${e}`);
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [onToast],
  );

  useEffect(() => {
    if (dir) load(dir);
  }, [dir, load]);

  async function pickLibrary() {
    const picked = await open({ directory: true });
    if (typeof picked !== "string") return;
    saveLibraryDir(picked);
    setDir(picked);
  }

  // Le sélecteur natif émet en continu pendant qu'on fait glisser la souris.
  // L'état suit immédiatement (l'aperçu doit être instantané), mais l'écriture
  // dans localStorage est synchrone : la faire à chaque événement saccade
  // l'interface. On ne persiste donc qu'une fois le geste retombé.
  const persistTimer = useRef<number | null>(null);
  function updateColor(next: string) {
    setColor(next);
    if (persistTimer.current !== null) clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => saveColor(next), 300);
  }

  useEffect(() => {
    return () => {
      if (persistTimer.current !== null) clearTimeout(persistTimer.current);
    };
  }, []);

  /** Mémorise la couleur au moment où elle sert vraiment (un export), pas à
   *  chaque mouvement du sélecteur. */
  function rememberColor() {
    setRecent(pushRecentColor(color));
  }

  const selected = items.find((i) => i.path === selectedPath) ?? null;

  // L'objet passé à `dangerouslySetInnerHTML` doit garder la MÊME identité d'un
  // rendu à l'autre : React 19 réécrit l'innerHTML dès que l'objet change, même
  // si la chaîne est identique — ce qui détruirait le SVG et relancerait son
  // animation à chaque mouvement du sélecteur de couleur. On mémoïse donc un
  // objet par icône, dépendant des seules `items`. La couleur, elle, ne passe
  // plus du tout par le balisage : c'est du CSS hérité (voir `toCurrentColor`).
  const html = useMemo(() => {
    const map = new Map<string, { __html: string }>();
    for (const item of items) map.set(item.path, { __html: item.source });
    return map;
  }, [items]);

  const htmlOf = useCallback(
    (item: SvgItem) => html.get(item.path) ?? { __html: item.source },
    [html],
  );

  useEffect(() => {
    if (!selected) return;
    setName(selected.name);
    setDuration(detectDuration(selected.source));
    setFormat((f) =>
      selected.animated ? f : f === "gif" || f === "webp" ? "png" : f,
    );
  }, [selected]);

  const frameCount = Math.max(1, Math.round(duration * fps));
  const def = EMOJI_FORMATS.find((f) => f.id === format);
  const needsFfmpeg = def?.animated ?? false;
  const ffmpegMissing = needsFfmpeg && tools !== null && !tools.ffmpeg;
  // le fond ne concerne que le GIF : le WebP garde un vrai alpha
  const showBackground = format === "gif" && background !== null;
  // une icône qui s'estompe ne survit pas au bit unique de transparence du GIF
  const fadeAtRisk =
    format === "gif" &&
    background === null &&
    selected !== null &&
    hasFade(selected.source);

  async function exportEmoji() {
    if (!selected || busy) return;
    const source = recolor(selected.source, color);
    rememberColor();
    try {
      if (format === "svg") {
        setBusy({ label: "Écriture du SVG", done: 0, total: 1 });
        const out = await saveEmojiSvg(name, source);
        finish(out.path, out.bytes);
        return;
      }
      if (format === "png") {
        setBusy({ label: "Rendu de l'image", done: 0, total: 1 });
        const png = await rasterize(frameAt(source, 0, size), size);
        const out = await saveEmojiPng(name, png);
        finish(out.path, out.bytes);
        return;
      }
      setBusy({ label: "Capture des images", done: 0, total: frameCount });
      const frames = await captureFrames(source, {
        duration,
        fps,
        size,
        onProgress: (done, total) =>
          setBusy({ label: "Capture des images", done, total }),
      });
      if (framesAreStill(frames)) {
        onToast(
          "info",
          "Animation non capturée : toutes les images sont identiques — le fichier sera fixe",
        );
      }
      setBusy({ label: "Encodage", done: frameCount, total: frameCount });
      const out = await saveEmojiAnimation(
        name,
        format,
        frames,
        fps,
        size,
        background,
      );
      finish(out.path, out.bytes);
    } catch (e) {
      onToast("error", `Export échoué : ${e}`);
    } finally {
      setBusy(null);
    }
  }

  function finish(path: string, bytes: number) {
    const weight = formatBytes(bytes);
    if (bytes > DISCORD_MAX_BYTES) {
      onToast(
        "info",
        `${basename(path)} — ${weight}, au-delà des 256 Ko de Discord : baisse la taille, les FPS ou la durée`,
      );
    } else {
      onToast("success", `${basename(path)} — ${weight}`);
    }
    onReveal(path);
  }

  if (!dir) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-zinc-700 bg-panel p-12 text-center">
        <p className="text-lg font-medium">Choisis une bibliothèque de SVG</p>
        <p className="max-w-md text-sm text-zinc-500">
          Un dossier d'icônes, animées ou non. Elles seront affichées, mises à
          la couleur de ton choix, puis exportées en emoji.
        </p>
        <button
          type="button"
          onClick={pickLibrary}
          className="cursor-pointer rounded-lg bg-card px-3.5 py-2 text-sm text-zinc-200 transition-colors hover:bg-accent-soft"
        >
          📁 Choisir un dossier
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
      {/* Galerie */}
      <div className="flex min-h-[60vh] flex-col rounded-2xl border border-zinc-800 bg-panel">
        <div className="flex items-center gap-2 border-b border-zinc-800/60 px-3 py-2.5 text-xs">
          <span className="shrink-0 text-zinc-500">Bibliothèque :</span>
          <span className="truncate font-medium text-zinc-300" title={dir}>
            {dir}
          </span>
          <span className="shrink-0 text-zinc-600">
            {loading ? "chargement…" : `${items.length} SVG`}
          </span>
          <button
            type="button"
            onClick={pickLibrary}
            className="ml-auto shrink-0 cursor-pointer rounded-lg bg-card px-2.5 py-1.5 text-zinc-300 transition-colors hover:bg-accent-soft"
          >
            Changer
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
            {items.map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => setSelectedPath(item.path)}
                title={`${item.name}${item.animated ? " (animé)" : ""}`}
                style={{ color }}
                className={`group relative aspect-square cursor-pointer rounded-xl border p-2.5 transition-colors ${
                  item.path === selectedPath
                    ? "border-accent bg-accent-soft"
                    : "border-zinc-800 bg-card hover:border-zinc-600"
                }`}
              >
                <span
                  className="ih-svg block h-full w-full"
                  // source assainie au chargement (voir sanitize) — l'injection
                  // est nécessaire : un SVG en <img> n'hérite pas de `color`
                  // et ne pourrait donc pas être recoloré.
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: seul moyen d'animer ET recoloriser
                  dangerouslySetInnerHTML={htmlOf(item)}
                />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate rounded-b-xl bg-surface/90 px-1 py-0.5 text-[9px] text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100">
                  {item.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Panneau d'édition */}
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

        <ColorPicker color={color} onChange={updateColor} recent={recent} />

        {!selected ? (
          <p className="rounded-xl bg-panel p-3 text-xs text-zinc-500">
            Choisis une icône dans la galerie pour l'exporter en emoji.
          </p>
        ) : (
          <>
            <div className="space-y-3 rounded-xl bg-panel p-3">
              {/* l'aperçu porte le fond choisi : on voit ce qu'on exportera */}
              <div
                className={`mx-auto flex h-32 w-32 items-center justify-center rounded-xl p-3 ${
                  showBackground ? "" : "ih-checker"
                }`}
                style={{
                  color,
                  ...(showBackground ? { backgroundColor: background } : {}),
                }}
              >
                <span
                  className="ih-svg block h-full w-full"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: aperçu animé de la source assainie
                  dangerouslySetInnerHTML={htmlOf(selected)}
                />
              </div>
              <p className="text-center text-[11px] text-zinc-500">
                {selected.animated ? "animé" : "statique"}
                {selected.themeable ? "" : " · couleurs d'origine unifiées"}
              </p>

              <label className="block">
                <span className="text-xs text-zinc-500">Nom du fichier</span>
                <input
                  type="text"
                  value={name}
                  spellCheck={false}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-card px-2.5 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-accent"
                />
              </label>
            </div>

            <div className="space-y-3 rounded-xl bg-panel p-3">
              <h3 className="text-xs font-semibold tracking-wider text-zinc-600">
                FORMAT
              </h3>
              <div className="grid grid-cols-2 gap-1.5">
                {EMOJI_FORMATS.map((f) => {
                  const blocked = f.animated && !selected.animated;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      disabled={blocked}
                      onClick={() => setFormat(f.id)}
                      title={blocked ? "Cette icône n'est pas animée" : f.note}
                      className={`rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                        blocked
                          ? "cursor-not-allowed bg-card/50 text-zinc-600"
                          : format === f.id
                            ? "cursor-pointer bg-accent-soft text-zinc-100"
                            : "cursor-pointer bg-card text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {f.label}
                      <span className="block text-[10px] leading-tight text-zinc-500">
                        {f.note}
                      </span>
                    </button>
                  );
                })}
              </div>

              {format !== "svg" && (
                <div className="flex items-center gap-2">
                  <span className="w-20 text-xs text-zinc-500">Taille</span>
                  <div className="flex gap-1 rounded-lg bg-card p-0.5">
                    {EMOJI_SIZES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSize(s)}
                        className={`cursor-pointer rounded-md px-2.5 py-1 text-xs transition-colors ${
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
              )}

              {format === "gif" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-xs text-zinc-500">
                      Fond
                    </span>
                    <div className="flex flex-wrap gap-1 rounded-lg bg-card p-0.5">
                      {GIF_BACKGROUNDS.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setBackground(b.color)}
                          className={`cursor-pointer rounded-md px-2.5 py-1 text-xs transition-colors ${
                            background === b.color
                              ? "bg-accent-soft text-zinc-100"
                              : "text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                      <input
                        type="color"
                        value={background ?? "#313338"}
                        onChange={(e) => setBackground(e.target.value)}
                        title="Fond personnalisé"
                        className="h-6 w-8 cursor-pointer rounded-md border border-zinc-700 bg-card p-0.5"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] leading-snug text-zinc-500">
                    {background === null
                      ? "Le GIF n'a qu'un bit de transparence : les bords seront tranchés net et les fondus perdus."
                      : "Images composées sur ce fond : bords lissés et fondus fidèles, mais l'aplat sera visible si la destination n'a pas cette couleur."}
                  </p>
                  {fadeAtRisk && (
                    <p className="text-[11px] leading-snug text-amber-400">
                      Cette icône s'estompe : en transparent, elle clignotera au
                      lieu de fondre. Choisis un fond, ou passe en WebP.
                    </p>
                  )}
                </div>
              )}

              {needsFfmpeg && (
                <>
                  <div className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-xs text-zinc-500">
                      Boucle
                    </span>
                    <input
                      type="range"
                      min={0.2}
                      max={6}
                      step={0.1}
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      title="Durée d'un tour complet de l'animation"
                      className="h-1.5 flex-1 cursor-pointer accent-accent"
                    />
                    <span className="w-10 text-right text-xs tabular-nums text-zinc-400">
                      {duration.toFixed(1)}s
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-xs text-zinc-500">
                      Images/s
                    </span>
                    <input
                      type="range"
                      min={5}
                      max={30}
                      step={1}
                      value={fps}
                      onChange={(e) => setFps(Number(e.target.value))}
                      className="h-1.5 flex-1 cursor-pointer accent-accent"
                    />
                    <span className="w-10 text-right text-xs tabular-nums text-zinc-400">
                      {fps}
                    </span>
                  </div>
                  <p className="text-[11px] leading-snug text-zinc-500">
                    {frameCount} images à capturer. La durée est estimée depuis
                    l'animation — ajuste-la si la boucle saute.
                  </p>
                </>
              )}

              {ffmpegMissing && (
                <p className="text-[11px] text-red-400">
                  ffmpeg est absent : les formats animés ne peuvent pas être
                  encodés.
                </p>
              )}

              <button
                type="button"
                onClick={exportEmoji}
                disabled={busy !== null || ffmpegMissing || name.trim() === ""}
                className={`w-full rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  busy !== null || ffmpegMissing || name.trim() === ""
                    ? "cursor-not-allowed bg-card text-zinc-600"
                    : "cursor-pointer bg-accent text-white hover:bg-accent/90"
                }`}
              >
                {busy
                  ? `${busy.label}… ${busy.done}/${busy.total}`
                  : `Créer l'emoji ${def?.label ?? ""}`}
              </button>
              {busy && (
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-150"
                    style={{
                      width: `${busy.total > 0 ? (busy.done / busy.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
