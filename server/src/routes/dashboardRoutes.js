import express from 'express';
import Patient from '../models/Patient.js';
import Bed from '../models/Bed.js';
import TreatmentEpisode from '../models/TreatmentEpisode.js';
import Surgery from '../models/Surgery.js';
import AmbulanceRequest from '../models/AmbulanceRequest.js';
import BloodInventory from '../models/BloodInventory.js';
import InventoryItem from '../models/InventoryItem.js';
import AuditLog from '../models/AuditLog.js';
import { checkS3Health } from '../config/s3.js';

const router = express.Router();

router.get('/s3-health', async (req, res, next) => {
  try {
    const health = await checkS3Health();
    const statusCode = health.healthy ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (err) {
    next(err);
  }
});

router.get('/audit', async (req, res, next) => {
  try {
    const { patientId } = req.query;
    if (!patientId) {
      return res.status(400).json({ message: 'patientId query parameter is required' });
    }
    const logs = await AuditLog.find({
      $or: [
        { entityId: patientId },
        { 'metadata.patientId': patientId }
      ]
    }).sort({ timestamp: -1 });
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const [
      totalPatients,
      activeEpisodes,
      bedsList,
      upcomingSurgeries,
      activeAmbulances,
      bloodList,
      inventoryList
    ] = await Promise.all([
      Patient.countDocuments({ status: 'ACTIVE' }),
      TreatmentEpisode.countDocuments({ status: 'ACTIVE' }),
      Bed.find({}),
      Surgery.countDocuments({ status: 'SCHEDULED' }),
      AmbulanceRequest.countDocuments({ status: { $ne: 'Completed' } }),
      BloodInventory.find({}),
      InventoryItem.find({})
    ]);

    const occupiedBeds = bedsList.filter(b => b.status === 'OCCUPIED').length;
    const cleaningBeds = bedsList.filter(b => b.status === 'CLEANING').length;
    const availableBeds = bedsList.filter(b => b.status === 'AVAILABLE').length;

    const lowStockCount = inventoryList.filter(i => i.quantity <= i.minimumStock).length;
    const bloodAlerts = bloodList.some(b => b.unitsAvailable <= 1);

    res.json({
      totalPatients,
      activePatients: activeEpisodes,
      occupiedBeds,
      cleaningBeds,
      availableBeds,
      totalBeds: bedsList.length,
      upcomingSurgeries,
      activeAmbulance: activeAmbulances,
      lowInventory: lowStockCount,
      bloodAlerts
    });
  } catch (err) {
    next(err);
  }
});

export default router;
