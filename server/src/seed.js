import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Patient from './models/Patient.js';
import Doctor from './models/Doctor.js';
import TreatmentEpisode from './models/TreatmentEpisode.js';
import Ward from './models/Ward.js';
import Bed from './models/Bed.js';
import BloodInventory from './models/BloodInventory.js';
import BloodDonor from './models/BloodDonor.js';
import InventoryItem from './models/InventoryItem.js';
import Surgery from './models/Surgery.js';
import Notification from './models/Notification.js';
import ScheduleEvent from './models/ScheduleEvent.js';
import AuditLog from './models/AuditLog.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/halo';

async function seed() {
  try {
    console.log('Connecting to database for seeding...');
    try {
      await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
    } catch (err) {
      console.warn('[Seeder Warning] Failed to connect to MongoDB Atlas. Trying local MongoDB...');
      await mongoose.connect('mongodb://127.0.0.1:27017/halo', { serverSelectionTimeoutMS: 3000 });
    }
    console.log('Connected. Dropping collections...');

    // Clear old data
    await Promise.all([
      Patient.deleteMany({}),
      Doctor.deleteMany({}),
      TreatmentEpisode.deleteMany({}),
      Ward.deleteMany({}),
      Bed.deleteMany({}),
      BloodInventory.deleteMany({}),
      BloodDonor.deleteMany({}),
      InventoryItem.deleteMany({}),
      Surgery.deleteMany({}),
      Notification.deleteMany({}),
      ScheduleEvent.deleteMany({}),
      AuditLog.deleteMany({})
    ]);

    console.log('Collections cleared. Inserting seed data...');

    // 1. Seed Wards
    const wards = await Ward.insertMany([
      { wardId: 'WARD-ICU', name: 'Intensive Care Unit', type: 'ICU' },
      { wardId: 'WARD-CCU', name: 'Coronary Care Unit', type: 'CCU' },
      { wardId: 'WARD-GEN', name: 'General Ward Block B', type: 'GENERAL' },
      { wardId: 'WARD-PVT', name: 'Private Suite block A', type: 'PRIVATE' }
    ]);
    console.log(`- Seeded ${wards.length} Wards.`);

    // 2. Seed Beds
    const beds = await Bed.insertMany([
      { bedId: 'ICU-01', wardId: 'WARD-ICU', bedNumber: '1', status: 'AVAILABLE' },
      { bedId: 'ICU-02', wardId: 'WARD-ICU', bedNumber: '2', status: 'AVAILABLE' },
      { bedId: 'CCU-01', wardId: 'WARD-CCU', bedNumber: '1', status: 'AVAILABLE' },
      { bedId: 'CCU-02', wardId: 'WARD-CCU', bedNumber: '2', status: 'AVAILABLE' },
      { bedId: 'WARD-01', wardId: 'WARD-GEN', bedNumber: '101', status: 'AVAILABLE' },
      { bedId: 'WARD-02', wardId: 'WARD-GEN', bedNumber: '102', status: 'AVAILABLE' },
      { bedId: 'PVT-01', wardId: 'WARD-PVT', bedNumber: '301', status: 'AVAILABLE' }
    ]);
    console.log(`- Seeded ${beds.length} Beds.`);

    // 3. Seed Doctors
    const doctors = await Doctor.insertMany([
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
    console.log(`- Seeded ${doctors.length} Doctors.`);

    // 4. Seed Patient
    const patient = await Patient.create({
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
      allergies: ['Penicillin'],
      medicalHistory: ['Hypertension', 'Appendectomy'],
      qrCodeToken: 'token_rahul_sharma_10294',
      status: 'ACTIVE'
    });
    console.log(`- Seeded Patient ${patient.fullName}.`);

    // 5. Seed active Treatment Episode
    const episode = await TreatmentEpisode.create({
      episodeId: 'EP-2026-10000',
      patientId: 'HALO-PAT-RS-1029',
      patientName: patient.fullName,
      doctorId: 'HALO-DOC-AI-8888',
      doctorName: 'Dr. Ananya Iyer',
      status: 'ACTIVE',
      currentStage: 'TREATMENT',
      reason: 'Chest tightness, elevated Troponin levels',
      diagnosisInformation: 'Acute Coronary Syndrome',
      requiresAttention: false,
      consultations: [
        {
          notes: 'Patient presented with mild angina and diaphoresis. Ordered emergency Troponin test and ECG.',
          diagnosis: 'Suspected Angina'
        }
      ],
      prescriptions: [
        {
          medicine: 'Aspirin 75mg',
          dosage: '75 mg',
          frequency: '0-1-0',
          duration: '10 days',
          isDigitized: true
        }
      ],
      tests: [
        {
          name: 'Troponin I Lab Assay',
          status: 'COMPLETED',
          result: 'Troponin I: 0.12 ng/mL (Elevated)'
        },
        {
          name: '12-Lead ECG Diagnostics',
          status: 'COMPLETED',
          result: 'ST-segment depression in anterior leads V2-V4'
        }
      ],
      messages: [
        {
          sender: 'PATIENT',
          text: 'Hello doctor, chest tightness is slightly better after taking the medicine.'
        },
        {
          sender: 'DOCTOR',
          text: 'Good to hear. Rest completely. Avoid physical exertion. We will monitor test results.'
        }
      ]
    });
    console.log(`- Seeded active Care Episode ${episode.episodeId}.`);

    // 6. Seed Blood Inventory
    const bloodItems = await BloodInventory.insertMany([
      { bloodGroup: 'O-', unitsAvailable: 1, unitsReserved: 0 }, // Intentionally low to trigger shortage
      { bloodGroup: 'O+', unitsAvailable: 12, unitsReserved: 1 },
      { bloodGroup: 'A-', unitsAvailable: 4, unitsReserved: 0 },
      { bloodGroup: 'A+', unitsAvailable: 9, unitsReserved: 2 },
      { bloodGroup: 'B-', unitsAvailable: 3, unitsReserved: 0 },
      { bloodGroup: 'B+', unitsAvailable: 15, unitsReserved: 0 },
      { bloodGroup: 'AB-', unitsAvailable: 2, unitsReserved: 0 },
      { bloodGroup: 'AB+', unitsAvailable: 8, unitsReserved: 0 }
    ]);
    console.log(`- Seeded ${bloodItems.length} Blood Group stock balances.`);

    // 7. Seed Donors
    const donors = await BloodDonor.insertMany([
      {
        donorId: 'DONOR-10001',
        name: 'Amit Verma',
        bloodGroup: 'O-',
        phone: '+919012345678',
        location: 'Indirapuram, Ghaziabad',
        lastDonationDate: new Date('2026-05-10'),
        eligibilityStatus: 'ELIGIBLE',
        emergencyContactConsent: true
      },
      {
        donorId: 'DONOR-10002',
        name: 'Priya Singh',
        bloodGroup: 'O-',
        phone: '+919123456789',
        location: 'Noida Sector 62',
        lastDonationDate: new Date('2026-04-15'),
        eligibilityStatus: 'ELIGIBLE',
        emergencyContactConsent: true
      }
    ]);
    console.log(`- Seeded ${donors.length} emergency outreach consenting donors.`);

    // 8. Seed general inventory
    const inventory = await InventoryItem.insertMany([
      {
        itemId: 'INV-101',
        name: 'Amoxicillin 500mg capsules',
        SKU: 'PHAR-AMOX-500',
        category: 'MEDICINE',
        unit: 'tablets',
        quantity: 120,
        minimumStock: 20,
        location: 'PHARMACY',
        supplier: 'AstraZeneca Pharmaceuticals'
      },
      {
        itemId: 'INV-102',
        name: 'Paracetamol 650mg tablets',
        SKU: 'PHAR-PARA-650',
        category: 'MEDICINE',
        unit: 'tablets',
        quantity: 8, // Intentionally low to trigger alert
        minimumStock: 15,
        location: 'PHARMACY',
        supplier: 'Cipla Laboratories'
      },
      {
        itemId: 'INV-103',
        name: 'Sterilized Latex Surgical Gloves (Pair)',
        SKU: 'SURG-GLOV-M',
        category: 'SURGICAL',
        unit: 'pieces',
        quantity: 45,
        minimumStock: 10,
        location: 'OT',
        supplier: 'MediTech Supplies'
      }
    ]);
    console.log(`- Seeded ${inventory.length} general inventory items.`);

    // 9. Seed ScheduleEvent
    const schedule = await ScheduleEvent.create({
      eventId: 'EV-10001',
      doctorId: 'HALO-DOC-AI-8888',
      patientId: 'HALO-PAT-RS-1029',
      treatmentEpisodeId: 'EP-2026-10000',
      type: 'WARD_ROUND',
      title: 'Inpatient Ward Rounds',
      startTime: new Date('2026-08-19T09:30:00'),
      endTime: new Date('2026-08-19T10:30:00'),
      location: 'ICU Block B',
      notes: 'Evaluate patient stability and check cardiac monitors.'
    });
    console.log(`- Seeded schedule timeline rounds.`);

    // 10. Audit Log initial entry
    await AuditLog.create({
      actor: 'system',
      action: 'System Seed Initialized',
      entityType: 'System',
      entityId: 'SEED',
      metadata: { seededAt: new Date() }
    });
    console.log('- Seed audit log created.');

    console.log('\nSeeding completed successfully!');
  } catch (err) {
    console.error('Seeding failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Database disconnected.');
  }
}

seed();
