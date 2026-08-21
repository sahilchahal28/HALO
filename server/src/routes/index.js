import express from 'express';
import patientRoutes from './patientRoutes.js';
import episodeRoutes from './episodeRoutes.js';
import bedRoutes from './bedRoutes.js';
import ambulanceRoutes from './ambulanceRoutes.js';
import bloodRoutes from './bloodRoutes.js';
import inventoryRoutes from './inventoryRoutes.js';
import surgeryRoutes from './surgeryRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import doctorRoutes from './doctorRoutes.js';

const router = express.Router();

router.use('/patients', patientRoutes);
router.use('/episodes', episodeRoutes);
router.use('/beds', bedRoutes);
router.use('/ambulance', ambulanceRoutes);
router.use('/bloodbank', bloodRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/surgeries', surgeryRoutes);
router.use('/notifications', notificationRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/doctors', doctorRoutes);

router.get('/departments', (req, res) => {
  res.json([
    'Cardiology',
    'Neurology',
    'Radiology',
    'General Medicine',
    'Orthopedics',
    'Pediatrics',
    'Emergency',
    'ICU',
    'CCU',
    'Surgery',
    'Laboratory',
    'Pharmacy'
  ]);
});

export default router;
