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
 */

export const SERVER_URL_KEY = 'halo_server_url';
const TOKEN_KEY = 'halo_token';

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
        const clean = serverParam.trim().replace(/\/$/, '');
        localStorage.setItem(SERVER_URL_KEY, clean);
        // Clean param from address bar without reloading
        searchParams.delete('server');
        const newSearch = searchParams.toString();
        const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
        window.history.replaceState({}, document.title, newUrl);
        return clean;
      }
    } catch (_) {}

    // 2. Check saved localStorage override
    try {
      const stored = localStorage.getItem(SERVER_URL_KEY);
      if (stored) {
        return stored.replace(/\/$/, '');
      }
    } catch (_) {}
  }
  // Same-origin fallback (dev vite proxy or production Express)
  return '';
}

/** Persist a server URL override (e.g. "http://192.168.1.10:5001") */
export function setServerUrl(url) {
  try {
    if (url) localStorage.setItem(SERVER_URL_KEY, url.trim().replace(/\/$/, ''));
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
      const res = await fetch(`${base}/api/auth/refresh`, {
        method: 'POST',
        credentials: base ? 'include' : 'same-origin',
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.token) setToken(data.token);
      return data;
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
      'Network error: Unable to reach the HALO server. Make sure the backend server is running and the server URL is correctly configured in Settings.',
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
