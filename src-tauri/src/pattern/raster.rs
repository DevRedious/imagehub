//! Plomberie de pixels : alpha prémultiplié, rotation, composition.
//!
//! Rien ici ne connaît la notion de motif — ce sont les opérations de bas
//! niveau sur lesquelles tout le rendu s'appuie, et qui décident seules de
//! l'absence de halo et de crénelage.

use image::{Rgba, RgbaImage};

/// Passe en alpha prémultiplié.
///
/// Sans ça, rééchantillonner mélange la couleur des pixels transparents (bien
/// souvent du noir, resté dans les octets RGB d'un PNG détouré) avec celle des
/// pixels visibles : le bord de chaque élément se cerne d'un halo sombre, très
/// visible sur fond clair. En prémultiplié, un pixel transparent ne pèse rien
/// dans la moyenne, ce qui est exactement le comportement attendu.
pub(crate) fn premultiply(src: &RgbaImage) -> RgbaImage {
    let mut out = src.clone();
    for p in out.pixels_mut() {
        let a = u32::from(p.0[3]);
        for c in 0..3 {
            p.0[c] = ((u32::from(p.0[c]) * a + 127) / 255) as u8;
        }
    }
    out
}

/// Retour en alpha droit, à la toute fin. Les valeurs sont bornées à l'alpha
/// avant division : un filtre à lobes (Lanczos) dépasse, et un canal supérieur
/// à son alpha n'a pas de sens — il ressortirait en pixel sur-lumineux.
pub(crate) fn unpremultiply(img: &mut RgbaImage) {
    for p in img.pixels_mut() {
        let a = p.0[3];
        if a == 0 {
            p.0 = [0, 0, 0, 0];
            continue;
        }
        for c in 0..3 {
            let v = p.0[c].min(a);
            p.0[c] = ((u32::from(v) * 255 + u32::from(a) / 2) / u32::from(a)).min(255) as u8;
        }
    }
}

/// Rétablit l'invariant `couleur ≤ alpha` après un filtre à lobes négatifs.
pub(crate) fn clamp_premultiplied(img: &mut RgbaImage) {
    for p in img.pixels_mut() {
        let a = p.0[3];
        for c in 0..3 {
            if p.0[c] > a {
                p.0[c] = a;
            }
        }
    }
}

/// Rotation d'angle libre, par échantillonnage affine INVERSE et interpolation
/// bilinéaire, sur des données prémultipliées.
///
/// Pourquoi à la main plutôt qu'avec `imageproc` : la crate ne servirait qu'à
/// cette seule fonction (elle tire `rayon` et `nalgebra` dans le binaire d'une
/// application déjà lourde de ses moteurs CLI), et il faudrait de toute façon
/// gérer le prémultiplié autour d'elle. Quarante lignes ici valent mieux que
/// deux dépendances de plus.
///
/// L'échelle a DÉJÀ été appliquée en amont, par un vrai filtre de
/// rééchantillonnage (Lanczos3) : la rotation est donc une transformation
/// rigide, où le bilinéaire ne crée aucun crénelage — il n'y a plus de
/// réduction à absorber.
pub(crate) fn rotate_premultiplied(src: &RgbaImage, degrees: f32) -> RgbaImage {
    let theta = degrees.to_radians();
    let (cos, sin) = (theta.cos(), theta.sin());
    let (sw, sh) = (src.width() as f32, src.height() as f32);

    // boîte englobante de la source tournée
    let bw = (sw * cos.abs() + sh * sin.abs()).ceil().max(1.0);
    let bh = (sw * sin.abs() + sh * cos.abs()).ceil().max(1.0);
    let mut out = RgbaImage::new(bw as u32, bh as u32);

    let (scx, scy) = (sw / 2.0, sh / 2.0);
    let (dcx, dcy) = (bw / 2.0, bh / 2.0);

    for y in 0..out.height() {
        for x in 0..out.width() {
            // du pixel de destination vers la source : rotation inverse
            let dx = x as f32 + 0.5 - dcx;
            let dy = y as f32 + 0.5 - dcy;
            let sx = dx * cos + dy * sin + scx - 0.5;
            let sy = -dx * sin + dy * cos + scy - 0.5;
            if let Some(px) = sample_bilinear(src, sx, sy) {
                out.put_pixel(x, y, px);
            }
        }
    }
    out
}

/// Échantillon bilinéaire ; `None` hors du support de la source.
///
/// Les pixels hors bords comptent comme transparents plutôt que d'être
/// rabattus sur le bord le plus proche : un élément tourné doit s'arrêter net,
/// pas laisser traîner une bavure de sa dernière colonne.
fn sample_bilinear(src: &RgbaImage, x: f32, y: f32) -> Option<Rgba<u8>> {
    let (w, h) = (src.width() as i32, src.height() as i32);
    if x <= -1.0 || y <= -1.0 || x >= w as f32 || y >= h as f32 {
        return None;
    }
    let x0 = x.floor() as i32;
    let y0 = y.floor() as i32;
    let fx = x - x0 as f32;
    let fy = y - y0 as f32;

    let at = |ix: i32, iy: i32| -> [f32; 4] {
        if ix < 0 || iy < 0 || ix >= w || iy >= h {
            return [0.0; 4];
        }
        let p = src.get_pixel(ix as u32, iy as u32).0;
        [
            f32::from(p[0]),
            f32::from(p[1]),
            f32::from(p[2]),
            f32::from(p[3]),
        ]
    };

    let (a, b, c, d) = (
        at(x0, y0),
        at(x0 + 1, y0),
        at(x0, y0 + 1),
        at(x0 + 1, y0 + 1),
    );
    let mut out = [0u8; 4];
    for i in 0..4 {
        let top = a[i] + (b[i] - a[i]) * fx;
        let bottom = c[i] + (d[i] - c[i]) * fx;
        out[i] = (top + (bottom - top) * fy).round().clamp(0.0, 255.0) as u8;
    }
    Some(Rgba(out))
}

/// Pose `sprite` (prémultiplié) sur `dst` (prémultiplié) au coin `(left, top)`,
/// en « source over ». L'écrêtage aux bords de la tuile est implicite : tout ce
/// qui tombe en dehors n'est simplement jamais écrit.
pub(crate) fn blit_over(dst: &mut RgbaImage, sprite: &RgbaImage, left: i32, top: i32, opacity: f32) {
    let alpha = opacity.clamp(0.0, 1.0);
    if alpha <= 0.0 {
        return;
    }
    let (dw, dh) = (dst.width() as i32, dst.height() as i32);
    let x0 = left.max(0);
    let y0 = top.max(0);
    let x1 = (left + sprite.width() as i32).min(dw);
    let y1 = (top + sprite.height() as i32).min(dh);

    for y in y0..y1 {
        for x in x0..x1 {
            let s = sprite.get_pixel((x - left) as u32, (y - top) as u32).0;
            let sa = f32::from(s[3]) * alpha;
            if sa <= 0.0 {
                continue;
            }
            let inv = 1.0 - sa / 255.0;
            let d = dst.get_pixel(x as u32, y as u32).0;
            let mut px = [0u8; 4];
            for c in 0..3 {
                let v = f32::from(s[c]) * alpha + f32::from(d[c]) * inv;
                px[c] = v.round().clamp(0.0, 255.0) as u8;
            }
            px[3] = (sa + f32::from(d[3]) * inv).round().clamp(0.0, 255.0) as u8;
            dst.put_pixel(x as u32, y as u32, Rgba(px));
        }
    }
}


pub(crate) fn parse_hex(value: &str) -> Result<Rgba<u8>, String> {
    let hex = value.trim().trim_start_matches('#');
    if hex.len() != 6 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(format!("Couleur de fond invalide : {value}"));
    }
    let byte = |i: usize| u8::from_str_radix(&hex[i..i + 2], 16).unwrap_or(0);
    Ok(Rgba([byte(0), byte(2), byte(4), 255]))
}
