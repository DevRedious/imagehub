//! Générateur de QR codes — la partie calcul.
//!
//! Le dessin, lui, est fait au canvas par le webview : modules arrondis, yeux
//! colorés, logo, cadre et légende sont des choix graphiques qui demandent un
//! aperçu en direct, et le canvas sait rasteriser du texte avec n'importe
//! quelle police. Ici on fournit la matrice, on relève les couleurs de marque
//! d'un projet, on charge un fichier de police, et surtout on RELIT le code
//! produit.
//!
//! Cette relecture n'est pas un luxe : un logo au centre et un dégradé sur les
//! modules dégradent la lisibilité, et un QR illisible ne se découvre
//! normalement qu'une fois imprimé.

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
pub struct QrMatrix {
    /// côté de la matrice, en modules
    pub size: usize,
    /// modules sombres, ligne par ligne (`size * size` valeurs)
    pub modules: Vec<bool>,
    /// niveau de correction réellement appliqué
    pub ecc: String,
}

/// Niveau de correction d'erreur. `H` (30 %) est imposé dès qu'un logo masque
/// le centre, sinon le code devient illisible.
fn ec_level(level: &str) -> qrcode::EcLevel {
    match level {
        "L" => qrcode::EcLevel::L,
        "M" => qrcode::EcLevel::M,
        "Q" => qrcode::EcLevel::Q,
        _ => qrcode::EcLevel::H,
    }
}

#[tauri::command]
pub fn qr_matrix(text: String, ecc: String) -> Result<QrMatrix, String> {
    if text.trim().is_empty() {
        return Err("Rien à encoder.".into());
    }
    let level = ec_level(&ecc);
    let code = qrcode::QrCode::with_error_correction_level(text.as_bytes(), level)
        .map_err(|e| format!("Encodage impossible : {e}"))?;
    let size = code.width();
    let modules = code
        .to_colors()
        .into_iter()
        .map(|c| c == qrcode::types::Color::Dark)
        .collect();
    Ok(QrMatrix {
        size,
        modules,
        ecc: ecc.to_uppercase(),
    })
}

#[derive(Serialize)]
pub struct QrCheck {
    /// le code a été relu avec succès
    pub readable: bool,
    /// contenu décodé (vide si illisible) — comparé à l'original par l'UI
    pub decoded: String,
}

/// Relit le PNG rendu par le webview et renvoie ce qu'un lecteur y verrait.
#[tauri::command]
pub fn verify_qr(data: String) -> Result<QrCheck, String> {
    let bytes = crate::emoji::decode_data_url(&data)?;
    let img = image::load_from_memory(&bytes)
        .map_err(|e| format!("Image illisible : {e}"))?
        .to_luma8();
    Ok(read_back(img))
}

/// Ce qu'un lecteur de QR verrait dans cette image.
fn read_back(img: image::GrayImage) -> QrCheck {
    let mut prepared = rqrr::PreparedImage::prepare(img);
    for grid in prepared.detect_grids() {
        if let Ok((_meta, content)) = grid.decode() {
            return QrCheck {
                readable: true,
                decoded: content,
            };
        }
    }
    QrCheck {
        readable: false,
        decoded: String::new(),
    }
}

#[derive(Serialize, Clone)]
pub struct ThemeColor {
    /// nom de la variable, tel qu'écrit dans le CSS
    pub name: String,
    /// toujours normalisé en `#rrggbb`
    pub value: String,
    /// fichier d'où elle vient
    pub source: String,
    /// rôle deviné : "primary", "secondary" ou "" si indéterminé
    pub role: String,
}

/// `#abc` → `#aabbcc`, `rgb(…)`, `hsl(…)` et le triplet HSL nu de shadcn
/// (`222.2 47.4% 11.2%`) ramenés à `#rrggbb`. `None` si ce n'est pas une couleur.
fn to_hex(raw: &str) -> Option<String> {
    let v = raw.trim().trim_end_matches(';').trim();
    if let Some(hex) = v.strip_prefix('#') {
        let h = hex.trim();
        if h.len() == 3 && h.chars().all(|c| c.is_ascii_hexdigit()) {
            let c: Vec<char> = h.chars().collect();
            return Some(format!("#{0}{0}{1}{1}{2}{2}", c[0], c[1], c[2]).to_lowercase());
        }
        if (h.len() == 6 || h.len() == 8) && h.chars().all(|c| c.is_ascii_hexdigit()) {
            return Some(format!("#{}", &h[..6]).to_lowercase());
        }
        return None;
    }

    let numbers: Vec<f64> = v
        .trim_start_matches(|c: char| c.is_ascii_alphabetic())
        .trim_start_matches('(')
        .trim_end_matches(')')
        .split(|c: char| c == ',' || c.is_whitespace() || c == '/')
        .filter(|s| !s.is_empty())
        .filter_map(|s| s.trim_end_matches('%').parse::<f64>().ok())
        .collect();
    if numbers.len() < 3 {
        return None;
    }

    let lower = v.to_lowercase();
    if lower.starts_with("oklch") {
        return Some(oklch_to_hex(numbers[0], numbers[1], numbers[2]));
    }
    if lower.starts_with("rgb") {
        let c = |x: f64| x.clamp(0.0, 255.0).round() as u8;
        return Some(format!(
            "#{:02x}{:02x}{:02x}",
            c(numbers[0]),
            c(numbers[1]),
            c(numbers[2])
        ));
    }
    // hsl() explicite, ou triplet nu « H S% L% » (convention shadcn/ui)
    if lower.starts_with("hsl") || v.contains('%') {
        return Some(hsl_to_hex(numbers[0], numbers[1], numbers[2]));
    }
    None
}

/// `oklch()` → sRGB. Indispensable : c'est le format par défaut des palettes
/// Tailwind v4, donc celui de la plupart des fronts récents. La chaîne est
/// OKLCH → OKLab → LMS → sRGB linéaire → sRGB avec la correction gamma.
fn oklch_to_hex(l: f64, c: f64, h_deg: f64) -> String {
    // `L` s'écrit indifféremment 0..1 ou en pourcentage
    let l = if l > 1.5 { l / 100.0 } else { l };
    let h = h_deg.to_radians();
    let (a, b) = (c * h.cos(), c * h.sin());

    let l_ = (l + 0.3963377774 * a + 0.2158037573 * b).powi(3);
    let m_ = (l - 0.1055613458 * a - 0.0638541728 * b).powi(3);
    let s_ = (l - 0.0894841775 * a - 1.2914855480 * b).powi(3);

    let lin = [
        4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
        -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
        -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_,
    ];
    let gamma = |x: f64| {
        let v = if x <= 0.0031308 {
            12.92 * x
        } else {
            1.055 * x.powf(1.0 / 2.4) - 0.055
        };
        (v * 255.0).round().clamp(0.0, 255.0) as u8
    };
    format!(
        "#{:02x}{:02x}{:02x}",
        gamma(lin[0]),
        gamma(lin[1]),
        gamma(lin[2])
    )
}

fn hsl_to_hex(h: f64, s: f64, l: f64) -> String {
    let (h, s, l) = (h.rem_euclid(360.0) / 360.0, s / 100.0, l / 100.0);
    let q = if l < 0.5 { l * (1.0 + s) } else { l + s - l * s };
    let p = 2.0 * l - q;
    let channel = |t: f64| {
        let t = t.rem_euclid(1.0);
        let v = if t < 1.0 / 6.0 {
            p + (q - p) * 6.0 * t
        } else if t < 0.5 {
            q
        } else if t < 2.0 / 3.0 {
            p + (q - p) * (2.0 / 3.0 - t) * 6.0
        } else {
            p
        };
        (v * 255.0).round().clamp(0.0, 255.0) as u8
    };
    format!(
        "#{:02x}{:02x}{:02x}",
        channel(h + 1.0 / 3.0),
        channel(h),
        channel(h - 1.0 / 3.0)
    )
}

/// Rôle deviné d'après le nom de la variable. Les noms sont conventionnels
/// (`--primary`, `--color-primary`, `--brand`, `--accent`…) : on s'appuie
/// dessus plutôt que sur l'ordre d'apparition, qui ne veut rien dire.
fn role_of(name: &str) -> &'static str {
    let n = name.to_lowercase();
    if n.contains("secondary") || n.contains("accent-2") {
        return "secondary";
    }
    if n.contains("primary") || n.contains("brand") || n.contains("accent") {
        return "primary";
    }
    ""
}

/// Noms de fichiers qui portent conventionnellement le thème d'un front.
/// On cherche en profondeur : un dépôt abrite souvent le site dans un
/// sous-dossier (`web/`, `apps/site/`…), et le chemin fixe passait à côté.
fn looks_like_theme(path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_lowercase();
    matches!(
        name.as_str(),
        "globals.css" | "global.css" | "index.css" | "app.css" | "main.css" | "styles.css"
    ) || name.starts_with("theme")
}

/// Couleurs de marque d'un projet front, pour que le premier QR généré porte
/// déjà l'identité du site plutôt qu'une teinte arbitraire.
#[tauri::command]
pub fn detect_theme_colors(root: String) -> Result<Vec<ThemeColor>, String> {
    let root = Path::new(&root);
    if !root.is_dir() {
        return Err("Dossier de projet introuvable".into());
    }
    let mut found: Vec<ThemeColor> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    let files: Vec<PathBuf> = crate::inputs::collect(root, &["css"], 5)
        .into_iter()
        .filter(|p| looks_like_theme(p))
        .take(8)
        .collect();

    for path in &files {
        let rel = path
            .strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();
        let Ok(text) = std::fs::read_to_string(path) else {
            continue;
        };
        for line in text.lines() {
            let line = line.trim();
            let Some(rest) = line.strip_prefix("--") else {
                continue;
            };
            let Some((name, raw)) = rest.split_once(':') else {
                continue;
            };
            let name = name.trim();
            // on écarte le bruit (rayons, espacements, ombres…)
            if name.len() > 48 || raw.contains("var(") {
                continue;
            }
            let Some(value) = to_hex(raw) else { continue };
            if !seen.insert(name.to_string()) {
                continue;
            }
            found.push(ThemeColor {
                name: format!("--{name}"),
                value,
                source: rel.clone(),
                role: role_of(name).to_string(),
            });
        }
        if found.len() > 60 {
            break;
        }
    }

    // les couleurs porteuses de rôle d'abord : l'UI prend les premières
    found.sort_by_key(|c| match c.role.as_str() {
        "primary" => 0,
        "secondary" => 1,
        _ => 2,
    });
    Ok(found)
}

#[derive(Serialize)]
pub struct FontFile {
    pub path: String,
    pub name: String,
}

/// Fichier de police lu en base64, pour que le webview le charge tel quel
/// (`new FontFace(nom, buffer)`).
///
/// On ne passe PAS par les polices installées : la convention de l'utilisateur
/// est de garder le `.otf` dans le projet qui s'en sert (voir les titres
/// Primal Ascension), et une police téléchargée n'est de toute façon pas
/// installée. Le PNG final embarque les glyphes en pixels : le fichier produit
/// ne dépend plus d'aucune police.
#[tauri::command]
pub fn read_font(path: String) -> Result<String, String> {
    use base64::Engine;
    let p = Path::new(&path);
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !matches!(ext.as_str(), "ttf" | "otf" | "woff" | "woff2") {
        return Err(format!("Format de police non pris en charge : .{ext}"));
    }
    let bytes = std::fs::read(p).map_err(|e| format!("Police illisible : {e}"))?;
    if bytes.len() > 8 * 1024 * 1024 {
        return Err("Police trop volumineuse (> 8 Mo).".into());
    }
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// Image lue en data URL, pour être dessinée sur un canvas dont on relira
/// ensuite les pixels.
///
/// Passer par `convertFileSrc` semble plus direct, mais l'URL produite relève
/// d'une AUTRE ORIGINE : dessiner une telle image « contamine » le canvas, et
/// `toDataURL` lève alors une erreur de sécurité. Une data URL est de même
/// origine par construction — c'est la seule façon fiable d'exporter ensuite.
#[tauri::command]
pub fn read_image_data_url(path: String) -> Result<String, String> {
    use base64::Engine;
    let p = Path::new(&path);
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "gif" => "image/gif",
        other => return Err(format!("Format d'image non pris en charge : .{other}")),
    };
    let bytes = std::fs::read(p).map_err(|e| format!("Image illisible : {e}"))?;
    if bytes.len() > 12 * 1024 * 1024 {
        return Err("Image trop volumineuse (> 12 Mo).".into());
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{mime};base64,{b64}"))
}

/// Polices trouvées à côté d'un dossier de travail (ex. le `.otf` posé dans le
/// projet), pour les proposer sans que l'utilisateur ait à les chercher.
#[tauri::command]
pub fn find_fonts(root: String) -> Result<Vec<FontFile>, String> {
    let root = Path::new(&root);
    if !root.is_dir() {
        return Ok(Vec::new());
    }
    Ok(crate::inputs::collect(root, &["ttf", "otf", "woff2"], 3)
        .into_iter()
        .take(200)
        .map(|p| FontFile {
            name: p
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("police")
                .to_string(),
            path: p.to_string_lossy().to_string(),
        })
        .collect())
}

/// Dossier de sortie des QR codes, dans le dépôt du Studio libre.
#[tauri::command]
pub fn qr_dir() -> String {
    crate::actions::studio_root()
        .join("qr")
        .to_string_lossy()
        .to_string()
}

/// Écrit le PNG rendu par le webview. Le nom vient de l'URL encodée, mais
/// c'est `safe_name` (côté emoji) qui décide ce qui est écrivable sur disque.
#[tauri::command]
pub fn save_qr_png(name: String, data: String) -> Result<crate::emoji::SavedEmoji, String> {
    let bytes = crate::emoji::decode_data_url(&data)?;
    let dest = crate::emoji::dest_path_in(
        crate::actions::studio_root().join("qr"),
        &name,
        "png",
    )?;
    std::fs::write(&dest, bytes).map_err(|e| format!("Écriture du PNG impossible : {e}"))?;
    Ok(crate::emoji::saved(dest))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_matrice_est_carree_et_non_vide() {
        let m = qr_matrix("https://cluster.primal-ascension.fr/".into(), "H".into()).unwrap();
        assert_eq!(m.modules.len(), m.size * m.size);
        assert!(m.size >= 21 && m.size % 4 == 1, "taille QR invalide : {}", m.size);
        assert!(m.modules.iter().any(|&d| d));
        assert_eq!(m.ecc, "H");
    }

    /// Rend la matrice comme le fera le canvas : modules noirs sur blanc, avec
    /// la zone de silence de 4 modules qu'impose la norme.
    fn render(m: &QrMatrix, scale: u32) -> image::GrayImage {
        let quiet = 4u32;
        let side = (m.size as u32 + quiet * 2) * scale;
        let mut img = image::GrayImage::from_pixel(side, side, image::Luma([255]));
        for y in 0..m.size {
            for x in 0..m.size {
                if !m.modules[y * m.size + x] {
                    continue;
                }
                for dy in 0..scale {
                    for dx in 0..scale {
                        img.put_pixel(
                            (x as u32 + quiet) * scale + dx,
                            (y as u32 + quiet) * scale + dy,
                            image::Luma([0]),
                        );
                    }
                }
            }
        }
        img
    }

    /// La garantie qui compte : ce qu'on encode se relit à l'identique. C'est
    /// ce même chemin qui vérifiera les codes stylisés avant export.
    #[test]
    fn un_code_encode_se_relit() {
        let url = "https://cluster.primal-ascension.fr/";
        for ecc in ["L", "M", "Q", "H"] {
            let m = qr_matrix(url.into(), ecc.into()).unwrap();
            let check = read_back(render(&m, 8));
            assert!(check.readable, "illisible en correction {ecc}");
            assert_eq!(check.decoded, url, "contenu altéré en correction {ecc}");
        }
    }

    /// Sans zone de silence suffisante, un lecteur décroche — le rendu devra
    /// donc toujours ménager cette marge.
    #[test]
    fn une_image_sans_code_ne_decode_rien() {
        let blanc = image::GrayImage::from_pixel(200, 200, image::Luma([255]));
        assert!(!read_back(blanc).readable);
    }

    #[test]
    fn les_formats_de_couleur_css_sont_normalises() {
        assert_eq!(to_hex("#7C6CF0").unwrap(), "#7c6cf0");
        assert_eq!(to_hex(" #abc ").unwrap(), "#aabbcc");
        assert_eq!(to_hex("#7c6cf0ff").unwrap(), "#7c6cf0");
        assert_eq!(to_hex("rgb(124, 108, 240)").unwrap(), "#7c6cf0");
        assert_eq!(to_hex("rgb(124 108 240 / 0.5)").unwrap(), "#7c6cf0");
        // triplet HSL nu : la convention shadcn/ui, sans fonction autour
        assert_eq!(to_hex("0 0% 100%").unwrap(), "#ffffff");
        assert_eq!(to_hex("hsl(240 60% 50%)").unwrap(), "#3333cc");
        assert!(to_hex("0.5rem").is_none());
        assert!(to_hex("ease-in-out").is_none());
    }

    /// oklch est le format par défaut de Tailwind v4 : sans lui, la détection
    /// ne trouve rien sur un front récent. Repères vérifiables à la main.
    #[test]
    fn oklch_est_converti_en_srgb() {
        assert_eq!(to_hex("oklch(1 0 0)").unwrap(), "#ffffff");
        assert_eq!(to_hex("oklch(0 0 0)").unwrap(), "#000000");
        // l'accent de primal-ascension : un violet franc, pas un gris
        let accent = to_hex("oklch(0.64 0.19 284)").unwrap();
        let (r, g, b) = (
            u8::from_str_radix(&accent[1..3], 16).unwrap(),
            u8::from_str_radix(&accent[3..5], 16).unwrap(),
            u8::from_str_radix(&accent[5..7], 16).unwrap(),
        );
        assert!(b > r && r > g, "attendu un violet, obtenu {accent}");
        assert!(b > 180, "violet trop terne : {accent}");
        // `L` accepté aussi en pourcentage
        assert_eq!(to_hex("oklch(100% 0 0)").unwrap(), "#ffffff");
    }

    #[test]
    fn le_role_est_devine_depuis_le_nom() {
        assert_eq!(role_of("color-primary"), "primary");
        assert_eq!(role_of("brand"), "primary");
        assert_eq!(role_of("accent"), "primary");
        assert_eq!(role_of("secondary"), "secondary");
        assert_eq!(role_of("color-secondary-foreground"), "secondary");
        assert_eq!(role_of("radius"), "");
    }

    #[test]
    fn le_texte_vide_est_refuse() {
        assert!(qr_matrix("   ".into(), "H".into()).is_err());
    }

    /// Enveloppe de tolérance du vérificateur, verrouillée par un test parce
    /// qu'elle décide de ce que l'interface a le droit d'affirmer.
    ///
    /// Deux faits mesurés, contre-intuitifs :
    /// - un code INVERSÉ (modules clairs sur fond sombre) n'est pas décodé —
    ///   ce qui rejoint le comportement de la plupart des lecteurs de
    ///   téléphone, l'appareil photo d'iOS étant l'exception qui ré-inverse ;
    /// - un contraste FAIBLE passe quand même. Le décodeur travaille sur une
    ///   image parfaite ; un téléphone, lui, vise de biais sous un néon. La
    ///   relecture ne suffit donc pas : l'UI mesure aussi le contraste.
    #[test]
    fn enveloppe_de_tolerance_du_verificateur() {
        let url = "https://cluster.primal-ascension.fr/";
        let m = qr_matrix(url.into(), "H".into()).unwrap();
        let (scale, quiet) = (8u32, 4u32);
        let side = (m.size as u32 + quiet * 2) * scale;
        let render = |dark: u8, light: u8| {
            let mut img = image::GrayImage::from_pixel(side, side, image::Luma([light]));
            for y in 0..m.size {
                for x in 0..m.size {
                    if !m.modules[y * m.size + x] {
                        continue;
                    }
                    for dy in 0..scale {
                        for dx in 0..scale {
                            img.put_pixel(
                                (x as u32 + quiet) * scale + dx,
                                (y as u32 + quiet) * scale + dy,
                                image::Luma([dark]),
                            );
                        }
                    }
                }
            }
            img
        };

        assert!(read_back(render(0, 255)).readable, "noir sur blanc doit passer");
        assert!(
            !read_back(render(255, 0)).readable,
            "un code inversé ne doit PAS être validé"
        );
        assert!(
            !read_back(render(140, 0)).readable,
            "modules clairs sur fond noir : inversé, donc refusé"
        );
        assert!(
            read_back(render(110, 150)).readable,
            "le décodeur accepte un contraste que l'UI doit refuser de son côté"
        );
    }
}
