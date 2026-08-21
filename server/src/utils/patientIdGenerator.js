import Patient from '../models/Patient.js';

export async function generatePatientId() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let candidateId;
  let isUnique = false;
  
  while (!isUnique) {
    const l1 = letters[Math.floor(Math.random() * 26)];
    const l2 = letters[Math.floor(Math.random() * 26)];
    const num = String(Math.floor(1000 + Math.random() * 9000));
    candidateId = `HALO-PAT-${l1}${l2}-${num}`;
    
    const exists = await Patient.exists({ patientId: candidateId });
    if (!exists) {
      isUnique = true;
    }
  }
  
  return candidateId;
}
