//! Surveillance temps réel du projet connecté (crate notify).
//! Émet `project-fs-change` après 1 s d'accalmie suivant tout changement
//! pertinent : image ou fichier de code, hors dossiers ignorés.
//! Remplace l'ancienne ré-analyse au focus de la fenêtre.

use crate::project::{CODE_EXTS, IMG_EXTS, SKIP_DIRS};
use notify::{recommended_watcher, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

/// Watcher du projet actif. Le remplacer (ou le mettre à None) droppe
/// l'ancien : son canal se ferme et le thread de débounce se termine seul.
pub struct WatcherState(pub Mutex<Option<RecommendedWatcher>>);

/// Accalmie à respecter après le dernier événement d'une rafale.
const QUIET_MS: u64 = 1_000;

/// Un chemin mérite-t-il une ré-analyse ? Mêmes filtres que l'analyse :
/// dossiers cachés et SKIP_DIRS exclus, extensions image ou code uniquement.
fn is_relevant(root: &Path, path: &Path) -> bool {
    let Ok(rel) = path.strip_prefix(root) else {
        return false;
    };
    for comp in rel.components() {
        let name = comp.as_os_str().to_string_lossy();
        if name.starts_with('.') || SKIP_DIRS.contains(&name.as_ref()) {
            return false;
        }
    }
    let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
        return false;
    };
    let ext = ext.to_lowercase();
    IMG_EXTS.contains(&ext.as_str()) || CODE_EXTS.contains(&ext.as_str())
}

fn relevant_event(root: &Path, event: &Event) -> bool {
    // les lectures (scan chirurgical inclus) ne changent rien au projet
    if matches!(event.kind, EventKind::Access(_)) {
        return false;
    }
    event.paths.iter().any(|p| is_relevant(root, p))
}

/// Boucle du thread de débounce : attend un événement pertinent, laisse
/// passer la rafale, puis émet `project-fs-change` (une fois par rafale).
fn debounce_loop(app: AppHandle, root: PathBuf, rx: Receiver<notify::Result<Event>>) {
    loop {
        // attente bloquante du prochain événement pertinent
        loop {
            match rx.recv() {
                Ok(Ok(ev)) if relevant_event(&root, &ev) => break,
                Ok(_) => {}
                Err(_) => return, // watcher droppé → fin du thread
            }
        }
        // tout événement (même non pertinent, ex. npm install) prolonge l'accalmie
        loop {
            match rx.recv_timeout(Duration::from_millis(QUIET_MS)) {
                Ok(_) => {}
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }
        let _ = app.emit("project-fs-change", ());
    }
}

/// Pose un watcher récursif sur la racine du projet (remplace l'éventuel
/// watcher précédent).
#[tauri::command]
pub fn watch_project(
    app: AppHandle,
    state: State<WatcherState>,
    root: String,
) -> Result<(), String> {
    let root_path = PathBuf::from(&root);
    if !root_path.is_dir() {
        return Err("Dossier de projet introuvable".into());
    }
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher = recommended_watcher(tx).map_err(|e| e.to_string())?;
    watcher
        .watch(&root_path, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    *state.0.lock().unwrap() = Some(watcher);
    std::thread::spawn(move || debounce_loop(app, root_path, rx));
    Ok(())
}

/// Arrête la surveillance (déconnexion du projet).
#[tauri::command]
pub fn unwatch_project(state: State<WatcherState>) {
    *state.0.lock().unwrap() = None;
}
