/**
 * API utility for HALO.
 *
 * Strategy: Always use the saved server IP if available.
 * The server IP is saved to localStorage on first contact (via downloader or main app).
 * This makes the PWA work regardless of whether it was installed via tunnel or LAN.
 */

const STORAGE_KEY = 'halo_server_ip';
const API_PORT = 5001;

function getBaseUrl() {
  if (typeof window === 'undefined') return '/api';

  const { hostname, protocol } = window.location;

  // On localhost → use Vite dev proxy
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return '/api';
  }

  // If we are browsing over HTTPS (secure tunnel or production), we must use
  // same-origin /api to avoid Mixed Content blockage.
  if (protocol === 'https:') {
    return '/api';
  }

  // If the current hostname is an IP address, use it directly (prevents stale storage IP clashes)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return `http://${hostname}:${API_PORT}/api`;
  }

  // Check for a saved server IP (set during installation or on first LAN access)
  const savedIp = localStorage.getItem(STORAGE_KEY);
  if (savedIp) {
    return `http://${savedIp}:${API_PORT}/api`;
  }

  // No saved IP — try same-host on API port (works when browsing via LAN IP directly)
  return `http://${hostname}:${API_PORT}/api`;
}

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('halo_token');

  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const config = {
    ...options,
    headers,
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  let response;
  try {
    response = await fetch(url, config);
  } catch (networkErr) {
    // If same-origin /api fails (e.g. downloader proxy is closed), attempt to connect
    // directly to the local backend server on port 5001 or the saved LAN IP.
    if (baseUrl === '/api') {
      const savedIp = localStorage.getItem(STORAGE_KEY);
      const fallbackHost = savedIp ? `${savedIp}:${API_PORT}` : `127.0.0.1:${API_PORT}`;
      const fallbackUrl = `http://${fallbackHost}/api${endpoint}`;
      try {
        console.log(`[API Fallback] Proxy offline. Retrying directly on: ${fallbackUrl}`);
        response = await fetch(fallbackUrl, config);
      } catch (fallbackErr) {
        throw new Error(
          'Network error: Unable to reach the HALO server. Make sure the backend server is running (npm run host).'
        );
      }
    } else {
      throw new Error(
        'Network error: Unable to reach the HALO server. Make sure you are on the same Wi-Fi and the server is running (npm run host).'
      );
    }
  }

  if (response.status === 204) return null;

  if (response.ok) {
    return response.json();
  }

  let errorMessage = `API request failed (${response.status})`;
  try {
    const errData = await response.json();
    errorMessage = errData.message || errorMessage;
  } catch (_) {}
  throw new Error(errorMessage);
}

export const api = {
  get: (endpoint, headers = {}) => request(endpoint, { method: 'GET', headers }),
  post: (endpoint, body, headers = {}) => request(endpoint, { method: 'POST', body, headers }),
  put: (endpoint, body, headers = {}) => request(endpoint, { method: 'PUT', body, headers }),
  delete: (endpoint, headers = {}) => request(endpoint, { method: 'DELETE', headers }),
};
