//! Workers de traitement d'images : chaque action délègue à un outil CLI
//! installé sur la machine et émet des événements `job-progress`.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Emitter};
use tauri_plugin_clipboard_manager::ClipboardExt;

/// Copie un prompt dans le presse-papier et notifie l'utilisateur.
#[tauri::command]
pub fn deliver_prompt(app: AppHandle, title: String, prompt: String) -> Result<(), String> {
    app.clipboard().write_text(prompt).map_err(|e| e.to_string())?;
    crate::icon_packs::notify(
        &app,
        &title,
        "Le prompt est dans le presse-papier — colle-le à ton agent IA.",
    );
    Ok(())
}

#[derive(Clone, Serialize)]
pub struct Progress {
    pub job_id: String,
    pub status: String,
    pub progress: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub(crate) fn emit(app: &AppHandle, job_id: &str, status: &str, progress: u8, output: Option<String>, error: Option<String>) {
    let _ = app.emit(
        "job-progress",
        Progress {
            job_id: job_id.to_string(),
            status: status.to_string(),
            progress,
            output,
            error,
        },
    );
}

/// Dossier de sortie selon le mode choisi :
/// - "same"      → à côté de l'original
/// - "subfolder" → sous-dossier nommé selon le format cible ; cas malin :
///                 si le dossier parent porte le nom du format source
///                 (ex. `logo/png/x.png`), on utilise le dossier FRÈRE
///                 (`logo/avif/`) pour respecter un rangement par format.
/// - "custom"    → dossier choisi par l'utilisateur
pub(crate) fn resolve_out_dir(input: &Path, mode: &str, custom_dir: &Option<String>, target_ext: &str) -> PathBuf {
    let parent = input.parent().unwrap_or(Path::new(".")).to_path_buf();
    match mode {
        "custom" => custom_dir.as_ref().map(PathBuf::from).unwrap_or(parent),
        "subfolder" => {
            let src_ext = input
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            let parent_name = parent
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_lowercase();
            let base = if !src_ext.is_empty() && parent_name == src_ext {
                parent.parent().map(Path::to_path_buf).unwrap_or(parent)
            } else {
                parent
            };
            base.join(target_ext)
        }
        _ => parent,
    }
}

/// Chemin complet de sortie ; crée le dossier au besoin et évite d'écraser
/// un fichier existant (suffixe -1, -2, …). `suffix` est accolé au nom
/// (ex. `@4x` pour l'upscale, `-nobg` pour le détourage).
fn out_path(input: &str, mode: &str, custom_dir: &Option<String>, ext: &str, suffix: &str) -> Result<String, String> {
    let p = Path::new(input);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("image");
    let dir = resolve_out_dir(p, mode, custom_dir, ext);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Création du dossier impossible : {e}"))?;
    let mut dest = dir.join(format!("{stem}{suffix}.{ext}"));
    let mut i = 1;
    while dest.exists() {
        dest = dir.join(format!("{stem}{suffix}-{i}.{ext}"));
        i += 1;
    }
    Ok(dest.to_string_lossy().to_string())
}

pub(crate) fn run_tool(program: &str, args: &[&str]) -> Result<(), String> {
    // résolution multi-OS : sidecar bundlé → ~/.local/bin → PATH
    let resolved = crate::tools::find_tool(program)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| program.to_string());
    let out = Command::new(&resolved)
        .args(args)
        .output()
        .map_err(|e| format!("{program} introuvable : {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

fn to_ico(input: &str, dest: &str) -> Result<(), String> {
    run_tool(
        "magick",
        &[input, "-define", "icon:auto-resize=256,128,64,48,32,16", dest],
    )
}

fn svg_to_png(input: &str, dest: &str) -> Result<(), String> {
    run_tool(
        "inkscape",
        &[input, "--export-type=png", "--export-width=1024", &format!("--export-filename={dest}")],
    )
}

fn to_avif(input: &str, dest: &str) -> Result<(), String> {
    run_tool(
        "ffmpeg",
        &["-y", "-i", input, "-c:v", "libaom-av1", "-crf", "20", "-still-picture", "1", dest],
    )
}

/// Upscale ×4 via Real-ESRGAN (ncnn/Vulkan → GPU NVIDIA, device 0 forcé
/// car le device auto retombe sur llvmpipe, le rendu logiciel CPU).
/// Le binaire ne lit que png/jpg/webp → pré-conversion ffmpeg sinon (ex. AVIF).
fn upscale(input: &str, dest: &str) -> Result<(), String> {
    let models = crate::tools::realesrgan_models()
        .ok_or("Modèles Real-ESRGAN introuvables (~/.local/share/realesrgan-models ou models/ à côté du binaire)")?;
    let ext = Path::new(input)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    // nom temporaire dérivé de dest (unique par job, voir out_path)
    let tmp = std::env::temp_dir().join(format!(
        "imagehub-pre-{}",
        Path::new(dest).file_name().and_then(|n| n.to_str()).unwrap_or("in.png"),
    ));
    let src = if matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp") {
        input.to_string()
    } else {
        run_tool("ffmpeg", &["-y", "-i", input, &tmp.to_string_lossy()])?;
        tmp.to_string_lossy().to_string()
    };
    let models = models.to_string_lossy();
    let result = run_tool(
        "realesrgan-ncnn-vulkan",
        &["-i", &src, "-o", dest, "-n", "realesrgan-x4plus", "-m", &models, "-g", "0"],
    );
    let _ = std::fs::remove_file(&tmp);
    result
}

/// Détourage (suppression du fond) via rembg (venv dédié ou PATH).
fn remove_bg(input: &str, dest: &str) -> Result<(), String> {
    let rembg = crate::tools::rembg_path()
        .ok_or("rembg non installé (venv ~/.local/share/imagehub-venv ou pip install rembg)")?;
    run_tool(&rembg.to_string_lossy(), &["i", input, dest])
}

/// Vectorisation PNG/JPG → SVG via vtracer.
fn png_to_svg(input: &str, dest: &str) -> Result<(), String> {
    run_tool("vtracer", &["--input", input, "--output", dest])
}

#[tauri::command]
pub async fn run_action(
    app: AppHandle,
    job_id: String,
    path: String,
    action: String,
    output_mode: String,
    custom_dir: Option<String>,
    project_kind: Option<String>,
    project_root: Option<String>,
) -> Result<(), String> {
    emit(&app, &job_id, "running", 15, None, None);

    let app2 = app.clone();
    let job2 = job_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        if matches!(action.as_str(), "webIcons" | "appIcons" | "desktopIcons") {
            return crate::icon_packs::generate(
                &app2, &job2, &path, &output_mode, &custom_dir, &action,
                &project_kind, &project_root,
            );
        }
        let (ext, suffix) = match action.as_str() {
            "toIco" => ("ico", ""),
            "svgToPng" => ("png", ""),
            "toAvif" | "optimizeAvif" => ("avif", ""),
            "upscale" => ("png", "@4x"),
            "removeBg" => ("png", "-nobg"),
            "pngToSvg" => ("svg", ""),
            _ => return Err(format!("Action inconnue : {action}")),
        };
        // optimisation en place : AVIF à côté, puis suppression de l'original
        let mode = if action == "optimizeAvif" { "same" } else { output_mode.as_str() };
        let dest = out_path(&path, mode, &custom_dir, ext, suffix)?;
        match action.as_str() {
            "toIco" => to_ico(&path, &dest)?,
            "svgToPng" => svg_to_png(&path, &dest)?,
            "toAvif" => to_avif(&path, &dest)?,
            "upscale" => upscale(&path, &dest)?,
            "removeBg" => remove_bg(&path, &dest)?,
            "pngToSvg" => png_to_svg(&path, &dest)?,
            "optimizeAvif" => {
                to_avif(&path, &dest)?;
                std::fs::remove_file(&path)
                    .map_err(|e| format!("AVIF créé mais suppression de l'original impossible : {e}"))?;
            }
            _ => unreachable!(),
        }
        Ok(dest)
    })
    .await
    .map_err(|e| e.to_string())?;

    match result {
        Ok(dest) => emit(&app, &job_id, "done", 100, Some(dest), None),
        Err(e) => emit(&app, &job_id, "error", 100, None, Some(e)),
    }
    Ok(())
}
