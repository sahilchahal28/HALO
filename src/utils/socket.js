import { io } from 'socket.io-client';

/**
 * Real-time sync socket.
 * - Dev: same-origin (Vite proxies /socket.io with ws:true)
 * - Production (Vercel): connects directly to the Railway backend because
 *   Vercel rewrites do not support WebSocket upgrades.
 */
const BACKEND_URL = 'https://halo-production-3fe5.up.railway.app';

export function createSocket(token) {
  const isProd = typeof window !== 'undefined' && window.location.hostname.endsWith('.vercel.app');
  return io(isProd ? BACKEND_URL : window.location.origin, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 10000,
  });
}
