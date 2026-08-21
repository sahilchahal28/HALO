import Doctor from '../models/Doctor.js';

export async function generateDoctorId() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let candidateId;
  let isUnique = false;
  
  while (!isUnique) {
    const l1 = letters[Math.floor(Math.random() * 26)];
    const l2 = letters[Math.floor(Math.random() * 26)];
    const num = String(Math.floor(1000 + Math.random() * 9000));
    candidateId = `HALO-DOC-${l1}${l2}-${num}`;
    
    const exists = await Doctor.exists({ doctorId: candidateId });
    if (!exists) {
      isUnique = true;
    }
  }
  
  return candidateId;
}
