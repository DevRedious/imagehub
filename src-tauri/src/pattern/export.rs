//! Écriture des fichiers : encodage et commande d'export.

use image::{ImageEncoder, Rgba, RgbaImage};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

use super::model::{Spec, Written};
use super::raster::parse_hex;
use super::render::{montage, render_tile};

/// Aplatit sur une couleur opaque. Le JPG n'a pas d'alpha : sans ça, tout ce
/// qui est transparent sortirait noir.
fn flatten(img: &RgbaImage, bg: Rgba<u8>) -> image::RgbImage {
    let mut plein = RgbaImage::from_pixel(img.width(), img.height(), bg);
    image::imageops::overlay(&mut plein, img, 0, 0);
    image::DynamicImage::ImageRgba8(plein).to_rgb8()
}

pub(crate) fn patterns_root() -> PathBuf {
    crate::actions::studio_root().join("motifs")
}

#[tauri::command]
pub fn pattern_dir() -> String {
    patterns_root().to_string_lossy().to_string()
}

/// Encode et écrit une image dans le format demandé.
///
/// PNG, JPG et WebP sont écrits par la crate `image`, déjà là. L'AVIF passe par
/// `avifenc`, comme le reste de l'application : on a mesuré que ffmpeg/libaom
/// perd silencieusement l'alpha sur certains builds (voir `actions::bg_to_avif`),
/// et un motif sans transparence n'est plus un motif.
///
/// Le WebP produit est SANS PERTE : c'est le seul mode qu'encode la crate. Pour
/// un motif — aplats, contours nets, transparence — c'est de toute façon le bon
/// choix, un WebP avec perte baverait sur les bords des éléments.
fn write_image(
    img: &RgbaImage,
    dest: &Path,
    format: &str,
    quality: u8,
    // couleur d'aplatissement, exigée par les formats sans alpha
    opaque_on: Option<Rgba<u8>>,
) -> Result<(), String> {
    let fail = |e: String| format!("Écriture de {} impossible : {e}", dest.display());
    match format {
        "png" => img.save(dest).map_err(|e| fail(e.to_string())),
        "jpg" => {
            let bg = opaque_on
                .ok_or("Le JPG n'a pas de transparence : choisis un fond avant d'exporter.")?;
            let file = std::fs::File::create(dest).map_err(|e| fail(e.to_string()))?;
            let rgb = flatten(img, bg);
            image::codecs::jpeg::JpegEncoder::new_with_quality(
                std::io::BufWriter::new(file),
                quality.clamp(1, 100),
            )
            .encode(&rgb, rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8)
            .map_err(|e| fail(e.to_string()))
        }
        "webp" => {
            let file = std::fs::File::create(dest).map_err(|e| fail(e.to_string()))?;
            image::codecs::webp::WebPEncoder::new_lossless(std::io::BufWriter::new(file))
                .write_image(
                    img.as_raw(),
                    img.width(),
                    img.height(),
                    image::ExtendedColorType::Rgba8,
                )
                .map_err(|e| fail(e.to_string()))
        }
        "avif" => {
            if crate::tools::find_tool("avifenc").is_none() {
                return Err("avifenc introuvable : installe libavif-tools pour exporter en AVIF.".into());
            }
            let tmp = std::env::temp_dir().join(format!(
                "imagehub-motif-{}-{}.png",
                std::process::id(),
                dest.file_stem().and_then(|s| s.to_str()).unwrap_or("tuile"),
            ));
            img.save(&tmp).map_err(|e| fail(e.to_string()))?;
            let q = quality.clamp(0, 100).to_string();
            let enc = crate::actions::run_tool(
                "avifenc",
                &[
                    "--qcolor",
                    &q,
                    "--qalpha",
                    &q,
                    &tmp.to_string_lossy(),
                    &dest.to_string_lossy(),
                ],
            );
            let _ = std::fs::remove_file(&tmp);
            enc.map_err(|e| format!("Encodage AVIF échoué (avifenc) : {e}"))
        }
        other => Err(format!("Format inconnu : {other}")),
    }
}

/// Rend et écrit la tuile — et, si on le demande, la répétition 3×3.
///
/// `size` est la LARGEUR visée ; la hauteur en découle par le rapport de la
/// tuile, ce qui garantit qu'aucun export ne déforme la composition.
#[tauri::command]
pub async fn pattern_export(
    app: AppHandle,
    job_id: String,
    spec: Spec,
    name: String,
    size: u32,
    format: String,
    quality: Option<u8>,
    repeat: Option<bool>,
    dir: Option<String>,
) -> Result<Vec<Written>, String> {
    if spec.pieces.iter().all(|p| !p.visible) {
        return Err("Aucun élément visible : la tuile serait vide.".into());
    }
    if format == "jpg" && spec.background.is_none() {
        return Err("Le JPG n'a pas de transparence : choisis un fond avant d'exporter.".into());
    }

    let app2 = app.clone();
    let job2 = job_id.clone();
    crate::actions::emit(&app, &job_id, "running", 5, None, None);

    let written = tauri::async_runtime::spawn_blocking(move || {
        let out_w = size;
        let out_h = ((f64::from(size) * f64::from(spec.tile.height) / f64::from(spec.tile.width))
            .round() as u32)
            .max(1);

        // Neuf passes × N éléments à 2048 px : la progression tient l'interface
        // au courant plutôt que de la laisser figée, comme les autres
        // traitements lourds de l'application.
        let tile = render_tile(&spec, out_w, out_h, |done, total| {
            let pct = 10 + (75 * done / total.max(1)) as u8;
            crate::actions::emit(&app2, &job2, "running", pct, None, None);
        })?;

        crate::actions::emit(&app2, &job2, "running", 88, None, None);

        let root = dir.map(PathBuf::from).unwrap_or_else(patterns_root);
        let quality = quality.unwrap_or(85);
        let ext = format.as_str();
        let opaque_on = spec.background.as_deref().map(parse_hex).transpose()?;
        let mut out = Vec::new();

        let dest = crate::emoji::dest_path_in(root.clone(), &name, ext)?;
        write_image(&tile, &dest, ext, quality, opaque_on)?;
        out.push(Written {
            path: dest.to_string_lossy().to_string(),
            suffix: String::new(),
        });

        if repeat.unwrap_or(false) {
            let dest = crate::emoji::dest_path_in(root, &format!("{name}-x3"), ext)?;
            write_image(&montage(&tile), &dest, ext, quality, opaque_on)?;
            out.push(Written {
                path: dest.to_string_lossy().to_string(),
                suffix: "x3".into(),
            });
        }
        Ok::<Vec<Written>, String>(out)
    })
    .await
    .map_err(|e| e.to_string())?;

    match &written {
        Ok(files) => crate::actions::emit(
            &app,
            &job_id,
            "done",
            100,
            files.first().map(|w| w.path.clone()),
            None,
        ),
        Err(e) => crate::actions::emit(&app, &job_id, "error", 100, None, Some(e.clone())),
    }
    written
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pattern::fixtures::disque;

    /// Le contrat avec le webview, pris au mot — et la chaîne complète derrière.
    ///
    /// La charge utile ci-dessous est recopiée telle que `toSpec`
    /// (`src/lib/pattern/api.ts`) la produit, relevée sur une session réelle.
    /// C'est le maillon le plus coûteux à découvrir tard : `#[serde(flatten)]`
    /// posé sur un enum à discriminant interne, plus le passage camelCase, ne
    /// se vérifient à AUCUN moment de la compilation. Une pièce mal nommée ne
    /// fait pas échouer bruyamment : elle sort du motif sans prévenir, ou
    /// l'export casse au tout dernier moment, après le rendu.
    ///
    /// Le test va donc jusqu'au fichier écrit, pour les trois formats encodés
    /// dans le binaire. L'AVIF dépend d'`avifenc`, un outil externe : il est
    /// éprouvé s'il est là, ignoré sinon — un poste sans lui ne doit pas voir
    /// rougir sa suite de tests.
    #[test]
    fn la_charge_utile_du_webview_va_jusqu_au_fichier() {
        let src = disque("contrat", 64);
        let json = format!(
            r##"{{
              "tile": {{ "width": 480, "height": 480 }},
              "background": "#efe6d6",
              "pieces": [
                {{ "kind": "image", "x": 0.62, "y": 0.0027, "rotation": 168.6,
                   "opacity": 1, "visible": true, "src": {src:?},
                   "width": 0.21, "height": 0.21, "flipX": true, "flipY": false }},
                {{ "kind": "stroke", "x": 0.5, "y": 0.5, "rotation": 0,
                   "opacity": 0.8, "visible": true,
                   "points": [{{"x":-0.2,"y":0}},{{"x":0.2,"y":0.05}}],
                   "color": "#2f3a2a", "width": 0.012, "closed": false }},
                {{ "kind": "shape", "x": 0.2, "y": 0.8, "rotation": 12.5,
                   "opacity": 1, "visible": true, "shape": "polygon", "sides": 6,
                   "width": 0.2, "height": 0.2, "fill": "#8d9a6b",
                   "stroke": null, "strokeWidth": 0 }}
              ]
            }}"##
        );

        let spec: Spec =
            serde_json::from_str(&json).expect("la charge utile du webview doit se relire");
        assert_eq!(spec.pieces.len(), 3, "les trois natures doivent survivre");

        // les champs camelCase de la variante aplatie sont bien arrivés
        match &spec.pieces[0].geometry {
            crate::pattern::model::Geometry::Image { .. } => {}
            _ => panic!("la première pièce devait être une image"),
        }

        let tuile = render_tile(&spec, 256, 256, |_, _| {}).expect("rendu");
        let fond = parse_hex("#efe6d6").unwrap();
        let peints = tuile.pixels().filter(|p| p.0 != fond.0).count();
        assert!(
            peints > 2_000,
            "les trois pièces n'ont presque rien peint ({peints} px) — \
             signe qu'une nature s'est perdue à la désérialisation"
        );

        let dir = std::env::temp_dir().join(format!("imagehub-contrat-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("dossier");
        for (ext, opaque) in [
            ("png", None),
            ("webp", None),
            ("jpg", Some(fond)),
            ("avif", None),
        ] {
            if ext == "avif" && crate::tools::find_tool("avifenc").is_none() {
                continue;
            }
            let dest = dir.join(format!("tuile.{ext}"));
            write_image(&tuile, &dest, ext, 85, opaque)
                .unwrap_or_else(|e| panic!("écriture {ext} : {e}"));
            let poids = std::fs::metadata(&dest).expect("fichier écrit").len();
            assert!(poids > 200, "{ext} suspicieusement vide ({poids} octets)");
        }
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_file(src);
    }
}
