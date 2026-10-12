import { enqueueMutation } from './offlineQueue';

/**
 * API utility for HALO.
 *
 * Strategy: Support both same-origin /api (dev proxy / production) AND a
 * configurable server URL stored in localStorage as `halo_server_url`.
 *
 * The `halo_server_url` override is used when the PWA is installed on a
 * device (phone/tablet) that accesses a LOCAL machine running the HALO
 * Node server. Users set the server URL once via the PWA settings screen.
 *
 * Priority:
 *  1. If `halo_server_url` is set in localStorage → use that origin for all
 *     API calls (e.g. http://192.168.1.5:5001)
 *  2. Otherwise → fall back to same-origin `/api` (dev proxy / production)
 *  3. Auto-detect LAN IP via /api/server-info when on same network
 */

export const SERVER_URL_KEY = 'halo_server_url';
const TOKEN_KEY = 'halo_token';

function isPageHttps() {
  try {
    return typeof window !== 'undefined' && window.location.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

// Browsers permanently block http:// API calls from an https:// page (mixed
// content) — except loopback hosts, which are treated as secure contexts.
function isBlockedMixedContent(url) {
  if (!isPageHttps()) return false;
  if (!/^http:\/\//i.test(url)) return false;
  return !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(url);
}

// Normalize a user-supplied server base into an absolute http(s) URL.
// Returns '' when the value can never work in this browser context (e.g. an
// old http:// LAN IP saved while the PWA is now served over https) so the
// caller falls back to same-origin instead of hard-failing every request.
function sanitizeApiBase(raw) {
  const clean = String(raw || '').trim().replace(/\/$/, '');
  if (!clean) return '';
  // Bare host/IP without a scheme (e.g. "192.168.1.15:5001") — assume http.
  const withScheme = /^https?:\/\//i.test(clean) ? clean : `http://${clean}`;
  if (isBlockedMixedContent(withScheme)) return '';
  return withScheme;
}

// Cache for auto-detected LAN base to avoid repeated probes
let lanBaseCache = null;
let lanBaseCacheTime = 0;
const LAN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Synchronous getter for cached LAN base (used by getApiBase)
function getCachedLanBase() {
  if (lanBaseCache && Date.now() - lanBaseCacheTime < LAN_CACHE_TTL) {
    return lanBaseCache;
  }
  return null;
}

// Background probe for LAN base — runs async, updates cache
async function probeLanBase() {
  if (typeof window === 'undefined') return;
  // Only probe when on https (Vercel) - on http we're already direct
  if (!isPageHttps()) return;
  try {
    const res = await fetch('/api/server-info', { credentials: 'same-origin' });
    if (res.ok) {
      const data = await res.json();
      if (data.lanIp) {
        const base = `http://${data.lanIp}:5001`;
        lanBaseCache = base;
        lanBaseCacheTime = Date.now();
      }
    }
  } catch (_) {}
}

// Kick off background probe on module load
if (typeof window !== 'undefined') {
  probeLanBase();
  // Re-probe periodically
  setInterval(probeLanBase, LAN_CACHE_TTL);
}

let refreshingPromise = null;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.isNetworkError = status === undefined;
  }
}

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (_) {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (_) {}
}

/**
 * Return the base URL for API calls.
 * If halo_server_url is set (e.g. "http://192.168.1.10:5001"), use that.
 * Otherwise use same-origin (relative path "/api...").
 */
export function getApiBase() {
  if (typeof window !== 'undefined') {
    try {
      // 1. Check if ?server= was provided in the URL query string
      const searchParams = new URLSearchParams(window.location.search);
      const serverParam = searchParams.get('server');
      if (serverParam) {
        // Clean param from address bar without reloading
        searchParams.delete('server');
        const newSearch = searchParams.toString();
        const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
        window.history.replaceState({}, document.title, newUrl);
        const clean = sanitizeApiBase(serverParam);
        if (clean) {
          localStorage.setItem(SERVER_URL_KEY, clean);
          return clean;
        }
        // A ?server= value that can never work (e.g. http:// from an
        // https:// page) is ignored — and any stale stored base is dropped
        // so the app falls back to same-origin instead of hard-failing.
        localStorage.removeItem(SERVER_URL_KEY);
        return '';
      }
    } catch (_) {}

    // 2. Check saved localStorage override
    try {
      const stored = localStorage.getItem(SERVER_URL_KEY);
      if (stored) {
        const clean = sanitizeApiBase(stored);
        if (clean) return clean;
        // Stale override (e.g. an old http:// LAN IP saved while the PWA is
        // now served over https) — drop it and use same-origin.
        localStorage.removeItem(SERVER_URL_KEY);
      }
    } catch (_) {}

    // 3. Auto-detected LAN IP (cached) — allows direct Mac connection
    //    when phone is on same Wi-Fi, bypassing the flaky tunnel.
    const lanBase = getCachedLanBase();
    if (lanBase) return lanBase;
  }
  // Same-origin fallback (dev vite proxy / production Express)
  return '';
}

/** Persist a server URL override (e.g. "http://192.168.1.10:5001") */
export function setServerUrl(url) {
  try {
    if (url) {
      const clean = sanitizeApiBase(url);
      if (clean) localStorage.setItem(SERVER_URL_KEY, clean);
      else localStorage.removeItem(SERVER_URL_KEY);
    }
    else localStorage.removeItem(SERVER_URL_KEY);
  } catch (_) {}
}

/** Clear the server URL override (revert to same-origin) */
export function clearServerUrl() {
  try {
    localStorage.removeItem(SERVER_URL_KEY);
  } catch (_) {}
}

async function refreshSession() {
  if (!refreshingPromise) {
    refreshingPromise = (async () => {
      const base = getApiBase();
      let lastError = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(`${base}/api/auth/refresh`, {
            method: 'POST',
            credentials: base ? 'include' : 'same-origin',
          });
          if (res.ok) {
            const data = await res.json();
            if (data.token) setToken(data.token);
            return data;
          }
          // 503 = tunnel temporarily unavailable; treat as network error, retry
          if (res.status === 503) {
            lastError = new ApiError('Tunnel unavailable', 503);
            await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
            continue;
          }
          // 401 = session truly expired; don't retry
          if (res.status === 401) return null;
          lastError = new ApiError(`Refresh failed (${res.status})`, res.status);
        } catch (e) {
          lastError = e instanceof ApiError ? e : new ApiError(e.message, undefined);
        }
      }
      return null;
    })().finally(() => {
      refreshingPromise = null;
    });
  }
  return refreshingPromise;
}

async function rawRequest(endpoint, options = {}, isRetry = false) {
  const token = getToken();
  const base = getApiBase();

  const headers = {
    'bypass-tunnel-reminder': 'true',
    'ngrok-skip-browser-warning': 'true',
    ...(options.body && !(options.body instanceof FormData) && { 'Content-Type': 'application/json' }),
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  // Serialize object bodies for fetch
  let body = options.body;
  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    body = JSON.stringify(body);
  }

  // When using a custom server URL we use credentials: 'include' (cross-origin cookies);
  // when same-origin we keep 'same-origin'.
  const credentials = base ? 'include' : 'same-origin';

  let response;
  try {
    response = await fetch(`${base}/api${endpoint}`, {
      ...options,
      body,
      headers,
      credentials,
    });
  } catch (_) {
    throw new ApiError(
      `Network error: Unable to reach the HALO server at ${base || 'same-origin'}. Make sure the backend server is running, then check Host Server Settings (Reset Default uses the built-in connection).`,
      undefined
    );
  }

  if (response.status === 204) return null;

  if (response.status === 401 && !isRetry && !endpoint.startsWith('/auth/')) {
    // Access token expired → silent refresh once, then retry
    const session = await refreshSession();
    if (session && session.token) {
      return rawRequest(endpoint, options, true);
    }
  }

  if (response.ok) {
    return response.json();
  }

  let errorMessage = `API request failed (${response.status})`;
  try {
    const errData = await response.json();
    errorMessage = errData.message || errorMessage;
  } catch (_) {}
  throw new ApiError(errorMessage, response.status);
}

async function request(endpoint, options = {}) {
  try {
    return await rawRequest(endpoint, options);
  } catch (err) {
    // Queue failed mutations for offline replay (never queue auth or FormData — can't serialize)
    if (
      err.isNetworkError &&
      options.method &&
      options.method !== 'GET' &&
      !endpoint.startsWith('/auth/') &&
      !(options.body instanceof FormData)
    ) {
      enqueueMutation({ endpoint, method: options.method, body: options.body });
    }
    throw err;
  }
}

/**
 * Build absolute download/view URL for a document file.
 * Prepends the configured server base URL if relative.
 */
export function getFileUrl(downloadUrl) {
  if (!downloadUrl) return '';
  const base = getApiBase();
  const url = downloadUrl.startsWith('http://') || downloadUrl.startsWith('https://') 
    ? downloadUrl 
    : `${base}${downloadUrl}`;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}bypass-tunnel-reminder=true`;
}

export const api = {
  get: (endpoint, headers = {}) => request(endpoint, { method: 'GET', headers }),
  post: (endpoint, body, headers = {}) => request(endpoint, { method: 'POST', body, headers }),
  put: (endpoint, body, headers = {}) => request(endpoint, { method: 'PUT', body, headers }),
  patch: (endpoint, body, headers = {}) => request(endpoint, { method: 'PATCH', body, headers }),
  delete: (endpoint, headers = {}) => request(endpoint, { method: 'DELETE', headers }),
  refreshSession,
  getFileUrl,
};
