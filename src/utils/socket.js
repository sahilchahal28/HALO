import { io } from 'socket.io-client';

/**
 * Real-time sync socket.
 * - Dev: same-origin (Vite proxies /socket.io with ws:true)
 * - Production (Vercel): connects directly to the Railway backend because
 *   Vercel rewrites do not support WebSocket upgrades.
 */
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://halo-production-34b4.up.railway.app';

export function createSocket(token) {
  const isProd = typeof window !== 'undefined' && window.location.hostname.endsWith('.vercel.app');
  return io(isProd ? BACKEND_URL : window.location.origin, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 10000,
  });
}
