//! Persistance JSON d'un motif, pour ré-édition.

use std::path::PathBuf;

use super::export::patterns_root;
use super::model::SavedPattern;

/// Enregistre la composition à côté des tuiles rendues, en `.motif.json`.
/// Le JSON est écrit tel que le webview l'a formé : c'est lui qui décide de la
/// forme du document, Rust ne fait que le poser sur le disque.
#[tauri::command]
pub fn pattern_save_json(name: String, json: String) -> Result<String, String> {
    // relecture de contrôle : mieux vaut refuser d'écrire qu'enregistrer un
    // fichier que la ré-ouverture rejettera
    serde_json::from_str::<serde_json::Value>(&json)
        .map_err(|e| format!("Motif illisible, enregistrement annulé : {e}"))?;
    let dest = crate::emoji::dest_path_in(patterns_root(), &name, "motif.json")?;
    std::fs::write(&dest, json).map_err(|e| format!("Enregistrement impossible : {e}"))?;
    Ok(dest.to_string_lossy().to_string())
}

/// Les motifs enregistrés, du plus récent au plus ancien.
#[tauri::command]
pub fn pattern_list_json() -> Vec<SavedPattern> {
    let Ok(entries) = std::fs::read_dir(patterns_root()) else {
        return Vec::new();
    };
    let mut files: Vec<(std::time::SystemTime, PathBuf)> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.to_string_lossy().ends_with(".motif.json"))
        .map(|p| {
            let at = p
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(std::time::UNIX_EPOCH);
            (at, p)
        })
        .collect();
    files.sort_by_key(|(at, _)| std::cmp::Reverse(*at));
    files
        .iter()
        .take(200)
        .map(|(_, p)| SavedPattern {
            name: p
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("motif")
                .trim_end_matches(".motif.json")
                .to_string(),
            path: p.to_string_lossy().to_string(),
        })
        .collect()
}

/// Relit un motif. On refuse tout chemin hors du dossier des motifs : la
/// commande vient du webview, elle ne doit pas servir à lire n'importe quel
/// fichier du disque.
#[tauri::command]
pub fn pattern_read_json(path: String) -> Result<String, String> {
    let file = PathBuf::from(&path);
    if !file.starts_with(patterns_root()) {
        return Err("Chemin hors du dossier des motifs : lecture refusée.".into());
    }
    std::fs::read_to_string(&file).map_err(|e| format!("Motif illisible : {e}"))
}
