# Changelog

Toutes les modifications notables d'ImageHub sont consignées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versionnage [SemVer](https://semver.org/lang/fr/).

La section correspondant au tag publié (`## [x.y.z]`) est extraite automatiquement
par la CI : elle devient le corps de la release GitHub **et** le texte affiché
dans la fenêtre de mise à jour de l'application. Écris donc ces notes pour
l'utilisateur final, en texte lisible (la modale n'affiche pas le Markdown).

## [Non publié]

<!-- Notes de la prochaine version. Au moment de tagger vX.Y.Z, renomme cette
     section en « ## [X.Y.Z] - AAAA-MM-JJ » et recrée un bloc « Non publié ». -->

## [0.7.1] - 2026-06-08

Première version avec mises à jour automatiques.

- Si ImageHub (≥ 0.7.1) est déjà installé : rien à faire, l'app propose « Installer et redémarrer » au démarrage.
- Linux : seul l'AppImage est mis à jour automatiquement (les paquets .deb / .rpm se mettent à jour manuellement).
- Ajout de l'auto-updater Tauri (artefacts signés), de la cible AppImage et de la licence MIT.
