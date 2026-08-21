import * as bloodService from '../services/bloodService.js';

export async function getBloodInventory(req, res, next) {
  try {
    const list = await bloodService.getBloodInventory();
    res.json(list);
  } catch (err) {
    next(err);
  }
}

export async function getEligibleDonors(req, res, next) {
  try {
    const { bloodGroup } = req.params;
    const list = await bloodService.getEligibleDonors(bloodGroup);
    res.json(list);
  } catch (err) {
    next(err);
  }
}

export async function createRequirement(req, res, next) {
  try {
    const { bloodGroup, unitsRequired } = req.body;
    const patientId = req.body.patientId || 'HALO-P-10294';
    const actor = req.user ? req.user.id : 'admin';
    
    const requirement = await bloodService.createRequirement({ bloodGroup, unitsRequired }, patientId, actor);
    res.status(201).json(requirement);
  } catch (err) {
    next(err);
  }
}

export async function updateBloodStock(req, res, next) {
  try {
    const { bloodGroup, actionType } = req.body;
    const actor = req.user ? req.user.id : 'admin';
    const inventory = await bloodService.updateBloodStock(bloodGroup, actionType, actor);
    res.json(inventory);
  } catch (err) {
    next(err);
  }
}

export async function getAllDonors(req, res, next) {
  try {
    const list = await bloodService.getAllDonors();
    res.json(list);
  } catch (err) {
    next(err);
  }
}

export async function createDonor(req, res, next) {
  try {
    const donor = await bloodService.createDonor(req.body);
    res.status(201).json(donor);
  } catch (err) {
    next(err);
  }
}

export async function deleteDonor(req, res, next) {
  try {
    const { donorId } = req.params;
    const result = await bloodService.deleteDonor(donorId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
