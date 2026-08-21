import mongoose from 'mongoose';

const BloodInventorySchema = new mongoose.Schema({
  bloodGroup: { type: String, required: true, unique: true, enum: ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'] },
  unitsAvailable: { type: Number, default: 0 },
  unitsReserved: { type: Number, default: 0 },
  batches: [{
    batchNumber: String,
    expiryDate: Date,
    quantity: Number
  }]
}, { timestamps: true });

export default mongoose.model('BloodInventory', BloodInventorySchema);
