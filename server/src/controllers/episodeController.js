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

export async function createEpisode(req, res, next) {
  try {
    const actor = req.user ? req.user.id : 'admin';
    const episode = await episodeService.createEpisode(req.body, actor);
    res.status(201).json(episode);
  } catch (err) {
    next(err);
  }
}

export async function updateEpisode(req, res, next) {
  try {
    const { episodeId } = req.params;
    const actor = req.user ? req.user.id : 'doctor';
    const episode = await episodeService.updateEpisode(episodeId, req.body, actor);
    res.json(episode);
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
