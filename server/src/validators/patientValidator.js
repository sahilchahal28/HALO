export function validatePatientRegister(body) {
  const { name, phone, age, gender, dob, bloodGroup, aadhaarNumber } = body;
  if (!name || !phone || !age || !gender || !dob || !bloodGroup) {
    throw new Error('Demographics missing: name, phone, age, gender, dob, bloodGroup are required.');
  }

  if (!aadhaarNumber) {
    throw new Error('Aadhaar Number is required for patient registration to prevent duplicate records.');
  }

  const cleanAadhaar = String(aadhaarNumber).replace(/\D/g, '');
  if (cleanAadhaar.length !== 12) {
    throw new Error('Invalid Aadhaar number. Aadhaar must be a 12-digit numeric identifier.');
  }
  
  if (phone.trim().length < 8) {
    throw new Error('Invalid phone number format. Must contain at least 8 characters.');
  }
  
  const numericAge = Number(age);
  if (isNaN(numericAge) || numericAge < 0) {
    throw new Error('Age must be a positive number.');
  }
  
  if (!['Male', 'Female', 'Other'].includes(gender)) {
    throw new Error('Invalid gender. Must be Male, Female, or Other.');
  }
  
  if (!['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'].includes(bloodGroup)) {
    throw new Error('Invalid blood group.');
  }
}
