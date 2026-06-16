//! Prompts d'intégration générés pour l'agent IA (collés au presse-papier).
//! Ils s'ADAPTENT au cas d'usage :
//! - projet connecté (stack connue, fichiers déjà en place) vs pack générique ;
//! - set unique (noms fixes) vs duo de variantes `-dark`/`-light` (câblage themé).

pub fn prompt_for(
    kind: &str,
    dir: &str,
    project: Option<(&str, &str)>, // (kind, root)
    in_project: bool,
    dual: bool, // true = duo de variantes dark/light écrites (fichiers suffixés)
) -> String {
    match (kind, project) {
        ("webIcons", Some((pk, root))) if in_project => web_project(dir, pk, root, dual),
        ("appIcons", Some((pk, root))) if in_project => app_project(dir, pk, root, dual),
        ("desktopIcons", Some((pk, root))) if in_project => desktop_project(dir, pk, root, dual),
        (_, Some((pk, root))) => mismatched_project(kind, dir, pk, root, dual),
        ("appIcons", None) => app_generic(dir, dual),
        ("desktopIcons", None) => desktop_generic(dir, dual),
        _ => web_generic(dir, dual),
    }
}

fn web_project(dir: &str, pk: &str, root: &str, dual: bool) -> String {
    let files = if dual {
        "(favicon-16x16/32x32/96x96, apple-touch-icon, icon-192x192, icon-512x512,\n\
        maskable-icon-512x512 — CHACUN en -dark ET -light —, favicon-dark.ico & favicon-light.ico,\n\
        icon.svg, site-dark.webmanifest & site-light.webmanifest). Aucun fichier en nom fixe."
    } else {
        "(favicon.ico, favicon-16x16/32x32/96x96.png, apple-touch-icon.png, icon-192x192.png,\n\
        icon-512x512.png, maskable-icon-512x512.png, icon.svg, site.webmanifest)."
    };
    let wiring = match (dual, pk) {
        (true, "nextjs") => "Projet Next.js — déclare les VARIANTES via l'API Metadata avec `media` :\n\
            export const metadata = { icons: { icon: [\n\
              { url: '/icon-192x192-light.png', media: '(prefers-color-scheme: light)' },\n\
              { url: '/icon-192x192-dark.png',  media: '(prefers-color-scheme: dark)' } ] },\n\
              manifest: '/site-light.webmanifest' }\n\
           (un favicon themé se branche toujours à la main : il n'y a pas de nom fixe).",
        (true, _) => "Branche les VARIANTES via media query dans le <head> (favicon themé = câblage manuel) :\n\
            <link rel=\"icon\" href=\"/icon-192x192-light.png\" media=\"(prefers-color-scheme: light)\">\n\
            <link rel=\"icon\" href=\"/icon-192x192-dark.png\"  media=\"(prefers-color-scheme: dark)\">\n\
            (idem favicon-32x32 et apple-touch-icon) + <link rel=\"manifest\" href=\"/site-light.webmanifest\">.",
        (false, "nextjs") => "Projet Next.js : déclare les icônes via l'API Metadata (export metadata.icons dans app/layout.tsx)\n\
           ou la convention de fichiers App Router, et référence /site.webmanifest (metadata.manifest).",
        (false, _) => "Ajoute dans le <head> de l'index/du layout :\n\
            <link rel=\"icon\" href=\"/favicon.ico\" sizes=\"48x48\">\n\
            <link rel=\"icon\" type=\"image/svg+xml\" href=\"/icon.svg\">\n\
            <link rel=\"apple-touch-icon\" href=\"/apple-touch-icon.png\">\n\
            <link rel=\"manifest\" href=\"/site.webmanifest\">",
    };
    let check = if dual { "en thème CLAIR et SOMBRE" } else { "et installabilité PWA si applicable" };
    format!(
        "Le pack d'icônes web de ce projet ({pk}) vient d'être généré et il est DÉJÀ en place dans {dir}\n\
        {files}\n\
        Racine du projet : {root}\n\
        \n\
        À faire — ne déplace pas les fichiers, branche-les :\n\
        1. {wiring}\n\
        2. Renseigne name, short_name, theme_color et background_color dans le(s) manifest(s) selon ce projet.\n\
        3. Supprime les anciens favicons et toute référence obsolète.\n\
        4. Vérifie le rendu (onglet navigateur, {check})."
    )
}

fn app_project(dir: &str, pk: &str, root: &str, dual: bool) -> String {
    let files = if dual {
        "(icon.png, adaptive-icon.png, favicon.png + extras stores — chacun en -dark ET -light)"
    } else {
        "(icon.png 1024, adaptive-icon.png avec zone de sécurité, favicon.png,\n\
        + extras stores dans icons-extra/)"
    };
    let step1 = if dual {
        "iOS/Android ne gèrent pas un DUO d'icône d'app au runtime comme le web. Choisis la variante\n\
           adaptée comme icône principale (souvent -dark = contenu clair) et branche-la dans\n\
           app.json/app.config (icon, android.adaptiveIcon.foregroundImage, web.favicon). Garde les\n\
           fichiers -light/-dark restants pour un éventuel jeu d'icônes alternatif (asset catalog iOS /\n\
           icône monochrome Android)."
    } else {
        "Mets à jour app.json / app.config : icon → './assets/icon.png',\n\
           android.adaptiveIcon.foregroundImage → './assets/adaptive-icon.png'\n\
           (+ backgroundColor cohérent avec le logo), web.favicon → './assets/favicon.png'."
    };
    format!(
        "Le pack d'icônes de cette appli ({pk}) vient d'être généré et il est DÉJÀ en place dans {dir}\n\
        {files}.\n\
        Racine du projet : {root}\n\
        \n\
        À faire — ne déplace pas les fichiers, branche-les :\n\
        1. {step1}\n\
        2. icons-extra/ (playstore-512, tailles iOS) sert aux fiches stores : ne pas l'embarquer dans le bundle.\n\
        3. Supprime les anciennes icônes et références obsolètes.\n\
        4. Vérifie avec un prebuild/run que la nouvelle icône apparaît."
    )
}

fn desktop_project(dir: &str, pk: &str, root: &str, dual: bool) -> String {
    let files = if dual {
        "(32→1024, icon.ico, icon.icns, icon.svg — chacun en -dark ET -light)"
    } else {
        "(32x32.png, 64x64.png, 128x128.png, 128x128@2x.png, 512x512.png, icon.png 1024,\n\
        icon.ico, icon.icns, icon.svg)"
    };
    let step1 = if dual {
        "Une appli desktop n'a qu'UNE icône (pas de thème runtime) : choisis la variante (-dark/-light)\n\
           qui ressort le mieux sur les lanceurs, et référence CELLE-LÀ dans bundle.icon de\n\
           src-tauri/tauri.conf.json (les autres fichiers restent dispo si besoin)."
    } else {
        "Vérifie que bundle.icon de src-tauri/tauri.conf.json référence bien ces fichiers."
    };
    format!(
        "Le pack d'icônes desktop de ce projet ({pk}) vient d'être généré et il est DÉJÀ en place dans {dir}\n\
        {files}.\n\
        Racine du projet : {root}\n\
        \n\
        À faire — ne déplace pas les fichiers, branche-les :\n\
        1. {step1}\n\
        2. Si une meilleure qualité .icns/.ico est requise, regénère via `npm run tauri icon <icon.png choisi>`.\n\
        3. Supprime les anciennes icônes restantes et rebuild pour vérifier."
    )
}

fn mismatched_project(kind: &str, dir: &str, pk: &str, root: &str, dual: bool) -> String {
    let pack = match kind {
        "appIcons" => "mobile (iOS/Android)",
        "desktopIcons" => "desktop (Tauri/Electron/Linux)",
        _ => "web (favicon/PWA)",
    };
    let variants = if dual {
        "\n        Chaque fichier existe en deux variantes -dark ET -light (web : câble-les via media query ;\n\
        app/desktop : choisis la variante adaptée comme icône principale)."
    } else {
        ""
    };
    format!(
        "Un pack d'icônes {pack} vient d'être généré dans {dir}.{variants}\n\
        Le projet connecté ({root}) est détecté comme « {pk} », ce qui ne correspond pas\n\
        directement à ce pack : détermine toi-même les bons emplacements dans ce projet,\n\
        déplace les fichiers nécessaires, branche-les (config/manifest/HTML selon la stack),\n\
        puis supprime les anciennes icônes et vérifie le résultat."
    )
}

fn web_generic(dir: &str, dual: bool) -> String {
    if dual {
        return format!(
            "Intègre le pack d'icônes web (DUO dark/light) généré dans ce projet.\n\
            Assets : {dir} — chaque taille en -dark ET -light (PNG, .ico, .webmanifest), + icon.svg.\n\
            Copie-les dans le dossier statique (public/…), puis branche les variantes via media query\n\
            (favicon themé = câblage manuel) :\n\
            <link rel=\"icon\" href=\"/icon-192x192-light.png\" media=\"(prefers-color-scheme: light)\">\n\
            <link rel=\"icon\" href=\"/icon-192x192-dark.png\"  media=\"(prefers-color-scheme: dark)\">\n\
            (idem favicon-32x32, apple-touch-icon) + un site-*.webmanifest. Supprime les anciens favicons,\n\
            vérifie le rendu en thème clair ET sombre."
        );
    }
    format!(
        "Intègre le pack d'icônes web généré dans ce projet.\n\
        Assets : {dir} (favicon.ico, PNG 16→512, maskable, icon.svg, site.webmanifest).\n\
        Copie-les dans le dossier statique (public/…), renseigne le manifest,\n\
        ajoute les <link> (favicon.ico, icon.svg, apple-touch-icon, manifest),\n\
        supprime les anciens favicons, vérifie le rendu."
    )
}

fn app_generic(dir: &str, dual: bool) -> String {
    let variants = if dual {
        " Chaque icône existe en -dark ET -light : les stores/OS ne gèrent pas un duo d'icône d'app\n\
        de façon standard → choisis la variante adaptée comme icône principale (les autres restent dispo)."
    } else {
        ""
    };
    format!(
        "Intègre le pack d'icônes mobile généré dans ce projet d'application.\n\
        Assets : {dir} (icon-1024, adaptive-icon-foreground, playstore-512, ios/, android/).{variants}\n\
        Détecte la stack (Expo : assets/ + app.json ; iOS : AppIcon.appiconset ; Android : res/mipmap-*),\n\
        installe les fichiers aux bons endroits, mets à jour la config, supprime l'ancienne icône."
    )
}

fn desktop_generic(dir: &str, dual: bool) -> String {
    let variants = if dual {
        " Chaque icône existe en -dark ET -light : une appli desktop n'a qu'une icône\n\
        → choisis la variante qui ressort le mieux sur les lanceurs (les autres restent dispo)."
    } else {
        ""
    };
    format!(
        "Intègre le pack d'icônes desktop généré dans ce projet d'application.\n\
        Assets : {dir} (PNG 32→1024 conventions Tauri, icon.ico, icon.icns, icon.svg).{variants}\n\
        Détecte la stack (Tauri : src-tauri/icons/ + tauri.conf.json ; Electron : config builder ;\n\
        Linux : hicolor + .desktop), installe et branche les fichiers, supprime l'ancienne icône."
    )
}
