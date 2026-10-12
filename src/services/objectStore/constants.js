/**
 * objectStore/constants.js
 *
 * Central constants for the HALO local object storage layer.
 * This is the ONLY file that knows the underlying storage is IndexedDB.
 * Everything outside sees an opaque "ObjectStore" API.
 */

// ── Database identifiers ─────────────────────────────────────────────────────
export const DB_NAMES = {
  ADMIN:   'halo_admin_store',
  DOCTOR:  'halo_doctor_store',
  PATIENT: 'halo_patient_store',
};

export const DB_VERSION = 1;

// ── Object store names ───────────────────────────────────────────────────────
export const STORES = {
  OBJECTS:    'objects',
  SYNC_STATE: 'sync_state',
};

// ── Storage cap ──────────────────────────────────────────────────────────────
// 2 GB total. When exceeded, oldest-first purge runs automatically.
export const MAX_STORAGE_BYTES = 2 * 1024 * 1024 * 1024;

// ── Document types ───────────────────────────────────────────────────────────
export const DOCUMENT_TYPES = [
  'LAB_REPORT',
  'IMAGING',
  'PRESCRIPTION',
  'DISCHARGE_SUMMARY',
  'REFERRAL',
  'TEST_REPORT',
  'OTHER',
];

// Types auto-deleted after 6 months (mirrors server-side rule)
export const RETENTION_ELIGIBLE_TYPES = ['LAB_REPORT', 'IMAGING', 'TEST_REPORT'];

// ── Departments ───────────────────────────────────────────────────────────────
export const DEPARTMENTS = [
  'GENERAL',
  'CARDIOLOGY',
  'RADIOLOGY',
  'PATHOLOGY',
  'NEUROLOGY',
  'ORTHOPAEDICS',
  'DERMATOLOGY',
  'ONCOLOGY',
  'PAEDIATRICS',
  'GYNAECOLOGY',
  'UROLOGY',
  'GASTROENTEROLOGY',
  'ENDOCRINOLOGY',
  'PSYCHIATRY',
  'OPHTHALMOLOGY',
  'ENT',
  'EMERGENCY',
  'ICU',
];

// ── Type metadata (icons + labels) for the UI ─────────────────────────────────
export const TYPE_META = {
  LAB_REPORT:        { label: 'Lab Reports',        icon: '🧪', color: '#0071e3' },
  IMAGING:           { label: 'Imaging',            icon: '🫁', color: '#6e48aa' },
  PRESCRIPTION:      { label: 'Prescriptions',      icon: '💊', color: '#34c759' },
  DISCHARGE_SUMMARY: { label: 'Discharge Summaries',icon: '📋', color: '#ff9500' },
  REFERRAL:          { label: 'Referrals',          icon: '📨', color: '#5ac8fa' },
  TEST_REPORT:       { label: 'Test Reports',       icon: '🔬', color: '#af52de' },
  OTHER:             { label: 'Other',              icon: '📄', color: '#8e8e93' },
};

// ── Sync ──────────────────────────────────────────────────────────────────────
export const SYNC_CURSOR_KEY = 'cursor';
