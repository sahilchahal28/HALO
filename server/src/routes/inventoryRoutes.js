import express from 'express';
import * as inventoryController from '../controllers/inventoryController.js';

const router = express.Router();

router.get('/', inventoryController.getInventory);
router.post('/', inventoryController.addInventoryItem);
router.post('/movement', inventoryController.logMovement);
router.delete('/:itemId', inventoryController.deleteInventoryItem);

export default router;
