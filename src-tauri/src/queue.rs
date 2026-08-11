//! File d'attente des traitements.
//!
//! Chaque action du Studio lance un outil externe (rembg, Real-ESRGAN, libaom,
//! vtracer…) qui occupe déjà à lui seul toutes les unités de calcul de la
//! machine. Déposer une douzaine de visuels et cliquer « Détourage » démarrait
//! une douzaine de processus d'un coup : le CPU et la RAM saturaient, et
//! l'application tombait. On sérialise donc les jobs derrière un sémaphore
//! équitable (tokio distribue les permis dans l'ordre des demandes) : les
//! traitements partent dans l'ordre où ils ont été demandés, un à la fois pour
//! les actions lourdes.
//!
//! Le job attend son tour AVANT que `run_action` n'émette `running` : côté UI
//! il reste donc « en attente », avec son rang dans la file.

use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use tokio::sync::{Semaphore, SemaphorePermit};

/// Couloir d'exécution d'une action.
///
/// ⚠️ Miroir côté interface dans `src/lib/actions.ts` (`actionLane`), qui s'en
/// sert pour afficher le bon rang d'attente : garder les deux listes en phase.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Lane {
    /// Un seul à la fois : le processus sature déjà tous les cœurs (rembg via
    /// ONNX, libaom en AV1, vtracer) ou toute la VRAM (Real-ESRGAN).
    Heavy,
    /// Conversions courtes (magick, inkscape, packs d'icônes) : quelques-unes
    /// de front restent confortables et gardent l'app réactive.
    Light,
}

pub fn lane(action: &str) -> Lane {
    match action {
        "removeBg" | "bgToAvif" | "upscale" | "toAvif" | "optimizeAvif" | "pngToSvg" => Lane::Heavy,
        _ => Lane::Light,
    }
}

/// Places du couloir léger : un quart des cœurs, borné à [1, 3].
fn light_slots() -> usize {
    std::thread::available_parallelism()
        .map(|n| (n.get() / 4).clamp(1, 3))
        .unwrap_or(1)
}

fn semaphore(lane: Lane) -> &'static Semaphore {
    static HEAVY: OnceLock<Semaphore> = OnceLock::new();
    static LIGHT: OnceLock<Semaphore> = OnceLock::new();
    match lane {
        Lane::Heavy => HEAVY.get_or_init(|| Semaphore::new(1)),
        Lane::Light => LIGHT.get_or_init(|| Semaphore::new(light_slots())),
    }
}

/// Attend son tour dans le couloir de l'action. Le permis est rendu à la
/// destruction de la valeur retournée — donc aussi en cas d'erreur ou de
/// panique du worker, ce qui interdit à la file de se bloquer définitivement.
pub async fn acquire(action: &str) -> SemaphorePermit<'static> {
    semaphore(lane(action))
        .acquire()
        .await
        .expect("les sémaphores de la file ne sont jamais fermés")
}

/// Jobs annulés pendant leur attente.
///
/// On n'interrompt jamais un traitement déjà lancé : l'outil externe tourne
/// dans son propre processus, et le tuer laisserait des fichiers à moitié
/// écrits. L'annulation ne concerne donc que ce qui n'a pas encore démarré —
/// ce qui suffit, puisque c'est justement la file qui s'allonge.
fn cancelled() -> &'static Mutex<HashSet<String>> {
    static CANCELLED: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    CANCELLED.get_or_init(Mutex::default)
}

/// Marque des jobs comme annulés : quand leur tour viendra, ils seront écartés
/// sans qu'aucun processus ne soit lancé.
#[tauri::command]
pub fn cancel_jobs(job_ids: Vec<String>) {
    cancelled()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .extend(job_ids);
}

/// Le job a-t-il été annulé ? Consomme la marque au passage, pour que le
/// registre ne grossisse pas au fil de la session.
pub fn take_cancelled(job_id: &str) -> bool {
    cancelled()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(job_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    // registre partagé entre tests (statique) → identifiants distincts
    #[test]
    fn une_annulation_ne_sert_qu_une_fois() {
        cancel_jobs(vec!["t1-a".into(), "t1-b".into()]);
        assert!(take_cancelled("t1-a"));
        assert!(!take_cancelled("t1-a"), "la marque doit être consommée");
        assert!(!take_cancelled("t1-inconnu"));
        assert!(take_cancelled("t1-b"));
    }

    #[test]
    fn le_detourage_est_serialise() {
        assert!(matches!(lane("removeBg"), Lane::Heavy));
        assert!(matches!(lane("bgToAvif"), Lane::Heavy));
        assert!(matches!(lane("upscale"), Lane::Heavy));
        assert!(matches!(lane("webIcons"), Lane::Light));
        assert_eq!(semaphore(Lane::Heavy).available_permits(), 1);
        assert!((1..=3).contains(&light_slots()));
    }
}
