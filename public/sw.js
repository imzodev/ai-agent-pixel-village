// Minimal service worker. Cache-first for immutable static assets,
// network-first for API + HTML. Registered only in production (see
// ClientShell.tsx) — in dev a worker would serve stale Turbopack chunks
// and break the module graph.

const CACHE_NAME = "grove-v2";
const STATIC_ASSETS = ["/", "/manifest.webmanifest", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  // Never cache /api/* — must be live.
  if (url.pathname.startsWith("/api/")) return;
  // Network-first for HTML; cache fallback.
  if (event.request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(event.request).then((res) => {
        // Never store responses the server marked no-store (e.g. anything
        // served during a hot rebuild).
        if (res.ok && !/no-store/i.test(res.headers.get("cache-control") ?? "")) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return res;
      }).catch(() => caches.match(event.request).then((r) => r ?? caches.match("/"))),
    );
    return;
  }
  // Cache-first for immutable, content-hashed assets. Restrict to
  // /_next/static/ so we never cache HMR / dev runtime modules.
  event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request).then((res) => {
    const immutable = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/lpc/") || url.pathname.startsWith("/cosmetics/");
    if (res.ok && immutable && !/no-store/i.test(res.headers.get("cache-control") ?? "")) {
      const clone = res.clone();
      caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
    }
    return res;
  })));
});
