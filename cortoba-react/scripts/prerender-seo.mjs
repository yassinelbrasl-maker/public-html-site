/**
 * Post-build SEO prerender — génère un index.html statique par route avec les
 * bonnes meta tags (title, description, og:*).
 *
 * Fonctionnement :
 *  - lit `dist/index.html` produit par Vite (contient les <script> hashés)
 *  - pour chaque route connue, remplace title / description / og:* / canonical
 *  - écrit `dist/<route>/index.html`
 *
 * Ça ne rend PAS le DOM React (pas du vrai SSR). Mais les crawlers qui ne
 * rendent pas JS (Bing, LinkedIn preview, WhatsApp preview) voient désormais
 * les bonnes meta tags. React hydrate normalement côté client.
 *
 * Pour les pages `/projet-:slug`, on fait un fetch de l'API au build pour
 * lister les slugs.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, "../dist");
const SITE_URL = "https://cortobaarchitecture.com";
const API_BASE = "https://cortobaarchitecture.com";

// Static routes & their SEO content
const STATIC_ROUTES = [
  {
    path: "/",
    title: "Cortoba Architecture Studio",
    description:
      "Cortoba Architecture Studio — studio d'architecture basé à Djerba. Conception, design intérieur, suivi de chantier. Des projets qui racontent le lieu, la lumière et les gestes du quotidien.",
    image: "/img/og-default.jpg",
    keywords:
      "architecte Djerba, architecture Tunisie, studio d'architecture, Cortoba, conception architecturale, villa contemporaine, HQE",
  },
  {
    path: "/landscaping",
    title: "Landscaping — Cortoba Architecture Studio",
    description:
      "Cortoba Landscaping — architecture du paysage en Tunisie. Jardins privés, terrasses, hôtellerie, espaces publics.",
    image: "/img/og-landscaping.jpg",
    keywords:
      "paysagiste Djerba, architecte paysagiste Tunisie, jardin méditerranéen, aménagement extérieur, landscaping",
  },
  {
    path: "/configurateur",
    title: "Configurateur de projet — Cortoba Architecture Studio",
    description:
      "Estimez la surface et le budget de votre futur projet en quelques clics. Moteur de calcul basé sur des ratios architecturaux réels.",
    image: "/img/og-default.jpg",
    keywords: "configurateur projet architectural, estimation coût construction",
  },
];

async function fetchPublishedProjects() {
  try {
    const res = await fetch(
      `${API_BASE}/cortoba-plateforme/api/published_projects.php`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
  } catch {
    console.warn(
      "⚠️ Impossible de fetcher les projets publiés — les pages /projet-* ne seront pas pré-rendues."
    );
    return [];
  }
}

function projectRouteSeo(p) {
  return {
    path: `/projet-${p.slug}`,
    title: `${p.title} — Cortoba Architecture Studio`,
    description:
      p.description ||
      `${p.category} — ${p.title}, ${p.location}${
        p.country ? ", " + p.country : ""
      }. Projet Cortoba Architecture Studio.`,
    image: p.hero_image || "/img/og-default.jpg",
    type: "article",
  };
}

function injectMeta(html, route) {
  const fullTitle = route.title;
  const absoluteImage = route.image?.startsWith("http")
    ? route.image
    : `${SITE_URL}${route.image || "/img/og-default.jpg"}`;
  const absoluteUrl = `${SITE_URL}${route.path}`;
  const metaBlock = `
    <title>${escape(fullTitle)}</title>
    <meta name="description" content="${escape(route.description)}" />
    ${route.keywords ? `<meta name="keywords" content="${escape(route.keywords)}" />` : ""}
    <link rel="canonical" href="${absoluteUrl}" />

    <meta property="og:title" content="${escape(fullTitle)}" />
    <meta property="og:description" content="${escape(route.description)}" />
    <meta property="og:image" content="${absoluteImage}" />
    <meta property="og:url" content="${absoluteUrl}" />
    <meta property="og:type" content="${route.type || "website"}" />
    <meta property="og:site_name" content="Cortoba Architecture Studio" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escape(fullTitle)}" />
    <meta name="twitter:description" content="${escape(route.description)}" />
    <meta name="twitter:image" content="${absoluteImage}" />
  `.trim();

  // Replace <title>…</title> if any, else insert before </head>
  let out = html.replace(/<title>[\s\S]*?<\/title>/, "");
  out = out.replace("</head>", `${metaBlock}\n  </head>`);
  return out;
}

function escape(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function main() {
  const tmplPath = path.join(DIST, "index.html");
  if (!fs.existsSync(tmplPath)) {
    console.error("❌ dist/index.html introuvable. Exécutez npm run build d'abord.");
    process.exit(1);
  }
  const template = fs.readFileSync(tmplPath, "utf8");

  const dynamic = (await fetchPublishedProjects()).map(projectRouteSeo);
  const routes = [...STATIC_ROUTES, ...dynamic];

  let written = 0;
  for (const route of routes) {
    const html = injectMeta(template, route);
    const outDir =
      route.path === "/"
        ? DIST
        : path.join(DIST, route.path.replace(/^\//, ""));
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "index.html"), html, "utf8");
    written++;
  }

  console.log(`✓ SEO snapshots générés pour ${written} routes :`);
  routes.forEach((r) => console.log(`  ${r.path}`));
}

main().catch((err) => {
  console.error("❌ Erreur prerender-seo :", err);
  process.exit(1);
});
