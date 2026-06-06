//! Prompts d'intégration générés pour l'agent IA (collés au presse-papier).
//! Avec projet connecté : prompt précis (stack connue, fichiers déjà en place).

pub fn prompt_for(
    kind: &str,
    dir: &str,
    project: Option<(&str, &str)>, // (kind, root)
    in_project: bool,
) -> String {
    match (kind, project) {
        ("webIcons", Some((pk, root))) if in_project => web_project(dir, pk, root),
        ("appIcons", Some((pk, root))) if in_project => expo_project(dir, pk, root),
        ("desktopIcons", Some((pk, root))) if in_project => tauri_project(dir, pk, root),
        (_, Some((pk, root))) => mismatched_project(kind, dir, pk, root),
        ("appIcons", None) => app_generic(dir),
        ("desktopIcons", None) => desktop_generic(dir),
        _ => web_generic(dir),
    }
}

fn web_project(dir: &str, pk: &str, root: &str) -> String {
    let head_hint = if pk == "nextjs" {
        "Projet Next.js : déclare les icônes via l'API Metadata (export metadata.icons dans app/layout.tsx)\n\
         ou la convention de fichiers App Router, et référence /site.webmanifest (metadata.manifest)."
    } else {
        "Ajoute dans le <head> de l'index/du layout :\n\
         <link rel=\"icon\" href=\"/favicon.ico\" sizes=\"48x48\">\n\
         <link rel=\"icon\" type=\"image/svg+xml\" href=\"/icon.svg\">\n\
         <link rel=\"apple-touch-icon\" href=\"/apple-touch-icon.png\">\n\
         <link rel=\"manifest\" href=\"/site.webmanifest\">"
    };
    format!(
        "Le pack d'icônes web de ce projet ({pk}) vient d'être généré et il est DÉJÀ en place dans {dir}\n\
        (favicon.ico, favicon-16x16/32x32/96x96.png, apple-touch-icon.png, icon-192x192.png,\n\
        icon-512x512.png, maskable-icon-512x512.png, icon.svg, site.webmanifest).\n\
        Racine du projet : {root}\n\
        \n\
        À faire — ne déplace pas les fichiers, branche-les :\n\
        1. {head_hint}\n\
        2. Renseigne name, short_name, theme_color et background_color dans site.webmanifest selon ce projet.\n\
        3. Supprime les anciens favicons et toute référence obsolète.\n\
        4. Vérifie le rendu (onglet navigateur, et installabilité PWA si applicable)."
    )
}

fn expo_project(dir: &str, pk: &str, root: &str) -> String {
    format!(
        "Le pack d'icônes de cette appli ({pk}) vient d'être généré et il est DÉJÀ en place dans {dir}\n\
        (icon.png 1024, adaptive-icon.png avec zone de sécurité, favicon.png,\n\
        + extras stores dans icons-extra/).\n\
        Racine du projet : {root}\n\
        \n\
        À faire — ne déplace pas les fichiers, branche-les :\n\
        1. Mets à jour app.json / app.config : icon → './assets/icon.png',\n\
           android.adaptiveIcon.foregroundImage → './assets/adaptive-icon.png'\n\
           (+ backgroundColor cohérent avec le logo), web.favicon → './assets/favicon.png'.\n\
        2. icons-extra/ (playstore-512, tailles iOS) sert aux fiches stores : ne pas l'embarquer dans le bundle.\n\
        3. Supprime les anciennes icônes et références obsolètes.\n\
        4. Vérifie avec un prebuild/run que la nouvelle icône apparaît."
    )
}

fn tauri_project(dir: &str, pk: &str, root: &str) -> String {
    format!(
        "Le pack d'icônes desktop de ce projet ({pk}) vient d'être généré et il est DÉJÀ en place dans {dir}\n\
        (32x32.png, 64x64.png, 128x128.png, 128x128@2x.png, 512x512.png, icon.png 1024,\n\
        icon.ico, icon.icns, icon.svg).\n\
        Racine du projet : {root}\n\
        \n\
        À faire — ne déplace pas les fichiers, branche-les :\n\
        1. Vérifie que bundle.icon de src-tauri/tauri.conf.json référence bien ces fichiers.\n\
        2. Si une meilleure qualité .icns/.ico est requise, regénère via `npm run tauri icon {dir}/icon.png`.\n\
        3. Supprime les anciennes icônes restantes et rebuild pour vérifier."
    )
}

fn mismatched_project(kind: &str, dir: &str, pk: &str, root: &str) -> String {
    let pack = match kind {
        "appIcons" => "mobile (iOS/Android)",
        "desktopIcons" => "desktop (Tauri/Electron/Linux)",
        _ => "web (favicon/PWA)",
    };
    format!(
        "Un pack d'icônes {pack} vient d'être généré dans {dir}.\n\
        Le projet connecté ({root}) est détecté comme « {pk} », ce qui ne correspond pas\n\
        directement à ce pack : détermine toi-même les bons emplacements dans ce projet,\n\
        déplace les fichiers nécessaires, branche-les (config/manifest/HTML selon la stack),\n\
        puis supprime les anciennes icônes et vérifie le résultat."
    )
}

fn web_generic(dir: &str) -> String {
    format!(
        "Intègre le pack d'icônes web généré dans ce projet.\n\
        Assets : {dir} (favicon.ico, PNG 16→512, maskable, icon.svg, site.webmanifest).\n\
        Copie-les dans le dossier statique (public/…), renseigne le manifest,\n\
        ajoute les <link> (favicon.ico, icon.svg, apple-touch-icon, manifest),\n\
        supprime les anciens favicons, vérifie le rendu."
    )
}

fn app_generic(dir: &str) -> String {
    format!(
        "Intègre le pack d'icônes mobile généré dans ce projet d'application.\n\
        Assets : {dir} (icon-1024, adaptive-icon-foreground, playstore-512, ios/, android/).\n\
        Détecte la stack (Expo : assets/ + app.json ; iOS : AppIcon.appiconset ; Android : res/mipmap-*),\n\
        installe les fichiers aux bons endroits, mets à jour la config, supprime l'ancienne icône."
    )
}

fn desktop_generic(dir: &str) -> String {
    format!(
        "Intègre le pack d'icônes desktop généré dans ce projet d'application.\n\
        Assets : {dir} (PNG 32→1024 conventions Tauri, icon.ico, icon.icns, icon.svg).\n\
        Détecte la stack (Tauri : src-tauri/icons/ + tauri.conf.json ; Electron : config builder ;\n\
        Linux : hicolor + .desktop), installe et branche les fichiers, supprime l'ancienne icône."
    )
}
