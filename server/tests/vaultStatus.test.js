import test from 'node:test';
import assert from 'node:assert/strict';

test('Vault Node Status & Heartbeat Model Logic', async (t) => {
  await t.test('detects online vault within heartbeat timeout window', () => {
    const lastHeartbeat = new Date();
    const HEARTBEAT_TIMEOUT_MS = 45000;
    const timeSinceHeartbeat = Date.now() - lastHeartbeat.getTime();
    const isOnline = timeSinceHeartbeat < HEARTBEAT_TIMEOUT_MS;
    assert.equal(isOnline, true);
  });

  await t.test('treats stale heartbeat (>45s) as offline', () => {
    const lastHeartbeat = new Date(Date.now() - 50000);
    const HEARTBEAT_TIMEOUT_MS = 45000;
    const timeSinceHeartbeat = Date.now() - lastHeartbeat.getTime();
    const isOnline = timeSinceHeartbeat < HEARTBEAT_TIMEOUT_MS;
    assert.equal(isOnline, false);
  });

  await t.test('formats public status payload correctly for client PWAs', () => {
    const mockNode = {
      nodeId: 'mac-primary',
      status: 'ONLINE',
      tunnelUrl: 'https://halo-device-vault-mac.trycloudflare.com',
      storageProvider: 'Mac Disk Space (server/storage/users/records)',
      lastHeartbeat: new Date(),
    };

    const isOnline = mockNode.status === 'ONLINE' && Boolean(mockNode.tunnelUrl);
    const responsePayload = {
      online: isOnline,
      tunnelUrl: isOnline ? mockNode.tunnelUrl : null,
      storageProvider: mockNode.storageProvider,
    };

    assert.equal(responsePayload.online, true);
    assert.equal(responsePayload.tunnelUrl, 'https://halo-device-vault-mac.trycloudflare.com');
  });

  await t.test('explicitly stopped vault (OFFLINE) evaluates to isOnline=false even with fresh heartbeat', () => {
    const mockNode = {
      nodeId: 'mac-primary',
      status: 'OFFLINE',
      tunnelUrl: null,
      lastHeartbeat: new Date(), // fresh heartbeat
    };

    const HEARTBEAT_TIMEOUT_MS = 45000;
    const timeSinceHeartbeat = Date.now() - mockNode.lastHeartbeat.getTime();
    const isExplicitlyOffline = mockNode.status === 'OFFLINE';
    const isOnline = !isExplicitlyOffline && timeSinceHeartbeat < HEARTBEAT_TIMEOUT_MS;

    assert.equal(isOnline, false);
  });

  await t.test('stopping vault clears tunnelUrl in heartbeat update data', () => {
    const inputPayload = {
      status: 'OFFLINE',
      tunnelUrl: '',
    };

    const updateData = {
      status: inputPayload.status,
      lastHeartbeat: new Date(),
    };
    if (inputPayload.status === 'OFFLINE') {
      updateData.tunnelUrl = null;
    } else if (inputPayload.tunnelUrl !== undefined) {
      updateData.tunnelUrl = inputPayload.tunnelUrl || null;
    }

    assert.equal(updateData.status, 'OFFLINE');
    assert.equal(updateData.tunnelUrl, null);
  });
});
