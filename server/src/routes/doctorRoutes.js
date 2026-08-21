import express from 'express';
import Doctor from '../models/Doctor.js';
import { generateDoctorId } from '../utils/doctorIdGenerator.js';
import { logAction } from '../services/auditService.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const list = await Doctor.find({});
    // Map doctorId to id property for full frontend compatibility
    const formatted = list.map(d => {
      const docObj = d.toObject({ virtuals: true });
      return {
        ...docObj,
        id: d.doctorId
      };
    });
    res.json(formatted);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const doctorId = await generateDoctorId();

    const newDoc = new Doctor({
      doctorId,
      name: req.body.name,
      specialty: req.body.specialty || 'General Practice',
      department: req.body.department || 'GENERAL',
      phone: req.body.phone,
      status: req.body.status || 'ACTIVE'
    });

    await newDoc.save();

    await logAction({
      actor: req.user ? req.user.id : 'admin',
      action: 'Clinical Doctor Registered',
      entityType: 'Doctor',
      entityId: doctorId,
      metadata: { name: newDoc.name, department: newDoc.department }
    });

    res.status(201).json({
      ...newDoc.toObject(),
      id: newDoc.doctorId
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:doctorId', async (req, res, next) => {
  try {
    const { doctorId } = req.params;
    const doc = await Doctor.findOne({ doctorId });
    if (!doc) {
      return res.status(404).json({ message: 'Doctor record not found' });
    }

    await Doctor.deleteOne({ doctorId });

    await logAction({
      actor: req.user ? req.user.id : 'admin',
      action: 'Clinical Doctor Removed',
      entityType: 'Doctor',
      entityId: doctorId,
      metadata: { name: doc.name }
    });

    res.json({ message: 'Doctor deleted successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
