<div align="center">
  <img src="public/png/logo-solo.png" alt="ImageHub logo" width="200">

  <p align="center">
    <img src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white" alt="Tauri 2">
    <img src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white" alt="React 19">
    <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/Rust-2021-000000?logo=rust&logoColor=white" alt="Rust">
    <img src="https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white" alt="Vite 7">
    <img src="https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind v4">
    <img src="https://img.shields.io/badge/Linter-Biome-60A5FA?logo=biome&logoColor=white" alt="Biome">
  </p>

  <p align="center">
    <img src="https://img.shields.io/badge/Upscale-Real--ESRGAN-FF6F00" alt="Real-ESRGAN">
    <img src="https://img.shields.io/badge/Remove%20BG-rembg-8E44AD" alt="rembg">
    <img src="https://img.shields.io/badge/AVIF-ffmpeg-007808?logo=ffmpeg&logoColor=white" alt="ffmpeg">
    <img src="https://img.shields.io/badge/ICO-ImageMagick-EF2929" alt="ImageMagick">
    <img src="https://img.shields.io/badge/SVG-Inkscape-000000?logo=inkscape&logoColor=white" alt="Inkscape">
    <img src="https://img.shields.io/badge/PNG%E2%86%92SVG-vtracer-1E88E5" alt="vtracer">
  </p>

  <p align="center">
    <i>Traitement &amp; optimisation d'images en local + audit des assets de tes projets de dev.</i><br>
    Dépôt  <a href="https://github.com/DevRedious/imagehub">DevRedious/imagehub</a>
  </p>
</div>

---

Application de bureau (Tauri 2) de traitement et d'optimisation d'images, pensée comme un assistant pour les projets de dev. Deux usages complémentaires :

- **Studio** — convertir / transformer des images à la demande en déléguant à des outils CLI installés sur la machine (upscale, détourage, conversions, packs d'icônes).
- **Projet** — connecter un dépôt de code, inventorier ses images, repérer les fichiers lourds et les assets inutilisés, optimiser en AVIF en lot, puis générer un prompt d'intégration pour un agent IA.

> L'app ne contient pas de moteur d'IA embarqué. L'« IA » se limite à des **prompts d'intégration** copiés dans le presse-papier (à coller à un agent type Claude / Cursor) et à l'**upscale** Real-ESRGAN, délégué au binaire CLI externe.

## Stack technique

| Couche | Technologies |
| --- | --- |
| Desktop | Tauri 2 (identifiant `fr.redious.imagehub`) |
| Backend | Rust (edition 2021), crates `image` 0.25, `notify` 8.2, `serde` |
| Plugins Tauri | `opener`, `dialog`, `clipboard-manager`, `notification`, `updater`, `process` (asset protocol activé, scope `$HOME/**`) |
| Frontend | React 19 + TypeScript 5.8, Vite 7 |
| Styles | Tailwind CSS 4 (`@tailwindcss/vite`) |
| Lint / format | Biome 2.4 |
| Cibles bundle | `.deb`, `.rpm`, `.AppImage` (Linux) ; installeur NSIS produit en CI (Windows) |
| Mises à jour | Auto-updater Tauri (artefacts signés, `latest.json` sur la release GitHub) |

Version courante : **0.7.0**. Fenêtre par défaut 880×720, titre « ImageHub ».

## Moteurs CLI externes

Chaque action délègue à un outil CLI résolu dynamiquement (sidecar bundlé → `~/.local/bin` → `PATH`). La commande `check_tools` détecte leur présence et grise les actions dont le moteur manque.

| Moteur | Utilisé pour |
| --- | --- |
| ImageMagick (`magick`) | → ICO, rendu PNG des packs d'icônes, `.ico`/`.icns` |
| Inkscape | SVG → PNG, rendu maître 1024px des packs d'icônes |
| ffmpeg | → AVIF (libaom-av1), pré-conversion avant upscale |
| Real-ESRGAN (`realesrgan-ncnn-vulkan`) | Upscale ×4 (ncnn/Vulkan, GPU device 0 forcé) |
| rembg | Détourage / suppression de fond |
| vtracer | Vectorisation PNG/JPG → SVG |

Emplacements spécifiques recherchés : venv `~/.local/share/imagehub-venv/bin/rembg` pour rembg, dossier `~/.local/share/realesrgan-models` pour les modèles Real-ESRGAN.

## Fonctionnalités

### Studio — actions sur fichiers (9 au total)

Glisser-déposer ou sélection de fichiers, puis lancement d'une action. Le mode de sortie est configurable (à côté de l'original, sous-dossier par format, ou dossier personnalisé) et les collisions de noms sont évitées par suffixe `-1`, `-2`, …

- **Upscale ×4** — Real-ESRGAN (png/jpg/webp/avif ; AVIF pré-converti via ffmpeg)
- **Remove BG** — détourage via rembg (png/jpg/webp)
- **→ ICO** — ImageMagick, multi-tailles 16→256
- **Icônes Web** — pack favicon/PWA complet depuis un SVG (favicons PNG, maskable, `favicon.ico`, `site.webmanifest`)
- **Icônes Appli** — pack mobile iOS/Android, variante Expo (`icon.png`, `adaptive-icon`, tailles stores)
- **Icônes Desktop** — pack Tauri/Electron (PNG 32→1024, `icon.ico`, `icon.icns`)
- **SVG → PNG** — Inkscape (export 1024px)
- **PNG → SVG** — vectorisation vtracer
- **→ AVIF** — ffmpeg

Les packs d'icônes (Web/Appli/Desktop) n'acceptent que du SVG (qualité parfaite à toutes les tailles). Quand un projet est connecté, les fichiers sont écrits directement aux emplacements conventionnels de la stack (`public/`, `assets/`, `src-tauri/icons/`), et un **prompt d'intégration** adapté à la stack est copié dans le presse-papier avec notification système.

### Projet connecté — analyse et optimisation

- **Détection de stack** : tauri, expo, react-native, nextjs, electron, android, nuxt, angular, astro, svelte, vue, vite, rust, python, node, generic.
- **Détection de l'icône réelle** de l'app selon les conventions de chaque stack.
- **Inventaire des images** (par extension, poids), repérage des **fichiers lourds** (PNG/JPG ≥ 50 Ko, candidats AVIF) en ignorant `node_modules`, `dist`, `target`, etc.
- **Scan chirurgical des usages** : recherche de chaque image dans tout le code (js/ts/vue/svelte/astro/html/css/rust/py/xml/plist/gradle…), avec rôle inféré (logo, favicon, bannière…) et références fichier:ligne.
- **Détection des assets inutilisés** (aucune référence trouvée) + suppression confirmée.
- **Score qualité 0–100** pondéré par le poids non optimisé, le nombre d'images lourdes et les assets morts.
- **Optimisation AVIF en lot** des fichiers lourds sélectionnés (l'original PNG/JPG est supprimé), suivie d'un prompt listant les conversions et les références exactes à corriger, copié dans le presse-papier.
- **Surveillance temps réel** du projet (`notify`, débounce 1 s) : ré-analyse silencieuse à chaque changement image/code, avec repli manuel « Réanalyser » si le watcher est indisponible (limite inotify, montage réseau…).
- Projets récents mémorisés, bascule instantanée via cache de session.

## Structure du projet

```
imagehub/
├── src/                      # Frontend React / TypeScript
│   ├── App.tsx               # état global, jobs, analyse, optimisation
│   ├── components/           # vues (Studio, Projet, About) + UI (modales, lightbox…)
│   ├── lib/                  # actions, score, paths, project, stores, icons, output
│   └── types/                # types des jobs
├── src-tauri/                # Backend Rust
│   └── src/
│       ├── lib.rs            # builder Tauri + enregistrement des commandes
│       ├── actions.rs        # workers de traitement (run_action, deliver_prompt)
│       ├── icon_packs.rs     # génération des packs d'icônes
│       ├── icon_prompts.rs   # prompts d'intégration par stack
│       ├── project.rs        # analyse projet, scan des usages, suppression
│       ├── thumbs.rs         # miniatures
│       ├── tools.rs          # résolution des CLI + check_tools
│       └── watcher.rs        # surveillance temps réel du projet
└── .github/workflows/build.yml  # CI Linux + Windows, release sur tag
```

Commandes Tauri exposées : `run_action`, `deliver_prompt`, `analyze_project`, `scan_image_usages`, `delete_files`, `make_thumb`, `check_tools`, `watch_project`, `unwatch_project`.

## Développement

Prérequis : Node, Rust (toolchain stable), et les dépendances système Tauri (sous Linux : `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`). Les moteurs CLI doivent être installés pour que les actions correspondantes soient actives.

```bash
npm install            # dépendances
npm run tauri dev      # lancer l'app en dev (Vite + Tauri)
npm run tauri build    # build de production (.deb / .rpm)
```

Scripts frontend utiles :

```bash
npm run dev            # serveur Vite seul (port 1420)
npm run build          # tsc + build Vite
npm run check          # Biome (lint + format, écriture)
npm run lint           # Biome lint
npm run format         # Biome format
npm run ci             # Biome ci (vérification sans écriture)
```

> Note Linux : `WEBKIT_DISABLE_DMABUF_RENDERER=1` est forcé au démarrage pour contourner une erreur WebKitGTK + NVIDIA sous Wayland.

## CI / Release

Le workflow `Build ImageHub` (GitHub Actions) se déclenche sur tag `v*` ou manuellement. Il compile pour `ubuntu-24.04` et `windows-latest` via `tauri-apps/tauri-action`. Sous Windows, des sidecars (ffmpeg, Real-ESRGAN + modèles, vtracer) sont téléchargés et embarqués dans l'installeur ; `magick`, `inkscape` et `rembg` ne sont pas bundlés (leurs actions restent indisponibles tant qu'ils ne sont pas installés). Un tag produit une release GitHub en brouillon avec les artefacts `.deb`, `.rpm`, `.AppImage` et `.exe` (NSIS), leurs signatures, et le `latest.json` consommé par l'updater.

## Mises à jour automatiques

L'app embarque l'updater Tauri : au démarrage, elle interroge `latest.json` publié sur la dernière release GitHub et propose d'installer la nouvelle version (téléchargement + redémarrage). Les artefacts sont signés par une clé privée (jamais dans le dépôt) ; seule la clé publique est embarquée (`plugins.updater.pubkey`). Côté Linux, **seul l'AppImage** est mis à jour par l'updater (les `.deb`/`.rpm` passent par le gestionnaire de paquets).

> La diffusion ne se déclenche que lorsque la release est **publiée** (l'endpoint pointe sur `releases/latest`, qui ignore les brouillons). La CI exige deux secrets : `TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
