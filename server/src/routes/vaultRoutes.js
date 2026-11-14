import express from 'express';
import VaultNode from '../models/VaultNode.js';

const router = express.Router();

/**
 * GET /api/vault/status
 * Public endpoint to check whether the host Mac disk storage vault is online via tunnel.
 */
router.get('/status', async (req, res) => {
  try {
    const node = await VaultNode.findOne({ nodeId: 'mac-primary' });
    if (!node) {
      return res.json({
        online: false,
        tunnelUrl: null,
        message: 'Mac Device Storage is offline. Run "npm run tunnel" on your Mac terminal to connect disk storage.',
      });
    }

    const HEARTBEAT_TIMEOUT_MS = 45000; // 45 seconds
    const timeSinceHeartbeat = Date.now() - new Date(node.lastHeartbeat).getTime();
    const isOnline = node.status === 'ONLINE' && timeSinceHeartbeat < HEARTBEAT_TIMEOUT_MS && Boolean(node.tunnelUrl);

    return res.json({
      online: isOnline,
      tunnelUrl: isOnline ? node.tunnelUrl : null,
      lanUrl: isOnline ? node.lanUrl : null,
      localUrl: node.localUrl || 'http://127.0.0.1:5001',
      storageProvider: node.storageProvider || 'Mac Disk Space (server/storage/users/records)',
      lastHeartbeat: node.lastHeartbeat,
      message: isOnline
        ? 'Mac Device Storage is online and ready for document archiving.'
        : 'Mac Device Storage is offline. Run "npm run tunnel" on your Mac terminal to connect disk storage.',
    });
  } catch (err) {
    console.error('[Vault Status] Error:', err.message);
    return res.status(500).json({ online: false, error: 'Failed to retrieve vault status' });
  }
});

/**
 * POST /api/vault/heartbeat
 * Heartbeat pulse sent by server/scripts/tunnel.js to maintain the active tunnel URL.
 */
router.post('/heartbeat', async (req, res) => {
  try {
    const { status = 'ONLINE', tunnelUrl = '', lanUrl = '', localUrl = '' } = req.body;

    const updateData = {
      status,
      lastHeartbeat: new Date(),
    };
    if (tunnelUrl) updateData.tunnelUrl = tunnelUrl;
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

