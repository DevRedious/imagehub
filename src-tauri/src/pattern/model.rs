//! Le modèle d'un motif : ce que le webview sérialise et que Rust reçoit.

use serde::{Deserialize, Serialize};

/// Un point d'un tracé, RELATIF au centre de la pièce.
#[derive(Deserialize, Clone, Copy)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

#[derive(Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ShapeKind {
    Rect,
    Ellipse,
    /// polygone régulier à `sides` côtés : 3 donne le triangle, 6 l'hexagone
    Polygon,
}

/// Ce qu'une pièce dessine.
///
/// Trois natures, un seul comportement : quelle que soit la géométrie, la pièce
/// est reportée aux neuf décalages et écrêtée à la tuile. Ajouter le dessin
/// n'était donc pas ajouter un second système de motif, mais une seconde façon
/// de remplir une pièce.
#[derive(Deserialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Geometry {
    /// un fichier posé : PNG, WebP, ou SVG rasterisé à la volée
    Image(ImageGeometry),
    /// un trait : main levée, ligne droite, ou polyligne. Les deux ne diffèrent
    /// que par le nombre de points — inutile d'en faire deux types.
    #[serde(rename_all = "camelCase")]
    Stroke {
        points: Vec<Point>,
        color: String,
        width: f32,
        #[serde(default)]
        closed: bool,
    },
    /// une forme géométrique, remplie et/ou contourée
    #[serde(rename_all = "camelCase")]
    Shape {
        shape: ShapeKind,
        #[serde(default = "trois_cotes")]
        sides: u32,
        width: f32,
        height: f32,
        #[serde(default)]
        fill: Option<String>,
        #[serde(default)]
        stroke: Option<String>,
        #[serde(default)]
        stroke_width: f32,
    },
}

fn trois_cotes() -> u32 {
    3
}

/// Une pièce image.
///
/// Charge NOMMÉE plutôt qu'anonyme dans la variante : la mise à l'échelle
/// prenait sinon cinq paramètres séparés, et une signature à huit arguments
/// n'apprend plus rien à qui la lit. En JSON, rien ne change — une variante
/// « newtype » sous un discriminant interne s'écrit à plat, comme avant.
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImageGeometry {
    pub src: String,
    pub width: f32,
    pub height: f32,
    #[serde(default)]
    pub flip_x: bool,
    #[serde(default)]
    pub flip_y: bool,
}

/// Une pièce posée sur la tuile.
///
/// # Unités
///
/// Tout est NORMALISÉ, jamais en pixels : c'est ce qui rend la résolution
/// d'export indépendante de la taille d'édition. Composer en 480 px et rendre
/// en 2048 px revient à multiplier ces nombres par une autre constante, pas à
/// agrandir une image déjà rendue.
///
/// Deux unités, et une seule règle pour s'en souvenir :
///
/// - le **centre** `(x, y)` est une fraction de chaque axe — `(1, 1)` est le
///   coin bas-droit, quelle que soit la forme de la tuile ;
/// - **toute étendue** (taille, points d'un tracé, épaisseur de trait) est une
///   fraction de la LARGEUR de la tuile.
///
/// Rapporter les étendues à un seul axe est ce qui garde une rotation
/// isotrope : normaliser la hauteur sur la hauteur ferait pencher un cercle
/// dès qu'on sortirait du carré.
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Piece {
    pub x: f32,
    pub y: f32,
    /// angle libre, en degrés, dans le sens horaire (convention Konva)
    pub rotation: f32,
    /// 0..1
    pub opacity: f32,
    pub visible: bool,
    #[serde(flatten)]
    pub geometry: Geometry,
}

/// Taille de la tuile. `Tw × Th` dès la structure de données : l'interface ne
/// propose que du carré pour l'instant, mais une tuile en brique ou en bandeau
/// ne demandera pas de refonte.
#[derive(Deserialize, Clone, Copy)]
pub struct TileSize {
    pub width: u32,
    pub height: u32,
}

/// Une composition complète, telle qu'elle est sérialisée en JSON.
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Spec {
    pub tile: TileSize,
    /// `#rrggbb` ; absent = fond transparent
    pub background: Option<String>,
    /// du fond vers le premier plan
    pub pieces: Vec<Piece>,
}

/// Un fichier écrit. Même forme que pour les compositions de l'Atelier, pour
/// que l'interface n'ait qu'une seule notion de « ce qui vient d'être produit ».
pub type Written = crate::compose::Written;

/// Un motif enregistré sur le disque, pour ré-édition.
#[derive(Serialize)]
pub struct SavedPattern {
    pub path: String,
    pub name: String,
}
