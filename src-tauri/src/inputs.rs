//! Ce que l'utilisateur dépose dans le Studio → liste d'images exploitables.
//!
//! Le webview ne sait pas lire le disque : dès qu'une sélection peut contenir
//! un dossier (glisser-déposer comme sélecteur), c'est ici qu'elle est
//! développée. Un seul chemin pour les deux, donc un seul comportement.

use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

/// Formats acceptés en entrée du Studio.
///
/// ⚠️ Miroir de `IMAGE_EXTS` dans `src/lib/paths.ts`, qui alimente le filtre du
/// sélecteur de fichiers : garder les deux listes en phase.
const INPUT_EXTS: &[&str] = &[
    "png", "jpg", "jpeg", "webp", "avif", "svg", "bmp", "gif", "tiff", "ico",
];

/// Dossiers qu'on ne parcourt jamais : ils n'ont rien d'un dossier de visuels
/// et remonteraient des milliers d'icônes de dépendances.
const SKIP_DIRS: &[&str] = &[
    "node_modules",
    "dist",
    "build",
    "out",
    "target",
    "coverage",
    "Pods",
    "venv",
    "vendor",
];

/// Profondeur maximale d'exploration d'un dossier déposé.
const MAX_DEPTH: u8 = 6;

/// Au-delà, la zone de dépôt devient illisible et la file interminable : on
/// s'arrête et on le dit, plutôt que d'engloutir un dossier entier en silence.
const MAX_IMAGES: usize = 200;

#[derive(Serialize)]
pub struct ExpandedInputs {
    pub images: Vec<String>,
    /// entrées écartées : format non pris en charge, ou dossier sans image
    pub skipped: usize,
    /// des images ont été laissées de côté (limite `MAX_IMAGES` atteinte)
    pub truncated: bool,
}

fn has_ext(path: &Path, exts: &[&str]) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| exts.contains(&e.to_lowercase().as_str()))
}

fn is_image(path: &Path) -> bool {
    has_ext(path, INPUT_EXTS)
}

fn walk(dir: &Path, depth: u8, max_depth: u8, exts: &[&str], acc: &mut Vec<PathBuf>) {
    if depth > max_depth {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut here: Vec<PathBuf> = Vec::new();
    let mut subdirs: Vec<PathBuf> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if path.is_dir() {
            if !name.starts_with('.') && !SKIP_DIRS.contains(&name.as_str()) {
                subdirs.push(path);
            }
        } else if has_ext(&path, exts) {
            here.push(path);
        }
    }
    here.sort();
    subdirs.sort();
    acc.append(&mut here);
    for sub in subdirs {
        walk(&sub, depth + 1, max_depth, exts, acc);
    }
}

/// Fichiers d'un dossier portant l'une des extensions, en profondeur, triés
/// (ordre stable d'un appel à l'autre — `read_dir` n'en garantit aucun), en
/// écartant les dossiers cachés et les `SKIP_DIRS`.
pub(crate) fn collect(dir: &Path, exts: &[&str], max_depth: u8) -> Vec<PathBuf> {
    let mut acc = Vec::new();
    walk(dir, 0, max_depth, exts, &mut acc);
    acc
}

/// Développe une sélection utilisateur (fichiers et/ou dossiers) en liste
/// d'images, sans doublon et dans l'ordre de la sélection.
#[tauri::command]
pub fn expand_inputs(paths: Vec<String>) -> ExpandedInputs {
    let mut images: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut skipped = 0usize;

    for raw in paths {
        let path = Path::new(&raw);
        if path.is_dir() {
            let found = collect(path, INPUT_EXTS, MAX_DEPTH);
            if found.is_empty() {
                skipped += 1;
                continue;
            }
            for p in found {
                let s = p.to_string_lossy().to_string();
                if seen.insert(s.clone()) {
                    images.push(s);
                }
            }
        } else if is_image(path) {
            if seen.insert(raw.clone()) {
                images.push(raw);
            }
        } else {
            skipped += 1;
        }
    }

    let truncated = images.len() > MAX_IMAGES;
    images.truncate(MAX_IMAGES);
    ExpandedInputs {
        images,
        skipped,
        truncated,
    }
}
