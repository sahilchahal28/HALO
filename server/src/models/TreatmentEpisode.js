import mongoose from 'mongoose';

const TreatmentEpisodeSchema = new mongoose.Schema({
  episodeId: { type: String, required: true, unique: true }, // e.g. EP-2026-10001
  patientId: { type: String, required: true },
  patientName: { type: String, required: true },
  doctorId: { type: String, required: true },
  doctorName: { type: String, required: true },
  doctorPhone: { type: String },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date },
  status: { type: String, enum: ['ACTIVE', 'COMPLETED', 'CANCELLED'], default: 'ACTIVE' },
  reason: { type: String },
  diagnosisInformation: { type: String },
  department: { type: String, default: 'General Medicine' },
  currentStage: { type: String, enum: ['REGISTRATION', 'CONSULTATION', 'INVESTIGATION', 'TREATMENT', 'ADMISSION', 'SURGERY', 'DISCHARGE', 'FOLLOW_UP'], default: 'REGISTRATION' },
  requiresAttention: { type: Boolean, default: false },
  
  consultations: [{
    date: { type: Date, default: Date.now },
    notes: String,
    diagnosis: String
  }],
  prescriptions: [{
    date: { type: Date, default: Date.now },
    medicine: String,
    dosage: String,
    frequency: String,
    duration: String,
    originalImagePath: String,
    isDigitized: { type: Boolean, default: false }
  }],
  tests: [{
    name: String,
    status: { type: String, enum: ['PENDING', 'COMPLETED'], default: 'PENDING' },
    result: String,
    date: { type: Date, default: Date.now }
  }],
  bedAssignment: {
    bedId: String,
    assignedAt: Date,
    dischargedAt: Date
  },
  surgeries: [{
    procedure: String,
    time: String,
    theatre: String,
    status: String
  }],
  messages: [{
    sender: { type: String, enum: ['DOCTOR', 'PATIENT'] },
    text: String,
    timestamp: { type: Date, default: Date.now }
  }],
  ambulanceEvents: [String],
  inventoryUsage: [{
    itemId: String,
    itemName: String,
    quantity: Number,
    issuedBy: String,
    timestamp: { type: Date, default: Date.now }
  }],
  billing: [{
    description: { type: String, required: true },
    category: { type: String, default: 'Other' },
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, required: true },
    total: { type: Number, required: true },
    department: { type: String },
    date: { type: Date, default: Date.now },
    status: { type: String, enum: ['PENDING', 'PAID'], default: 'PENDING' }
  }],
  reminders: [{
    medicine: { type: String, required: true },
    dosage: { type: String },
    timeOfDay: { type: String, enum: ['MORNING', 'AFTERNOON', 'NIGHT'], required: true },
    dateString: { type: String, required: true }, // YYYY-MM-DD
    status: { type: String, enum: ['PENDING', 'TAKEN', 'SKIPPED'], default: 'PENDING' }
  }],
  dischargeSummary: { type: String }
}, { timestamps: true });

export default mongoose.model('TreatmentEpisode', TreatmentEpisodeSchema);
