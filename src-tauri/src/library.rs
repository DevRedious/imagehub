//! Bibliothèque d'éléments de l'Atelier.
//!
//! Un dossier unique, prévisible, sous le dépôt du Studio : chaque pièce y vit
//! comme un PNG transparent réutilisable d'une composition à l'autre. C'est le
//! stock de briques — les planches découpées y déversent leurs morceaux, et
//! l'utilisateur peut y glisser ses propres détourages.

use serde::Serialize;
use std::path::{Path, PathBuf};

/// Extensions acceptées : celles que le webview sait charger en data URL
/// (`qr::read_image_data_url`). En lister d'autres n'offrirait qu'un choix mort.
const KINDS: &[&str] = &["png", "webp", "svg"];

#[derive(Serialize)]
pub struct Asset {
    pub path: String,
    pub name: String,
    /// Dimensions en pixels, lues dans l'en-tête du fichier. `None` pour un SVG
    /// (pas de taille intrinsèque fiable) : le webview mesurera au chargement.
    pub width: Option<u32>,
    pub height: Option<u32>,
}

pub(crate) fn library_root() -> PathBuf {
    crate::actions::studio_root().join("bibliotheque")
}

#[tauri::command]
pub fn library_dir() -> String {
    library_root().to_string_lossy().to_string()
}

pub(crate) fn describe(path: &Path) -> Asset {
    // `image_dimensions` ne lit que l'en-tête : lister deux cents pièces ne
    // décode aucun pixel.
    let (width, height) = match image::image_dimensions(path) {
        Ok((w, h)) => (Some(w), Some(h)),
        Err(_) => (None, None),
    };
    Asset {
        path: path.to_string_lossy().to_string(),
        name: path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("élément")
            .to_string(),
        width,
        height,
    }
}

/// Contenu de la bibliothèque, du plus récent au plus ancien : ce qu'on vient
/// de découper doit se retrouver en tête, pas noyé dans l'ordre alphabétique.
#[tauri::command]
pub fn library_list() -> Vec<Asset> {
    let root = library_root();
    let Ok(entries) = std::fs::read_dir(&root) else {
        return Vec::new();
    };
    let mut files: Vec<(std::time::SystemTime, PathBuf)> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.extension()
                .and_then(|e| e.to_str())
                .map(|e| KINDS.contains(&e.to_lowercase().as_str()))
                .unwrap_or(false)
        })
        .map(|p| {
            let at = p
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(std::time::UNIX_EPOCH);
            (at, p)
        })
        .collect();
    files.sort_by_key(|(at, _)| std::cmp::Reverse(*at));
    files.iter().take(500).map(|(_, p)| describe(p)).collect()
}

/// Copie des fichiers dans la bibliothèque. On copie plutôt qu'on ne référence :
/// une composition qui pointerait vers un fichier que l'utilisateur déplace ou
/// supprime ailleurs se briserait en silence.
#[tauri::command]
pub fn library_import(paths: Vec<String>) -> Result<Vec<Asset>, String> {
    let root = library_root();
    let mut added = Vec::new();
    for p in paths {
        let src = PathBuf::from(&p);
        let ext = src
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        if !KINDS.contains(&ext.as_str()) {
            continue;
        }
        let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("element");
        let dest = crate::emoji::dest_path_in(root.clone(), stem, &ext)?;
        std::fs::copy(&src, &dest).map_err(|e| format!("Copie impossible : {e}"))?;
        added.push(describe(&dest));
    }
    Ok(added)
}

/// Retire des pièces. On refuse tout chemin hors de la bibliothèque : la
/// commande vient du webview, elle ne doit pas pouvoir servir à effacer
/// n'importe quoi sur le disque.
#[tauri::command]
pub fn library_delete(paths: Vec<String>) -> Result<(), String> {
    let root = library_root();
    for p in paths {
        let path = PathBuf::from(&p);
        if !path.starts_with(&root) {
            return Err("Chemin hors de la bibliothèque : suppression refusée.".into());
        }
        std::fs::remove_file(&path).map_err(|e| format!("Suppression impossible : {e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Le garde-fou de `library_delete` compare le chemin reçu à la racine de
    /// la bibliothèque. Ce test le prend au mot : il écrit un fichier là où
    /// `library_list` irait le chercher, le supprime par la commande, et
    /// vérifie qu'il a bien disparu. Une divergence entre le chemin listé et
    /// le chemin accepté rendrait la bibliothèque impossible à vider.
    #[test]
    fn une_piece_listee_est_supprimable() {
        let root = library_root();
        std::fs::create_dir_all(&root).expect("racine de bibliothèque");
        let name = format!("imagehub-test-suppression-{}.png", std::process::id());
        let file = root.join(&name);
        image::RgbaImage::new(4, 4).save(&file).expect("écriture");

        // le chemin tel que l'interface le reçoit
        let listed = describe(&file).path;
        assert!(file.exists(), "le fichier de test doit exister");

        library_delete(vec![listed]).expect("la suppression doit aboutir");
        assert!(!file.exists(), "le fichier doit avoir disparu");
    }

    #[test]
    fn un_chemin_hors_bibliotheque_est_refuse() {
        let intrus = std::env::temp_dir().join("imagehub-test-intrus.png");
        image::RgbaImage::new(2, 2).save(&intrus).expect("écriture");
        assert!(
            library_delete(vec![intrus.to_string_lossy().to_string()]).is_err(),
            "un chemin hors bibliothèque doit être refusé"
        );
        assert!(intrus.exists(), "et le fichier doit rester intact");
        let _ = std::fs::remove_file(intrus);
    }
}

/// Renomme une pièce sans la sortir de la bibliothèque ni changer son format.
#[tauri::command]
pub fn library_rename(path: String, name: String) -> Result<Asset, String> {
    let root = library_root();
    let src = PathBuf::from(&path);
    if !src.starts_with(&root) {
        return Err("Chemin hors de la bibliothèque : renommage refusé.".into());
    }
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let dest = crate::emoji::dest_path_in(root, &name, &ext)?;
    std::fs::rename(&src, &dest).map_err(|e| format!("Renommage impossible : {e}"))?;
    Ok(describe(&dest))
}
