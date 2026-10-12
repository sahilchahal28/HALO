const CACHE_NAME = 'halo-cache-v11';
const API_CACHE_NAME = 'halo-api-cache-v5';

// Precache only the app shell. Hashed /assets/* files are content-hashed and
// cached stale-while-revalidate on first use — no build-time injection needed.
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/manifest-patient.json',
  '/manifest-doctor.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png'
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
          .filter((key) => key !== CACHE_NAME && key !== API_CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Minimal offline fallback page when even the cached shell is unavailable
function offlineResponse() {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>HALO • Offline</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a0a0c;color:#f5f5f5;font-family:system-ui,sans-serif;text-align:center}div{padding:2rem}h1{font-size:1.1rem;font-weight:600;margin:0 0 .5rem}p{font-size:.8rem;color:#9ca3af;margin:0}</style></head><body><div><h1>HALO is offline</h1><p>Reconnect to the internet and try again.</p></div></body></html>`,
    { status: 503, headers: { 'Content-Type': 'text/html' } }
  );
}

// Fetch Event
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Only handle same-origin GET requests
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

  // API requests: Network-first with cache fallback so the app shows data offline.
  // Non-GET mutations pass straight through (queued client-side on failure).
  if (requestUrl.pathname.startsWith('/api/')) {
    if (event.request.headers.get('accept')?.includes('text/event-stream')) {
      return;
    }
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(API_CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          return new Response(
            JSON.stringify({ message: 'Offline: no cached data for this request.' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
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
          throw new Error('Navigation response status: ' + (response ? response.status : 'unknown'));
        })
        .catch(async () => {
          const cached = await caches.match('/index.html');
          if (cached) return cached;
          const rootCached = await caches.match('/');
          if (rootCached) return rootCached;
          return offlineResponse();
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
        if (cached) {
          return cached;
        }
        return response;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
