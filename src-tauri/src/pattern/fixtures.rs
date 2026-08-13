//! De quoi éprouver un motif : sources synthétiques, constructeurs de pièces,
//! et la mesure de raccord elle-même.
//!
//! Ces outils sont partagés par les tests de [`super::render`] (le raccord) et
//! de [`super::vector`] (le dessin) : les dupliquer aurait laissé deux mesures
//! de couture diverger en silence, et une mesure de couture trop permissive ne
//! protège plus rien.

use image::{Rgba, RgbaImage};
use std::path::{Path, PathBuf};

use super::model::{Geometry, ImageGeometry, Piece, Point, Spec, TileSize};

/// Un disque à bord doux, écrit sur le disque : la source dont les tests se
/// servent pour poser un élément à cheval sur un bord. Le dégradé importe —
/// une forme à bord franc rendrait le contrôle de raccord trivial, alors
/// qu'un dégradé oblige à comparer la couture à la variation naturelle de
/// l'image.
pub(crate) fn disque(nom: &str, taille: u32) -> PathBuf {
    let dest = std::env::temp_dir().join(format!(
        "imagehub-test-motif-{nom}-{}.png",
        std::process::id()
    ));
    let mut img = RgbaImage::new(taille, taille);
    let r = taille as f32 / 2.0;
    for y in 0..taille {
        for x in 0..taille {
            let dx = x as f32 + 0.5 - r;
            let dy = y as f32 + 0.5 - r;
            let d = (dx * dx + dy * dy).sqrt() / r;
            let a = ((1.0 - d).clamp(0.0, 1.0) * 255.0) as u8;
            img.put_pixel(x, y, Rgba([220, 120, 60, a]));
        }
    }
    img.save(&dest).expect("écriture du disque de test");
    dest
}

pub(crate) fn piece(src: &Path, x: f32, y: f32, taille: f32) -> Piece {
    Piece {
        x,
        y,
        rotation: 0.0,
        opacity: 1.0,
        visible: true,
        geometry: Geometry::Image(ImageGeometry {
            src: src.to_string_lossy().to_string(),
            width: taille,
            height: taille,
            flip_x: false,
            flip_y: false,
        }),
    }
}

pub(crate) fn trait_droit(de: (f32, f32), a: (f32, f32), epaisseur: f32) -> Piece {
    // les points sont RELATIFS au centre : on prend le milieu du segment
    let cx = (de.0 + a.0) / 2.0;
    let cy = (de.1 + a.1) / 2.0;
    Piece {
        x: cx,
        y: cy,
        rotation: 0.0,
        opacity: 1.0,
        visible: true,
        geometry: Geometry::Stroke {
            points: vec![
                Point {
                    x: de.0 - cx,
                    y: de.1 - cy,
                },
                Point {
                    x: a.0 - cx,
                    y: a.1 - cy,
                },
            ],
            color: "#1b1b1f".into(),
            width: epaisseur,
            closed: false,
        },
    }
}

pub(crate) fn spec_de_coin(src: &Path) -> Spec {
    Spec {
        tile: TileSize {
            width: 256,
            height: 256,
        },
        background: None,
        // délibérément à cheval sur le coin bas-droit ET sur le bord droit
        // à mi-hauteur : de quoi éprouver colonnes et lignes.
        pieces: vec![piece(src, 1.0, 1.0, 0.5), piece(src, 1.0, 0.5, 0.3)],
    }
}

/// Écart moyen entre deux colonnes, tous canaux confondus.
pub(crate) fn ecart_colonnes(img: &RgbaImage, a: u32, b: u32) -> f64 {
    let mut somme = 0.0;
    for y in 0..img.height() {
        let (p, q) = (img.get_pixel(a, y).0, img.get_pixel(b, y).0);
        for c in 0..4 {
            somme += (f64::from(p[c]) - f64::from(q[c])).abs();
        }
    }
    somme / f64::from(img.height() * 4)
}

pub(crate) fn ecart_lignes(img: &RgbaImage, a: u32, b: u32) -> f64 {
    let mut somme = 0.0;
    for x in 0..img.width() {
        let (p, q) = (img.get_pixel(x, a).0, img.get_pixel(x, b).0);
        for c in 0..4 {
            somme += (f64::from(p[c]) - f64::from(q[c])).abs();
        }
    }
    somme / f64::from(img.width() * 4)
}

/// Le contrôle de raccord.
///
/// Juxtaposer la tuile à elle-même met la DERNIÈRE colonne au contact de la
/// PREMIÈRE. Si le motif est réellement raccordable, ces deux colonnes sont
/// voisines comme deux colonnes quelconques de l'intérieur : leur écart ne
/// doit donc pas sortir de la variation naturelle de l'image, mesurée par
/// le plus grand écart entre deux colonnes voisines à l'intérieur.
///
/// Comparer à cette variation plutôt qu'à un seuil fixe est ce qui rend le
/// contrôle utilisable sur n'importe quel motif : un dégradé doux et un
/// motif contrasté n'ont pas les mêmes écarts absolus.
pub(crate) fn raccord(img: &RgbaImage) -> (f64, f64) {
    let couture = ecart_colonnes(img, img.width() - 1, 0);
    let mut interieur: f64 = 0.0;
    for x in 0..img.width() - 1 {
        interieur = interieur.max(ecart_colonnes(img, x, x + 1));
    }
    (couture, interieur)
}

pub(crate) fn raccord_vertical(img: &RgbaImage) -> (f64, f64) {
    let couture = ecart_lignes(img, img.height() - 1, 0);
    let mut interieur: f64 = 0.0;
    for y in 0..img.height() - 1 {
        interieur = interieur.max(ecart_lignes(img, y, y + 1));
    }
    (couture, interieur)
}
