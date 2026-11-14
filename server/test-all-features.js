const BASE = process.env.BASE || 'http://127.0.0.1:5001/api';

async function req(endpoint, options = {}) {
  const url = `${BASE}${endpoint}`;
  const res = await fetch(url, options);
  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  return { status: res.status, ok: res.ok, data };
}

let testPassed = 0;
let testFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    testPassed++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    testFailed++;
  }
}

async function run() {
  console.log('====================================================');
  console.log('  STARTING COMPREHENSIVE END-TO-END FEATURE AUDIT   ');
  console.log('====================================================\n');

  // ==========================================
  // 1. ADMIN FEATURES (OPEN / NO AUTH REQUIRED)
  // ==========================================
  console.log('--- 1. ADMIN WEB DASHBOARD FEATURES ---');

  // Test Admin: No Auth Header (Simulating cross-origin / admin clicks)
  const health = await req('/departments');
  assert(health.status === 200 && Array.isArray(health.data), 'GET /departments without token succeeds');

  const dash = await req('/dashboard');
  assert(dash.status === 200, 'GET /dashboard without token succeeds');

  // Beds Management
  const getBeds = await req('/beds');
  assert(getBeds.status === 200 && Array.isArray(getBeds.data), 'GET /beds succeeds');

  const newBed = await req('/beds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wardId: 'GENERAL', bedNumber: 'B-999', type: 'GENERAL' })
  });
  assert(newBed.status === 201, 'POST /beds (Add Bed) succeeds');
  const createdBedId = newBed.data?.bedId || 'GENERAL-B-999';

  const updateBed = await req(`/beds/${createdBedId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'MAINTENANCE' })
  });
  assert(updateBed.status === 200, 'PUT /beds/:id/status succeeds');

  const cleanBed = await req(`/beds/${createdBedId}/clean`, { method: 'PUT' });
  assert(cleanBed.status === 200, 'PUT /beds/:id/clean succeeds');

  // Ambulance Dispatch & Vehicles
  const getAmbReqs = await req('/ambulance');
  assert(getAmbReqs.status === 200 && Array.isArray(getAmbReqs.data), 'GET /ambulance succeeds');

  const getVehicles = await req('/ambulance/vehicles');
  assert(getVehicles.status === 200 && Array.isArray(getVehicles.data), 'GET /ambulance/vehicles succeeds');

  const addVehicle = await req('/ambulance/vehicles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vehicleNumber: 'DL-01-AMB-999',
      driverName: 'Suresh Kumar',
      driverPhone: '9876543210',
      type: 'ALS'
    })
  });
  assert(addVehicle.status === 201, 'POST /ambulance/vehicles succeeds');
  const createdVehId = addVehicle.data?.ambulanceId;

  // Emergency ambulance request from unregistered caller or patient
  const ambReq = await req('/ambulance/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callerName: 'Emergency Bystander',
      callerPhone: '9988776655',
      pickupLocation: 'Main Highway Sector 14',
      condition: 'Cardiac Emergency',
      priority: 'CRITICAL'
    })
  });
  assert(ambReq.status === 201, 'POST /ambulance/request without registered patient succeeds');
  const createdAmbReqId = ambReq.data?.requestId;

  if (createdAmbReqId) {
    const dispatchAmb = await req(`/ambulance/${createdAmbReqId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'DISPATCHED', ambulanceId: createdVehId || 'AMB-101' })
    });
    assert(dispatchAmb.status === 200, 'PUT /ambulance/:id/status (Dispatch) succeeds');
  }

  // Blood Bank
  const bloodStock = await req('/bloodbank');
  assert(bloodStock.status === 200 && Array.isArray(bloodStock.data), 'GET /bloodbank stock succeeds');

  const bloodGroup = bloodStock.data[0]?.bloodGroup || 'O+';
  const addStock = await req('/bloodbank/stock', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bloodGroup, actionType: 'ADD' })
  });
  assert(addStock.status === 200, 'PUT /bloodbank/stock actionType: ADD succeeds');

  const useStock = await req('/bloodbank/stock', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bloodGroup, actionType: 'USE' })
  });
  assert(useStock.status === 200, 'PUT /bloodbank/stock actionType: USE succeeds');

  const bloodDonors = await req(`/bloodbank/donors/${encodeURIComponent(bloodGroup)}`);
  assert(bloodDonors.status === 200, 'GET /bloodbank/donors/:group succeeds');

  const allDonors = await req('/bloodbank/donors-list');
  assert(allDonors.status === 200 && Array.isArray(allDonors.data), 'GET /bloodbank/donors-list succeeds');

  const addDonor = await req('/bloodbank/donors-list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Rohan Sharma',
      bloodGroup: 'O+',
      phone: '9811223344',
      location: 'Ward B'
    })
  });
  assert(addDonor.status === 201, 'POST /bloodbank/donors-list succeeds');
  const createdDonorId = addDonor.data?.donorId;

  // Inventory Management
  const getInv = await req('/inventory');
  assert(getInv.status === 200 && Array.isArray(getInv.data), 'GET /inventory succeeds');

  const addInvItem = await req('/inventory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Saline Normal 500ml',
      category: 'CONSUMABLE',
      unit: 'bottles',
      quantity: 50,
      minimumStock: 15,
      location: 'PHARMACY',
      supplier: 'Apex Healthcare Depot'
    })
  });
  assert(addInvItem.status === 201, 'POST /inventory succeeds');
  const createdInvId = addInvItem.data?.itemId;

  const invMove = await req('/inventory/movement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      itemId: createdInvId,
      type: 'Received',
      quantity: 20,
      notes: 'New Batch Arrival'
    })
  });
  assert(invMove.status === 200, 'POST /inventory/movement (Received) succeeds');

  const invTxns = await req('/inventory/transactions');
  assert(invTxns.status === 200 && Array.isArray(invTxns.data), 'GET /inventory/transactions succeeds');

  // Clinical Doctor Registration & Reset PIN
  const getDocs = await req('/doctors');
  assert(getDocs.status === 200 && Array.isArray(getDocs.data), 'GET /doctors succeeds');

  const addDoc = await req('/doctors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Dr. Vikram Malhotra',
      specialty: 'Cardiology',
      department: 'Cardiology',
      phone: '9876501234'
    })
  });
  assert(addDoc.status === 201, 'POST /doctors (Register Doctor) succeeds');
  const createdDocId = addDoc.data?.doctorId || addDoc.data?.id;

  // Reset Doctor PIN without auth token (Open Admin Action)
  const resetDocPin = await req(`/doctors/${createdDocId}/reset-pin`, { method: 'POST' });
  assert(resetDocPin.status === 200, 'POST /doctors/:id/reset-pin succeeds without auth requirement');

  // Patient Registration & Reset PIN
  const randomAadhaar = String(Math.floor(100000000000 + Math.random() * 900000000000));
  const addPat = await req('/patients/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Aarav Patel',
      phone: '9898989898',
      aadhaarNumber: randomAadhaar,
      gender: 'MALE',
      dateOfBirth: '1990-05-15',
      bloodGroup: 'B+',
      emergencyContactName: 'Pooja Patel',
      emergencyContactPhone: '9898989897'
    })
  });
  assert(addPat.status === 201, 'POST /patients/register succeeds');
  const createdPatId = addPat.data?.patientId;

  // Reset Patient PIN without auth token (Open Admin Action)
  const resetPatPin = await req(`/patients/${createdPatId}/reset-pin`, { method: 'POST' });
  assert(resetPatPin.status === 200, 'POST /patients/:id/reset-pin succeeds without auth requirement');

  // Surgery Booking & Status
  const bookSurg = await req('/surgeries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patientId: createdPatId,
      procedure: 'Coronary Angioplasty',
      doctorId: createdDocId,
      theatre: 'OT-02',
      time: '2026-11-20T10:00'
    })
  });
  assert(bookSurg.status === 201, 'POST /surgeries (Book Surgery) succeeds');
  const createdSurgId = bookSurg.data?.surgeryId;

  if (createdSurgId) {
    const updateSurg = await req(`/surgeries/${createdSurgId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'IN_PROGRESS' })
    });
    assert(updateSurg.status === 200, 'PATCH /surgeries/:id/status succeeds');
  }

  // Patient Admission & Department Transfer
  const admitPat = await req(`/patients/${createdPatId}/admit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      department: 'Cardiology',
      doctorId: createdDocId,
      reason: 'Acute Angina'
    })
  });
  assert(admitPat.status === 200, 'POST /patients/:id/admit succeeds');

  const patEpisodes = await req(`/episodes?patientId=${createdPatId}`);
  assert(patEpisodes.status === 200 && patEpisodes.data.length > 0, 'GET /episodes?patientId=... succeeds');
  const activeEpisodeId = patEpisodes.data[0]?.episodeId;

  if (activeEpisodeId) {
    const transferDept = await req(`/episodes/${activeEpisodeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ department: 'ICU' })
    });
    assert(transferDept.status === 200, 'PUT /episodes/:id (Transfer Department) succeeds');
  }

  console.log('\n--- 2. DOCTOR PWA AUTH & ACCESS CONTROL ---');
  // Doctor Login
  const docLogin = await req('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'DOCTOR',
      phone: '9876501234',
      id: createdDocId,
      pin: '123456'
    })
  });
  assert(docLogin.status === 200 && docLogin.data?.token, 'Doctor login with default PIN (123456) succeeds');
  const doctorToken = docLogin.data?.token;

  // Second doctor for access control checks
  const addDoc2 = await req('/doctors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Dr. Ananya Sen',
      specialty: 'Pediatrics',
      department: 'Pediatrics',
      phone: '9123456789'
    })
  });
  const doc2Id = addDoc2.data?.doctorId;
  const doc2Login = await req('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'DOCTOR',
      phone: '9123456789',
      id: doc2Id,
      pin: '123456'
    })
  });
  const doc2Token = doc2Login.data?.token;

  // Doctor 1 scans Patient QR
  const patLookup = await req(`/patients/lookup?token=${createdPatId}`, {
    headers: { Authorization: `Bearer ${doctorToken}` }
  });
  assert(patLookup.status === 200 && patLookup.data?.patientId === createdPatId, 'Doctor 1 scans Patient QR -> auto-assigned');

  // Doctor 1 uploads document for Patient
  const form1 = new FormData();
  form1.append('patientId', createdPatId);
  form1.append('type', 'LAB_REPORT');
  form1.append('title', 'Blood Lipid Profile');
  form1.append('department', 'Cardiology');
  const dummyBlob = new Blob(['Dummy ECG and Lipid Panel Data'], { type: 'application/pdf' });
  form1.append('file', dummyBlob, 'lipid_panel.pdf');

  const uploadRes = await fetch(`${BASE}/documents/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${doctorToken}`
    },
    body: form1
  });
  const uploadData = await uploadRes.json();
  assert(uploadRes.status === 201, 'Doctor 1 uploads document for scanned patient succeeds');
  const createdDocuId = uploadData.documentId;

  // Doctor 1 lists documents for patient
  const doc1List = await req(`/documents?patientId=${createdPatId}`, {
    headers: { Authorization: `Bearer ${doctorToken}` }
  });
  assert(doc1List.status === 200 && doc1List.data?.documents?.length > 0, 'Doctor 1 lists documents of scanned patient');

  // Doctor 2 tries to list documents for this patient without scanning QR
  const doc2List = await req(`/documents?patientId=${createdPatId}`, {
    headers: { Authorization: `Bearer ${doc2Token}` }
  });
  assert(doc2List.status === 403, 'Doctor 2 (unscanned) gets 403 Forbidden accessing patient documents');

  // Doctor 1 tries to delete the document (STRICT RULE: Doctor forbidden)
  const docDeleteAttempt = await req(`/documents/${createdDocuId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${doctorToken}` }
  });
  assert(docDeleteAttempt.status === 403, 'Doctor deleting patient document is rejected (403 Forbidden - Patient only)');

  console.log('\n--- 3. PATIENT PWA AUTH & ACCESS CONTROL ---');
  // Patient Login
  const patLogin = await req('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'PATIENT',
      phone: '9898989898',
      id: createdPatId,
      pin: '123456'
    })
  });
  assert(patLogin.status === 200 && patLogin.data?.token, 'Patient login with default PIN (123456) succeeds');
  const patientToken = patLogin.data?.token;

  // Second patient for access control checks
  const randomAadhaar2 = String(Math.floor(100000000000 + Math.random() * 900000000000));
  const addPat2 = await req('/patients/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Rahul Varma',
      phone: '9777777777',
      aadhaarNumber: randomAadhaar2,
      gender: 'MALE',
      dateOfBirth: '1985-01-01'
    })
  });
  const pat2Id = addPat2.data?.patientId;
  const pat2Login = await req('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'PATIENT',
      phone: '9777777777',
      id: pat2Id,
      pin: '123456'
    })
  });
  const pat2Token = pat2Login.data?.token;

  // Patient 1 views own documents
  const pat1Docs = await req(`/documents?patientId=${createdPatId}`, {
    headers: { Authorization: `Bearer ${patientToken}` }
  });
  assert(pat1Docs.status === 200 && pat1Docs.data?.documents?.length > 0, 'Patient 1 views own medical records');

  // Patient 2 tries to view Patient 1's documents
  const pat2ViewingPat1 = await req(`/documents?patientId=${createdPatId}`, {
    headers: { Authorization: `Bearer ${pat2Token}` }
  });
  assert(pat2ViewingPat1.status === 403, 'Patient 2 gets 403 Forbidden trying to view Patient 1 documents');

  // Patient 1 deletes own document (STRICT RULE: Allowed only for owning patient)
  const pat1Delete = await req(`/documents/${createdDocuId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${patientToken}` }
  });
  assert(pat1Delete.status === 200 && pat1Delete.data?.success, 'Patient 1 successfully deletes own medical document');

  // Cleanup test items
  if (createdInvId) await req(`/inventory/${createdInvId}`, { method: 'DELETE' });
  if (createdDonorId) await req(`/bloodbank/donors-list/${createdDonorId}`, { method: 'DELETE' });
  if (createdVehId) await req(`/ambulance/vehicles/${createdVehId}`, { method: 'DELETE' });
  if (createdBedId) await req(`/beds/${createdBedId}`, { method: 'DELETE' });
  if (createdPatId) await req(`/patients/${createdPatId}`, { method: 'DELETE' });
  if (pat2Id) await req(`/patients/${pat2Id}`, { method: 'DELETE' });
  if (createdDocId) await req(`/doctors/${createdDocId}`, { method: 'DELETE' });
  if (doc2Id) await req(`/doctors/${doc2Id}`, { method: 'DELETE' });

  console.log('\n====================================================');
  console.log(`  AUDIT COMPLETE: ${testPassed} PASSED, ${testFailed} FAILED`);
  console.log('====================================================');

  if (testFailed > 0) {
    process.exit(1);
  }
}

run().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
