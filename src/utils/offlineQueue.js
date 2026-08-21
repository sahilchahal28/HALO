/**
 * Offline mutation queue.
 * Failed non-GET requests (network errors only) are stored and replayed
 * automatically when connectivity returns. Auth endpoints are never queued.
 */

const QUEUE_KEY = 'halo_offline_queue';
const MAX_QUEUE = 50;

function load() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch (_) {
    return [];
  }
}

function save(items) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUE)));
  } catch (_) {}
}

export function enqueueMutation({ endpoint, method, body }) {
  const items = load();
  items.push({ endpoint, method, body, queuedAt: Date.now() });
  save(items);
  console.log(`[HALO] Queued offline mutation: ${method} ${endpoint} (${items.length} pending)`);
}

export function queueSize() {
  return load().length;
}

export async function flushQueue(requestFn) {
  const items = load();
  if (!items.length) return 0;

  const remaining = [];
  let flushed = 0;

  for (const item of items) {
    try {
      await requestFn(item.endpoint, { method: item.method, body: item.body });
      flushed++;
    } catch (err) {
      // Only keep items that failed due to network; drop ones the server rejected
      if (err && err.isNetworkError) {
        remaining.push(item);
      } else {
        console.warn(`[HALO] Dropped rejected offline mutation ${item.method} ${item.endpoint}:`, err.message);
      }
    }
  }

  save(remaining);
  return flushed;
}
