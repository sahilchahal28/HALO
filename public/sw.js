const CACHE_NAME = 'halo-cache-v6';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/manifest-patient.json',
  '/manifest-doctor.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/downloader.html'
];

// Handle Skip Waiting message from client for instant updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Install Event - Pre-cache shell assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return Promise.allSettled(
          STATIC_ASSETS.map(url => 
            fetch(url).then(res => {
              if (res && res.status === 200) return cache.put(url, res);
            }).catch(() => {})
          )
        );
      })
  );
});

// Activate Event - Clean old caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Only handle same-origin GET requests
  // Cross-origin API calls (e.g. http://192.168.x.x:5001/api/...) must NOT be intercepted
  if (
    event.request.method !== 'GET' ||
    (requestUrl.protocol !== 'http:' && requestUrl.protocol !== 'https:') ||
    requestUrl.origin !== self.location.origin
  ) {
    return;
  }

  // Bypass service worker for development HMR modules
  if (
    requestUrl.pathname.startsWith('/src/') ||
    requestUrl.pathname.startsWith('/node_modules/') ||
    requestUrl.pathname.includes('/@') ||
    requestUrl.pathname.includes('vite') ||
    requestUrl.search.includes('t=')
  ) {
    return;
  }

  // Bypass service worker entirely for API requests so that client-side
  // error handling and port fallback/routing logic take effect directly.
  if (requestUrl.pathname.startsWith('/api/')) {
    return;
  }

  // Navigation requests: Network First (always get latest online, fallback to cache offline)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
            return response;
          }
          // If status is not 200 (e.g. 502/503/504 gateway error from tunnel), throw to trigger catch and fallback to cache
          throw new Error('Navigation response status: ' + (response ? response.status : 'unknown'));
        })
        .catch(() => {
          return caches.match('/index.html')
            .then((cachedResponse) => {
              if (cachedResponse) return cachedResponse;
              return caches.match('/');
            });
        })
    );
    return;
  }

  // Static Assets (JS, CSS, Images): Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        }
        // If the fetch returned a non-200 (like 502/503 tunnel error), return cached version if we have it
        if (cached) {
          return cached;
        }
        return response;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
