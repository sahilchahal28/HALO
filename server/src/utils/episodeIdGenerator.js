import TreatmentEpisode from '../models/TreatmentEpisode.js';

export async function generateEpisodeId() {
  const year = new Date().getFullYear();
  const lastEpisode = await TreatmentEpisode.findOne().sort({ createdAt: -1 });
  
  let nextNum = 10001;
  if (lastEpisode && lastEpisode.episodeId) {
    const match = lastEpisode.episodeId.match(/EP-\d+-(\d+)/);
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }

  // Guarantee uniqueness even if episodes were deleted or added out of order
  let candidateId = `EP-${year}-${nextNum}`;
  while (await TreatmentEpisode.exists({ episodeId: candidateId })) {
    nextNum++;
    candidateId = `EP-${year}-${nextNum}`;
  }

  return candidateId;
}
