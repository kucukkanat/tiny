// App-shell service worker.
//
// Two rules, and the split between them is the whole point:
//
//   Navigations are NETWORK-FIRST. The HTML names content-hashed chunks, and a
//   build deletes the previous ones — so serving a cached page after a deploy
//   points the browser at chunks that no longer exist, and the app never starts
//   again. Cache is the offline fallback here, not the default.
//
//   Everything else same-origin is CACHE-FIRST. Those URLs carry a content hash,
//   so a hit is always the right bytes and can never be stale.
//
// API calls cross origin (the user's own endpoint), so they are never touched.
const CACHE = "tiny-chat-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["./"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Keep a copy, but never fail the response because caching failed. */
const remember = (request, response) => {
  const copy = response.clone();
  void caches.open(CACHE).then((cache) => cache.put(request, copy));
  return response;
};

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => remember(event.request, response))
        // Offline: the last shell we saw is better than nothing.
        .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match("./"))),
    );
    return;
  }

  event.respondWith(
    caches
      .match(event.request)
      .then(
        (cached) =>
          cached ?? fetch(event.request).then((response) => remember(event.request, response)),
      ),
  );
});
