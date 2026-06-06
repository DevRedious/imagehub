//! Analyse d'un projet connecté : type de stack, dossier d'assets,
//! inventaire des images et candidates à l'optimisation AVIF.

use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone)]
pub struct ImageStat {
    pub ext: String,
    pub count: u32,
    pub bytes: u64,
}

#[derive(Serialize, Clone)]
pub struct HeavyImage {
    pub path: String,
    pub bytes: u64,
}

#[derive(Serialize, Clone)]
pub struct ProjectInfo {
    pub root: String,
    pub name: String,
    pub kind: String,
    pub asset_dir: Option<String>,
    /// icône réelle de l'app (conventions par stack), None si introuvable
    pub icon: Option<String>,
    pub stats: Vec<ImageStat>,
    pub heavy: Vec<HeavyImage>,
    pub heavy_bytes: u64,
    /// toutes les images du projet (pour la détection d'assets inutilisés)
    pub images: Vec<HeavyImage>,
}

pub(crate) const SKIP_DIRS: &[&str] = &[
    "node_modules", "dist", "build", "out", "target", "coverage", "Pods", "venv", "vendor",
];
pub(crate) const IMG_EXTS: &[&str] = &["png", "jpg", "jpeg", "webp", "avif", "gif", "svg", "ico"];
/// Seuil au-delà duquel un PNG/JPG est considéré « lourd » (candidat AVIF).
const HEAVY_MIN_BYTES: u64 = 50 * 1024;

fn detect_kind(root: &Path) -> String {
    let pkg = fs::read_to_string(root.join("package.json")).unwrap_or_default();
    let app_json = fs::read_to_string(root.join("app.json")).unwrap_or_default();
    if root.join("src-tauri").is_dir() {
        return "tauri".into();
    }
    if pkg.contains("\"expo\"") || app_json.contains("\"expo\"") {
        return "expo".into();
    }
    if pkg.contains("\"react-native\"") {
        return "react-native".into();
    }
    if pkg.contains("\"next\"") {
        return "nextjs".into();
    }
    if pkg.contains("\"electron\"") {
        return "electron".into();
    }
    if root.join("app/src/main/AndroidManifest.xml").exists() {
        return "android".into();
    }
    // méta-frameworks AVANT vite : leurs projets embarquent aussi vite
    if pkg.contains("\"nuxt\"") {
        return "nuxt".into();
    }
    if pkg.contains("\"@angular/core\"") {
        return "angular".into();
    }
    if pkg.contains("\"astro\"") {
        return "astro".into();
    }
    if pkg.contains("\"svelte\"") {
        return "svelte".into();
    }
    if pkg.contains("\"vue\"") {
        return "vue".into();
    }
    if pkg.contains("\"vite\"") {
        return "vite".into();
    }
    if root.join("Cargo.toml").exists() {
        return "rust".into();
    }
    if root.join("pyproject.toml").exists()
        || root.join("requirements.txt").exists()
        || root.join("setup.py").exists()
    {
        return "python".into();
    }
    if !pkg.is_empty() {
        return "node".into();
    }
    "generic".into()
}

/// Icône réelle de l'app du projet, par conventions propres à chaque stack.
fn detect_icon(root: &Path, kind: &str) -> Option<String> {
    // Expo : le champ `icon` d'app.json fait foi s'il existe
    if kind == "expo" {
        if let Ok(app_json) = fs::read_to_string(root.join("app.json")) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&app_json) {
                let icon = v
                    .pointer("/expo/icon")
                    .and_then(|i| i.as_str())
                    .or_else(|| {
                        v.pointer("/expo/android/adaptiveIcon/foregroundImage")
                            .and_then(|i| i.as_str())
                    });
                if let Some(icon) = icon {
                    let p = root.join(icon.trim_start_matches("./"));
                    if p.is_file() {
                        return Some(p.to_string_lossy().to_string());
                    }
                }
            }
        }
    }
    let by_kind: &[&str] = match kind {
        "tauri" => &[
            "src-tauri/icons/128x128.png",
            "src-tauri/icons/icon.png",
            "src-tauri/icons/32x32.png",
        ],
        "expo" | "react-native" => &[
            "assets/icon.png",
            "assets/images/icon.png",
            "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png",
        ],
        "android" => &[
            "app/src/main/res/mipmap-xxxhdpi/ic_launcher.png",
            "app/src/main/res/mipmap-xxhdpi/ic_launcher.png",
        ],
        "electron" => &["build/icon.png", "assets/icon.png", "public/icon.png"],
        _ => &[],
    };
    let generic: &[&str] = &[
        "public/logo-solo.svg",
        "public/logo.svg",
        "public/logo.png",
        "public/icon.svg",
        "public/icon.png",
        "src/app/icon.png",
        "app/icon.png",
        "public/favicon.svg",
        "public/favicon.png",
        "src/app/favicon.ico",
        "app/favicon.ico",
        "public/favicon.ico",
        "favicon.ico",
    ];
    by_kind
        .iter()
        .chain(generic.iter())
        .map(|c| root.join(c))
        .find(|p| p.is_file())
        .map(|p| p.to_string_lossy().to_string())
}

fn walk(dir: &Path, depth: u8, acc: &mut Vec<(PathBuf, u64)>) {
    if depth > 8 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if path.is_dir() {
            if !name.starts_with('.') && !SKIP_DIRS.contains(&name.as_str()) {
                walk(&path, depth + 1, acc);
            }
        } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            if IMG_EXTS.contains(&ext.to_lowercase().as_str()) {
                if let Ok(meta) = entry.metadata() {
                    acc.push((path, meta.len()));
                }
            }
        }
    }
}

#[tauri::command]
pub fn analyze_project(root: String) -> Result<ProjectInfo, String> {
    let root_path = Path::new(&root);
    if !root_path.is_dir() {
        return Err("Dossier de projet introuvable".into());
    }

    let mut images: Vec<(PathBuf, u64)> = Vec::new();
    walk(root_path, 0, &mut images);

    let mut by_ext: HashMap<String, (u32, u64)> = HashMap::new();
    let mut heavy: Vec<HeavyImage> = Vec::new();
    for (path, bytes) in &images {
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        let entry = by_ext.entry(ext.clone()).or_insert((0, 0));
        entry.0 += 1;
        entry.1 += bytes;
        if matches!(ext.as_str(), "png" | "jpg" | "jpeg") && *bytes >= HEAVY_MIN_BYTES {
            heavy.push(HeavyImage { path: path.to_string_lossy().to_string(), bytes: *bytes });
        }
    }
    heavy.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    heavy.truncate(500);
    let heavy_bytes = heavy.iter().map(|h| h.bytes).sum();

    let mut all: Vec<HeavyImage> = images
        .iter()
        .map(|(p, b)| HeavyImage { path: p.to_string_lossy().to_string(), bytes: *b })
        .collect();
    all.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    all.truncate(1500);

    let mut stats: Vec<ImageStat> = by_ext
        .into_iter()
        .map(|(ext, (count, bytes))| ImageStat { ext, count, bytes })
        .collect();
    stats.sort_by(|a, b| b.bytes.cmp(&a.bytes));

    let asset_dir = ["public", "static", "assets", "src/assets"]
        .iter()
        .map(|d| root_path.join(d))
        .find(|p| p.is_dir())
        .map(|p| p.to_string_lossy().to_string());

    let kind = detect_kind(root_path);
    Ok(ProjectInfo {
        name: root_path.file_name().and_then(|n| n.to_str()).unwrap_or("projet").to_string(),
        icon: detect_icon(root_path, &kind),
        kind,
        root,
        asset_dir,
        stats,
        heavy,
        heavy_bytes,
        images: all,
    })
}

/// Supprime définitivement des fichiers du projet (assets inutilisés).
#[tauri::command]
pub fn delete_files(paths: Vec<String>) -> Result<u32, String> {
    let mut count = 0u32;
    for path in paths {
        fs::remove_file(&path).map_err(|e| format!("{path} : {e}"))?;
        count += 1;
    }
    Ok(count)
}

// ─── Scan chirurgical des usages ────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct UsageRef {
    pub file: String,
    pub line: u32,
}

#[derive(Serialize, Clone)]
pub struct ImageUsages {
    pub path: String,
    pub role: String,
    pub usages: Vec<UsageRef>,
}

pub(crate) const CODE_EXTS: &[&str] = &[
    "js", "jsx", "ts", "tsx", "mjs", "cjs", "vue", "svelte", "astro", "html", "htm",
    "css", "scss", "sass", "less", "md", "mdx", "json", "yml", "yaml", "toml",
    "rs", "py", "xml", "plist", "gradle", "kt", "swift",
];
const MAX_CODE_FILE_BYTES: u64 = 1_500_000;
const MAX_USAGES_PER_IMAGE: usize = 50;

fn walk_code(dir: &Path, depth: u8, acc: &mut Vec<PathBuf>) {
    if depth > 8 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if path.is_dir() {
            if !name.starts_with('.') && !SKIP_DIRS.contains(&name.as_str()) {
                walk_code(&path, depth + 1, acc);
            }
        } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            if CODE_EXTS.contains(&ext.to_lowercase().as_str())
                && entry.metadata().map(|m| m.len() <= MAX_CODE_FILE_BYTES).unwrap_or(false)
            {
                acc.push(path);
            }
        }
    }
}

/// Rôle probable du visuel, déduit du nom/chemin et des fichiers qui l'utilisent.
fn infer_role(image_path: &str, usages: &[UsageRef]) -> String {
    let mut hay = image_path.to_lowercase();
    for u in usages.iter().take(10) {
        hay.push(' ');
        hay.push_str(&u.file.to_lowercase());
    }
    const RULES: &[(&str, &str)] = &[
        ("favicon", "Favicon"),
        ("logo", "Logo"),
        ("banner", "Bannière"),
        ("hero", "Bannière / hero"),
        ("cover", "Couverture"),
        ("splash", "Splash screen"),
        ("background", "Arrière-plan"),
        ("wallpaper", "Arrière-plan"),
        ("avatar", "Avatar"),
        ("profile", "Avatar / profil"),
        ("screenshot", "Capture d'écran"),
        ("button", "Bouton"),
        ("btn", "Bouton"),
        ("thumb", "Miniature"),
        ("icon", "Icône"),
        ("illustration", "Illustration"),
    ];
    for (needle, role) in RULES {
        if hay.contains(needle) {
            return (*role).to_string();
        }
    }
    "Visuel".to_string()
}

/// Cherche chaque image (par nom de fichier) dans tout le code du projet.
/// Émet `scan-progress` { done, total } pendant le parcours.
#[tauri::command]
pub async fn scan_image_usages(
    app: AppHandle,
    root: String,
    images: Vec<String>,
) -> Result<Vec<ImageUsages>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root_path = Path::new(&root);
        // (chemin complet, nom de fichier, nom sans extension)
        // Le nom sans extension attrape les références indirectes
        // (ex. @mipmap/ic_launcher, imports sans extension).
        let needles: Vec<(String, String, String)> = images
            .iter()
            .filter_map(|p| {
                let path = Path::new(p);
                let base = path.file_name().and_then(|n| n.to_str())?.to_string();
                let stem = path.file_stem().and_then(|n| n.to_str()).unwrap_or("").to_string();
                Some((p.clone(), base, stem))
            })
            .collect();
        if needles.is_empty() {
            return Ok(Vec::new());
        }

        let mut files: Vec<PathBuf> = Vec::new();
        walk_code(root_path, 0, &mut files);
        let total = files.len();

        let rel = |p: &Path| {
            p.strip_prefix(root_path).unwrap_or(p).to_string_lossy().to_string()
        };

        let mut found: HashMap<String, Vec<UsageRef>> = HashMap::new();
        for (i, file) in files.iter().enumerate() {
            if i % 100 == 0 {
                let _ = app.emit("scan-progress", serde_json::json!({ "done": i, "total": total }));
            }
            let Ok(content) = fs::read_to_string(file) else { continue };
            for (full, base, stem) in &needles {
                let hit_base = content.contains(base.as_str());
                // stems courts (bg, ico…) exclus : trop de faux positifs
                let pattern = if hit_base {
                    base
                } else if stem.len() >= 5 && content.contains(stem.as_str()) {
                    stem
                } else {
                    continue;
                };
                let refs = found.entry(full.clone()).or_default();
                for (idx, line) in content.lines().enumerate() {
                    if refs.len() >= MAX_USAGES_PER_IMAGE {
                        break;
                    }
                    if line.contains(pattern.as_str()) {
                        refs.push(UsageRef { file: rel(file), line: (idx + 1) as u32 });
                    }
                }
            }
        }
        let _ = app.emit("scan-progress", serde_json::json!({ "done": total, "total": total }));

        Ok(images
            .into_iter()
            .map(|path| {
                let usages = found.remove(&path).unwrap_or_default();
                let role = infer_role(&path, &usages);
                ImageUsages { path, role, usages }
            })
            .collect())
    })
    .await
    .map_err(|e| e.to_string())?
}
