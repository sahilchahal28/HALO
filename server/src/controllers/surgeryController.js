import * as surgeryService from '../services/surgeryService.js';

export async function getSurgeries(req, res, next) {
  try {
    const list = await surgeryService.getSurgeries();
    res.json(list);
  } catch (err) {
    next(err);
  }
}

export async function bookSurgery(req, res, next) {
  try {
    const actor = req.user ? req.user.id : 'admin';
    const surgery = await surgeryService.bookSurgery(req.body, actor);
    res.status(201).json(surgery);
  } catch (err) {
    next(err);
  }
}

export async function updateSurgeryStatus(req, res, next) {
  try {
    const { surgeryId } = req.params;
    const actor = req.user || { id: 'admin', name: 'Admin', role: 'ADMIN' };
    const surgery = await surgeryService.updateSurgeryStatus(surgeryId, req.body, actor);
    res.json(surgery);
  } catch (err) {
    next(err);
  }
}
