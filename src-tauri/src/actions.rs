//! Workers de traitement d'images : chaque action délègue à un outil CLI
//! installé sur la machine et émet des événements `job-progress`.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Emitter};
use tauri_plugin_clipboard_manager::ClipboardExt;

/// Copie un prompt dans le presse-papier et notifie l'utilisateur.
#[tauri::command]
pub fn deliver_prompt(app: AppHandle, title: String, prompt: String) -> Result<(), String> {
    app.clipboard().write_text(prompt).map_err(|e| e.to_string())?;
    crate::icon_packs::notify(
        &app,
        &title,
        "Le prompt est dans le presse-papier — colle-le à ton agent IA.",
    );
    Ok(())
}

#[derive(Clone, Serialize)]
pub struct Progress {
    pub job_id: String,
    pub status: String,
    pub progress: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub(crate) fn emit(app: &AppHandle, job_id: &str, status: &str, progress: u8, output: Option<String>, error: Option<String>) {
    let _ = app.emit(
        "job-progress",
        Progress {
            job_id: job_id.to_string(),
            status: status.to_string(),
            progress,
            output,
            error,
        },
    );
}

/// Dossier de sortie selon le mode choisi :
/// - "same"      → à côté de l'original
/// - "subfolder" → sous-dossier nommé selon le format cible ; cas malin :
///                 si le dossier parent porte le nom du format source
///                 (ex. `logo/png/x.png`), on utilise le dossier FRÈRE
///                 (`logo/avif/`) pour respecter un rangement par format.
/// - "custom"    → dossier choisi par l'utilisateur
pub(crate) fn resolve_out_dir(input: &Path, mode: &str, custom_dir: &Option<String>, target_ext: &str) -> PathBuf {
    let parent = input.parent().unwrap_or(Path::new(".")).to_path_buf();
    match mode {
        "custom" => custom_dir.as_ref().map(PathBuf::from).unwrap_or(parent),
        "subfolder" => {
            let src_ext = input
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            let parent_name = parent
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_lowercase();
            let base = if !src_ext.is_empty() && parent_name == src_ext {
                parent.parent().map(Path::to_path_buf).unwrap_or(parent)
            } else {
                parent
            };
            base.join(target_ext)
        }
        _ => parent,
    }
}

/// Chemin complet de sortie ; crée le dossier au besoin et évite d'écraser
/// un fichier existant (suffixe -1, -2, …). `suffix` est accolé au nom
/// (ex. `@4x` pour l'upscale, `-nobg` pour le détourage).
fn out_path(input: &str, mode: &str, custom_dir: &Option<String>, ext: &str, suffix: &str) -> Result<String, String> {
    let p = Path::new(input);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("image");
    let dir = resolve_out_dir(p, mode, custom_dir, ext);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Création du dossier impossible : {e}"))?;
    let mut dest = dir.join(format!("{stem}{suffix}.{ext}"));
    let mut i = 1;
    while dest.exists() {
        dest = dir.join(format!("{stem}{suffix}-{i}.{ext}"));
        i += 1;
    }
    Ok(dest.to_string_lossy().to_string())
}

pub(crate) fn run_tool(program: &str, args: &[&str]) -> Result<(), String> {
    // résolution multi-OS : sidecar bundlé → ~/.local/bin → PATH
    let resolved = crate::tools::find_tool(program)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| program.to_string());
    let out = Command::new(&resolved)
        .args(args)
        .output()
        .map_err(|e| format!("{program} introuvable : {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

fn to_ico(input: &str, dest: &str) -> Result<(), String> {
    run_tool(
        "magick",
        &[input, "-define", "icon:auto-resize=256,128,64,48,32,16", dest],
    )
}

fn svg_to_png(input: &str, dest: &str) -> Result<(), String> {
    run_tool(
        "inkscape",
        &[input, "--export-type=png", "--export-width=1024", &format!("--export-filename={dest}")],
    )
}

fn to_avif(input: &str, dest: &str) -> Result<(), String> {
    run_tool(
        "ffmpeg",
        &["-y", "-i", input, "-c:v", "libaom-av1", "-crf", "20", "-still-picture", "1", dest],
    )
}

/// Upscale ×4 via Real-ESRGAN (ncnn/Vulkan → GPU NVIDIA, device 0 forcé
/// car le device auto retombe sur llvmpipe, le rendu logiciel CPU).
/// Le binaire ne lit que png/jpg/webp → pré-conversion ffmpeg sinon (ex. AVIF).
fn upscale(input: &str, dest: &str) -> Result<(), String> {
    let models = crate::tools::realesrgan_models()
        .ok_or("Modèles Real-ESRGAN introuvables (~/.local/share/realesrgan-models ou models/ à côté du binaire)")?;
    let ext = Path::new(input)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    // nom temporaire dérivé de dest (unique par job, voir out_path)
    let tmp = std::env::temp_dir().join(format!(
        "imagehub-pre-{}",
        Path::new(dest).file_name().and_then(|n| n.to_str()).unwrap_or("in.png"),
    ));
    let src = if matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp") {
        input.to_string()
    } else {
        run_tool("ffmpeg", &["-y", "-i", input, &tmp.to_string_lossy()])?;
        tmp.to_string_lossy().to_string()
    };
    let models = models.to_string_lossy();
    let result = run_tool(
        "realesrgan-ncnn-vulkan",
        &["-i", &src, "-o", dest, "-n", "realesrgan-x4plus", "-m", &models, "-g", "0"],
    );
    let _ = std::fs::remove_file(&tmp);
    result
}

/// Lance rembg en mode « masque seul » → PNG temporaire contenant le masque
/// doux (niveaux de gris 0..255) du modèle. `tag` rend le nom unique par job.
fn rembg_mask(input: &str, tag: &str, model: &str) -> Result<PathBuf, String> {
    let rembg = crate::tools::rembg_path()
        .ok_or("rembg non installé (venv ~/.local/share/imagehub-venv ou pip install rembg)")?;
    let tmp = std::env::temp_dir().join(format!("imagehub-mask-{tag}.png"));
    // -m choisit le modèle (u2net rapide → birefnet précis) ; les modèles
    // autres que u2net sont téléchargés par rembg au premier usage.
    run_tool(
        &rembg.to_string_lossy(),
        &["i", "-m", model, "--only-mask", input, &tmp.to_string_lossy()],
    )
    .map_err(|e| format!("Détourage rembg échoué : {e}"))?;
    Ok(tmp)
}

/// Recompose l'image d'origine en RGBA en remappant le masque doux selon
/// l'agressivité (0..100). On garde les couleurs d'origine (pas de halo noir)
/// et on déplace la fenêtre de seuil : plus l'agressivité est BASSE, plus on
/// conserve les pixels de faible confiance (petits détails) ; plus elle est
/// HAUTE, plus on n'garde que les zones franches.
fn compose_cutout(original: &str, mask: &Path, aggressiveness: u8) -> Result<image::RgbaImage, String> {
    let rgb = image::open(original)
        .map_err(|e| format!("Image source illisible : {e}"))?
        .to_rgb8();
    let mask = image::open(mask)
        .map_err(|e| format!("Masque illisible : {e}"))?
        .to_luma8();
    if rgb.dimensions() != mask.dimensions() {
        return Err("Dimensions image/masque incohérentes (rembg).".into());
    }
    // fenêtre de seuil glissante [lo, lo+105] sur 0..255 (souplesse des bords
    // préservée par la rampe linéaire de largeur 105).
    let lo = f32::from(aggressiveness.min(100)) / 100.0 * 150.0;
    let span = 105.0;
    let (w, h) = rgb.dimensions();
    let mut out = image::RgbaImage::new(w, h);
    for y in 0..h {
        for x in 0..w {
            let c = rgb.get_pixel(x, y).0;
            let m = f32::from(mask.get_pixel(x, y).0[0]);
            let a = (((m - lo) / span).clamp(0.0, 1.0) * 255.0).round() as u8;
            out.put_pixel(x, y, image::Rgba([c[0], c[1], c[2], a]));
        }
    }
    Ok(out)
}

/// Détourage à agressivité + modèle réglables → écrit le PNG RGBA détouré.
fn remove_bg(input: &str, dest: &str, aggressiveness: u8, model: &str) -> Result<(), String> {
    let tag = Path::new(dest).file_stem().and_then(|s| s.to_str()).unwrap_or("cut");
    let mask = rembg_mask(input, tag, model)?;
    let composed = compose_cutout(input, &mask, aggressiveness);
    let _ = std::fs::remove_file(&mask);
    composed?
        .save(dest)
        .map_err(|e| format!("Écriture du PNG détouré impossible : {e}"))
}

/// Vectorisation PNG/JPG → SVG via vtracer.
fn png_to_svg(input: &str, dest: &str) -> Result<(), String> {
    run_tool("vtracer", &["--input", input, "--output", dest])
}

/// Détourage (rembg) puis encodage AVIF en conservant la transparence.
///
/// IMPORTANT : on n'utilise PAS ffmpeg/libaom ici — sur certains builds il
/// perd silencieusement le canal alpha (sortie opaque). avifenc (libavif-tools)
/// gère l'alpha nativement via `--qcolor`/`--qalpha` (et surtout pas
/// `--quality`/`--quality-alpha`, qui n'existent pas en avifenc 1.3).
fn bg_to_avif(
    input: &str,
    dest: &str,
    quality: u8,
    aggressiveness: u8,
    model: &str,
) -> Result<(), String> {
    let tag = Path::new(dest).file_stem().and_then(|n| n.to_str()).unwrap_or("cut");
    // 1) détourage paramétrable → PNG RGBA temporaire
    let mask = rembg_mask(input, tag, model)?;
    let composed = compose_cutout(input, &mask, aggressiveness);
    let _ = std::fs::remove_file(&mask);
    let tmp = std::env::temp_dir().join(format!("imagehub-nobg-{tag}.png"));
    composed?
        .save(&tmp)
        .map_err(|e| format!("Écriture du PNG détouré impossible : {e}"))?;
    let tmp_s = tmp.to_string_lossy().to_string();
    // 2) encodage AVIF avec alpha sur le PNG RGBA détouré
    let q = quality.to_string();
    let enc = run_tool("avifenc", &["--qcolor", &q, "--qalpha", &q, &tmp_s, dest]);
    let _ = std::fs::remove_file(&tmp);
    enc.map_err(|e| format!("Encodage AVIF échoué (avifenc) : {e}"))?;
    // 3) non-régression : l'AVIF doit conserver un alpha non trivial
    verify_avif_alpha(dest)
}

/// Garde-fou : l'AVIF produit doit avoir un alpha non trivial (au moins un
/// pixel < 255), sinon le fond est resté opaque (régression à signaler).
/// Décodage via avifdec (fourni avec avifenc) car le crate `image` ne décode
/// pas l'AVIF dans cette config ; best-effort si avifdec est absent.
fn verify_avif_alpha(avif: &str) -> Result<(), String> {
    if crate::tools::find_tool("avifdec").is_none() {
        return Ok(()); // pas de décodeur → on ne bloque pas la conversion
    }
    let tmp = std::env::temp_dir().join(format!(
        "imagehub-verify-{}.png",
        Path::new(avif).file_stem().and_then(|n| n.to_str()).unwrap_or("v"),
    ));
    let tmp_s = tmp.to_string_lossy().to_string();
    run_tool("avifdec", &[avif, &tmp_s])
        .map_err(|e| format!("Vérification de l'alpha impossible (avifdec) : {e}"))?;
    let decoded = image::open(&tmp);
    let _ = std::fs::remove_file(&tmp);
    let opaque = decoded
        .map_err(|e| format!("AVIF décodé illisible : {e}"))?
        .to_rgba8()
        .pixels()
        .all(|p| p[3] == 255);
    if opaque {
        return Err("Fond non détouré : l'AVIF est entièrement opaque (alpha = 255).".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn run_action(
    app: AppHandle,
    job_id: String,
    path: String,
    action: String,
    output_mode: String,
    custom_dir: Option<String>,
    project_kind: Option<String>,
    project_root: Option<String>,
    quality: Option<u8>,
    aggressiveness: Option<u8>,
    model: Option<String>,
) -> Result<(), String> {
    emit(&app, &job_id, "running", 15, None, None);

    let app2 = app.clone();
    let job2 = job_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        if matches!(action.as_str(), "webIcons" | "appIcons" | "desktopIcons") {
            return crate::icon_packs::generate(
                &app2, &job2, &path, &output_mode, &custom_dir, &action,
                &project_kind, &project_root,
            );
        }
        let (ext, suffix) = match action.as_str() {
            "toIco" => ("ico", ""),
            "svgToPng" => ("png", ""),
            "toAvif" | "optimizeAvif" => ("avif", ""),
            "bgToAvif" => ("avif", "-nobg"),
            "upscale" => ("png", "@4x"),
            "removeBg" => ("png", "-nobg"),
            "pngToSvg" => ("svg", ""),
            _ => return Err(format!("Action inconnue : {action}")),
        };
        // optimisation en place : AVIF à côté, puis suppression de l'original
        let mode = if action == "optimizeAvif" { "same" } else { output_mode.as_str() };
        let dest = out_path(&path, mode, &custom_dir, ext, suffix)?;
        let model = model.as_deref().unwrap_or("u2net");
        match action.as_str() {
            "toIco" => to_ico(&path, &dest)?,
            "svgToPng" => svg_to_png(&path, &dest)?,
            "toAvif" => to_avif(&path, &dest)?,
            "bgToAvif" => bg_to_avif(
                &path,
                &dest,
                quality.unwrap_or(70),
                aggressiveness.unwrap_or(50),
                model,
            )?,
            "upscale" => upscale(&path, &dest)?,
            "removeBg" => remove_bg(&path, &dest, aggressiveness.unwrap_or(50), model)?,
            "pngToSvg" => png_to_svg(&path, &dest)?,
            "optimizeAvif" => {
                to_avif(&path, &dest)?;
                std::fs::remove_file(&path)
                    .map_err(|e| format!("AVIF créé mais suppression de l'original impossible : {e}"))?;
            }
            _ => unreachable!(),
        }
        Ok(dest)
    })
    .await
    .map_err(|e| e.to_string())?;

    match result {
        Ok(dest) => emit(&app, &job_id, "done", 100, Some(dest), None),
        Err(e) => emit(&app, &job_id, "error", 100, None, Some(e)),
    }
    Ok(())
}
