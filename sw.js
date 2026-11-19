const CACHE = "deep-time-v1";
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isVideoRequest(request, url) {
  if (request.headers.get("range")) return true;
  if (request.destination === "video" || request.destination === "track") return true;
  if (url.pathname.includes("/videos/")) return true;
  if (/\.(mp4|vtt)$/i.test(url.pathname)) return true;
  return false;
}

function isNavigationRequest(request) {
  if (request.mode === "navigate") return true;
  if (request.destination === "document") return true;
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      // Store as the app shell so ?focus= and other query params still work offline
      cache.put("./index.html", fresh.clone());
    }
    return fresh;
  } catch (err) {
    return (await cache.match(request, { ignoreSearch: true }))
      || (await cache.match("./index.html"))
      || (await cache.match("./"))
      || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then(res => {
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => undefined);
  return cached || (await network) || Response.error();
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Do not intercept or cache video streams, range requests, or caption files
  if (isVideoRequest(request, url)) return;

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
