const CACHE_NAME = "k5tech-dtr-v11";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./K5Tech_Icon_192.png",
  "./K5Tech_Icon_512.png",
];

/**********************************************************
 * INSTALL
 **********************************************************/

self.addEventListener("install", (event) => {
  console.log("[Service Worker] Installing:", CACHE_NAME);

  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_FILES);
    }),
  );
});

/**********************************************************
 * ACTIVATE
 **********************************************************/

self.addEventListener("activate", (event) => {
  console.log("[Service Worker] Activating:", CACHE_NAME);

  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              console.log("[Service Worker] Deleting old cache:", key);

              return caches.delete(key);
            }

            return null;
          }),
        );
      })

      .then(() => {
        return self.clients.claim();
      }),
  );
});

/**********************************************************
 * FETCH
 **********************************************************/

self.addEventListener("fetch", (event) => {
  /*
   * Only handle GET requests.
   * POST requests are handled directly
   * by the application/API.
   */

  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);

  /*
   * HTML / navigation requests
   *
   * Always try the network first.
   * If offline, fall back to cached index.html.
   */

  if (event.request.mode === "navigate" || url.pathname.endsWith(".html")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          return response;
        })

        .catch(() => {
          return caches.match("./index.html");
        }),
    );

    return;
  }

  /*
   * Other static assets
   *
   * Cache first.
   * If not cached, fetch from network
   * and store a copy in the cache.
   */

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        /*
         * Only cache valid responses.
         */

        if (
          !networkResponse ||
          networkResponse.status !== 200 ||
          networkResponse.type === "opaque"
        ) {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(
            event.request,

            responseToCache,
          );
        });

        return networkResponse;
      });
    }),
  );
});

/**********************************************************
 * MESSAGE
 *
 * Allows the main application to activate
 * a newly installed service worker immediately.
 **********************************************************/

self.addEventListener("message", (event) => {
  if (event.data && event.data.action === "skipWaiting") {
    console.log("[Service Worker] skipWaiting requested.");

    self.skipWaiting();
  }
});
