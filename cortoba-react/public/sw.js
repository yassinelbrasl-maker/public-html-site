/**
 * Cortoba service worker — offline fallback + cache-first pour les assets hashés.
 *
 * Stratégie :
 *   - /assets/*.{js,css,woff2} (hashés par Vite) → cache-first, cache permanent
 *   - index.html + HTML des routes prerenderées → network-first, fallback cache
 *   - API /cortoba-plateforme/api/* → NEVER cache, NEVER intercept (passthrough)
 *   - Admin routes /settings, /plateforme/* → NEVER cache (passthrough)
 *   - Images /img/* → cache-first avec expiration implicite par hash d'URL
 */

const VERSION = "v2";
const ASSETS_CACHE = `cortoba-assets-${VERSION}`;
const HTML_CACHE = `cortoba-html-${VERSION}`;
const IMG_CACHE = `cortoba-img-${VERSION}`;

const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/img/favicon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(HTML_CACHE);
      await cache.addAll(PRECACHE).catch(() => {
        /* precache best-effort; app installs even if some items fail */
      });
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (k) =>
              !k.endsWith(VERSION) &&
              (k.startsWith("cortoba-assets-") ||
                k.startsWith("cortoba-html-") ||
                k.startsWith("cortoba-img-"))
          )
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache / never intercept : API + admin (HTML shell is enough, all content is dynamic).
  if (
    url.pathname.startsWith("/cortoba-plateforme/") ||
    url.pathname.startsWith("/settings") ||
    url.pathname.startsWith("/plateforme")
  ) {
    return;
  }

  // Hashed assets (Vite) → cache-first, permanent
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(req, ASSETS_CACHE));
    return;
  }

  // Images → cache-first
  if (url.pathname.startsWith("/img/") || /\.(png|jpe?g|webp|avif|svg)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(req, IMG_CACHE));
    return;
  }

  // HTML routes (including / and /projet-*) → network-first
  if (
    req.mode === "navigate" ||
    req.destination === "document" ||
    url.pathname.endsWith(".html") ||
    url.pathname === "/" ||
    !url.pathname.includes(".")
  ) {
    event.respondWith(networkFirst(req, HTML_CACHE));
    return;
  }

  // Default: try network, fall back to cache
  event.respondWith(networkFirst(req, HTML_CACHE));
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    if (cached) return cached;
    throw e;
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Last resort : try the root index.html (SPA shell)
    const root = await cache.match("/");
    if (root) return root;
    throw e;
  }
}
