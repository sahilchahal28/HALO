import { runRetentionDeletionWorker } from './documentService.js';

let intervalId = null;

/**
 * Initializes the background scheduled retention deletion worker.
 * Runs once every 24 hours to automatically purge eligible reports and tests older than 6 months.
 */
export function startRetentionWorker(intervalMs = 24 * 60 * 60 * 1000) {
  if (intervalId) return;

  console.log('[Retention Worker] Initialized. Scanning schedule: every 24 hours.');

  // Run initial check 30 seconds after server start
  setTimeout(async () => {
    try {
      const summary = await runRetentionDeletionWorker();
      if (summary.purged > 0 || summary.failed > 0) {
        console.log('[Retention Worker] Initial run summary:', summary);
      }
    } catch (err) {
      console.warn('[Retention Worker] Startup pass warning:', err.message);
    }
  }, 30000);

  // Periodic scheduled pass
  intervalId = setInterval(async () => {
    try {
      const summary = await runRetentionDeletionWorker();
      if (summary.purged > 0 || summary.failed > 0) {
        console.log('[Retention Worker] Scheduled run summary:', summary);
      }
    } catch (err) {
      console.error('[Retention Worker] Scheduled pass error:', err.message);
    }
  }, intervalMs);
}

export function stopRetentionWorker() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
