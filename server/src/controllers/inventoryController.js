import * as inventoryService from '../services/inventoryService.js';

export async function getInventory(req, res, next) {
  try {
    const list = await inventoryService.getInventory();
    res.json(list);
  } catch (err) {
    next(err);
  }
}

export async function logMovement(req, res, next) {
  try {
    const actor = req.user ? req.user.id : 'admin';
    const updated = await inventoryService.logMovement(req.body, actor);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function addInventoryItem(req, res, next) {
  try {
    const actor = req.user ? req.user.id : 'admin';
    const item = await inventoryService.addInventoryItem(req.body, actor);
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
}

export async function deleteInventoryItem(req, res, next) {
  try {
    const { itemId } = req.params;
    const actor = req.user ? req.user.id : 'admin';
    await inventoryService.deleteInventoryItem(itemId, actor);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
