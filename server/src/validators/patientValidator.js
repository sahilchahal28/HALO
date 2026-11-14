export function validatePatientRegister(body) {
  const name = body.name || body.fullName;
  const phone = body.phone;
  const dob = body.dob || body.dateOfBirth;
  let age = body.age;
  if (!age && dob) {
    const birthYear = new Date(dob).getFullYear();
    if (!isNaN(birthYear)) {
      age = Math.max(0, new Date().getFullYear() - birthYear);
      body.age = age;
    }
  }
  if (!dob && age) {
    const calcYear = new Date().getFullYear() - Number(age);
    body.dob = `${calcYear}-01-01`;
  }

  const rawGender = String(body.gender || '').trim();
  let normalizedGender = 'Other';
  if (/^m/i.test(rawGender)) normalizedGender = 'Male';
  else if (/^f/i.test(rawGender)) normalizedGender = 'Female';
  body.gender = normalizedGender;

  const bloodGroup = (body.bloodGroup || 'O+').toUpperCase();
  body.bloodGroup = bloodGroup;

  const aadhaarNumber = body.aadhaarNumber;

  if (!name || !phone) {
    throw new Error('Demographics missing: name and phone are required.');
  }

  if (!aadhaarNumber) {
    throw new Error('Aadhaar Number is required for patient registration to prevent duplicate records.');
  }

  const cleanAadhaar = String(aadhaarNumber).replace(/\D/g, '');
  if (cleanAadhaar.length !== 12) {
    throw new Error('Invalid Aadhaar number. Aadhaar must be a 12-digit numeric identifier.');
  }
  
  if (String(phone).trim().length < 8) {
    throw new Error('Invalid phone number format. Must contain at least 8 characters.');
  }
}
