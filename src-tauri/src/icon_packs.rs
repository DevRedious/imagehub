//! Packs d'icônes one-shot générés depuis un SVG : web (favicon/PWA),
//! appli mobile (iOS/Android/Expo) et desktop (Tauri/Electron).
//! Projet connecté → fichiers écrits directement aux emplacements de la stack.
//! À la fin : prompt d'intégration copié dans le presse-papier + notification.

use crate::actions::{emit, resolve_out_dir, run_tool};
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

fn png(src: &str, dest: &PathBuf, size: u32, inner: Option<u32>) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let inner = inner.unwrap_or(size);
    run_tool(
        "magick",
        &[src, "-resize", &format!("{inner}x{inner}"), "-background", "none",
          "-gravity", "center", "-extent", &format!("{size}x{size}"), &dest.to_string_lossy()],
    )
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

    // Rendu maître 1024px via Inkscape + copie du SVG source dans le pack.
    let tmp = std::env::temp_dir().join(format!("imagehub-pack-{job_id}.png"));
    run_tool(
        "inkscape",
        &[input, "--export-type=png", "--export-width=1024", "--export-height=1024",
          &format!("--export-filename={}", tmp.display())],
    )?;
    let src = tmp.to_string_lossy().to_string();
    let _ = fs::copy(input, dir.join("icon.svg"));

    let total = (specs.len() + 2) as u32;
    let mut step = 0u32;
    let mut bump = |app: &AppHandle| {
        step += 1;
        emit(app, job_id, "running", (10 + 85 * step / total) as u8, None, None);
    };

    for (size, name, inner) in specs {
        png(&src, &dir.join(name), *size, *inner)?;
        bump(app);
    }

    match kind {
        "webIcons" => {
            run_tool("magick", &[&src, "-define", "icon:auto-resize=48,32,16",
                &dir.join("favicon.ico").to_string_lossy()])?;
            if !dir.join("site.webmanifest").exists() {
                fs::write(dir.join("site.webmanifest"), MANIFEST).map_err(|e| e.to_string())?;
            }
        }
        "desktopIcons" => {
            run_tool("magick", &[&src, "-define", "icon:auto-resize=256,128,64,48,32,16",
                &dir.join("icon.ico").to_string_lossy()])?;
            // .icns best effort (ImageMagick le gère sommairement) : non bloquant
            let _ = run_tool("magick", &[&src, "-resize", "512x512",
                &dir.join("icon.icns").to_string_lossy()]);
        }
        _ => {}
    }
    bump(app);

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
