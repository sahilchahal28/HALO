import * as bedService from '../services/bedService.js';

export async function getBeds(req, res, next) {
  try {
    const list = await bedService.getBeds();
    res.json(list);
  } catch (err) {
    next(err);
  }
}

export async function assignBed(req, res, next) {
  try {
    const { bedId } = req.params;
    const { patientId } = req.body;
    const actor = req.user ? req.user.id : 'admin';
    const bed = await bedService.assignBed(bedId, patientId, actor);
    res.json(bed);
  } catch (err) {
    next(err);
  }
}

export async function cleanBed(req, res, next) {
  try {
    const { bedId } = req.params;
    const actor = req.user ? req.user.id : 'admin';
    const bed = await bedService.cleanBed(bedId, actor);
    res.json(bed);
  } catch (err) {
    next(err);
  }
}

export async function updateBedStatus(req, res, next) {
  try {
    const { bedId } = req.params;
    const { status } = req.body;
    const actor = req.user ? req.user.id : 'admin';
    const bed = await bedService.updateBedStatus(bedId, status, actor);
    res.json(bed);
  } catch (err) {
    next(err);
  }
}

export async function addBed(req, res, next) {
  try {
    const actor = req.user ? req.user.id : 'admin';
    const bed = await bedService.addBed(req.body, actor);
    res.status(201).json(bed);
  } catch (err) {
    next(err);
  }
}

export async function removeBed(req, res, next) {
  try {
    const { bedId } = req.params;
    const actor = req.user ? req.user.id : 'admin';
    const result = await bedService.removeBed(bedId, actor);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
