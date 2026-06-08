// Extrait la section d'une version depuis CHANGELOG.md et l'expose à la CI
// (corps de release + champ `notes` de latest.json lu par l'updater).
//
// Usage : node scripts/extract-changelog.mjs <vX.Y.Z|X.Y.Z>
// Écrit `notes=<section>` dans $GITHUB_OUTPUT (sinon affiche sur stdout).
// Si la section est absente (ex. build hors tag), retombe sur un texte générique.

import { appendFileSync, readFileSync } from "node:fs";

const version = (process.argv[2] || "").replace(/^v/, "").trim();

const fallback = [
  "Mise à jour automatique : l'application télécharge et installe cette version, puis redémarre.",
  "",
  "Linux : seul l'AppImage est mis à jour automatiquement (les paquets .deb / .rpm se mettent à jour manuellement).",
].join("\n");

/** Renvoie le contenu entre `## [version]` et le prochain `## [`, ou null. */
function extract(md, version) {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex(
    (l) => /^##\s*\[/.test(l) && l.includes(`[${version}]`),
  );
  if (start === -1) return null;
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s*\[/.test(lines[i])) break;
    body.push(lines[i]);
  }
  return body.join("\n").trim() || null;
}

let notes = fallback;
try {
  const found = extract(readFileSync("CHANGELOG.md", "utf8"), version);
  if (found) notes = found;
  else console.error(`Aucune section [${version}] dans CHANGELOG.md → fallback.`);
} catch (e) {
  console.error(`CHANGELOG.md illisible (${e.message}) → fallback.`);
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `notes<<NOTES_EOF\n${notes}\nNOTES_EOF\n`);
} else {
  console.log(notes);
}
