//! Les pièces VECTORIELLES : tracés au crayon, lignes, formes géométriques.
//!
//! Le rasteriseur est `tiny-skia`, un portage de Skia en Rust pur. Dessiner à
//! la main des jointures, des coiffes et un remplissage antialiasés aurait
//! demandé plusieurs centaines de lignes délicates — et surtout se serait
//! écarté du canevas du webview, qui rend l'aperçu.

use image::{Rgba, RgbaImage};

use super::model::{Geometry, Piece, ShapeKind};
use super::raster::parse_hex;

/// Sommets d'un polygone régulier inscrit dans la boîte `w × h`.
///
/// Le premier sommet est EN HAUT (angle de départ à -90°) : c'est ce qui donne
/// un triangle posé sur sa base plutôt que couché sur le flanc. La formule est
/// répétée à l'identique dans `src/lib/pattern/draw.ts` — c'est le seul moyen
/// que l'aperçu et l'export dessinent le même triangle.
fn polygon_points(sides: u32, w: f32, h: f32) -> Vec<(f32, f32)> {
    let n = sides.clamp(3, 24);
    (0..n)
        .map(|i| {
            let a = -std::f32::consts::FRAC_PI_2
                + std::f32::consts::TAU * i as f32 / n as f32;
            (a.cos() * w / 2.0, a.sin() * h / 2.0)
        })
        .collect()
}

/// Le chemin d'une pièce vectorielle, dans son repère propre : centré sur
/// l'origine, en pixels de sortie, avant rotation.
fn local_path(geo: &Geometry, out_w: u32) -> Option<tiny_skia::Path> {
    let unit = out_w as f32;
    let mut b = tiny_skia::PathBuilder::new();
    match geo {
        Geometry::Stroke { points, closed, .. } => {
            let mut iter = points.iter();
            let first = iter.next()?;
            b.move_to(first.x * unit, first.y * unit);
            for p in iter {
                b.line_to(p.x * unit, p.y * unit);
            }
            // Un tracé d'UN SEUL point ne dessinerait rien : `tiny-skia` ignore
            // un sous-chemin sans segment, alors qu'un clic franc au crayon
            // doit poser un point. On lui donne donc une longueur nulle mais
            // explicite, que la coiffe ronde transforme en pastille.
            if points.len() == 1 {
                b.line_to(first.x * unit, first.y * unit);
            }
            if *closed {
                b.close();
            }
        }
        Geometry::Shape {
            shape,
            sides,
            width,
            height,
            ..
        } => {
            let (w, h) = (width.abs() * unit, height.abs() * unit);
            let rect = tiny_skia::Rect::from_xywh(-w / 2.0, -h / 2.0, w.max(0.01), h.max(0.01))?;
            match shape {
                ShapeKind::Rect => b.push_rect(rect),
                ShapeKind::Ellipse => b.push_oval(rect),
                ShapeKind::Polygon => {
                    let pts = polygon_points(*sides, w, h);
                    b.move_to(pts[0].0, pts[0].1);
                    for p in &pts[1..] {
                        b.line_to(p.0, p.1);
                    }
                    b.close();
                }
            }
        }
        Geometry::Image(_) => return None,
    }
    b.finish()
}

/// Dessine une pièce vectorielle et ses copies décalées.
///
/// Les neuf copies sont réunies en UN SEUL chemin, à sous-chemins multiples,
/// puis remplies ou contourées en une passe. C'est ce qui garantit qu'une pièce
/// assez grande pour se chevaucher elle-même par-dessus le bord ne s'assombrit
/// pas à l'intersection : la règle de remplissage en fait une union, là où neuf
/// appels successifs auraient composé neuf fois.
///
/// Le résultat est peint dans une ardoise prémultipliée — le format natif de
/// `tiny-skia`, et le nôtre — avant d'être reversé sur la tuile avec l'opacité
/// de la pièce. Passer par l'ardoise plutôt que d'affaiblir la couleur permet à
/// un tracé qui se recoupe de garder une opacité uniforme, comme un coup de
/// pinceau réel.
#[allow(clippy::too_many_arguments)]
pub(crate) fn draw_vector(
    canvas: &mut RgbaImage,
    piece: &Piece,
    geo: &Geometry,
    out_w: u32,
    out_h: u32,
    wrap: &[i32],
    slate: &mut tiny_skia::Pixmap,
) -> Result<(), String> {
    let Some(local) = local_path(geo, out_w) else {
        return Ok(());
    };
    let tourne = local
        .clone()
        .transform(tiny_skia::Transform::from_rotate(piece.rotation))
        .ok_or("Rotation impossible sur un tracé dégénéré.")?;

    let (fill, stroke, stroke_w) = match geo {
        Geometry::Stroke { color, width, .. } => {
            (None, Some(color.as_str()), width.abs() * out_w as f32)
        }
        Geometry::Shape {
            fill,
            stroke,
            stroke_width,
            ..
        } => (
            fill.as_deref(),
            stroke.as_deref(),
            stroke_width.abs() * out_w as f32,
        ),
        Geometry::Image(_) => return Ok(()),
    };
    // la marge du contour déborde du chemin : l'oublier ferait disparaître une
    // copie dont seul le trait mordait sur la tuile
    let marge = if stroke.is_some() { stroke_w / 2.0 + 1.0 } else { 1.0 };
    let b = tourne.bounds();

    let cx = piece.x * out_w as f32;
    let cy = piece.y * out_h as f32;
    let mut assemble = tiny_skia::PathBuilder::new();
    let mut zone: Option<(f32, f32, f32, f32)> = None;

    for dy in wrap {
        for dx in wrap {
            let ox = cx + (dx * out_w as i32) as f32;
            let oy = cy + (dy * out_h as i32) as f32;
            let (x0, y0) = (ox + b.left() - marge, oy + b.top() - marge);
            let (x1, y1) = (ox + b.right() + marge, oy + b.bottom() + marge);
            if x1 <= 0.0 || y1 <= 0.0 || x0 >= out_w as f32 || y0 >= out_h as f32 {
                continue;
            }
            let copie = local
                .clone()
                .transform(
                    tiny_skia::Transform::from_translate(ox, oy)
                        .pre_concat(tiny_skia::Transform::from_rotate(piece.rotation)),
                )
                .ok_or("Report du tracé impossible.")?;
            assemble.push_path(&copie);
            zone = Some(match zone {
                None => (x0, y0, x1, y1),
                Some(z) => (z.0.min(x0), z.1.min(y0), z.2.max(x1), z.3.max(y1)),
            });
        }
    }

    let (Some(path), Some(zone)) = (assemble.finish(), zone) else {
        return Ok(());
    };
    // On ne nettoie et ne reverse que la zone touchée : une ardoise de la
    // taille de la tuile parcourue en entier pour chaque forme rendrait un
    // export en 4096 px interminable dès la dixième.
    let x0 = zone.0.floor().max(0.0) as u32;
    let y0 = zone.1.floor().max(0.0) as u32;
    let x1 = (zone.2.ceil().max(0.0) as u32).min(out_w);
    let y1 = (zone.3.ceil().max(0.0) as u32).min(out_h);
    if x1 <= x0 || y1 <= y0 {
        return Ok(());
    }
    clear_region(slate, x0, y0, x1, y1);

    let mut paint = tiny_skia::Paint {
        anti_alias: true,
        ..Default::default()
    };
    if let Some(hex) = fill {
        let c = parse_hex(hex)?;
        paint.set_color_rgba8(c.0[0], c.0[1], c.0[2], 255);
        slate.fill_path(
            &path,
            &paint,
            tiny_skia::FillRule::Winding,
            tiny_skia::Transform::identity(),
            None,
        );
    }
    if let (Some(hex), true) = (stroke, stroke_w > 0.0) {
        let c = parse_hex(hex)?;
        paint.set_color_rgba8(c.0[0], c.0[1], c.0[2], 255);
        let trait_ = tiny_skia::Stroke {
            width: stroke_w,
            // rondes des deux côtés : c'est ce qui fait qu'un trait à la main
            // n'a ni angles coupés ni bouts carrés, et c'est ce que le webview
            // dessine (`lineCap`/`lineJoin` de Konva)
            line_cap: tiny_skia::LineCap::Round,
            line_join: tiny_skia::LineJoin::Round,
            ..Default::default()
        };
        slate.stroke_path(
            &path,
            &paint,
            &trait_,
            tiny_skia::Transform::identity(),
            None,
        );
    }

    blit_region(canvas, slate, x0, y0, x1, y1, piece.opacity);
    Ok(())
}

fn clear_region(slate: &mut tiny_skia::Pixmap, x0: u32, y0: u32, x1: u32, y1: u32) {
    let w = slate.width();
    let pixels = slate.pixels_mut();
    for y in y0..y1 {
        let row = (y * w) as usize;
        for p in &mut pixels[row + x0 as usize..row + x1 as usize] {
            *p = tiny_skia::PremultipliedColorU8::TRANSPARENT;
        }
    }
}

/// Reverse l'ardoise sur la tuile. Les deux sont en alpha prémultiplié — c'est
/// le format natif de `tiny-skia` autant que le nôtre, il n'y a donc aucune
/// conversion, et aucun halo à craindre.
fn blit_region(
    canvas: &mut RgbaImage,
    slate: &tiny_skia::Pixmap,
    x0: u32,
    y0: u32,
    x1: u32,
    y1: u32,
    opacity: f32,
) {
    let alpha = opacity.clamp(0.0, 1.0);
    if alpha <= 0.0 {
        return;
    }
    let w = slate.width();
    let pixels = slate.pixels();
    for y in y0..y1 {
        for x in x0..x1 {
            let s = pixels[(y * w + x) as usize];
            let sa = f32::from(s.alpha()) * alpha;
            if sa <= 0.0 {
                continue;
            }
            let inv = 1.0 - sa / 255.0;
            let d = canvas.get_pixel(x, y).0;
            let mut px = [0u8; 4];
            for (c, v) in [s.red(), s.green(), s.blue()].into_iter().enumerate() {
                let m = f32::from(v) * alpha + f32::from(d[c]) * inv;
                px[c] = m.round().clamp(0.0, 255.0) as u8;
            }
            px[3] = (sa + f32::from(d[3]) * inv).round().clamp(0.0, 255.0) as u8;
            canvas.put_pixel(x, y, Rgba(px));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pattern::fixtures::{raccord, trait_droit};
    use crate::pattern::model::{Point, Spec, TileSize};
    use crate::pattern::render::render_tile;

    /// Un trait tiré au-delà du bord droit doit ressortir à gauche, à la même
    /// hauteur : le dessin obéit exactement à la règle des neuf copies, sinon il
    /// serait un motif à part, raccordable par accident.
    #[test]
    fn un_trait_qui_sort_par_la_droite_rentre_par_la_gauche() {
        let spec = Spec {
            tile: TileSize {
                width: 200,
                height: 200,
            },
            background: None,
            pieces: vec![trait_droit((0.7, 0.5), (1.3, 0.5), 0.05)],
        };
        let img = render_tile(&spec, 200, 200, |_, _| {}).expect("rendu");
        let milieu = img.height() / 2;
        assert!(
            img.get_pixel(2, milieu).0[3] > 200,
            "la moitié sortie à droite doit rentrer à gauche"
        );
        assert!(
            img.get_pixel(2, 10).0[3] == 0,
            "et pas ailleurs qu'à sa hauteur"
        );
        let (couture, interieur) = raccord(&img);
        assert!(
            couture <= interieur * 1.5 + 1.0,
            "couture visible sur un trait : {couture:.2} contre {interieur:.2}"
        );
    }

    /// Une forme géométrique posée sur un coin le tient dans les quatre, comme
    /// n'importe quelle autre pièce.
    #[test]
    fn une_forme_de_coin_reapparait_dans_les_trois_autres() {
        let spec = Spec {
            tile: TileSize {
                width: 200,
                height: 200,
            },
            background: None,
            pieces: vec![Piece {
                x: 0.0,
                y: 0.0,
                rotation: 0.0,
                opacity: 1.0,
                visible: true,
                geometry: Geometry::Shape {
                    shape: ShapeKind::Ellipse,
                    sides: 3,
                    width: 0.4,
                    height: 0.4,
                    fill: Some("#c04a52".into()),
                    stroke: None,
                    stroke_width: 0.0,
                },
            }],
        };
        let img = render_tile(&spec, 200, 200, |_, _| {}).expect("rendu");
        let (w, h) = (img.width() - 1, img.height() - 1);
        for (x, y) in [(0, 0), (w, 0), (0, h), (w, h)] {
            assert!(
                img.get_pixel(x, y).0[3] > 100,
                "le coin ({x}, {y}) devrait porter un quart de l'ellipse"
            );
        }
    }

    /// Un triangle a trois sommets, et le premier est en haut : c'est ce qui
    /// distingue un triangle posé sur sa base d'un triangle couché. La formule
    /// est recopiée dans `draw.ts` — ce test fige la convention que les deux
    /// doivent partager.
    #[test]
    fn le_premier_sommet_d_un_polygone_est_en_haut() {
        let pts = polygon_points(3, 100.0, 100.0);
        assert_eq!(pts.len(), 3);
        assert!(
            pts[0].0.abs() < 0.001 && pts[0].1 < -49.0,
            "premier sommet attendu en haut au centre, obtenu {:?}",
            pts[0]
        );
        // et les trois sommets sont bien répartis autour du centre
        let somme_y: f32 = pts.iter().map(|p| p.1).sum();
        assert!(somme_y.abs() < 0.01, "polygone décentré : {somme_y}");
    }

    /// Un tracé qui se recoupe garde une opacité UNIFORME : les neuf copies et
    /// les boucles du trait sont réunies en un seul chemin, puis peintes en une
    /// passe. Composer copie par copie assombrirait chaque croisement, et un
    /// coup de crayon translucide deviendrait un entrelacs de taches.
    #[test]
    fn un_trace_translucide_ne_s_assombrit_pas_a_ses_croisements() {
        let croix = Piece {
            x: 0.5,
            y: 0.5,
            rotation: 0.0,
            opacity: 0.5,
            visible: true,
            geometry: Geometry::Stroke {
                points: vec![
                    Point { x: -0.2, y: -0.2 },
                    Point { x: 0.2, y: 0.2 },
                    Point { x: -0.2, y: 0.2 },
                    Point { x: 0.2, y: -0.2 },
                ],
                color: "#000000".into(),
                width: 0.06,
                closed: false,
            },
        };
        let spec = Spec {
            tile: TileSize {
                width: 200,
                height: 200,
            },
            background: Some("#ffffff".into()),
            pieces: vec![croix],
        };
        let img = render_tile(&spec, 200, 200, |_, _| {}).expect("rendu");
        // Les deux diagonales se croisent au centre (100, 100) ; (80, 80) n'est
        // sur QUE la première. Le noir à demi opaque doit y peser pareil.
        let centre = img.get_pixel(100, 100).0[0];
        let bras = img.get_pixel(80, 80).0[0];
        assert!(
            (i32::from(centre) - i32::from(bras)).abs() <= 4,
            "croisement assombri : {centre} au centre contre {bras} sur un bras"
        );
    }
}
