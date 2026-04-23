/**
 * Post-build sitemap.xml generator.
 *
 * Liste toutes les routes publiques (home, landscaping, configurateur +
 * pages /projet-:slug dynamiquement fetchées) et produit un sitemap.xml
 * standard à la racine de dist/.
 *
 * Les routes admin (/settings, /plateforme/*) sont volontairement exclues
 * — elles ne doivent pas être indexées.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, "../dist");
const SITE_URL = "https://cortobaarchitecture.com";
const API_BASE = "https://cortobaarchitecture.com";

const STATIC_URLS = [
  { loc: "/", changefreq: "weekly", priority: 1.0 },
  { loc: "/landscaping", changefreq: "monthly", priority: 0.9 },
  { loc: "/configurateur", changefreq: "monthly", priority: 0.9 },
];

async function fetchPublishedProjects() {
  try {
    const res = await fetch(
      `${API_BASE}/cortoba-plateforme/api/published_projects.php`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const list = data.data || [];
    // Même filtre que prerender — on n'inclut pas les slugs vides au sitemap.
    return list.filter(
      (p) => p && p.title && p.title.trim() && p.slug && p.slug.trim()
    );
  } catch {
    return [];
  }
}

function urlEntry({ loc, lastmod, changefreq, priority }) {
  const abs = loc.startsWith("http") ? loc : `${SITE_URL}${loc}`;
  return `  <url>
    <loc>${abs}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}
    <changefreq>${changefreq || "monthly"}</changefreq>
    <priority>${(priority ?? 0.5).toFixed(1)}</priority>
  </url>`;
}

async function main() {
  const projects = await fetchPublishedProjects();
  const today = new Date().toISOString().split("T")[0];

  const all = [
    ...STATIC_URLS.map((u) => ({ ...u, lastmod: today })),
    ...projects.map((p) => ({
      loc: `/projet-${p.slug}`,
      lastmod:
        (p.updated_at || p.created_at || today).split("T")[0] || today,
      changefreq: "yearly",
      priority: 0.7,
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map(urlEntry).join("\n")}
</urlset>
`;

  fs.writeFileSync(path.join(DIST, "sitemap.xml"), xml, "utf8");

  // Also write robots.txt if it doesn't exist
  const robotsPath = path.join(DIST, "robots.txt");
  if (!fs.existsSync(robotsPath)) {
    const robots = `User-agent: *
Allow: /
Disallow: /settings
Disallow: /plateforme/
Disallow: /cortoba-plateforme/

Sitemap: ${SITE_URL}/sitemap.xml
`;
    fs.writeFileSync(robotsPath, robots, "utf8");
  }

  console.log(
    `✓ sitemap.xml généré (${all.length} URLs) + robots.txt`
  );
}

main().catch((err) => {
  console.error("❌ Erreur sitemap :", err);
  process.exit(1);
});
