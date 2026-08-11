//! Créateur d'emojis : bibliothèque de SVG à recolorer, puis export.
//!
//! Le rendu, lui, n'est PAS ici. Aucun outil de la machine ne sait rasteriser
//! une animation SMIL : `inkscape` et `magick` rendent l'instant t=0 et rien
//! d'autre. C'est donc le webview qui produit les images (il exécute SMIL, sait
//! se placer à un instant donné et dessiner dans un canvas), et ce module se
//! contente de recevoir des PNG déjà rendus, de les écrire et — pour les
//! formats animés — de les assembler avec ffmpeg.

use base64::Engine;
use serde::Serialize;
use std::path::{Path, PathBuf};

/// Au-delà, la galerie n'est plus consultable et le chargement se voit.
const MAX_SVGS: usize = 800;
/// Un « icône » SVG dépasse rarement quelques kilo-octets : au-delà c'est une
/// illustration, qu'on ne veut pas inliner dans le webview.
const MAX_SVG_BYTES: u64 = 256 * 1024;
const MAX_DEPTH: u8 = 4;

#[derive(Serialize)]
pub struct SvgItem {
    pub path: String,
    /// nom de fichier sans extension, sert de nom d'emoji par défaut
    pub name: String,
    pub source: String,
    /// porte une animation SMIL (`<animate>`, `<animateTransform>`…)
    pub animated: bool,
    /// utilise `currentColor` → recoloration intégrale par une seule couleur
    pub themeable: bool,
}

#[derive(Serialize)]
pub struct SvgLibrary {
    pub items: Vec<SvgItem>,
    /// fichiers écartés : illisibles, ou plus gros que `MAX_SVG_BYTES`
    pub skipped: usize,
    /// la limite `MAX_SVGS` a été atteinte
    pub truncated: bool,
}

/// Décrit un fichier écrit dans le dépôt. Sert aux emojis comme aux QR codes.
#[derive(Serialize)]
pub struct SavedEmoji {
    pub path: String,
    /// poids du fichier écrit : l'UI le compare aux limites de Discord/Slack
    pub bytes: u64,
}

pub(crate) fn saved(dest: PathBuf) -> SavedEmoji {
    let bytes = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
    SavedEmoji {
        path: dest.to_string_lossy().to_string(),
        bytes,
    }
}

/// Dossier de sortie des emojis, dans le dépôt du Studio libre.
pub(crate) fn emoji_root() -> PathBuf {
    crate::actions::studio_root().join("emojis")
}

#[tauri::command]
pub fn emoji_dir() -> String {
    emoji_root().to_string_lossy().to_string()
}

#[tauri::command]
pub fn list_svgs(dir: String) -> Result<SvgLibrary, String> {
    let root = Path::new(&dir);
    if !root.is_dir() {
        return Err(format!("Dossier introuvable : {dir}"));
    }
    let found = crate::inputs::collect(root, &["svg"], MAX_DEPTH);
    let truncated = found.len() > MAX_SVGS;
    let mut items = Vec::new();
    let mut skipped = 0usize;
    for path in found.into_iter().take(MAX_SVGS) {
        let too_big = std::fs::metadata(&path).is_ok_and(|m| m.len() > MAX_SVG_BYTES);
        if too_big {
            skipped += 1;
            continue;
        }
        let Ok(source) = std::fs::read_to_string(&path) else {
            skipped += 1;
            continue;
        };
        items.push(SvgItem {
            animated: source.contains("<animate"),
            themeable: source.contains("currentColor"),
            name: path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("emoji")
                .to_string(),
            path: path.to_string_lossy().to_string(),
            source,
        });
    }
    Ok(SvgLibrary {
        items,
        skipped,
        truncated,
    })
}

/// Nom de fichier sûr : minuscules, `[a-z0-9-_]`, jamais vide.
fn safe_name(name: &str) -> String {
    let cleaned: String = name
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "emoji".into()
    } else {
        trimmed
    }
}

/// Chemin libre dans un dossier du dépôt (suffixe -1, -2… si besoin).
pub(crate) fn dest_path_in(dir: PathBuf, name: &str, ext: &str) -> Result<PathBuf, String> {
    std::fs::create_dir_all(&dir).map_err(|e| format!("Création du dossier impossible : {e}"))?;
    let stem = safe_name(name);
    let mut dest = dir.join(format!("{stem}.{ext}"));
    let mut i = 1;
    while dest.exists() {
        dest = dir.join(format!("{stem}-{i}.{ext}"));
        i += 1;
    }
    Ok(dest)
}

fn dest_path(name: &str, ext: &str) -> Result<PathBuf, String> {
    dest_path_in(emoji_root(), name, ext)
}

#[tauri::command]
pub fn save_emoji_svg(name: String, source: String) -> Result<SavedEmoji, String> {
    let dest = dest_path(&name, "svg")?;
    std::fs::write(&dest, source).map_err(|e| format!("Écriture du SVG impossible : {e}"))?;
    Ok(saved(dest))
}

/// `#7C5CFF` ou `7c5cff` → `7c5cff`. Refuse tout le reste : cette valeur part
/// dans un filtre ffmpeg, on ne lui laisse pas la possibilité d'être autre
/// chose qu'une couleur.
fn normalize_hex(value: &str) -> Result<String, String> {
    let hex = value.trim().trim_start_matches('#').to_lowercase();
    if hex.len() == 6 && hex.chars().all(|c| c.is_ascii_hexdigit()) {
        Ok(hex)
    } else {
        Err(format!("Couleur de fond invalide : {value}"))
    }
}

pub(crate) fn decode_data_url(data: &str) -> Result<Vec<u8>, String> {
    // le webview envoie des data URL `data:image/png;base64,…`
    let payload = data.rsplit(',').next().unwrap_or(data);
    base64::engine::general_purpose::STANDARD
        .decode(payload)
        .map_err(|e| format!("Image rendue illisible : {e}"))
}

#[tauri::command]
pub fn save_emoji_png(name: String, data: String) -> Result<SavedEmoji, String> {
    let bytes = decode_data_url(&data)?;
    let dest = dest_path(&name, "png")?;
    std::fs::write(&dest, bytes).map_err(|e| format!("Écriture du PNG impossible : {e}"))?;
    Ok(saved(dest))
}

/// Assemble en GIF ou WebP animé les images rendues par le webview.
///
/// Le GIF n'a qu'UN BIT de transparence : un pixel y est opaque ou absent,
/// jamais à moitié. Deux conséquences, et deux chemins d'encodage.
///
/// Sans fond (`background` absent), il faut trancher chaque pixel au seuil
/// (`alpha_threshold`) : l'anti-aliasing des bords disparaît, et surtout une
/// icône qui s'estompe ne s'estompe plus — elle reste pleine puis s'éteint
/// d'un coup. Mesuré : une image à 63 % d'opacité ressort intégralement
/// opaque, une à 27 % ressort vide.
///
/// Avec un fond, les images sont composées dessus et le GIF devient opaque :
/// la translucidité se traduit alors en mélange de couleurs, que la palette de
/// 256 entrées restitue fidèlement. C'est le seul moyen d'avoir un fondu franc
/// en GIF — au prix d'un aplat visible si le fond ne correspond pas à celui de
/// l'application de destination.
///
/// `transparency_color` remplace le vert lime que ffmpeg réserve par défaut :
/// les pixels transparents portent quand même une couleur, et les moteurs qui
/// l'ignorent en redimensionnant produisent alors un halo — un gris-bleu neutre
/// passe partout, un vert fluo se voit sur tous les fonds.
///
/// `dither=none` : ces icônes sont des aplats vectoriels, le tramage n'y
/// apporterait que du moucheté.
///
/// Le WebP, lui, garde l'alpha sur 8 bits : ni seuil ni fond nécessaires, ses
/// bords restent lissés et ses fondus intacts.
#[tauri::command]
pub async fn save_emoji_animation(
    name: String,
    format: String,
    frames: Vec<String>,
    fps: u32,
    size: u32,
    background: Option<String>,
) -> Result<SavedEmoji, String> {
    if frames.is_empty() {
        return Err("Aucune image capturée.".into());
    }
    if !matches!(format.as_str(), "gif" | "webp") {
        return Err(format!("Format animé inconnu : {format}"));
    }
    let fps = fps.clamp(1, 50);
    let size = size.clamp(16, 1024);
    // le fond n'a de sens que pour le GIF ; le WebP garde son vrai alpha
    let background = match background.filter(|_| format == "gif") {
        Some(hex) => Some(normalize_hex(&hex)?),
        None => None,
    };

    tauri::async_runtime::spawn_blocking(move || {
        let dest = dest_path(&name, &format)?;
        let tmp = std::env::temp_dir().join(format!(
            "imagehub-emoji-{}",
            dest.file_stem().and_then(|s| s.to_str()).unwrap_or("frames")
        ));
        std::fs::create_dir_all(&tmp)
            .map_err(|e| format!("Dossier temporaire impossible : {e}"))?;

        let write_frames = || -> Result<(), String> {
            for (i, frame) in frames.iter().enumerate() {
                let bytes = decode_data_url(frame)?;
                std::fs::write(tmp.join(format!("f-{:04}.png", i + 1)), bytes)
                    .map_err(|e| format!("Écriture d'une image impossible : {e}"))?;
            }
            Ok(())
        };
        let result = write_frames().and_then(|()| {
            let pattern = tmp.join("f-%04d.png").to_string_lossy().to_string();
            let rate = fps.to_string();
            let out = dest.to_string_lossy().to_string();
            let gif_filter = match &background {
                Some(hex) => format!(
                    "color=c=0x{hex}:s={size}x{size}[bg];[bg][0:v]overlay=shortest=1,\
                     split[a][b];[a]palettegen=max_colors=256:stats_mode=diff[p];\
                     [b][p]paletteuse=dither=none"
                ),
                None => "[0:v]split[a][b];[a]palettegen=reserve_transparent=1:\
                         transparency_color=1a2b3c[p];[b][p]paletteuse=\
                         alpha_threshold=128:dither=none"
                    .to_string(),
            };
            let args: Vec<&str> = if format == "gif" {
                vec![
                    "-y", "-framerate", &rate, "-i", &pattern,
                    "-filter_complex", &gif_filter,
                    "-loop", "0", &out,
                ]
            } else {
                vec![
                    "-y", "-framerate", &rate, "-i", &pattern,
                    "-c:v", "libwebp_anim", "-lossless", "1", "-loop", "0", &out,
                ]
            };
            crate::actions::run_tool("ffmpeg", &args)
                .map_err(|e| format!("Encodage {format} échoué (ffmpeg) : {e}"))
        });
        let _ = std::fs::remove_dir_all(&tmp);
        result?;
        Ok(saved(dest))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{normalize_hex, safe_name};

    #[test]
    fn la_couleur_de_fond_est_validee() {
        assert_eq!(normalize_hex("#7C5CFF").unwrap(), "7c5cff");
        assert_eq!(normalize_hex(" 313338 ").unwrap(), "313338");
        assert!(normalize_hex("rouge").is_err());
        assert!(normalize_hex("#abc").is_err());
        // rien qui puisse déborder dans le graphe de filtres ffmpeg
        assert!(normalize_hex("000000[x];drop").is_err());
    }

    #[test]
    fn le_nom_de_fichier_est_assaini() {
        assert_eq!(safe_name("3-dots-bounce"), "3-dots-bounce");
        assert_eq!(safe_name("Mon Emoji !"), "mon-emoji");
        assert_eq!(safe_name("../../etc/passwd"), "etc-passwd");
        assert_eq!(safe_name("   "), "emoji");
        assert_eq!(safe_name(""), "emoji");
    }
}
