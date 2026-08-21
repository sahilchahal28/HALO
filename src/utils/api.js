import { enqueueMutation } from './offlineQueue';

/**
 * API utility for HALO.
 *
 * Strategy: ALWAYS use same-origin `/api`.
 * - Dev (vite): proxied to the backend by vite.config.js
 * - Production: Express serves dist/ and /api from one origin
 *
 * Same-origin is required for the httpOnly refresh cookie to work, so there
 * are deliberately NO cross-origin / raw-IP fallback paths anymore.
 */

const STORAGE_KEY = 'halo_token';

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
    return localStorage.getItem(STORAGE_KEY);
  } catch (_) {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch (_) {}
}

async function refreshSession() {
  // Coalesce concurrent refresh attempts into one request
  if (!refreshingPromise) {
    refreshingPromise = (async () => {
      const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
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

  const headers = {
    ...(options.body && { 'Content-Type': 'application/json' }),
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  // Serialize object bodies for fetch
  let body = options.body;
  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`/api${endpoint}`, {
      ...options,
      body,
      headers,
      credentials: 'same-origin',
    });
  } catch (_) {
    throw new ApiError(
      'Network error: Unable to reach the HALO server. Make sure the backend server is running.',
      undefined
    );
  }

  if (response.status === 204) return null;

  if (response.status === 401 && !isRetry && !endpoint.startsWith('/auth/')) {
    // Access token expired -> silent refresh once, then retry the original request
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
    // Queue failed mutations for replay when back online (never queue auth)
    if (
      err.isNetworkError &&
      options.method &&
      options.method !== 'GET' &&
      !endpoint.startsWith('/auth/')
    ) {
      enqueueMutation({ endpoint, method: options.method, body: options.body });
    }
    throw err;
  }
}

export const api = {
  get: (endpoint, headers = {}) => request(endpoint, { method: 'GET', headers }),
  post: (endpoint, body, headers = {}) => request(endpoint, { method: 'POST', body, headers }),
  put: (endpoint, body, headers = {}) => request(endpoint, { method: 'PUT', body, headers }),
  delete: (endpoint, headers = {}) => request(endpoint, { method: 'DELETE', headers }),
  refreshSession,
};
