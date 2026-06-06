//! Vignettes des images du projet, générées et mises en cache sur disque.
//! Évite à WebKit de décoder des photos pleine résolution pour des
//! miniatures de 36-64 px (lenteur majeure sur les gros projets).

use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager};

/// Côté max (px) des vignettes générées — assez pour du 64 px en HiDPI.
const THUMB_PX: u32 = 128;

/// Vignette via ffmpeg, pour les formats que la crate `image` ne décode pas
/// (AVIF surtout — ffmpeg est déjà une dépendance dure de l'app).
fn ffmpeg_thumb(src: &Path, dest: &Path) -> bool {
    let scale = format!(
        "scale='min({0},iw)':'min({0},ih)':force_original_aspect_ratio=decrease",
        THUMB_PX
    );
    Command::new("ffmpeg")
        .arg("-y")
        .arg("-i")
        .arg(src)
        .args(["-vf", &scale, "-frames:v", "1"])
        .arg(dest)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Retourne le chemin d'une vignette de `path`, générée si besoin.
/// Cache : ~/.cache/fr.redious.imagehub/thumbs/<hash>.png, invalidé par
/// (chemin, taille, mtime). En cas d'échec (SVG, AVIF, fichier corrompu…),
/// renvoie le chemin original — l'affichage direct reste le repli.
#[tauri::command]
pub async fn make_thumb(app: AppHandle, path: String) -> Result<String, String> {
    let cache_root = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("thumbs");

    tauri::async_runtime::spawn_blocking(move || {
        let src = PathBuf::from(&path);
        let ext = src
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        // SVG : vectoriel, léger à rendre tel quel — pas de raster
        if ext == "svg" {
            return Ok(path);
        }
        let Ok(meta) = fs::metadata(&src) else {
            return Ok(path);
        };
        // les petits PNG/JPEG se décodent vite : pas la peine de vignetter.
        // (PAS les AVIF/WebP : 16 Ko peuvent cacher une image de 4000 px)
        if meta.len() < 16 * 1024
            && matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "gif" | "bmp" | "ico")
        {
            return Ok(path);
        }

        let mut h = DefaultHasher::new();
        path.hash(&mut h);
        meta.len().hash(&mut h);
        if let Ok(modified) = meta.modified() {
            if let Ok(d) = modified.duration_since(UNIX_EPOCH) {
                d.as_secs().hash(&mut h);
            }
        }
        let thumb_path = cache_root.join(format!("{:016x}.png", h.finish()));
        if thumb_path.is_file() {
            return Ok(thumb_path.to_string_lossy().to_string());
        }

        if fs::create_dir_all(&cache_root).is_err() {
            return Ok(path);
        }
        match image::open(&src) {
            Ok(img) => {
                let thumb = img.thumbnail(THUMB_PX, THUMB_PX);
                if thumb.save(&thumb_path).is_err() {
                    return Ok(path);
                }
            }
            // format non décodable par la crate image (AVIF…) → ffmpeg
            Err(_) => {
                if !ffmpeg_thumb(&src, &thumb_path) {
                    return Ok(path);
                }
            }
        }
        Ok(thumb_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
