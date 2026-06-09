# Plan de tournage des médias du README

Ce dossier contient les captures d'écran et démos référencées par le `README.md`.
Les fichiers sont produits **manuellement** (l'app GUI ne peut pas être pilotée
automatiquement) ; ce document liste les plans à réaliser et les commandes.

## Fichiers attendus

| Fichier | Type | Contenu |
| --- | --- | --- |
| `studio.png` | capture | Studio : grande zone avec 3–4 images déposées, catégories + options à droite |
| `canvas-detour.gif` | démo | Remove BG sur une photo : scan → génération → résultat (avant/après) |
| `history.png` | capture | Page Historique : 2–3 traitements terminés, bouton « Ouvrir le dossier » |
| `project.png` | capture | Projet connecté : anneau de score, formats, liste d'images à optimiser |
| `project-scan.gif` | démo | Connexion d'un projet : la modale de scan « théâtrale » |

(Optionnel : `about.png`, `detour-options.png`.)

## Captures d'écran (Spectacle)

Mettre l'app au premier plan dans l'état voulu, puis :

```bash
# fenêtre active, sans notification, en arrière-plan
spectacle -b -n -a -o docs/media/studio.png
```

## Démos animées (GIF)

1. Enregistrer la **fenêtre** en vidéo pendant l'action :
   - Spectacle (Plasma 6) → mode **Enregistrement d'écran** → région/fenêtre, ou
   - OBS (capture de fenêtre PipeWire).
   - Garder court (~4–8 s), résolution raisonnable.
2. Convertir le `.mp4` en GIF optimisé (palette 2 passes) :

```bash
ffmpeg -y -i rec.mp4 -vf "fps=15,scale=960:-1:flags=lanczos,palettegen" /tmp/pal.png
ffmpeg -y -i rec.mp4 -i /tmp/pal.png \
  -lavfi "fps=15,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse" docs/media/canvas-detour.gif
```

> GitHub affiche les **GIF** en ligne dans le README (pas les MP4 via chemin relatif).
> Viser < 5–8 Mo par GIF (réduire `fps`/`scale` si besoin).
