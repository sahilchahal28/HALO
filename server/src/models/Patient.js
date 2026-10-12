import mongoose from 'mongoose';

const PatientSchema = new mongoose.Schema({
  patientId: { type: String, required: true, unique: true },
  aadhaarNumber: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true,
    validate: {
      validator: function(v) {
        return /^\d{12}$/.test(v);
      },
      message: props => `${props.value} is not a valid 12-digit Aadhaar number!`
    }
  },
  fullName: { type: String, required: true },
  phone: { type: String, required: true },
  dateOfBirth: { type: String, required: true },
  age: { type: Number, required: true },
  gender: { type: String, required: true, enum: ['Male', 'Female', 'Other'] },
  bloodGroup: { type: String, required: true, enum: ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'] },
  address: { type: String },
  emergencyContact: {
    name: { type: String },
    phone: { type: String },
    relation: { type: String }
  },
  allergies: { type: [String], default: [] },
  medicalHistory: { type: [String], default: [] },
  department: { type: String, default: 'General Medicine' },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ADMITTED'], default: 'ACTIVE' },
  assignedDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
  currentBed: { type: String },
  qrCodeToken: { type: String, required: true, unique: true },
  pin: { type: String, default: null }, // Bcrypt hash of 6-digit PIN; null defaults to '123456'
  pinUpdatedAt: { type: Date }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual field mapping 'name' to 'fullName' for UI compatibility
PatientSchema.virtual('name').get(function() {
  return this.fullName;
}).set(function(val) {
  this.fullName = val;
});

export default mongoose.model('Patient', PatientSchema);
