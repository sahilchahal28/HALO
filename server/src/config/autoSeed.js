import Patient from '../models/Patient.js';
import Doctor from '../models/Doctor.js';
import TreatmentEpisode from '../models/TreatmentEpisode.js';
import Ward from '../models/Ward.js';
import Bed from '../models/Bed.js';
import BloodInventory from '../models/BloodInventory.js';
import BloodDonor from '../models/BloodDonor.js';
import InventoryItem from '../models/InventoryItem.js';
import AuditLog from '../models/AuditLog.js';

/**
 * Safely seed a single collection if it's empty.
 * Swallows errors so one failure doesn't kill the server.
 */
async function seedCollection(Model, label, data) {
  try {
    const count = await Model.countDocuments();
    if (count > 0) return;
    await Model.insertMany(data);
    console.log(`[Auto-Seed] ✔ ${label} seeded (${data.length} docs)`);
  } catch (err) {
    // Duplicate-key errors are harmless — data already exists
    if (err.code === 11000) {
      console.log(`[Auto-Seed] ⏭ ${label} skipped (duplicate key — data already present)`);
    } else {
      console.error(`[Auto-Seed] ✘ ${label} failed:`, err.message);
    }
  }
}

export async function autoSeedIfEmpty() {
  try {
    // Quick check — if patients already exist, only ensure the mock bypass patient is present
    const patientsCount = await Patient.countDocuments();
    if (patientsCount > 0) {
      const hasMockPatient = await Patient.findOne({ patientId: 'HALO-PAT-RS-1029' });
      if (!hasMockPatient) {
        console.log('[Auto-Seed] Mock bypass patient HALO-PAT-RS-1029 missing. Creating...');
        try {
          await Patient.create({
            patientId: 'HALO-PAT-RS-1029',
            aadhaarNumber: '234567890123',
            fullName: 'Rahul Sharma',
            phone: '+919876543210',
            dateOfBirth: '1994-05-12',
            age: 32,
            gender: 'Male',
            bloodGroup: 'O-',
            address: 'Sector 15, Vasundhara, Ghaziabad',
            emergencyContact: {
              name: 'Neha Sharma',
              phone: '+919876543211',
              relation: 'Spouse'
            },
            status: 'ACTIVE',
            qrCodeToken: 'mock-qr-token-rahul-1'
          });
        } catch (e) {
          if (e.code !== 11000) console.error('[Auto-Seed] Mock patient creation failed:', e.message);
        }
      }
      // Even if patients exist, ensure other collections are seeded
    }

    console.log('[Auto-Seed] Checking collections and seeding any that are empty...');

    // Wards
    await seedCollection(Ward, 'Wards', [
      { wardId: 'WARD-ICU', name: 'Intensive Care Unit', type: 'ICU' },
      { wardId: 'WARD-CCU', name: 'Coronary Care Unit', type: 'CCU' },
      { wardId: 'WARD-GEN', name: 'General Ward Block B', type: 'GENERAL' },
      { wardId: 'WARD-PVT', name: 'Private Suite block A', type: 'PRIVATE' }
    ]);

    // Beds
    await seedCollection(Bed, 'Beds', [
      { bedId: 'ICU-01', wardId: 'WARD-ICU', bedNumber: '1', status: 'AVAILABLE' },
      { bedId: 'ICU-02', wardId: 'WARD-ICU', bedNumber: '2', status: 'AVAILABLE' },
      { bedId: 'CCU-01', wardId: 'WARD-CCU', bedNumber: '1', status: 'AVAILABLE' },
      { bedId: 'CCU-02', wardId: 'WARD-CCU', bedNumber: '2', status: 'AVAILABLE' },
      { bedId: 'WARD-01', wardId: 'WARD-GEN', bedNumber: '101', status: 'AVAILABLE' },
      { bedId: 'WARD-02', wardId: 'WARD-GEN', bedNumber: '102', status: 'AVAILABLE' },
      { bedId: 'PVT-01', wardId: 'WARD-PVT', bedNumber: '301', status: 'AVAILABLE' }
    ]);

    // Doctors
    await seedCollection(Doctor, 'Doctors', [
      {
        doctorId: 'HALO-DOC-AI-8888',
        name: 'Dr. Ananya Iyer',
        phone: '+919999988888',
        department: 'Cardiology',
        specialty: 'Consultant Cardiologist',
        status: 'ACTIVE'
      },
      {
        doctorId: 'HALO-DOC-SJ-7777',
        name: 'Dr. Sarah Jenkins',
        phone: '+918888877777',
        department: 'Emergency',
        specialty: 'Trauma Specialist',
        status: 'ACTIVE'
      }
    ]);

    // Patients (only if none exist — already checked above)
    if (patientsCount === 0) {
      await seedCollection(Patient, 'Patients', [{
        patientId: 'HALO-PAT-RS-1029',
        aadhaarNumber: '234567890123',
        fullName: 'Rahul Sharma',
        phone: '+919876543210',
        dateOfBirth: '1994-05-12',
        age: 32,
        gender: 'Male',
        bloodGroup: 'O-',
        address: 'Sector 15, Vasundhara, Ghaziabad',
        emergencyContact: {
          name: 'Neha Sharma',
          phone: '+919876543211',
          relation: 'Spouse'
        },
        status: 'ACTIVE',
        qrCodeToken: 'mock-qr-token-rahul-1'
      }]);
    }

    // Blood Inventory
    await seedCollection(BloodInventory, 'Blood Inventory', [
      { bloodGroup: 'O-', unitsAvailable: 8, unitsReserved: 0 },
      { bloodGroup: 'O+', unitsAvailable: 12, unitsReserved: 1 },
      { bloodGroup: 'A-', unitsAvailable: 4, unitsReserved: 0 },
      { bloodGroup: 'A+', unitsAvailable: 9, unitsReserved: 2 },
      { bloodGroup: 'B-', unitsAvailable: 5, unitsReserved: 0 },
      { bloodGroup: 'B+', unitsAvailable: 11, unitsReserved: 1 },
      { bloodGroup: 'AB-', unitsAvailable: 3, unitsReserved: 0 },
      { bloodGroup: 'AB+', unitsAvailable: 6, unitsReserved: 1 }
    ]);

    // Blood Donors
    await seedCollection(BloodDonor, 'Blood Donors', [
      { donorId: 'DONOR-10001', name: 'Amit Verma', bloodGroup: 'O-', phone: '+919911223344', location: 'Delhi', emergencyContactConsent: true },
      { donorId: 'DONOR-10002', name: 'Priya Sen', bloodGroup: 'A+', phone: '+919922334455', location: 'Noida', emergencyContactConsent: true },
      { donorId: 'DONOR-10003', name: 'Kabir Singh', bloodGroup: 'B+', phone: '+919933445566', location: 'Gurugram', emergencyContactConsent: true }
    ]);

    // Inventory
    await seedCollection(InventoryItem, 'Inventory Items', [
      { itemId: 'INV-10001', name: 'Paracetamol 650mg', SKU: 'SKU-PARA650', category: 'MEDICINE', unit: 'tablets', quantity: 2500, minimumStock: 500, location: 'PHARMACY', supplier: 'Apex Pharma' },
      { itemId: 'INV-10002', name: 'Saline IV Fluid 500ml', SKU: 'SKU-SAL500', category: 'CONSUMABLE', unit: 'vials', quantity: 180, minimumStock: 50, location: 'PHARMACY', supplier: 'Zenith Biotech' },
      { itemId: 'INV-10003', name: 'Disposable Syringes 5ml', SKU: 'SKU-SYR5', category: 'CONSUMABLE', unit: 'units', quantity: 1200, minimumStock: 300, location: 'EMERGENCY', supplier: 'Zenith Biotech' }
    ]);

    // Audit log
    try {
      await AuditLog.create({
        actor: 'system',
        action: 'System Seed Auto-Initialized',
        entityType: 'System',
        entityId: 'SEED',
        metadata: { seededAt: new Date() }
      });
    } catch (_) { /* ignore */ }

    console.log('[Auto-Seed] Seeding check completed.');
  } catch (err) {
    // Non-fatal — log and let the server continue
    console.error('[Auto-Seed] Seeding encountered an error (server will continue):', err.message);
  }
}

