//! Tuiles de motif raccordables (seamless).
//!
//! # Ce qui rend une tuile raccordable
//!
//! L'erreur classique consiste à retenir les éléments à l'intérieur des bords :
//! on obtient alors une grille de vignettes isolées, et le raccord se voit
//! d'autant mieux que le vide borde chaque tuile.
//!
//! La bonne construction fait l'inverse — **les débordements sont
//! souhaitables**. Chaque pièce est dessinée NEUF fois, aux décalages
//! `(dx, dy)` avec `dx, dy ∈ {-T, 0, +T}`, le tout écrêté aux limites de la
//! tuile :
//!
//! ```text
//! pour chaque pièce (par z-index croissant) :
//!     pour dy dans [-Th, 0, Th] :
//!         pour dx dans [-Tw, 0, Tw] :
//!             dessiner la pièce à (x + dx, y + dy)
//! écrêter le résultat à [0, Tw] × [0, Th]
//! ```
//!
//! Ce qui sort à droite rentre à gauche à la même hauteur, ce qui mord sur un
//! coin réapparaît dans les trois autres : la tuile est raccordable PAR
//! CONSTRUCTION, quel que soit ce qu'on y pose — une image importée, un coup de
//! crayon ou un triangle. C'est vérifié par les tests de [`render`], qui
//! échouent délibérément si l'on retombe à une seule copie.
//!
//! Le webview applique exactement la même règle (`src/lib/pattern/tiling.ts`),
//! sinon l'aperçu mentirait sur le résultat.
//!
//! # Pourquoi le rendu final est ici et pas dans le webview
//!
//! Une capture de canevas plafonne à ce que le navigateur a bien voulu
//! peindre : résolution de l'écran, filtrage de qualité inconnue, alpha
//! approximatif. Ici on compose en **alpha prémultiplié** — seul moyen d'éviter
//! le halo sombre au bord des éléments rééchantillonnés — et chaque image est
//! rééchantillonnée en **Lanczos3 depuis son fichier d'origine**, jamais depuis
//! l'aperçu. Composer en 480 px et sortir en 2048 px ne perd donc rien.
//!
//! # Découpage
//!
//! - [`model`] : ce que le webview envoie ;
//! - [`raster`] : la plomberie de pixels (prémultiplié, rotation, composition) ;
//! - [`sprite`] : les pièces image, du fichier au sprite à sa taille finale ;
//! - [`vector`] : les tracés et les formes, rasterisés par `tiny-skia` ;
//! - [`render`] : les neuf copies, et rien d'autre ;
//! - [`export`] : encodage et écriture des fichiers ;
//! - [`store`] : persistance JSON, pour ré-édition.

mod export;
mod model;
mod raster;
mod render;
mod sprite;
mod store;
mod vector;

#[cfg(test)]
mod fixtures;

// Ré-export GLOBAL, et non nommé : `#[tauri::command]` engendre, à côté de la
// fonction, une macro `__cmd__<nom>` que `generate_handler!` va chercher au même
// chemin. Un `pub use` nommé laisserait la fonction visible et la macro
// introuvable — l'erreur est alors incompréhensible.
pub use export::*;
pub use store::*;

/// Les trois décalages d'un axe, en multiples de la tuile. Le rendu les croise
/// pour obtenir les neuf copies ; les tests passent `&[0]` pour reconstituer la
/// version naïve et prouver qu'elle casse.
pub(crate) const WRAP: [i32; 3] = [-1, 0, 1];

/// Garde-fou de taille : au-delà, on refuse plutôt que de faire gonfler la
/// mémoire jusqu'à l'étranglement. 8192 px de côté couvre largement l'impression.
pub(crate) const MAX_SIDE: u32 = 8192;
