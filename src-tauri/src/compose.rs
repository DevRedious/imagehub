//! Écriture des compositions de l'Atelier.
//!
//! Le canevas est rendu par le webview (Konva), qui rend chaque format en data
//! URL. Rust n'a plus qu'à décoder et poser les fichiers — comme pour les QR
//! codes et les emojis, dont on réutilise le décodeur et la politique de
//! nommage.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Un format rendu : le suffixe distingue les déclinaisons d'une même compo
/// (`-16x9`, `-9x16`…), ce qui reproduit la convention déjà en place dans les
/// dossiers d'assets de l'utilisateur.
#[derive(Deserialize)]
pub struct Shot {
    pub suffix: String,
    pub data: String,
}

#[derive(Serialize)]
pub struct Written {
    pub path: String,
    pub suffix: String,
}

pub(crate) fn compositions_root() -> PathBuf {
    crate::actions::studio_root().join("compositions")
}

#[tauri::command]
pub fn composition_dir() -> String {
    compositions_root().to_string_lossy().to_string()
}

/// Écrit les formats rendus. `dir` permet de viser un dossier choisi (celui
/// d'un projet, par exemple) ; sans lui, tout atterrit dans le dépôt du Studio.
#[tauri::command]
pub fn save_composition(
    name: String,
    shots: Vec<Shot>,
    dir: Option<String>,
) -> Result<Vec<Written>, String> {
    if shots.is_empty() {
        return Err("Aucun format à écrire.".into());
    }
    let root = dir.map(PathBuf::from).unwrap_or_else(compositions_root);
    let mut written = Vec::with_capacity(shots.len());
    for shot in shots {
        let bytes = crate::emoji::decode_data_url(&shot.data)?;
        let stem = if shot.suffix.is_empty() {
            name.clone()
        } else {
            format!("{name}-{}", shot.suffix)
        };
        let dest = crate::emoji::dest_path_in(root.clone(), &stem, "png")?;
        std::fs::write(&dest, bytes)
            .map_err(|e| format!("Écriture de la composition impossible : {e}"))?;
        written.push(Written {
            path: dest.to_string_lossy().to_string(),
            suffix: shot.suffix,
        });
    }
    Ok(written)
}
