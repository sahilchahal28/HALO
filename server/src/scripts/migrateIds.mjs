/**
 * One-time migration: converts legacy doctor/patient IDs to the standard
 *   doctor:  HALO-DOC-XX-NNNN   patient: HALO-PAT-XX-NNNN
 * and remaps every referencing collection consistently.
 *
 * Run from repo root:  node server/src/scripts/migrateIds.mjs
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.MIGRATE_URI;
if (!MONGO_URI) {
  console.error('Set MONGO_URI (or MIGRATE_URI) before running.');
  process.exit(1);
}

const DOCTOR_RE = /^HALO-DOC-[A-Z]{2}-\d{4}$/;
const PATIENT_RE = /^HALO-PAT-[A-Z]{2}-\d{4}$/;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function newId(prefix) {
  const l1 = LETTERS[Math.floor(Math.random() * 26)];
  const l2 = LETTERS[Math.floor(Math.random() * 26)];
  return `${prefix}-${l1}${l2}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// field maps per collection
const REF_MAP = {
  treatmentepisodes: ['patientId', 'doctorId'],
  surgeries: ['patientId', 'doctorId'],
  prescriptions: ['patientId', 'doctorId'],
  scheduleevents: ['doctorId', 'patientId'],
  ambulancerequests: ['patientId'],
  beds: ['patientId'],
  bloodrequirements: ['patientId'],
  inventorytransactions: ['patientId'],
  medicaldocuments: ['patientId'],
  auditlogs: ['actor', 'entityId'],
};

async function migrate() {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  console.log('Connected:', mongoose.connection.host);

  const idMap = new Map(); // old -> new

  // 1. Build mappings for doctors
  const doctors = await db.collection('doctors').find({}).toArray();
  for (const d of doctors) {
    if (!DOCTOR_RE.test(d.doctorId)) {
      let candidate;
      do { candidate = newId('HALO-DOC'); } while (
        idMap.has(candidate) ||
        (await db.collection('doctors').findOne({ doctorId: candidate }))
      );
      idMap.set(d.doctorId, candidate);
    }
  }

  // 2. Build mappings for patients
  const patients = await db.collection('patients').find({}).toArray();
  for (const p of patients) {
    if (!PATIENT_RE.test(p.patientId)) {
      let candidate;
      do { candidate = newId('HALO-PAT'); } while (
        idMap.has(candidate) ||
        (await db.collection('patients').findOne({ patientId: candidate }))
      );
      idMap.set(p.patientId, candidate);
    }
  }

  if (idMap.size === 0) {
    console.log('✅ All IDs already standard. Nothing to migrate.');
    await mongoose.disconnect();
    return;
  }
  console.log('Migration map:');
  for (const [o, n] of idMap) console.log(`  ${o} -> ${n}`);

  // 3. Rename primary records
  for (const [oldId, newIdVal] of idMap) {
    await db.collection('doctors').updateOne({ doctorId: oldId }, { $set: { doctorId: newIdVal } });
    await db.collection('patients').updateOne({ patientId: oldId }, { $set: { patientId: newIdVal } });
  }

  // 4. Remap references everywhere
  for (const [coll, fields] of Object.entries(REF_MAP)) {
    for (const field of fields) {
      for (const [oldId, newIdVal] of idMap) {
        // exact-match only; avoids corrupting partial strings
        const r = await db.collection(coll).updateMany(
          { [field]: { $eq: oldId } },
          { $set: { [field]: newIdVal } }
        );
        if (r.modifiedCount > 0) {
          console.log(`  ${coll}.${field}: ${oldId} -> ${newIdVal} (${r.modifiedCount} docs)`);
        }
      }
    }
  }

  // 5. Notifications recipientId depends on recipientType
  for (const [oldId, newIdVal] of idMap) {
    const isDoctor = oldId.startsWith('doctor') || DOCTOR_RE.test(oldId);
    const r = await db.collection('notifications').updateMany(
      { recipientId: oldId, recipientType: isDoctor ? 'DOCTOR' : 'PATIENT' },
      { $set: { recipientId: newIdVal } }
    );
    if (r.modifiedCount > 0) {
      console.log(`  notifications.recipientId: ${oldId} -> ${newIdVal} (${r.modifiedCount})`);
    }
  }

  // 6. Verify no stragglers in primary collections
  const badDocs = await db.collection('doctors').countDocuments({ doctorId: { $not: DOCTOR_RE } });
  const badPts = await db.collection('patients').countDocuments({ patientId: { $not: PATIENT_RE } });
  console.log(badDocs === 0 && badPts === 0 ? '✅ Migration complete and verified.' : `⚠️ Stragglers — doctors:${badDocs} patients:${badPts}`);

  await mongoose.disconnect();
}

migrate().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
