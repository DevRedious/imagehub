//! Découpe d'une planche en pièces détachées.
//!
//! Une image générée par IA arrive presque toujours en *planche* : six branches
//! posées côte à côte sur un fond. Détourer une telle planche donne UN grand
//! PNG transparent — inutilisable tel quel, puisqu'on veut semer les branches
//! une par une dans une composition.
//!
//! On détoure donc d'abord (même chemin que l'action « Détourage » du Studio),
//! puis on découpe le résultat en composantes connexes du canal alpha : chaque
//! amas de pixels opaques devient sa propre pièce, recadrée au plus juste.
//!
//! Deux subtilités décident de la qualité du résultat :
//!
//! 1. **Le travail se fait sur une grille**, pas sur les pixels. Une planche de
//!    quatre mégapixels donnerait un parcours de composantes long et gourmand ;
//!    en ramenant l'image à une grille de quelques centaines de cases, la
//!    découpe devient instantanée et la précision reste largement suffisante
//!    (le recadrage final, lui, repasse au pixel).
//!
//! 2. **On dilate avant d'étiqueter.** Une branche à baies n'est pas d'un seul
//!    tenant : les baies flottent à quelques pixels de leur tige. Sans
//!    dilatation, on récolterait quarante confettis au lieu d'une branche.
//!    Élargir les formes avant de les compter fait toucher ce qui se frôle ;
//!    la dilatation ne sert qu'à décider des groupes, jamais à écrire des
//!    pixels — les pièces sortent avec leurs contours d'origine.

use image::RgbaImage;

/// Opacité à partir de laquelle un pixel compte comme « matière ». Assez bas
/// pour retenir les bords adoucis par le détourage, assez haut pour ignorer le
/// voile résiduel que rembg laisse sur un fond chargé.
const ALPHA_MIN: u8 = 32;

/// Nombre de pièces au-delà duquel on s'arrête : passé ce cap, ce n'est plus
/// une planche mais un détourage qui a mal tourné, et écrire trois cents
/// fichiers dans la bibliothèque ne rendrait service à personne.
const MAX_PIECES: usize = 40;

/// Réglages par défaut, mesurés sur une planche réelle (six éléments végétaux
/// en relief) : au-delà d'un regroupement de 8, des éléments pourtant distincts
/// commençaient à fusionner deux à deux.
pub(crate) const DEFAULT_GAP: i8 = 8;
pub(crate) const DEFAULT_MIN_SIZE: u8 = 25;

/// Modèle de détourage par défaut d'une planche.
///
/// Ce n'est PAS `u2net`, contrairement au reste du Studio, et ça se mesure :
/// sur une planche d'éléments en relief, dont les formes partagent la couleur
/// et l'éclairage du fond, u2net n'ose pas trancher — il rend un halo de
/// contours dont 0,1 % des pixels seulement dépassent la mi-opacité, ce qui
/// donne des confettis au lieu de branches. `isnet-general-use` rend sur la
/// même image un masque franc et rempli (23 % de pixels pleins). Une planche
/// n'a pas un sujet saillant mais plusieurs objets à égalité : c'est
/// exactement ce que ce modèle sait faire.
pub(crate) const SHEET_MODEL: &str = "isnet-general-use";

/// Grille de travail : une case par bloc de `cell` pixels.
struct Grid {
    w: usize,
    h: usize,
    cell: u32,
    on: Vec<bool>,
}

impl Grid {
    /// Réduit l'image à une grille : une case est allumée dès qu'elle contient
    /// au moins un pixel de matière.
    fn from_alpha(img: &RgbaImage) -> Grid {
        let (iw, ih) = img.dimensions();
        // ~400 cases sur le plus petit côté : assez fin pour séparer deux
        // feuilles voisines, assez grossier pour rester immédiat.
        let cell = (iw.min(ih) / 400).max(1);
        let w = (iw as usize).div_ceil(cell as usize);
        let h = (ih as usize).div_ceil(cell as usize);
        let mut on = vec![false; w * h];
        for (x, y, px) in img.enumerate_pixels() {
            if px.0[3] >= ALPHA_MIN {
                let gx = (x / cell) as usize;
                let gy = (y / cell) as usize;
                on[gy * w + gx] = true;
            }
        }
        Grid { w, h, cell, on }
    }
}

/// Dilatation carrée de rayon `r`, en deux passes séparables.
///
/// Chaque passe s'appuie sur une somme préfixe : savoir s'il existe une case
/// allumée dans une fenêtre revient à comparer deux valeurs, quel que soit le
/// rayon. Sans ça, un rayon large coûterait son carré à chaque case.
fn dilate(src: &[bool], w: usize, h: usize, r: usize) -> Vec<bool> {
    if r == 0 {
        return src.to_vec();
    }
    let mut mid = vec![false; w * h];
    let mut pref = vec![0u32; w.max(h) + 1];
    for y in 0..h {
        let row = y * w;
        for x in 0..w {
            pref[x + 1] = pref[x] + u32::from(src[row + x]);
        }
        for x in 0..w {
            let lo = x.saturating_sub(r);
            let hi = (x + r + 1).min(w);
            mid[row + x] = pref[hi] > pref[lo];
        }
    }
    let mut out = vec![false; w * h];
    for x in 0..w {
        for y in 0..h {
            pref[y + 1] = pref[y] + u32::from(mid[y * w + x]);
        }
        for y in 0..h {
            let lo = y.saturating_sub(r);
            let hi = (y + r + 1).min(h);
            out[y * w + x] = pref[hi] > pref[lo];
        }
    }
    out
}

/// Érosion : la dilatation du vide. Ronger les formes de quelques cases
/// détache celles qui ne font que se toucher — une tige qui effleure une
/// palme, par exemple, cas qu'aucun réglage de regroupement ne peut résoudre
/// puisque les deux formes sont, au sens strict, d'un seul tenant.
fn erode(src: &[bool], w: usize, h: usize, r: usize) -> Vec<bool> {
    let inverse: Vec<bool> = src.iter().map(|&v| !v).collect();
    let grown = dilate(&inverse, w, h, r);
    grown.iter().map(|&v| !v).collect()
}

/// Étiquette les amas de la grille dilatée (8-connexité, parcours en
/// profondeur avec pile explicite — une récursion se briserait sur une grande
/// forme d'un seul tenant).
fn label(dil: &[bool], w: usize, h: usize) -> (Vec<i32>, usize) {
    let mut lab = vec![-1i32; w * h];
    let mut count = 0usize;
    let mut stack: Vec<usize> = Vec::new();
    for start in 0..w * h {
        if !dil[start] || lab[start] >= 0 {
            continue;
        }
        lab[start] = count as i32;
        stack.push(start);
        while let Some(i) = stack.pop() {
            let (x, y) = ((i % w) as i32, (i / w) as i32);
            for dy in -1i32..=1 {
                for dx in -1i32..=1 {
                    let (nx, ny) = (x + dx, y + dy);
                    if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
                        continue;
                    }
                    let j = ny as usize * w + nx as usize;
                    if dil[j] && lab[j] < 0 {
                        lab[j] = count as i32;
                        stack.push(j);
                    }
                }
            }
        }
        count += 1;
    }
    (lab, count)
}

/// Rend aux formes rongées par l'érosion les cases qu'on leur a prises.
///
/// L'érosion ne sert qu'à décider où passe la frontière ; sans cette repousse,
/// les pièces sortiraient amaigries de plusieurs pixels. On fait donc croître
/// les étiquettes en parallèle depuis tous les noyaux à la fois : chaque case
/// reprise revient au noyau qui l'atteint le premier, ce qui coupe deux formes
/// accolées à mi-chemin — là où l'œil placerait lui-même la limite.
fn regrow(lab: &mut [i32], on: &[bool], w: usize, h: usize) {
    let mut queue: std::collections::VecDeque<usize> = (0..lab.len())
        .filter(|&i| lab[i] >= 0)
        .collect();
    while let Some(i) = queue.pop_front() {
        let (x, y) = ((i % w) as i32, (i / w) as i32);
        for dy in -1i32..=1 {
            for dx in -1i32..=1 {
                let (nx, ny) = (x + dx, y + dy);
                if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
                    continue;
                }
                let j = ny as usize * w + nx as usize;
                if on[j] && lab[j] < 0 {
                    lab[j] = lab[i];
                    queue.push_back(j);
                }
            }
        }
    }
}

/// Rectangle englobant d'une pièce, en pixels de l'image d'origine.
#[derive(Clone, Copy)]
struct Box {
    x0: u32,
    y0: u32,
    x1: u32,
    y1: u32,
}

impl Box {
    fn w(&self) -> u32 {
        self.x1 - self.x0 + 1
    }
    fn h(&self) -> u32 {
        self.y1 - self.y0 + 1
    }
}

/// Boîtes des amas, mesurées sur les cases RÉELLEMENT allumées : la dilatation
/// a servi à regrouper, elle ne doit pas gonfler les cadres de son halo.
fn boxes(grid: &Grid, lab: &[i32], groups: usize) -> Vec<Option<Box>> {
    let mut out: Vec<Option<Box>> = vec![None; groups];
    for i in 0..grid.on.len() {
        if !grid.on[i] || lab[i] < 0 {
            continue;
        }
        let (gx, gy) = ((i % grid.w) as u32, (i / grid.w) as u32);
        let (x0, y0) = (gx * grid.cell, gy * grid.cell);
        let (x1, y1) = (x0 + grid.cell - 1, y0 + grid.cell - 1);
        let slot = &mut out[lab[i] as usize];
        *slot = Some(match *slot {
            None => Box { x0, y0, x1, y1 },
            Some(b) => Box {
                x0: b.x0.min(x0),
                y0: b.y0.min(y0),
                x1: b.x1.max(x1),
                y1: b.y1.max(y1),
            },
        });
    }
    out
}

/// Découpe une pièce : on ne garde, dans son cadre, que les pixels dont la case
/// porte SON étiquette. Sans ce filtre, le cadre d'une branche arquée
/// emporterait un morceau de sa voisine passée dessous.
fn carve(img: &RgbaImage, grid: &Grid, lab: &[i32], id: i32, b: Box) -> RgbaImage {
    let mut out = RgbaImage::new(b.w(), b.h());
    for y in b.y0..=b.y1 {
        for x in b.x0..=b.x1 {
            let gi = (y / grid.cell) as usize * grid.w + (x / grid.cell) as usize;
            if lab.get(gi).copied().unwrap_or(-1) == id {
                out.put_pixel(x - b.x0, y - b.y0, *img.get_pixel(x, y));
            }
        }
    }
    out
}

/// Resserre le cadre sur la matière réelle : la grille arrondit au bloc, on
/// rend une pièce au pixel près.
fn trim(img: &RgbaImage) -> Option<RgbaImage> {
    let (w, h) = img.dimensions();
    let (mut x0, mut y0, mut x1, mut y1) = (w, h, 0u32, 0u32);
    for (x, y, px) in img.enumerate_pixels() {
        if px.0[3] >= ALPHA_MIN {
            x0 = x0.min(x);
            y0 = y0.min(y);
            x1 = x1.max(x);
            y1 = y1.max(y);
        }
    }
    if x0 > x1 || y0 > y1 {
        return None;
    }
    Some(image::imageops::crop_imm(img, x0, y0, x1 - x0 + 1, y1 - y0 + 1).to_image())
}

/// Ordonne les pièces comme on lit une planche : par bandes horizontales, puis
/// de gauche à droite. Trier bêtement par ordonnée entrelacerait les deux
/// rangées dès qu'une branche dépasse un peu.
fn reading_order(pieces: &mut [(Box, RgbaImage)]) {
    pieces.sort_by_key(|(b, _)| b.y0);
    let mut bands: Vec<(u32, u32)> = Vec::new();
    let mut band_of: Vec<usize> = Vec::with_capacity(pieces.len());
    for (b, _) in pieces.iter() {
        // même bande si les deux hauteurs se chevauchent pour moitié : c'est le
        // critère qui colle à l'œil, plus qu'une distance entre centres.
        let found = bands.iter().position(|&(y0, y1)| {
            let overlap = (b.y1.min(y1) as i64 - b.y0.max(y0) as i64 + 1).max(0) as u32;
            overlap * 2 >= b.h().min(y1 - y0 + 1)
        });
        match found {
            Some(i) => {
                bands[i].0 = bands[i].0.min(b.y0);
                bands[i].1 = bands[i].1.max(b.y1);
                band_of.push(i);
            }
            None => {
                bands.push((b.y0, b.y1));
                band_of.push(bands.len() - 1);
            }
        }
    }
    let mut indexed: Vec<usize> = (0..pieces.len()).collect();
    indexed.sort_by_key(|&i| (band_of[i], pieces[i].0.x0));
    // application de la permutation
    let mut ordered: Vec<(Box, RgbaImage)> = Vec::with_capacity(pieces.len());
    for &i in &indexed {
        ordered.push((pieces[i].0, std::mem::take(&mut pieces[i].1)));
    }
    for (slot, piece) in pieces.iter_mut().zip(ordered) {
        *slot = piece;
    }
}

/// Sépare une image détourée en pièces.
///
/// `gap` est un curseur à double tranchant, de -100 à 100 :
/// - **positif**, il regroupe — jusqu'à quelle distance deux formes voisines
///   comptent pour un même élément (une baie et sa tige, à 3 % du petit côté
///   au maximum) ;
/// - **négatif**, il sépare — de combien ronger les formes avant de les
///   compter, pour détacher celles qui se touchent (une tige posée sur une
///   palme). Les pièces retrouvent ensuite leur épaisseur d'origine.
///
/// `min_size` (0..100) fixe la taille en dessous de laquelle une forme est une
/// miette à jeter : de 0,5 % à 15 % du petit côté.
pub(crate) fn split(img: &RgbaImage, gap: i8, min_size: u8) -> Vec<RgbaImage> {
    let (iw, ih) = img.dimensions();
    let short = iw.min(ih) as f32;
    let grid = Grid::from_alpha(img);

    let gap_px = short * (f32::from(gap.unsigned_abs().min(100)) / 100.0) * 0.03;
    let radius = ((gap_px / grid.cell as f32).round() as usize).min(40);
    let marks = if gap < 0 {
        erode(&grid.on, grid.w, grid.h, radius)
    } else {
        dilate(&grid.on, grid.w, grid.h, radius)
    };
    let (mut lab, groups) = label(&marks, grid.w, grid.h);
    // l'érosion a mis des cases de matière hors de tout amas : on les rend.
    if gap < 0 {
        regrow(&mut lab, &grid.on, grid.w, grid.h);
    }
    let lab = lab;

    let min_px = short * (0.005 + f32::from(min_size.min(100)) / 100.0 * 0.145);
    let mut kept: Vec<(Box, RgbaImage)> = boxes(&grid, &lab, groups)
        .into_iter()
        .enumerate()
        .filter_map(|(id, b)| {
            let b = b?;
            // un long fil fin est une pièce légitime : on juge sur le plus
            // grand côté, pas sur les deux.
            if b.w().max(b.h()) < min_px as u32 {
                return None;
            }
            let piece = trim(&carve(img, &grid, &lab, id as i32, b))?;
            Some((b, piece))
        })
        .collect();

    // trop de pièces = découpe partie en confettis : on garde les plus grandes,
    // qui sont toujours les éléments voulus.
    if kept.len() > MAX_PIECES {
        kept.sort_by_key(|(b, _)| std::cmp::Reverse(b.w() as u64 * b.h() as u64));
        kept.truncate(MAX_PIECES);
    }
    reading_order(&mut kept);
    kept.into_iter().map(|(_, p)| p).collect()
}

/// Détourage d'une planche, mis en cache sur disque.
///
/// C'est l'étape lente (quelques secondes de rembg) et c'est la seule. Les
/// réglages de découpe, eux, se rejouent en quelques millisecondes sur ce
/// résultat : on peut donc laisser l'utilisateur tirer ses curseurs et voir
/// l'effet immédiatement, au lieu de lui infliger un détourage à chaque cran.
/// Le nom du cache ne dépend que des paramètres qui changent le détourage —
/// rouvrir la même planche rend la main tout de suite.
fn cutout_cache(path: &str, model: &str, aggressiveness: u8) -> std::path::PathBuf {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    path.hash(&mut h);
    model.hash(&mut h);
    aggressiveness.hash(&mut h);
    std::env::temp_dir().join(format!("imagehub-planche-{:016x}.png", h.finish()))
}

/// La planche porte-t-elle déjà un détourage exploitable ?
///
/// Le seuil compte : une image opaque bordée de quelques pixels translucides
/// (bords adoucis, coins arrondis) n'est pas une planche détourée. On exige
/// donc qu'un vingtième de la surface au moins soit franchement transparent,
/// ce qu'aucune image pleine n'atteint et que tout détourage dépasse largement.
fn is_already_cut_out(path: &str) -> bool {
    let Ok(img) = image::open(path) else {
        return false;
    };
    let rgba = img.to_rgba8();
    let total = (rgba.width() as u64) * (rgba.height() as u64);
    if total == 0 {
        return false;
    }
    let clear = rgba.pixels().filter(|p| p.0[3] < ALPHA_MIN).count() as u64;
    clear * 20 >= total
}

/// Détoure la planche et retourne le chemin du PNG transparent obtenu.
///
/// Le détourage occupe tous les cœurs (rembg) : le job passe par la file
/// d'attente du Studio, dans le même couloir que l'action « Détourage ».
///
/// ⚠️ Cette commande n'émet **aucun** `job-progress`, et ce n'est pas un
/// oubli. Elle ne figure pas dans la file affichée : chaque « terminé » y
/// produisait donc un toast orphelin (« Traitement : terminé ») à chaque
/// ouverture de la modale. Pire, ce toast fait rendre l'application, donc la
/// modale, donc rejoue son effet de détourage — qui retombe sur le cache,
/// répond aussitôt, et réémet un « terminé ». La boucle tournait à douze pour
/// cent d'un cœur en noyant l'écran de notifications. La modale a son propre
/// indicateur d'attente : elle n'a rien à recevoir par cette voie.
#[tauri::command]
pub async fn sheet_cutout(
    job_id: String,
    path: String,
    model: Option<String>,
    aggressiveness: Option<u8>,
) -> Result<String, String> {
    // Une planche DÉJÀ détourée n'a rien à faire dans rembg : son canal alpha
    // dit déjà où sont les formes. Y repasser coûterait plusieurs secondes et
    // dégraderait le résultat, puisque le détourage repart des composantes
    // RGB — les zones transparentes y redeviennent opaques (souvent noires)
    // avant d'être remasquées, ce qui cerne les pièces d'un liseré sombre.
    if is_already_cut_out(&path) {
        return Ok(path);
    }

    let model = model.unwrap_or_else(|| SHEET_MODEL.to_string());
    let aggressiveness = aggressiveness.unwrap_or(50);
    let cache = cutout_cache(&path, &model, aggressiveness);
    if cache.is_file() {
        return Ok(cache.to_string_lossy().to_string());
    }

    let _permit = crate::queue::acquire("removeBg").await;
    if crate::queue::take_cancelled(&job_id) {
        return Err("Découpe annulée".into());
    }

    let job2 = job_id.clone();
    let result: Result<String, String> = tauri::async_runtime::spawn_blocking(move || {
        let mask = crate::actions::rembg_mask(&path, &job2, &model)?;
        let cutout = crate::actions::compose_cutout(&path, &mask, aggressiveness);
        let _ = std::fs::remove_file(&mask);
        cutout?
            .save(&cache)
            .map_err(|e| format!("Écriture du détourage impossible : {e}"))?;
        Ok(cache.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?;

    crate::queue::take_cancelled(&job_id);
    result
}

/// Une pièce telle que l'aperçu la montre : jamais écrite sur disque, réduite
/// à une vignette que le webview affiche directement.
#[derive(serde::Serialize)]
pub struct Piece {
    pub index: usize,
    pub width: u32,
    pub height: u32,
    pub thumb: String,
}

/// Côté de la vignette d'aperçu : assez grand pour reconnaître une branche
/// d'un coup d'œil, assez petit pour que quarante d'entre elles transitent
/// sans peser sur le webview.
const THUMB: u32 = 220;

fn thumb_data_url(img: &RgbaImage) -> Result<String, String> {
    use base64::Engine;
    let long = img.width().max(img.height()).max(1);
    let scale = (THUMB as f32 / long as f32).min(1.0);
    let small = image::imageops::thumbnail(
        img,
        1.max((img.width() as f32 * scale) as u32),
        1.max((img.height() as f32 * scale) as u32),
    );
    let mut buf = std::io::Cursor::new(Vec::new());
    small
        .write_to(&mut buf, image::ImageFormat::Png)
        .map_err(|e| format!("Vignette illisible : {e}"))?;
    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(buf.into_inner())
    ))
}

/// Rejoue la découpe sur un détourage déjà calculé et rend des vignettes.
/// Rien n'est écrit : c'est l'étape que l'utilisateur voit bouger quand il
/// déplace un curseur.
#[tauri::command]
pub async fn sheet_preview(
    cutout: String,
    gap: Option<i8>,
    min_size: Option<u8>,
) -> Result<Vec<Piece>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let img = image::open(&cutout)
            .map_err(|e| format!("Détourage illisible : {e}"))?
            .to_rgba8();
        split(&img, gap.unwrap_or(DEFAULT_GAP), min_size.unwrap_or(DEFAULT_MIN_SIZE))
            .iter()
            .enumerate()
            .map(|(index, p)| {
                Ok(Piece {
                    index,
                    width: p.width(),
                    height: p.height(),
                    thumb: thumb_data_url(p)?,
                })
            })
            .collect()
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Écrit dans la bibliothèque les pièces retenues par l'utilisateur.
///
/// `keep` porte les index rendus par l'aperçu ; vide, on prend tout. Les
/// réglages sont repassés tels quels pour que la découpe écrite soit
/// exactement celle qui vient d'être montrée.
#[tauri::command]
pub async fn sheet_commit(
    cutout: String,
    stem: String,
    gap: Option<i8>,
    min_size: Option<u8>,
    keep: Vec<usize>,
) -> Result<Vec<crate::library::Asset>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let img = image::open(&cutout)
            .map_err(|e| format!("Détourage illisible : {e}"))?
            .to_rgba8();
        let pieces = split(&img, gap.unwrap_or(DEFAULT_GAP), min_size.unwrap_or(DEFAULT_MIN_SIZE));
        let wanted: Vec<(usize, &RgbaImage)> = pieces
            .iter()
            .enumerate()
            .filter(|(i, _)| keep.is_empty() || keep.contains(i))
            .collect();
        if wanted.is_empty() {
            return Err("Aucune pièce retenue.".into());
        }
        let dir = crate::library::library_root();
        let mut saved = Vec::with_capacity(wanted.len());
        for (i, piece) in wanted {
            let name = format!("{stem}-{:02}", i + 1);
            let dest = crate::emoji::dest_path_in(dir.clone(), &name, "png")?;
            piece
                .save(&dest)
                .map_err(|e| format!("Écriture de la pièce impossible : {e}"))?;
            saved.push(crate::library::describe(&dest));
        }
        Ok(saved)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Peint un disque plein dans l'image.
    fn blob(img: &mut RgbaImage, cx: u32, cy: u32, r: u32) {
        for y in cy.saturating_sub(r)..(cy + r).min(img.height()) {
            for x in cx.saturating_sub(r)..(cx + r).min(img.width()) {
                let (dx, dy) = (x as i64 - cx as i64, y as i64 - cy as i64);
                if dx * dx + dy * dy <= (r * r) as i64 {
                    img.put_pixel(x, y, image::Rgba([200, 180, 120, 255]));
                }
            }
        }
    }

    #[test]
    fn deux_formes_eloignees_donnent_deux_pieces() {
        let mut img = RgbaImage::new(600, 400);
        blob(&mut img, 120, 200, 60);
        blob(&mut img, 480, 200, 60);
        assert_eq!(split(&img, 30, 25).len(), 2);
    }

    #[test]
    fn une_forme_seule_est_recadree_au_plus_juste() {
        let mut img = RgbaImage::new(600, 400);
        blob(&mut img, 300, 200, 50);
        let pieces = split(&img, 30, 25);
        assert_eq!(pieces.len(), 1);
        // le disque fait 101 px de large : le cadre ne doit pas traîner de vide
        let (w, h) = pieces[0].dimensions();
        assert!((100..=102).contains(&w), "largeur recadrée = {w}");
        assert!((100..=102).contains(&h), "hauteur recadrée = {h}");
    }

    #[test]
    fn le_regroupement_recolle_une_baie_a_sa_branche() {
        // une grosse forme et une petite qui la frôle sans la toucher
        let mut img = RgbaImage::new(600, 400);
        blob(&mut img, 300, 200, 70);
        blob(&mut img, 385, 200, 8);
        // sans regroupement : deux amas distincts (la baie survit au filtre de
        // taille car min_size est au plancher)
        assert_eq!(split(&img, 0, 0).len(), 2);
        // avec regroupement : la baie rejoint la branche
        assert_eq!(split(&img, 60, 0).len(), 1);
    }

    #[test]
    fn la_separation_detache_deux_formes_qui_se_touchent() {
        // deux formes reliées par un pont mince — la tige qui traverse la
        // palme. Au sens strict, un seul amas.
        let mut img = RgbaImage::new(700, 400);
        blob(&mut img, 180, 200, 90);
        blob(&mut img, 520, 200, 90);
        for y in 196..204 {
            for x in 180..520 {
                img.put_pixel(x, y, image::Rgba([200, 180, 120, 255]));
            }
        }
        assert_eq!(split(&img, 0, 10).len(), 1, "reliés, ils ne font qu'un");

        // le pont fait 8 px de haut : une érosion de 4 le tranche
        let pieces = split(&img, -34, 10);
        assert_eq!(pieces.len(), 2, "la séparation doit les détacher");
        // la repousse rend leur épaisseur aux deux moitiés : chacune doit
        // rester proche du disque d'origine, pas d'un croissant amaigri.
        for p in &pieces {
            let (w, h) = p.dimensions();
            assert!(h > 150, "hauteur rabotée par l'érosion : {h}");
            assert!(w > 100, "largeur rabotée par l'érosion : {w}");
        }
    }

    #[test]
    fn les_miettes_sont_ecartees() {
        let mut img = RgbaImage::new(600, 400);
        blob(&mut img, 300, 200, 70);
        blob(&mut img, 60, 60, 3); // poussière isolée, loin de tout
        assert_eq!(split(&img, 30, 25).len(), 1);
    }

    /// Banc d'essai sur une vraie planche, à la demande :
    /// `IMAGEHUB_SHEET=/chemin/planche.png cargo test --lib planche_reelle -- --ignored --nocapture`
    ///
    /// Ignoré par défaut : il dépend de rembg et d'un fichier de la machine.
    #[test]
    #[ignore]
    fn planche_reelle() {
        let path = std::env::var("IMAGEHUB_SHEET").expect("IMAGEHUB_SHEET manquant");
        let model = std::env::var("IMAGEHUB_MODEL").unwrap_or_else(|_| SHEET_MODEL.into());
        let mask = crate::actions::rembg_mask(&path, "banc-essai", &model).unwrap();
        let cutout = crate::actions::compose_cutout(&path, &mask, 50).unwrap();
        let _ = std::fs::remove_file(&mask);
        let out = std::env::temp_dir().join("imagehub-banc-essai");
        let _ = std::fs::create_dir_all(&out);
        cutout.save(out.join("_cutout.png")).unwrap();
        let opaque = cutout.pixels().filter(|p| p.0[3] >= ALPHA_MIN).count();
        println!(
            "cutout {:?} — {opaque} px de matière ({:.1} %)",
            cutout.dimensions(),
            opaque as f32 * 100.0 / (cutout.width() * cutout.height()) as f32
        );
        for (gap, min) in [(-30i8, 25u8), (-15, 25), (-8, 25), (0, 25), (8, 25)] {
            let pieces = split(&cutout, gap, min);
            println!("gap={gap} min={min} → {} pièce(s)", pieces.len());
            for (i, p) in pieces.iter().enumerate() {
                let (w, h) = p.dimensions();
                println!("   #{:02} {w}×{h}", i + 1);
                p.save(out.join(format!("g{gap}-{:02}.png", i + 1))).unwrap();
            }
        }
        println!("pièces écrites dans {}", out.display());
    }

    #[test]
    fn une_planche_deja_detouree_est_reconnue() {
        let dir = std::env::temp_dir();

        // planche détourée : deux formes sur du vide
        let mut cut = RgbaImage::new(400, 300);
        blob(&mut cut, 120, 150, 60);
        blob(&mut cut, 280, 150, 60);
        let p_cut = dir.join("imagehub-test-detouree.png");
        cut.save(&p_cut).unwrap();
        assert!(
            is_already_cut_out(p_cut.to_str().unwrap()),
            "une planche transparente doit être reconnue"
        );

        // planche sur fond plein : rien de transparent
        let mut full = RgbaImage::from_pixel(400, 300, image::Rgba([40, 60, 40, 255]));
        blob(&mut full, 200, 150, 60);
        let p_full = dir.join("imagehub-test-fond-plein.png");
        full.save(&p_full).unwrap();
        assert!(
            !is_already_cut_out(p_full.to_str().unwrap()),
            "une planche sur fond plein doit passer par le détourage"
        );

        // un simple liseré translucide ne doit PAS passer pour un détourage
        let mut edged = RgbaImage::from_pixel(400, 300, image::Rgba([40, 60, 40, 255]));
        for x in 0..400 {
            for y in [0u32, 1, 298, 299] {
                edged.put_pixel(x, y, image::Rgba([0, 0, 0, 0]));
            }
        }
        let p_edged = dir.join("imagehub-test-liseré.png");
        edged.save(&p_edged).unwrap();
        assert!(
            !is_already_cut_out(p_edged.to_str().unwrap()),
            "quelques pixels de bord ne font pas un détourage"
        );

        for p in [p_cut, p_full, p_edged] {
            let _ = std::fs::remove_file(p);
        }
    }

    #[test]
    fn une_image_vide_ne_produit_rien() {
        let img = RgbaImage::new(300, 300);
        assert!(split(&img, 30, 25).is_empty());
    }

    #[test]
    fn l_ordre_de_lecture_suit_les_rangees() {
        // deux rangées de deux, posées dans le désordre
        let mut img = RgbaImage::new(800, 600);
        blob(&mut img, 600, 450, 50); // bas-droite
        blob(&mut img, 200, 150, 50); // haut-gauche
        blob(&mut img, 600, 150, 50); // haut-droite
        blob(&mut img, 200, 450, 50); // bas-gauche
        let pieces = split(&img, 20, 25);
        assert_eq!(pieces.len(), 4);
        // toutes de même taille : on vérifie surtout qu'aucune n'a fusionné
        for p in &pieces {
            let (w, h) = p.dimensions();
            assert!(w < 150 && h < 150, "pièce fusionnée : {w}×{h}");
        }
    }
}
