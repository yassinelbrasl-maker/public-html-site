/**
 * Post-deploy smoke test — vérifie que chaque route live renvoie le bon
 * code HTTP + contient le contenu minimum attendu (title / meta / keyword).
 *
 * Usage :
 *   node scripts/smoke-test.mjs                       # test production
 *   node scripts/smoke-test.mjs http://localhost:4173 # test un build local
 *
 * Sort en 0 si tout passe, 1 si un test échoue.
 */

const BASE = process.argv[2] || "https://cortobaarchitecture.com";

// TestCase shape: { name, path, expectStatus, expectContains[], expectNotContains?[] }
const TESTS = [
  {
    name: "Home (SEO prerender)",
    path: "/",
    expectStatus: 200,
    expectContains: [
      "Cortoba Architecture Studio",
      'rel="canonical"',
      '<meta property="og:',
    ],
  },
  {
    name: "Landscaping",
    path: "/landscaping",
    expectStatus: 200,
    expectContains: ["Landscaping", "Cortoba"],
  },
  {
    name: "Configurateur",
    path: "/configurateur",
    expectStatus: 200,
    expectContains: ["Configurateur", "Cortoba"],
  },
  {
    name: "Project detail (villa-al)",
    path: "/projet-villa-al",
    expectStatus: 200,
    expectContains: ["VILLA", "Cortoba"],
  },
  {
    name: "Sitemap",
    path: "/sitemap.xml",
    expectStatus: 200,
    expectContains: ["<urlset", "cortobaarchitecture.com"],
  },
  {
    name: "Robots",
    path: "/robots.txt",
    expectStatus: 200,
    expectContains: ["Disallow: /plateforme", "Sitemap:"],
  },
  {
    name: "API still served (published_projects)",
    path: "/cortoba-plateforme/api/published_projects.php",
    expectStatus: 200,
    expectContains: ["success", "data"],
  },
  {
    name: "Legacy /landscaping.html → 301",
    path: "/landscaping.html",
    expectStatus: 301,
    expectContains: [],
    expectFollow: false,
  },
  {
    name: "Manifest (PWA)",
    path: "/manifest.webmanifest",
    expectStatus: 200,
    expectContains: ["Cortoba", '"display"'],
  },
  {
    name: "Service worker",
    path: "/sw.js",
    expectStatus: 200,
    expectContains: ["caches", "fetch"],
  },
  {
    name: "Protected /_legacy must be 403",
    path: "/_legacy/index.html",
    expectStatus: 403,
    expectContains: [],
  },
  {
    name: "Protected /cortoba-react must be 403",
    path: "/cortoba-react/",
    expectStatus: 403,
    expectContains: [],
  },
];

const PASS = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";

let passed = 0;
let failed = 0;
const failures = [];

console.log(`\nSmoke tests against ${BASE}\n`);

for (const t of TESTS) {
  const url = BASE + t.path;
  try {
    const res = await fetch(url, { redirect: "manual" });
    const body = res.status < 400 ? await res.text() : "";

    const errors = [];
    if (res.status !== t.expectStatus) {
      errors.push(`status ${res.status} ≠ ${t.expectStatus}`);
    }
    for (const needle of t.expectContains || []) {
      if (!body.includes(needle)) {
        errors.push(`body missing: "${needle.slice(0, 40)}"`);
      }
    }
    for (const needle of t.expectNotContains || []) {
      if (body.includes(needle)) {
        errors.push(`body should not contain: "${needle.slice(0, 40)}"`);
      }
    }

    if (errors.length === 0) {
      console.log(`  ${PASS} ${t.name.padEnd(48)} ${res.status} ${t.path}`);
      passed++;
    } else {
      console.log(
        `  ${FAIL} ${t.name.padEnd(48)} ${res.status} ${t.path}\n      ${errors.join("\n      ")}`
      );
      failed++;
      failures.push({ name: t.name, errors });
    }
  } catch (e) {
    console.log(
      `  ${FAIL} ${t.name.padEnd(48)} NETWORK_ERROR ${t.path}\n      ${e.message}`
    );
    failed++;
    failures.push({ name: t.name, errors: [e.message] });
  }
}

console.log(
  `\n${passed}/${TESTS.length} passed · ${failed}/${TESTS.length} failed\n`
);

if (failed > 0) process.exit(1);
