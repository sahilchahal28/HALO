import InventoryItem from '../models/InventoryItem.js';
import InventoryTransaction from '../models/InventoryTransaction.js';
import Notification from '../models/Notification.js';
import { logAction } from './auditService.js';

export async function getInventory() {
  return await InventoryItem.find({});
}

export async function logMovement({ itemId, type, quantity, notes, patientId, episodeId }, actor) {
  const item = await InventoryItem.findOne({ itemId });
  if (!item) throw new Error('Inventory Item not found');

  const parsedQty = parseInt(quantity);
  if (isNaN(parsedQty) || parsedQty <= 0) throw new Error('Movement quantity must be positive');

  // Map transaction type case-insensitively for schema compatibility
  const normalizedType = type.toUpperCase();
  let dbType = 'RECEIVE';
  if (normalizedType === 'RECEIVE' || normalizedType === 'RECEIVED') {
    dbType = 'RECEIVE';
  } else if (normalizedType === 'ISSUE' || normalizedType === 'ISSUED') {
    dbType = 'ISSUE';
  } else if (normalizedType === 'WASTE' || normalizedType === 'WASTED') {
    dbType = 'WASTE';
  } else if (normalizedType === 'RETURN' || normalizedType === 'RETURNED') {
    dbType = 'RETURN';
  } else {
    dbType = 'ADJUST';
  }

  // Verify stock constraints (prevent negative stock)
  if (['ISSUE', 'WASTE'].includes(dbType)) {
    if (item.quantity < parsedQty) {
      throw new Error(`Insufficient stock. Available: ${item.quantity} ${item.unit}. Requested: ${parsedQty}.`);
    }
    item.quantity -= parsedQty;
  } else {
    item.quantity += parsedQty;
  }

  await item.save();

  // Create transactional record
  const count = await InventoryTransaction.countDocuments();
  const transactionId = `TXN-${10000 + count}`;

  const txn = new InventoryTransaction({
    transactionId,
    itemId,
    type: dbType,
    quantity: parsedQty,
    patientId,
    treatmentEpisodeId: episodeId,
    performedBy: actor || 'staff',
    reason: notes
  });
  await txn.save();

  // Trigger Low Stock Alerts if needed
  if (item.quantity <= item.minimumStock) {
    const notifId = `NOT-${Math.floor(100000 + Math.random() * 900000)}`;
    await Notification.create({
      notificationId: notifId,
      recipientType: 'ADMIN',
      recipientId: 'admin',
      type: 'LOW_STOCK',
      title: `Low Stock Warning: ${item.name}`,
      message: `Product SKU ${item.SKU} has dropped to ${item.quantity} ${item.unit} (Minimum threshold: ${item.minimumStock}). Restock required.`,
      relatedEntity: 'InventoryItem',
      relatedEntityId: itemId
    });
  }

  await logAction({
    actor: actor || 'admin',
    action: `Inventory movement logged: ${type}`,
    entityType: 'InventoryItem',
    entityId: itemId,
    metadata: { type, quantity: parsedQty, balance: item.quantity }
  });

  return item;
}

export async function addInventoryItem(itemData, actor) {
  const count = await InventoryItem.countDocuments();
  const itemId = `INV-${10000 + count}`;
  const cleanName = (itemData.name || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const SKU = itemData.SKU || `SKU-${cleanName || 'ITEM'}-${Math.floor(100 + Math.random() * 900)}`;

  const item = new InventoryItem({
    itemId,
    name: itemData.name,
    SKU,
    category: (itemData.category || 'MEDICINE').toUpperCase(),
    unit: itemData.unit || 'units',
    quantity: Number(itemData.quantity) || 0,
    minimumStock: Number(itemData.minimumStock) || 10,
    location: (itemData.location || 'PHARMACY').toUpperCase(),
    supplier: itemData.supplier || 'HALO Depot'
  });

  await item.save();

  await logAction({
    actor: actor || 'admin',
    action: 'Inventory Item Added',
    entityType: 'InventoryItem',
    entityId: itemId,
    metadata: { name: item.name, quantity: item.quantity }
  });

  return item;
}

export async function deleteInventoryItem(itemId, actor) {
  const item = await InventoryItem.findOne({ itemId });
  if (!item) throw new Error('Inventory Item not found');

  await InventoryItem.deleteOne({ itemId });

  await logAction({
    actor: actor || 'admin',
    action: 'Inventory Item Deleted',
    entityType: 'InventoryItem',
    entityId: itemId,
    metadata: { name: item.name }
  });

  return { success: true };
}

export async function getTransactions() {
  let txns = await InventoryTransaction.find({}).sort({ timestamp: -1, createdAt: -1 }).limit(50);
  if (txns.length === 0) {
    const items = await InventoryItem.find({});
    if (items.length > 0) {
      const sampleTxns = [
        {
          transactionId: 'TXN-10025',
          itemId: items[0]?.itemId || 'INV-10001',
          type: 'RECEIVE',
          quantity: 500,
          performedBy: 'Apex Pharma Logistics',
          reason: 'Scheduled Wholesale Batch Restock',
          timestamp: new Date(Date.now() - 2 * 3600 * 1000)
        },
        {
          transactionId: 'TXN-10024',
          itemId: items[1]?.itemId || items[0]?.itemId || 'INV-10002',
          type: 'ISSUE',
          quantity: 25,
          performedBy: 'Dr. Arjun Mehta (ICU)',
          reason: 'Emergency Ward Rapid Consumption',
          timestamp: new Date(Date.now() - 5 * 3600 * 1000)
        },
        {
          transactionId: 'TXN-10023',
          itemId: items[2]?.itemId || items[0]?.itemId || 'INV-10003',
          type: 'ISSUE',
          quantity: 80,
          performedBy: 'Dr. Sarah Jenkins (OT)',
          reason: 'Operating Theater Sterilized Pack Allocation',
          timestamp: new Date(Date.now() - 12 * 3600 * 1000)
        },
        {
          transactionId: 'TXN-10022',
          itemId: items[0]?.itemId || 'INV-10001',
          type: 'RECEIVE',
          quantity: 1200,
          performedBy: 'Central Medical Supplies Depot',
          reason: 'Quarterly Safety Buffer Replenishment',
          timestamp: new Date(Date.now() - 24 * 3600 * 1000)
        },
        {
          transactionId: 'TXN-10021',
          itemId: items[1]?.itemId || items[0]?.itemId || 'INV-10002',
          type: 'WASTE',
          quantity: 4,
          performedBy: 'Clinical QA Inspector',
          reason: 'Compromised Seal Quarantine Disposal',
          timestamp: new Date(Date.now() - 36 * 3600 * 1000)
        }
      ];
      try {
        await InventoryTransaction.insertMany(sampleTxns);
        txns = await InventoryTransaction.find({}).sort({ timestamp: -1, createdAt: -1 }).limit(50);
      } catch (_) {}
    }
  }
  return txns;
}

