//! Les pièces IMAGE : lecture du fichier source et mise à la taille finale.

use image::imageops::FilterType;
use image::RgbaImage;
use std::collections::HashMap;
use std::path::Path;

use super::model::{ImageGeometry, Piece};
use super::raster::{clamp_premultiplied, premultiply, rotate_premultiplied};
use super::MAX_SIDE;

fn is_svg(src: &str) -> bool {
    Path::new(src)
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("svg"))
}

/// Les pixels d'un élément.
///
/// Un SVG n'en a pas : `image::open` ne sait pas le décoder, et il n'y a rien à
/// décoder — c'est une description, pas une image. On le rasterise donc par
/// Inkscape, le même moteur que l'action « SVG → PNG » du Studio, à la largeur
/// exacte où la pièce sera posée. Le rapport du fichier est respecté à ce
/// stade ; l'étirement éventuel vers la boîte de la pièce est fait ensuite par
/// le rééchantillonnage, exactement comme le webview étire l'image chargée.
fn load_source(src: &str, width: u32) -> Result<RgbaImage, String> {
    if !is_svg(src) {
        return Ok(image::open(src)
            .map_err(|e| format!("Élément illisible ({src}) : {e}"))?
            .to_rgba8());
    }
    if crate::tools::find_tool("inkscape").is_none() {
        return Err(format!(
            "Inkscape est nécessaire pour rendre un élément SVG ({}). Installe-le, ou remplace la pièce par un PNG.",
            Path::new(src).file_name().unwrap_or_default().to_string_lossy()
        ));
    }
    let tmp = std::env::temp_dir().join(format!(
        "imagehub-motif-svg-{}-{width}-{}.png",
        std::process::id(),
        // deux SVG différents ne doivent pas se recouvrir dans le dossier
        // temporaire : le nom du fichier suffit à les séparer
        Path::new(src)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("element"),
    ));
    crate::actions::run_tool(
        "inkscape",
        &[
            src,
            "--export-type=png",
            &format!("--export-width={}", width.clamp(1, MAX_SIDE)),
            &format!("--export-filename={}", tmp.to_string_lossy()),
        ],
    )
    .map_err(|e| format!("Rendu du SVG impossible ({src}) : {e}"))?;
    let img = image::open(&tmp)
        .map_err(|e| format!("SVG rendu illisible ({src}) : {e}"))?
        .to_rgba8();
    let _ = std::fs::remove_file(&tmp);
    Ok(img)
}

/// La pièce, rendue une fois pour toutes à sa taille finale : rééchantillonnée
/// depuis l'original, retournée, puis tournée. Elle sera ensuite recopiée telle
/// quelle aux neuf décalages — le travail lourd n'est fait qu'une fois.
///
/// L'ordre reproduit celui du webview (`translate · rotate · scale`, convention
/// Konva) : miroir d'abord, dans le repère de la pièce, rotation ensuite. Les
/// inverser ferait pencher les éléments retournés du mauvais côté.
pub(crate) fn build_sprite(
    piece: &Piece,
    img: &ImageGeometry,
    out_w: u32,
    sources: &mut HashMap<String, RgbaImage>,
) -> Result<RgbaImage, String> {
    let ImageGeometry {
        src,
        width,
        height,
        flip_x,
        flip_y,
    } = img;
    // les deux étendues sont rapportées à la LARGEUR de la tuile (voir `Piece`)
    let pw = (width.abs() * out_w as f32).round().max(1.0);
    let ph = (height.abs() * out_w as f32).round().max(1.0);
    if pw > f32::from(u16::MAX) || ph > f32::from(u16::MAX) {
        return Err("Élément démesuré : réduis sa taille avant d'exporter.".into());
    }

    // Un SVG est rasterisé À LA TAILLE OÙ IL SERA POSÉ : il n'a pas de
    // résolution propre, et le rendre une fois pour toutes le condamnerait au
    // crénelage dès qu'on exporte plus grand. La clé de cache porte donc la
    // largeur, sans quoi deux pièces du même fichier à deux échelles
    // partageraient le même rendu.
    let clef = if is_svg(src) {
        format!("{src}@{}", pw as u32)
    } else {
        src.to_string()
    };
    if !sources.contains_key(&clef) {
        let img = load_source(src, pw as u32)?;
        sources.insert(clef.clone(), premultiply(&img));
    }
    let source = &sources[&clef];

    // Lanczos3 : c'est ici que se joue la qualité d'un export en 2048 px depuis
    // une composition éditée en 480 px, puisqu'on repart du fichier d'origine.
    let mut sprite = image::imageops::resize(source, pw as u32, ph as u32, FilterType::Lanczos3);
    clamp_premultiplied(&mut sprite);

    if *flip_x {
        sprite = image::imageops::flip_horizontal(&sprite);
    }
    if *flip_y {
        sprite = image::imageops::flip_vertical(&sprite);
    }
    let angle = piece.rotation.rem_euclid(360.0);
    if angle.abs() > f32::EPSILON {
        sprite = rotate_premultiplied(&sprite, angle);
    }
    Ok(sprite)
}
