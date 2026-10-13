import { io } from 'socket.io-client';
import { getApiBase } from './api';

/**
 * Real-time sync socket.
 * - Prioritizes custom server URL from getApiBase() if configured
 * - Dev: same-origin (Vite proxies /socket.io with ws:true)
 * - Production (Vercel): connects directly to the Railway backend because
 *   Vercel rewrites do not support WebSocket upgrades.
 */
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://halo-production-34b4.up.railway.app';

export function createSocket(token) {
  const isProd = typeof window !== 'undefined' && window.location.hostname.endsWith('.vercel.app');
  const base = getApiBase();
  const socketUrl = base || (isProd ? BACKEND_URL : (typeof window !== 'undefined' ? window.location.origin : ''));

  return io(socketUrl, {
    auth: (cb) => {
      let freshToken = token;
      try {
        freshToken = localStorage.getItem('halo_token') || token;
      } catch (_) {}
      cb({ token: freshToken });
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });
}

