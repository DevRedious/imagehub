// Génère les notes d'une version à partir des messages de commit Git, sans
// aucune saisie manuelle. Sert de corps de release ET de champ `notes` du
// latest.json (texte affiché dans la fenêtre de mise à jour de l'app).
//
// Usage : node scripts/release-notes.mjs <vX.Y.Z>
// Liste les commits entre le tag précédent et <vX.Y.Z>, en écartant les
// commits purement techniques. Écrit `notes=<…>` dans $GITHUB_OUTPUT
// (sinon stdout). Retombe sur un texte générique si rien de pertinent.
//
// Nécessite un historique complet : actions/checkout avec fetch-depth: 0.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const tag = (process.argv[2] || "").trim();

const fallback = [
  "Mise à jour automatique : l'application télécharge et installe cette version, puis redémarre.",
  "",
  "Linux : seul l'AppImage est mis à jour automatiquement (les paquets .deb / .rpm se mettent à jour manuellement).",
].join("\n");

// execFileSync n'invoque pas de shell → arguments littéraux, robustes sous
// Windows (pas d'échappement de `^`, pas de redirection `2>/dev/null`).
function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

// Commits sans intérêt pour l'utilisateur final.
const SKIP = [
  /^bump version/i,
  /^merge /i,
  /^release\b/i,
  /^v?\d+\.\d+\.\d+/, // commits nommés juste par un numéro de version
  /^(ci|chore|build|docs|test|refactor|style|wip)\b\s*[:(]/i,
];

let notes = fallback;
try {
  let prev = "";
  try {
    prev = git(["describe", "--tags", "--abbrev=0", `${tag}^`]);
  } catch {
    // pas de tag antérieur (première version) → tout l'historique
  }

  const range = prev ? `${prev}..${tag}` : tag;
  const log = git(["log", "--no-merges", "--pretty=format:%s", range]);

  const seen = new Set();
  const items = log
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !SKIP.some((re) => re.test(l)))
    .filter((l) => (seen.has(l) ? false : seen.add(l)));

  if (items.length) notes = items.map((l) => `- ${l}`).join("\n");
  else console.error(`Aucun commit pertinent pour ${tag} → fallback.`);
} catch (e) {
  console.error(`Génération des notes impossible (${e.message}) → fallback.`);
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `notes<<NOTES_EOF\n${notes}\nNOTES_EOF\n`);
} else {
  console.log(notes);
}
