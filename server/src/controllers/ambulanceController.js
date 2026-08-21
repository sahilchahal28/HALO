import * as ambulanceService from '../services/ambulanceService.js';

export async function getAmbulanceRequests(req, res, next) {
  try {
    const list = await ambulanceService.getAmbulanceRequests();
    res.json(list);
  } catch (err) {
    next(err);
  }
}

export async function createAmbulanceRequest(req, res, next) {
  try {
    const patientId = req.user ? req.user.patientId : 'HALO-P-10294';
    const request = await ambulanceService.createAmbulanceRequest(req.body, patientId);
    res.status(201).json(request);
  } catch (err) {
    next(err);
  }
}

export async function updateAmbulanceStatus(req, res, next) {
  try {
    const { requestId } = req.params;
    const { status } = req.body;
    const actor = req.user ? req.user.id : 'admin';
    const request = await ambulanceService.updateAmbulanceStatus(requestId, status, actor, req.body);
    res.json(request);
  } catch (err) {
    next(err);
  }
}

export async function getAmbulanceVehicles(req, res, next) {
  try {
    const list = await ambulanceService.getAmbulanceVehicles();
    res.json(list);
  } catch (err) {
    next(err);
  }
}

export async function addAmbulanceVehicle(req, res, next) {
  try {
    const actor = req.user ? req.user.id : 'admin';
    const vehicle = await ambulanceService.addAmbulanceVehicle(req.body, actor);
    res.status(201).json(vehicle);
  } catch (err) {
    next(err);
  }
}

export async function removeAmbulanceVehicle(req, res, next) {
  try {
    const { ambulanceId } = req.params;
    const actor = req.user ? req.user.id : 'admin';
    const result = await ambulanceService.removeAmbulanceVehicle(ambulanceId, actor);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
