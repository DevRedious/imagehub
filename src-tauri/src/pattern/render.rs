//! Le rendu d'une tuile : les neuf copies, et rien d'autre.

use image::RgbaImage;
use std::collections::HashMap;

use super::model::{Geometry, Piece, Spec};
use super::raster::{blit_over, parse_hex, unpremultiply};
use super::sprite::build_sprite;
use super::vector::draw_vector;
use super::{MAX_SIDE, WRAP};

/// Rend la tuile.
///
/// `wrap` porte les décalages à appliquer, en multiples de la tuile : `&WRAP`
/// donne les neuf copies attendues, `&[0]` la version naïve que les tests
/// utilisent pour vérifier que le contrôle de raccord détecte bien la
/// régression.
///
/// Optimisation : une copie décalée n'est dessinée que si sa boîte englobante
/// touche réellement la tuile. En pratique une pièce bien à l'intérieur n'est
/// dessinée qu'une fois, une pièce à cheval sur un bord deux fois, une pièce de
/// coin quatre fois — jamais neuf.
pub(crate) fn render_tile_with(
    spec: &Spec,
    out_w: u32,
    out_h: u32,
    wrap: &[i32],
    mut progress: impl FnMut(usize, usize),
) -> Result<RgbaImage, String> {
    if out_w == 0 || out_h == 0 || out_w > MAX_SIDE || out_h > MAX_SIDE {
        return Err(format!("Taille de tuile hors limites (1..{MAX_SIDE} px)."));
    }
    let mut canvas = RgbaImage::new(out_w, out_h);
    if let Some(hex) = spec.background.as_deref() {
        let bg = parse_hex(hex)?;
        for p in canvas.pixels_mut() {
            *p = bg; // opaque : prémultiplié et alpha droit s'y confondent
        }
    }

    let visible: Vec<&Piece> = spec.pieces.iter().filter(|p| p.visible).collect();
    let total = visible.len();
    let mut sources: HashMap<String, RgbaImage> = HashMap::new();
    // Une seule ardoise pour tous les tracés, allouée à la première pièce
    // vectorielle : une composition sans dessin n'en paie pas la mémoire, et
    // une composition qui en compte trente n'alloue qu'une fois.
    let mut slate: Option<tiny_skia::Pixmap> = None;

    for (done, piece) in visible.into_iter().enumerate() {
        match &piece.geometry {
            Geometry::Image(img) => {
                let sprite = build_sprite(piece, img, out_w, &mut sources)?;
                let cx = piece.x * out_w as f32;
                let cy = piece.y * out_h as f32;
                let half_w = sprite.width() as f32 / 2.0;
                let half_h = sprite.height() as f32 / 2.0;

                for dy in wrap {
                    for dx in wrap {
                        let left = cx + (dx * out_w as i32) as f32 - half_w;
                        let top = cy + (dy * out_h as i32) as f32 - half_h;
                        // hors de la tuile : rien à écrire, on ne parcourt même pas
                        if left >= out_w as f32
                            || top >= out_h as f32
                            || left + sprite.width() as f32 <= 0.0
                            || top + sprite.height() as f32 <= 0.0
                        {
                            continue;
                        }
                        blit_over(
                            &mut canvas,
                            &sprite,
                            left.round() as i32,
                            top.round() as i32,
                            piece.opacity,
                        );
                    }
                }
            }
            geo => {
                let slate = match slate {
                    Some(ref mut p) => p,
                    None => slate.insert(
                        tiny_skia::Pixmap::new(out_w, out_h)
                            .ok_or("Mémoire insuffisante pour rendre les tracés.")?,
                    ),
                };
                draw_vector(&mut canvas, piece, geo, out_w, out_h, wrap, slate)?;
            }
        }
        progress(done + 1, total);
    }

    unpremultiply(&mut canvas);
    Ok(canvas)
}

/// La tuile, avec les neuf copies — le seul rendu qu'on expose.
pub(crate) fn render_tile(
    spec: &Spec,
    out_w: u32,
    out_h: u32,
    progress: impl FnMut(usize, usize),
) -> Result<RgbaImage, String> {
    render_tile_with(spec, out_w, out_h, &WRAP, progress)
}

/// La tuile répétée 3×3, pour montrer le motif plutôt que sa brique.
pub(crate) fn montage(tile: &RgbaImage) -> RgbaImage {
    let (w, h) = tile.dimensions();
    let mut out = RgbaImage::new(w * 3, h * 3);
    for row in 0..3 {
        for col in 0..3 {
            image::imageops::replace(&mut out, tile, i64::from(w * col), i64::from(h * row));
        }
    }
    out
}

/// Aplatit sur une couleur opaque. Le JPG n'a pas d'alpha : sans ça, tout ce

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pattern::fixtures::{
        disque, piece, raccord, raccord_vertical, spec_de_coin,
    };
    use crate::pattern::model::{Geometry, ImageGeometry, Point, ShapeKind, TileSize};
    use image::{Rgba, RgbaImage};
    use std::path::{Path, PathBuf};

    /// Le critère d'acceptation : aucune discontinuité entre la dernière
    /// colonne et la première, ni entre la dernière ligne et la première.
    #[test]
    fn une_tuile_se_juxtapose_a_elle_meme_sans_couture() {
        let src = disque("raccord", 128);
        let img = render_tile(&spec_de_coin(&src), 256, 256, |_, _| {}).expect("rendu");
        let (couture, interieur) = raccord(&img);
        assert!(
            couture <= interieur * 1.5 + 1.0,
            "couture verticale visible : {couture:.2} contre {interieur:.2} à l'intérieur"
        );
        let (couture, interieur) = raccord_vertical(&img);
        assert!(
            couture <= interieur * 1.5 + 1.0,
            "couture horizontale visible : {couture:.2} contre {interieur:.2} à l'intérieur"
        );
        let _ = std::fs::remove_file(src);
    }

    /// Le contrôle ci-dessus ne vaut que s'il DÉTECTE la régression : on rejoue
    /// donc le même rendu avec une seule copie par élément — l'erreur classique
    /// — et on exige qu'il échoue franchement. Sans ce test, un contrôle trop
    /// permissif passerait inaperçu et ne protégerait plus rien.
    #[test]
    fn sans_les_neuf_copies_le_raccord_casse() {
        let src = disque("regression", 128);
        let spec = spec_de_coin(&src);
        let img = render_tile_with(&spec, 256, 256, &[0], |_, _| {}).expect("rendu");
        let (couture, interieur) = raccord(&img);
        assert!(
            couture > interieur * 1.5 + 1.0,
            "une seule copie par élément DOIT produire une couture ({couture:.2} contre {interieur:.2})"
        );
        let _ = std::fs::remove_file(src);
    }

    /// Le débordement de droite doit réapparaître à GAUCHE, à la même hauteur —
    /// pas seulement « quelque part ». On compare donc la colonne juste après
    /// le bord gauche à ce que la tuile porte au même endroit une largeur plus
    /// loin, c'est-à-dire la continuité du tore.
    #[test]
    fn ce_qui_deborde_a_droite_revient_a_gauche_a_la_meme_hauteur() {
        let src = disque("report", 128);
        let spec = Spec {
            tile: TileSize {
                width: 200,
                height: 200,
            },
            background: None,
            // à cheval sur le bord droit, à mi-hauteur
            pieces: vec![piece(&src, 1.0, 0.5, 0.4)],
        };
        let img = render_tile(&spec, 200, 200, |_, _| {}).expect("rendu");
        let milieu = img.height() / 2;
        assert!(
            img.get_pixel(1, milieu).0[3] > 200,
            "le bord gauche doit porter la moitié manquante de la pièce"
        );
        // et rien ne doit avoir débordé sur une autre hauteur
        assert_eq!(
            img.get_pixel(1, 5).0[3],
            0,
            "le report ne doit pas déplacer la pièce verticalement"
        );
        let _ = std::fs::remove_file(src);
    }

    /// Une pièce posée dans un coin réapparaît dans les trois autres.
    #[test]
    fn une_piece_de_coin_reapparait_dans_les_trois_autres() {
        let src = disque("coin", 128);
        let spec = Spec {
            tile: TileSize {
                width: 200,
                height: 200,
            },
            background: None,
            pieces: vec![piece(&src, 0.0, 0.0, 0.4)],
        };
        let img = render_tile(&spec, 200, 200, |_, _| {}).expect("rendu");
        let (w, h) = (img.width() - 1, img.height() - 1);
        for (x, y) in [(0, 0), (w, 0), (0, h), (w, h)] {
            assert!(
                img.get_pixel(x, y).0[3] > 100,
                "le coin ({x}, {y}) devrait porter un quart de la pièce"
            );
        }
        let _ = std::fs::remove_file(src);
    }

    /// La résolution d'export est indépendante de la taille d'édition : rendre
    /// la MÊME composition en 128 puis en 512 doit donner le même motif, à
    /// l'échelle près. On le vérifie sur le barycentre de la matière, qui
    /// résume position et taille en deux nombres normalisés.
    #[test]
    fn le_motif_ne_depend_pas_de_la_resolution() {
        let src = disque("echelle", 128);
        let spec = spec_de_coin(&src);
        let centre = |img: &RgbaImage| {
            let (mut sx, mut sy, mut poids) = (0.0f64, 0.0f64, 0.0f64);
            for (x, y, p) in img.enumerate_pixels() {
                let a = f64::from(p.0[3]);
                sx += f64::from(x) * a;
                sy += f64::from(y) * a;
                poids += a;
            }
            (
                sx / poids / f64::from(img.width()),
                sy / poids / f64::from(img.height()),
            )
        };
        let petit = centre(&render_tile(&spec, 128, 128, |_, _| {}).expect("petit"));
        let grand = centre(&render_tile(&spec, 512, 512, |_, _| {}).expect("grand"));
        assert!(
            (petit.0 - grand.0).abs() < 0.01 && (petit.1 - grand.1).abs() < 0.01,
            "le motif se déplace avec la résolution : {petit:?} contre {grand:?}"
        );
        let _ = std::fs::remove_file(src);
    }

    /// Le halo sombre est le défaut classique d'une composition en alpha DROIT :
    /// les pixels transparents d'un PNG détouré portent souvent du noir, qui se
    /// mélange à la couleur des pixels voisins dès qu'on rééchantillonne. Ici la
    /// source est blanche avec un fond transparent noir : après une forte
    /// réduction, les pixels de bord doivent rester blancs.
    #[test]
    fn pas_de_halo_sombre_sur_les_bords_reechantillonnes() {
        let dest = std::env::temp_dir().join(format!(
            "imagehub-test-motif-halo-{}.png",
            std::process::id()
        ));
        let mut img = RgbaImage::new(256, 256);
        for y in 0..256 {
            for x in 0..256 {
                // carré blanc opaque au centre, noir transparent autour
                let dedans = (64..192).contains(&x) && (64..192).contains(&y);
                let px = if dedans {
                    Rgba([255, 255, 255, 255])
                } else {
                    Rgba([0, 0, 0, 0])
                };
                img.put_pixel(x, y, px);
            }
        }
        img.save(&dest).expect("écriture");

        let spec = Spec {
            tile: TileSize {
                width: 64,
                height: 64,
            },
            background: None,
            pieces: vec![piece(&dest, 0.5, 0.5, 0.5)],
        };
        let tuile = render_tile(&spec, 64, 64, |_, _| {}).expect("rendu");
        let mut sombres = 0;
        for p in tuile.pixels() {
            // un pixel partiellement transparent qui a viré au gris trahit un
            // halo : en prémultiplié, il reste blanc quelle que soit son opacité
            if p.0[3] > 8 && p.0[3] < 250 && p.0[0] < 200 {
                sombres += 1;
            }
        }
        assert_eq!(sombres, 0, "{sombres} pixels de bord assombris (halo)");
        let _ = std::fs::remove_file(dest);
    }

    /// Banc d'essai à l'œil, à la demande :
    /// `cargo test --lib motif_a_regarder -- --ignored --nocapture`
    ///
    /// Les tests ci-dessus mesurent le raccord ; celui-ci le donne à VOIR — un
    /// motif de feuilles et de baies, la tuile et sa répétition 3×3 côte à
    /// côte. Ignoré par défaut : il écrit des fichiers, il ne vérifie rien.
    #[test]
    #[ignore]
    fn motif_a_regarder() {
        let dir = std::env::var("IMAGEHUB_MOTIF")
            .map(PathBuf::from)
            .unwrap_or_else(|_| std::env::temp_dir().join("imagehub-motif"));
        std::fs::create_dir_all(&dir).expect("dossier de sortie");

        let mut feuille = RgbaImage::new(200, 400);
        for (x, y, p) in feuille.enumerate_pixels_mut() {
            let dx = (x as f32 - 100.0) / 90.0;
            let dy = (y as f32 - 200.0) / 190.0;
            if dx * dx + dy * dy < 1.0 {
                *p = Rgba([106, 138, 78, 255]);
            }
        }
        let f = dir.join("_feuille.png");
        feuille.save(&f).expect("écriture");

        let mut baie = RgbaImage::new(140, 140);
        for (x, y, p) in baie.enumerate_pixels_mut() {
            let d = ((x as f32 - 70.0).powi(2) + (y as f32 - 70.0).powi(2)).sqrt();
            if d < 65.0 {
                let a = ((65.0 - d) / 3.0).clamp(0.0, 1.0);
                *p = Rgba([186, 74, 82, (a * 255.0) as u8]);
            }
        }
        let b = dir.join("_baie.png");
        baie.save(&b).expect("écriture");

        let pose = |src: &Path, x, y, w, h, rot| Piece {
            x,
            y,
            rotation: rot,
            opacity: 1.0,
            visible: true,
            geometry: Geometry::Image(ImageGeometry {
                src: src.to_string_lossy().to_string(),
                width: w,
                height: h,
                flip_x: false,
                flip_y: false,
            }),
        };
        let spec = Spec {
            tile: TileSize {
                width: 480,
                height: 480,
            },
            background: Some("#f2ece0".into()),
            pieces: vec![
                // un trait tiré en travers, qui sort par la droite
                Piece {
                    x: 0.5,
                    y: 0.18,
                    rotation: -12.0,
                    opacity: 1.0,
                    visible: true,
                    geometry: Geometry::Stroke {
                        points: vec![
                            Point { x: -0.6, y: 0.05 },
                            Point { x: -0.2, y: -0.06 },
                            Point { x: 0.2, y: 0.06 },
                            Point { x: 0.6, y: -0.05 },
                        ],
                        color: "#3d5a3a".into(),
                        width: 0.014,
                        closed: false,
                    },
                },
                // un triangle contouré, à cheval sur le bord gauche
                Piece {
                    x: 0.0,
                    y: 0.62,
                    rotation: 18.0,
                    opacity: 1.0,
                    visible: true,
                    geometry: Geometry::Shape {
                        shape: ShapeKind::Polygon,
                        sides: 3,
                        width: 0.22,
                        height: 0.22,
                        fill: None,
                        stroke: Some("#8a5a3a".into()),
                        stroke_width: 0.012,
                    },
                },
                // un hexagone plein
                Piece {
                    x: 0.78,
                    y: 0.8,
                    rotation: 0.0,
                    opacity: 0.85,
                    visible: true,
                    geometry: Geometry::Shape {
                        shape: ShapeKind::Polygon,
                        sides: 6,
                        width: 0.16,
                        height: 0.16,
                        fill: Some("#c9a227".into()),
                        stroke: None,
                        stroke_width: 0.0,
                    },
                },
                pose(&f, 1.0, 0.35, 0.16, 0.32, 24.0), // à cheval sur le bord droit
                pose(&f, 0.35, 0.0, 0.14, 0.28, -68.0), // à cheval sur le bord haut
                pose(&b, 0.0, 1.0, 0.09, 0.09, 0.0), // sur un coin : les quatre le portent
                pose(&b, 0.24, 0.52, 0.07, 0.07, 0.0),
            ],
        };
        let tuile = render_tile(&spec, 1024, 1024, |_, _| {}).expect("rendu");
        tuile.save(dir.join("tuile.png")).expect("écriture");
        montage(&tuile).save(dir.join("x3.png")).expect("écriture");
        println!("écrit dans {}", dir.display());
    }
}
