const CACHE_NAME = "k5tech-dtr-v16";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./toc.html",
  "./manifest-toc.json",
  "./K5Tech_Icon_192.png",
  "./K5Tech_Icon_512.png",
];

/**********************************************************
 * INSTALL
 **********************************************************/

self.addEventListener("install", (event) => {
  console.log("[Service Worker] Installing:", CACHE_NAME);

  /*
   * Activate the new service worker immediately.
   */
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
   * Service worker only handles GET requests.
   */

  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);

  /********************************************************
   * API REQUESTS
   *
   * NEVER CACHE API DATA.
   *
   * This includes:
   *
   * ?action=getCutoffPeriod
   * ?action=getDashboardAttendance
   * ?action=reverseGeocode
   *
   * etc.
   ********************************************************/

  const isApiRequest = url.searchParams.has("action");

  if (isApiRequest) {
    event.respondWith(
      fetch(event.request, {
        cache: "no-store",
      }),
    );

    return;
  }

  /********************************************************
   * HTML / NAVIGATION
   *
   * STALE-WHILE-REVALIDATE
   *
   * 1. Return the cached page immediately.
   * 2. Fetch a fresh copy in the background.
   * 3. Update the cache for the next visit.
   *
   * NOTE: This app now ships two HTML "shells" —
   * index.html (employee app) and toc.html (TOC kiosk).
   * The cache key below is derived from the actual
   * requested file, not hardcoded to index.html, so each
   * page is cached/updated independently. A request for
   * the site root ("/") still falls back to index.html,
   * matching the default start_url behavior.
   ********************************************************/

  if (event.request.mode === "navigate" || url.pathname.endsWith(".html")) {
    const navigationRequest = event.request;

    const fileMatch = url.pathname.match(/\/([^/]+\.html)$/);

    const cacheKey = fileMatch ? "./" + fileMatch[1] : "./index.html";

    event.respondWith(
      caches.match(cacheKey).then((cachedResponse) => {
        /*
         * ------------------------------------------------
         * Background network update
         * ------------------------------------------------
         */

        const networkFetch = fetch(navigationRequest)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();

              /*
               * Store the fresh app shell.
               */

              event.waitUntil(
                caches.open(CACHE_NAME).then((cache) => {
                  return cache.put(cacheKey, responseToCache);
                }),
              );
            }

            return networkResponse;
          })
          .catch(() => {
            /*
             * Network unavailable.
             *
             * If cachedResponse exists,
             * it will still be returned.
             */

            return null;
          });

        /*
         * ------------------------------------------------
         * FAST PATH
         * ------------------------------------------------
         *
         * Cached app shell exists:
         * return it immediately.
         */

        if (cachedResponse) {
          return cachedResponse;
        }

        /*
         * ------------------------------------------------
         * FIRST VISIT
         * ------------------------------------------------
         *
         * No cached app shell yet.
         * We must wait for the network.
         */

        return networkFetch;
      }),
    );

    return;
  }

  /********************************************************
   * STATIC ASSETS
   *
   * CACHE FIRST
   *
   * Used for:
   *
   * - Icons
   * - Manifest
   * - CSS
   * - JS
   * - Other static resources
   ********************************************************/

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      /*
       * Cached asset available.
       */

      if (cachedResponse) {
        return cachedResponse;
      }

      /*
       * Not cached.
       * Get it from network.
       */

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

        /*
         * Save the newly discovered
         * static asset for future visits.
         */

        event.waitUntil(
          caches.open(CACHE_NAME).then((cache) => {
            return cache.put(event.request, responseToCache);
          }),
        );

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
