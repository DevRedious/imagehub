//! Résolution multi-plateforme des outils CLI externes.
//! Ordre de recherche : sidecar à côté du binaire de l'app (bundles CI),
//! puis ~/.local/bin (installation utilisateur Linux), puis le PATH.

use serde::Serialize;
use std::path::PathBuf;

#[cfg(windows)]
const EXE_EXT: &str = ".exe";
#[cfg(not(windows))]
const EXE_EXT: &str = "";

/// Dossier personnel, HOME (Linux/macOS) ou USERPROFILE (Windows).
pub(crate) fn home_dir() -> PathBuf {
    #[cfg(windows)]
    let var = "USERPROFILE";
    #[cfg(not(windows))]
    let var = "HOME";
    PathBuf::from(std::env::var(var).unwrap_or_default())
}

fn which(file: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let p = dir.join(file);
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

/// Chemin résolu d'un outil, None s'il est introuvable.
pub(crate) fn find_tool(name: &str) -> Option<PathBuf> {
    let file = format!("{name}{EXE_EXT}");
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            // à côté de l'exe, ou dans binaries/ (ressources de l'installeur)
            for cand in [dir.join(&file), dir.join("binaries").join(&file)] {
                if cand.is_file() {
                    return Some(cand);
                }
            }
        }
    }
    let local = home_dir().join(".local/bin").join(&file);
    if local.is_file() {
        return Some(local);
    }
    which(&file)
}

/// rembg : venv dédié Linux d'abord, sinon PATH (pip install global).
pub(crate) fn rembg_path() -> Option<PathBuf> {
    let venv = home_dir().join(".local/share/imagehub-venv/bin/rembg");
    if venv.is_file() {
        return Some(venv);
    }
    find_tool("rembg")
}

/// Dossier des modèles Real-ESRGAN : emplacement utilisateur Linux,
/// sinon `models/` à côté du binaire (layout du zip Windows officiel).
pub(crate) fn realesrgan_models() -> Option<PathBuf> {
    let linux = home_dir().join(".local/share/realesrgan-models");
    if linux.is_dir() {
        return Some(linux);
    }
    find_tool("realesrgan-ncnn-vulkan")
        .and_then(|p| p.parent().map(|d| d.join("models")))
        .filter(|d| d.is_dir())
}

/// Disponibilité de chaque moteur — consommé par le front pour griser
/// les actions dont l'outil manque sur la machine.
#[derive(Serialize)]
pub struct ToolsStatus {
    pub magick: bool,
    pub inkscape: bool,
    pub ffmpeg: bool,
    pub realesrgan: bool,
    pub rembg: bool,
    pub vtracer: bool,
    pub avifenc: bool,
}

#[tauri::command]
pub fn check_tools() -> ToolsStatus {
    ToolsStatus {
        magick: find_tool("magick").is_some(),
        inkscape: find_tool("inkscape").is_some(),
        ffmpeg: find_tool("ffmpeg").is_some(),
        realesrgan: find_tool("realesrgan-ncnn-vulkan").is_some(),
        rembg: rembg_path().is_some(),
        vtracer: find_tool("vtracer").is_some(),
        avifenc: find_tool("avifenc").is_some(),
    }
}
