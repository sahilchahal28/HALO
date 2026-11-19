import express from 'express';
import VaultNode from '../models/VaultNode.js';

const router = express.Router();

/**
 * GET /api/vault/status
 * Public endpoint to check whether the host Mac disk storage vault is online via tunnel.
 */
router.get('/status', async (req, res) => {
  try {
    const isLocalMacServer = !process.env.RAILWAY_ENVIRONMENT && !process.env.RAILWAY_STATIC_URL;
    const node = await VaultNode.findOne({ nodeId: 'mac-primary' });

    const HEARTBEAT_TIMEOUT_MS = 45000; // 45 seconds
    const timeSinceHeartbeat = node?.lastHeartbeat ? (Date.now() - new Date(node.lastHeartbeat).getTime()) : Infinity;
    
    // Explicitly stopped vaults must ALWAYS report offline
    const isExplicitlyOffline = node && node.status === 'OFFLINE';
    const isOnline = !isExplicitlyOffline && (
      (isLocalMacServer && (!node || node.status === 'ONLINE')) ||
      (node && node.status === 'ONLINE' && timeSinceHeartbeat < HEARTBEAT_TIMEOUT_MS)
    );
    const hasValidTunnel = !isExplicitlyOffline && Boolean(node && node.tunnelUrl && timeSinceHeartbeat < HEARTBEAT_TIMEOUT_MS);

    return res.json({
      online: Boolean(isOnline),
      tunnelUrl: hasValidTunnel ? node.tunnelUrl : null,
      lanUrl: node?.lanUrl || null,
      localUrl: node?.localUrl || 'http://127.0.0.1:5001',
      storageProvider: node?.storageProvider || 'Mac Disk Space (server/storage/users/records)',
      lastHeartbeat: node?.lastHeartbeat || new Date(),
      message: isOnline
        ? 'Mac Device Storage is online and ready for document archiving.'
        : 'Mac Device Storage is offline. Run "npm run vault:start" (or "npm run storage:on") on your Mac terminal to connect disk storage.',
    });
  } catch (err) {
    console.error('[Vault Status] Error:', err.message);
    return res.status(500).json({ online: false, error: 'Failed to retrieve vault status' });
  }
});

/**
 * POST /api/vault/heartbeat
 * Heartbeat pulse sent by server/scripts/tunnel.js or vault-control.js to maintain the active tunnel URL.
 */
router.post('/heartbeat', async (req, res) => {
  try {
    const { status = 'ONLINE', tunnelUrl = null, lanUrl = '', localUrl = '' } = req.body;

    const updateData = {
      status,
      lastHeartbeat: new Date(),
    };
    if (status === 'OFFLINE') {
      updateData.tunnelUrl = null;
    } else if (tunnelUrl !== undefined) {
      updateData.tunnelUrl = tunnelUrl || null;
    }
    if (lanUrl) updateData.lanUrl = lanUrl;
    if (localUrl) updateData.localUrl = localUrl;

    const node = await VaultNode.findOneAndUpdate(
      { nodeId: 'mac-primary' },
      { $set: updateData },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({ success: true, status: node.status, lastHeartbeat: node.lastHeartbeat });
  } catch (err) {
    console.error('[Vault Heartbeat] Error:', err.message);
    return res.status(500).json({ error: 'Failed to record vault heartbeat' });
  }
});

export default router;

