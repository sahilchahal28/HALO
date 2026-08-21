import mongoose from 'mongoose';

const BatchSchema = new mongoose.Schema({
  batchNumber: { type: String, required: true },
  expiryDate: { type: Date, required: true },
  quantity: { type: Number, required: true }
});

const InventoryItemSchema = new mongoose.Schema({
  itemId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  SKU: { type: String, required: true },
  category: { type: String, enum: ['MEDICINE', 'CONSUMABLE', 'SURGICAL', 'LAB', 'EMERGENCY', 'EQUIPMENT'], required: true },
  unit: { type: String, required: true }, // e.g. tablets, vials, boxes
  quantity: { type: Number, default: 0 },
  minimumStock: { type: Number, default: 10 },
  location: { type: String, enum: ['PHARMACY', 'ICU', 'OT', 'EMERGENCY', 'GENERAL'], required: true },
  supplier: { type: String },
  batches: [BatchSchema]
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual field mapping 'sku' to 'SKU' for UI compatibility
InventoryItemSchema.virtual('sku').get(function() {
  return this.SKU;
}).set(function(val) {
  this.SKU = val;
});

// Virtual field mapping 'minStockLevel' to 'minimumStock' for UI compatibility
InventoryItemSchema.virtual('minStockLevel').get(function() {
  return this.minimumStock;
}).set(function(val) {
  this.minimumStock = val;
});

export default mongoose.model('InventoryItem', InventoryItemSchema);
