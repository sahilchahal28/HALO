import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Self-healing Service Worker guard: If the proxy/tunnel server is offline,
// unregister the Service Worker immediately to prevent cached workers from blocking
// client-side failover routing directly to the backend.
;(async function selfHealServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const res = await fetch('/api/server-info');
    if (!res.ok) throw new Error();
  } catch (_) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
      console.log('⚠️ Proxy offline. Unregistered Service Worker to allow direct backend failover.');
    } catch (e) {
      console.error('Failed to unregister SW:', e);
    }
  }
})();

// Auto-discover and save the HALO server IP on every load
// This ensures tunnel-installed PWAs can reach the backend after tunnel dies
;(async function discoverServerIp() {
  try {
    const h = window.location.hostname;
    // On localhost, Vite proxy handles everything — no need to save
    if (h === 'localhost' || h === '127.0.0.1') return;

    // If hostname looks like an IP address (any range), save it directly
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
      localStorage.setItem('halo_server_ip', h);
      return;
    }

    // On a tunnel domain — ask the server for its LAN IP
    const res = await fetch('/api/server-info');
    if (res.ok) {
      const data = await res.json();
      if (data.lanIp) localStorage.setItem('halo_server_ip', data.lanIp);
    }
  } catch (_) {}
})()

// Check for over-the-air updates from the LAN development server
async function checkForLanUpdates() {
  try {
    // Only check for LAN updates when running as an installed PWA in standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (!isStandalone) return;

    const savedIp = localStorage.getItem('halo_server_ip');
    if (!savedIp) return;

    const res = await fetch(`http://${savedIp}:5179/api/latest-assets`);
    if (!res.ok) return;

    const { assets } = await res.json();
    if (!assets || !assets.length) return;

    const cache = await caches.open('halo-cache-v6');

    // Find the current active index.js hash from the new assets list
    const newIndexJs = assets.find(a => a.startsWith('/assets/index-') && a.endsWith('.js'));
    if (!newIndexJs) return;

    // Check if the new index.js is already in our cache
    const cachedResponse = await cache.match(newIndexJs);
    if (!cachedResponse) {
      console.log('[HALO] New version detected on LAN! Fetching updates...');

      // Get all keys in cache to delete outdated assets later
      const cachedKeys = await cache.keys();

      // Download all new assets and save them in the CacheStorage under their same-origin URLs
      const downloadPromises = assets.map(async (asset) => {
        try {
          const response = await fetch(`http://${savedIp}:5179${asset}`);
          if (response.ok) {
            // Map the relative path asset to the same-origin URL (e.g. https://<subdomain>.localhost.run/assets/...)
            const requestUrl = new URL(asset, window.location.origin).toString();
            await cache.put(requestUrl, response);
          }
        } catch (e) {
          console.error(`[HALO] Failed to pre-fetch asset ${asset}:`, e);
        }
      });

      await Promise.all(downloadPromises);

      // Clean up old assets (like old index-XXX.js / index-XXX.css)
      const newAssetUrls = assets.map(a => new URL(a, window.location.origin).toString());
      for (const request of cachedKeys) {
        const url = request.url;
        // Don't delete sw.js or other non-hashed static files, only delete outdated assets not in the new list
        if (url.includes('/assets/') && !newAssetUrls.includes(url)) {
          await cache.delete(request);
          console.log('[HALO] Deleted obsolete asset from cache:', url);
        }
      }

      console.log('[HALO] LAN OTA update applied successfully! Reloading...');
      window.location.reload();
    }
  } catch (err) {
    // Fail silently when server is down or not on same Wi-Fi
  }
}

// Check for updates on startup, every 20 seconds, and when tab focus returns
setTimeout(checkForLanUpdates, 1500);
setInterval(checkForLanUpdates, 20000);

// Register and Auto-Update PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('HALO PWA Service Worker Registered:', reg.scope);

        // 1. Check for updates on startup
        reg.update();

        // 2. Check for updates periodically (every 45s)
        setInterval(() => {
          reg.update();
        }, 45000);

        // 3. Listen for new service worker installation
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New update ready -> trigger instant activation
                newWorker.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          }
        });
      })
      .catch((err) => console.error('HALO SW Registration failed:', err));

    // 4. Reload the page seamlessly when a new version takes control
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    // 5. Check for updates when the user switches back to the app
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker.ready.then((reg) => reg.update()).catch(() => {});
      }
    });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
