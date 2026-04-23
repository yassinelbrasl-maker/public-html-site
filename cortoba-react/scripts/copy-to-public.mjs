/**
 * Post-build : copie `dist/*` vers la racine de public_html (site live).
 *
 * Utilisé après la bascule SPA. Le Git auto-commit prend la suite pour
 * déployer sur cPanel.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, "../dist");
const ROOT = path.resolve(__dirname, "../..");

if (!fs.existsSync(DIST)) {
  console.error("❌ dist/ absent — exécutez npm run build d'abord.");
  process.exit(1);
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Nettoyer les anciens assets hashés avant de copier les nouveaux
const rootAssets = path.join(ROOT, "assets");
if (fs.existsSync(rootAssets)) {
  console.log("  Nettoyage de public_html/assets/ (anciens hashes)…");
  fs.rmSync(rootAssets, { recursive: true, force: true });
}

// Copier le contenu de dist à la racine
let copied = 0;
for (const entry of fs.readdirSync(DIST)) {
  const from = path.join(DIST, entry);
  const to = path.join(ROOT, entry);
  copyRecursive(from, to);
  copied++;
}

console.log(
  `✓ ${copied} entrées copiées de dist/ vers public_html/ — l'auto-commit Git prendra la suite.`
);
