//! Packs d'icônes one-shot générés depuis un SVG : web (favicon/PWA),
//! appli mobile (iOS/Android/Expo) et desktop (Tauri/Electron).
//! Projet connecté → fichiers écrits directement aux emplacements de la stack.
//! À la fin : prompt d'intégration copié dans le presse-papier + notification.

use crate::actions::{emit, resolve_out_dir, run_tool, run_tool_capture};
use crate::icon_prompts::prompt_for;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

/// (taille, chemin relatif, taille interne pour zone de sécurité éventuelle)
type Spec = (u32, &'static str, Option<u32>);

const WEB: &[Spec] = &[
    (16, "favicon-16x16.png", None),
    (32, "favicon-32x32.png", None),
    (96, "favicon-96x96.png", None),
    (180, "apple-touch-icon.png", None),
    (192, "icon-192x192.png", None),
    (512, "icon-512x512.png", None),
    (512, "maskable-icon-512x512.png", Some(410)),
];

const APP: &[Spec] = &[
    (1024, "icon-1024.png", None),
    (1024, "adaptive-icon-foreground.png", Some(684)),
    (512, "playstore-512.png", None),
    (180, "ios/icon-180.png", None),
    (167, "ios/icon-167.png", None),
    (152, "ios/icon-152.png", None),
    (120, "ios/icon-120.png", None),
    (192, "android/mipmap-xxxhdpi.png", None),
    (144, "android/mipmap-xxhdpi.png", None),
    (96, "android/mipmap-xhdpi.png", None),
    (72, "android/mipmap-hdpi.png", None),
    (48, "android/mipmap-mdpi.png", None),
];

/// Variante Expo : noms attendus par app.json, extras dans icons-extra/.
const APP_EXPO: &[Spec] = &[
    (1024, "icon.png", None),
    (1024, "adaptive-icon.png", Some(684)),
    (48, "favicon.png", None),
    (512, "icons-extra/playstore-512.png", None),
    (180, "icons-extra/ios-180.png", None),
    (167, "icons-extra/ios-167.png", None),
    (152, "icons-extra/ios-152.png", None),
    (120, "icons-extra/ios-120.png", None),
];

const DESKTOP: &[Spec] = &[
    (32, "32x32.png", None),
    (64, "64x64.png", None),
    (128, "128x128.png", None),
    (256, "128x128@2x.png", None),
    (512, "512x512.png", None),
    (1024, "icon.png", None),
];

const MANIFEST: &str = r##"{
  "name": "",
  "short_name": "",
  "icons": [
    { "src": "/icon-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512x512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/maskable-icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "theme_color": "#ffffff",
  "background_color": "#ffffff",
  "display": "standalone"
}
"##;

// Fonds neutres opaques choisis par contraste quand le logo n'a pas de fond.
const BG_DARK: &str = "#1f2430"; // logo entièrement clair (jaune+blanc…)
const BG_LIGHT: &str = "#f2f3f5"; // logo entièrement foncé
const BG_MID: &str = "#6b7280"; // logo contrasté (clair ET foncé, ex. jaune+noir)

/// Luminance extrême des pixels opaques. On aplatit le transparent vers la teinte
/// `flatten` (jamais l'extrême recherché : blanc pour le min, noir pour le max),
/// donc seul le logo décide. Robuste à l'anti-aliasing (les bords fondus tirent
/// vers la teinte d'aplatissement, pas vers l'extrême opposé).
fn extreme_lum(src: &str, flatten: &str, prop: &str) -> Result<f32, String> {
    Ok(run_tool_capture(
        "magick",
        &[src, "-background", flatten, "-flatten", "-colorspace", "Gray", "-format",
          &format!("%[fx:{prop}]"), "info:"],
    )?
    .parse()
    .unwrap_or(0.5))
}

/// Couleur de fond opaque pour la maskable. Le masque du système déborde la zone
/// de sécurité : il faut un fond plein jusqu'aux bords.
/// - SVG plein-cadre (coin opaque) → on reprend la couleur du coin : le fond se
///   prolonge sans rupture.
/// - logo transparent → gris neutre qui *contraste* avec le logo, choisi sur
///   l'étendue de ses luminances (tout clair → fond foncé, tout foncé → fond
///   clair, mélange clair+foncé → gris moyen lisible des deux côtés).
fn sample_bg(src: &str) -> Result<String, String> {
    let corner = run_tool_capture(
        "magick",
        &[src, "-format", "%[fx:p{0,0}.a] %[pixel:p{0,0}]", "info:"],
    )?;
    let mut parts = corner.splitn(2, ' ');
    let alpha: f32 = parts.next().and_then(|a| a.parse().ok()).unwrap_or(0.0);
    let color = parts.next().unwrap_or("").trim();
    if alpha >= 0.5 && !color.is_empty() {
        return Ok(color.to_string());
    }
    let min = extreme_lum(src, "white", "minima")?;
    let max = extreme_lum(src, "black", "maxima")?;
    Ok(if min >= 0.5 {
        BG_DARK
    } else if max <= 0.5 {
        BG_LIGHT
    } else {
        BG_MID
    }
    .to_string())
}

/// Génère un PNG carré : logo réduit à `inner` puis centré sur un canvas `size`.
/// `bg = Some(couleur)` (maskable) → fond opaque jusqu'aux bords + aplatissement,
/// car le masque du système déborde la zone de sécurité ; `None` → bordure
/// transparente (favicons, calques *foreground* adaptive Android/Expo).
fn png(src: &str, dest: &PathBuf, size: u32, inner: Option<u32>, bg: Option<&str>) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let inner = inner.unwrap_or(size);
    let resize = format!("{inner}x{inner}");
    let extent = format!("{size}x{size}");
    let dest_s = dest.to_string_lossy();
    let mut args: Vec<&str> = vec![src, "-resize", &resize, "-gravity", "center"];
    match bg {
        Some(color) => args.extend_from_slice(&[
            "-background", color, "-extent", &extent, "-flatten", &dest_s,
        ]),
        None => args.extend_from_slice(&[
            "-background", "none", "-extent", &extent, &dest_s,
        ]),
    }
    run_tool("magick", &args)
}

/// Fraction de pixels opaques d'une teinte achromatique : `seq = "min"` cible le
/// blanc (min(R,G,B) élevé), `seq = "max"` + `negate` cible le noir. Les couleurs
/// saturées (jaune…) sont naturellement exclues. Valeur ∈ 0..1 (× couverture alpha).
fn tone_frac(src: &str, seq: &str, thresh: &str, negate: bool) -> Result<f32, String> {
    let mut args: Vec<&str> = vec![
        src, "(", "-clone", "0", "-channel", "RGB", "-separate",
        "-evaluate-sequence", seq, "-threshold", thresh,
    ];
    if negate {
        args.push("-negate");
    }
    args.extend_from_slice(&[
        ")", "(", "-clone", "0", "-alpha", "extract", ")",
        "-delete", "0", "-compose", "multiply", "-composite",
        "-format", "%[fx:mean]", "info:",
    ]);
    Ok(run_tool_capture("magick", &args)?.parse().unwrap_or(0.0))
}

/// Le logo se prête-t-il à une paire dark/light (zone blanche ou noire notable à
/// inverser) ? `None` → un seul set. `Some(true)` → le blanc domine, l'original est
/// la variante « dark » (contenu clair pour fond sombre) ; `Some(false)` → le noir
/// domine, l'original est « light ».
fn detect_theme(src: &str) -> Result<Option<bool>, String> {
    let cov: f32 = run_tool_capture(
        "magick",
        &[src, "-alpha", "extract", "-format", "%[fx:mean]", "info:"],
    )?
    .parse()
    .unwrap_or(0.0);
    if cov < 0.001 {
        return Ok(None); // image quasi vide : rien à faire
    }
    let white = tone_frac(src, "min", "80%", false)? / cov;
    let black = tone_frac(src, "max", "20%", true)? / cov;
    // < 5 % des pixels opaques → l'inversion ne changerait quasi rien : un seul set.
    if white.max(black) < 0.05 {
        Ok(None)
    } else {
        Ok(Some(white >= black))
    }
}

/// Inverse les pixels achromatiques (blanc↔noir, gris inversés) en préservant les
/// couleurs (jaune intact) et l'alpha d'origine → produit la variante de thème
/// opposée. Masque = faible saturation ∩ pixels opaques.
fn invert_achromatic(src: &str, dest: &str) -> Result<(), String> {
    run_tool(
        "magick",
        &[
            src,
            "(", "-clone", "0", "-channel", "RGB", "-negate", "+channel", ")",
            "(", "-clone", "0", "-alpha", "extract", ")",
            "(", "-clone", "0", "-colorspace", "HSL", "-channel", "G", "-separate",
                 "+channel", "-threshold", "25%", "-negate", ")",
            "(", "-clone", "2", "-clone", "3", "-compose", "multiply", "-composite", ")",
            "-delete", "2,3",
            "-compose", "over", "-composite",
            dest,
        ],
    )
}

/// Insère un suffixe de variante avant l'extension : `ios/icon-180.png` + `dark`
/// → `ios/icon-180-dark.png`. Suffixe vide → nom inchangé (set unique).
fn suffixed(rel: &str, suffix: &str) -> String {
    if suffix.is_empty() {
        return rel.to_string();
    }
    match rel.rfind('.') {
        Some(i) => format!("{}-{}{}", &rel[..i], suffix, &rel[i..]),
        None => format!("{rel}-{suffix}"),
    }
}

/// Manifest PWA avec les `src` d'icônes suffixés pour la variante.
fn manifest_for(suffix: &str) -> String {
    if suffix.is_empty() {
        MANIFEST.to_string()
    } else {
        MANIFEST.replace(".png\"", &format!("-{suffix}.png\""))
    }
}

/// Écrit un set complet (toutes tailles + favicon/ico/manifest selon le pack)
/// depuis le rendu maître `master`, en suffixant chaque fichier.
fn write_pack(
    dir: &Path,
    specs: &[Spec],
    kind: &str,
    master: &str,
    suffix: &str,
    bump: &mut dyn FnMut(),
) -> Result<(), String> {
    // Fond maskable échantillonné une fois, et seulement si le pack en contient un.
    let mask_bg = specs
        .iter()
        .any(|(_, name, _)| name.contains("maskable"))
        .then(|| sample_bg(master))
        .transpose()?;

    for (size, name, inner) in specs {
        let bg = if name.contains("maskable") { mask_bg.as_deref() } else { None };
        png(master, &dir.join(suffixed(name, suffix)), *size, *inner, bg)?;
        bump();
    }

    match kind {
        "webIcons" => {
            run_tool("magick", &[master, "-define", "icon:auto-resize=48,32,16",
                &dir.join(suffixed("favicon.ico", suffix)).to_string_lossy()])?;
            let mf = dir.join(suffixed("site.webmanifest", suffix));
            if !mf.exists() {
                fs::write(mf, manifest_for(suffix)).map_err(|e| e.to_string())?;
            }
        }
        "desktopIcons" => {
            run_tool("magick", &[master, "-define", "icon:auto-resize=256,128,64,48,32,16",
                &dir.join(suffixed("icon.ico", suffix)).to_string_lossy()])?;
            // .icns best effort (ImageMagick le gère sommairement) : non bloquant
            let _ = run_tool("magick", &[master, "-resize", "512x512",
                &dir.join(suffixed("icon.icns", suffix)).to_string_lossy()]);
        }
        _ => {}
    }
    bump();
    Ok(())
}

/// Drapeau Inkscape pour rasteriser le SVG à 1024px sur son plus grand côté, en
/// préservant le ratio (un seul des deux côtés est imposé). Repli sur la largeur
/// si les dimensions sont illisibles.
fn master_dim(input: &str) -> String {
    let q = |flag: &str| {
        run_tool_capture("inkscape", &[flag, input])
            .ok()
            .and_then(|s| s.trim().parse::<f32>().ok())
            .unwrap_or(0.0)
    };
    if q("--query-height") > q("--query-width") {
        "--export-height=1024".to_string()
    } else {
        "--export-width=1024".to_string()
    }
}

/// Notification système, multi-plateforme (plugin Tauri).
pub(crate) fn notify(app: &AppHandle, title: &str, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show();
}

/// Dossier cible + liste de fichiers selon le pack et le projet connecté.
/// `in_project` = true quand les fichiers sont écrits directement dans la stack.
fn plan(
    kind: &str,
    stem: &str,
    input: &Path,
    mode: &str,
    custom_dir: &Option<String>,
    project: Option<(&str, &str)>, // (kind, root)
) -> Result<(PathBuf, &'static [Spec], bool), String> {
    let (label, generic_specs) = match kind {
        "webIcons" => ("web-icons", WEB),
        "appIcons" => ("app-icons", APP),
        "desktopIcons" => ("desktop-icons", DESKTOP),
        _ => return Err(format!("Pack inconnu : {kind}")),
    };

    if let Some((pkind, root)) = project {
        let root = Path::new(root);
        let target = match (kind, pkind) {
            ("webIcons", "nextjs" | "vite" | "electron" | "generic") => {
                Some((root.join("public"), WEB, true))
            }
            ("appIcons", "expo" | "react-native") => Some((root.join("assets"), APP_EXPO, true)),
            ("desktopIcons", "tauri") => Some((root.join("src-tauri/icons"), DESKTOP, true)),
            _ => None,
        };
        // pack ne correspondant pas à la stack → dossier dédié à la racine du projet
        let (dir, specs, in_project) =
            target.unwrap_or((root.join(format!("imagehub-{label}")), generic_specs, false));
        return Ok((dir, specs, in_project));
    }

    let base = resolve_out_dir(input, mode, custom_dir, label);
    let dir = if mode == "subfolder" {
        base.join(stem)
    } else {
        base.join(format!("{stem}-{label}"))
    };
    Ok((dir, generic_specs, false))
}

#[allow(clippy::too_many_arguments)]
pub fn generate(
    app: &AppHandle,
    job_id: &str,
    input: &str,
    mode: &str,
    custom_dir: &Option<String>,
    kind: &str,
    project_kind: &Option<String>,
    project_root: &Option<String>,
) -> Result<String, String> {
    let p = Path::new(input);
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    if ext != "svg" {
        return Err("Cette action n'accepte que du SVG (qualité parfaite à toutes les tailles).".into());
    }
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("icon");
    let project = project_kind.as_deref().zip(project_root.as_deref());

    let (dir, specs, in_project) = plan(kind, stem, p, mode, custom_dir, project)?;
    fs::create_dir_all(&dir).map_err(|e| format!("Création du dossier impossible : {e}"))?;

    // Rendu maître : 1024px sur le plus grand côté (ratio préservé via Inkscape),
    // puis centré dans un carré 1024×1024 transparent. Sans ce recadrage, un logo
    // large (mot-symbole « GitHub »…) serait étiré pour remplir le carré.
    let raw = std::env::temp_dir().join(format!("imagehub-pack-{job_id}-raw.png"));
    run_tool(
        "inkscape",
        &[input, "--export-type=png", &master_dim(input),
          &format!("--export-filename={}", raw.display())],
    )?;
    let tmp = std::env::temp_dir().join(format!("imagehub-pack-{job_id}.png"));
    run_tool(
        "magick",
        &[&raw.to_string_lossy(), "-background", "none", "-gravity", "center",
          "-extent", "1024x1024", &tmp.to_string_lossy()],
    )?;
    let _ = fs::remove_file(&raw);
    let src = tmp.to_string_lossy().to_string();
    let _ = fs::copy(input, dir.join("icon.svg"));

    // Paire dark/light si le logo s'y prête (blanc ou noir à inverser), sauf en
    // injection directe dans un projet (le framework attend des noms fixes).
    let theme = if in_project { None } else { detect_theme(&src)? };

    let total = (specs.len() as u32 + 2) * if theme.is_some() { 2 } else { 1 };
    let mut step = 0u32;
    let mut bump = || {
        step += 1;
        emit(app, job_id, "running", (10 + 85 * step / total) as u8, None, None);
    };

    match theme {
        None => write_pack(&dir, specs, kind, &src, "", &mut bump)?,
        Some(white_dominant) => {
            let inv = std::env::temp_dir().join(format!("imagehub-pack-{job_id}-inv.png"));
            let inv_s = inv.to_string_lossy().to_string();
            invert_achromatic(&src, &inv_s)?;
            // blanc dominant → original = contenu clair pour fond sombre = « dark »
            let (orig, other) = if white_dominant { ("dark", "light") } else { ("light", "dark") };
            write_pack(&dir, specs, kind, &src, orig, &mut bump)?;
            write_pack(&dir, specs, kind, &inv_s, other, &mut bump)?;
            let _ = fs::remove_file(&inv);
        }
    }

    let _ = fs::remove_file(&tmp);

    // Prompt d'intégration → presse-papier + notification
    let prompt = prompt_for(kind, &dir.to_string_lossy(), project, in_project);
    match app.clipboard().write_text(prompt) {
        Ok(()) => notify(
            app,
            "Pack d'icônes généré ✅",
            "Le prompt d'intégration est dans le presse-papier — colle-le à ton agent IA.",
        ),
        Err(_) => notify(app, "Pack d'icônes généré", "Copie du prompt impossible."),
    }

    Ok(dir.to_string_lossy().to_string())
}
