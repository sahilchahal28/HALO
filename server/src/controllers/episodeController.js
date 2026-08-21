import * as episodeService from '../services/episodeService.js';

export async function getEpisodes(req, res, next) {
  try {
    const { patientId } = req.query;
    const list = await episodeService.getEpisodes(patientId);
    res.json(list);
  } catch (err) {
    next(err);
  }
}

export async function updateEpisode(req, res, next) {
  try {
    const { episodeId } = req.params;
    const actor = req.user ? req.user.id : 'doctor';
    const body = { ...req.body };

    // A DOCTOR can only ever assign/reassign an episode to THEMSELVES.
    // This makes QR-scan assignment immune to stale or spoofed doctorIds.
    if (req.user?.role === 'DOCTOR') {
      body.doctorId = actor;
    }

    const episode = await episodeService.updateEpisode(episodeId, body, actor);
    res.json(episode);
  } catch (err) {
    next(err);
  }
}

export async function createEpisode(req, res, next) {
  try {
    const actor = req.user ? req.user.id : 'admin';
    const body = { ...req.body };

    // Same rule on creation: a DOCTOR creating an episode owns it.
    if (req.user?.role === 'DOCTOR') {
      body.doctorId = actor;
    }

    const episode = await episodeService.createEpisode(body, actor);
    res.status(201).json(episode);
  } catch (err) {
    next(err);
  }
}

export async function dischargePatient(req, res, next) {
  try {
    const { episodeId } = req.params;
    const actor = req.user ? req.user.id : 'doctor';
    const episode = await episodeService.dischargePatient(episodeId, req.body, actor);
    res.json(episode);
  } catch (err) {
    next(err);
  }
}
