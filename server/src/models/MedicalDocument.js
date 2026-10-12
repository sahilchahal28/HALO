import mongoose from 'mongoose';
import { isAllowedMimeType } from '../utils/mimeTypes.js';

// Legacy list of the most common accepted types — kept for compatibility.
// Actual validation accepts PDF + any image format (see utils/mimeTypes.js).
export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
export const RETENTION_ELIGIBLE_TYPES = ['LAB_REPORT', 'IMAGING', 'TEST_REPORT'];

const MedicalDocumentSchema = new mongoose.Schema(
  {
    documentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    patientId: {
      type: String,
      required: true,
      index: true,
    },
    treatmentEpisodeId: {
      type: String,
      index: true,
      default: null,
    },
    type: {
      type: String,
      enum: ['PRESCRIPTION', 'LAB_REPORT', 'IMAGING', 'DISCHARGE_SUMMARY', 'REFERRAL', 'TEST_REPORT', 'OTHER'],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    mimeType: {
      type: String,
      required: true,
      validate: {
        validator: (v) => isAllowedMimeType(v),
        message: (props) =>
          `${props.value} is not an accepted file type. Accepted: PDF and any image format.`,
      },
    },
    fileSize: {
      type: Number,
      required: true,
      max: MAX_FILE_SIZE_BYTES,
    },
    s3Key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    s3Bucket: {
      type: String,
      default: null,
    },
    // Backward compatibility reference for existing endpoints
    fileRef: {
      type: String,
      default: function () {
        return this.s3Key || 'pending';
      },
    },
    department: {
      type: String,
      default: 'GENERAL',
      index: true,
    },
    doctor: {
      type: String,
      default: null,
    },
    doctorId: {
      type: String,
      default: null,
      index: true,
    },
    examinationDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    status: {
      type: String,
      enum: ['PENDING_UPLOAD', 'ACTIVE', 'ARCHIVED', 'DELETION_FAILED', 'DELETED'],
      default: 'PENDING_UPLOAD',
      index: true,
    },
    legalHold: {
      type: Boolean,
      default: false,
      index: true,
    },
    legalHoldReason: {
      type: String,
      default: null,
    },
    legalHoldUpdatedAt: {
      type: Date,
      default: null,
    },
    legalHoldUpdatedBy: {
      type: String,
      default: null,
    },
    retentionPolicy: {
      policyType: {
        type: String,
        enum: ['SIX_MONTHS_AUTO_DELETE', 'PERMANENT', 'CUSTOM'],
        default: 'PERMANENT',
      },
      autoDelete: {
        type: Boolean,
        default: false,
      },
      retentionDays: {
        type: Number,
        default: 180,
      },
      expiresAt: {
        type: Date,
        default: null,
        index: true,
      },
    },
    uploadedBy: {
      type: String,
      required: true,
    },
    uploadedByRole: {
      type: String,
      enum: ['PATIENT', 'DOCTOR', 'ADMIN'],
      default: 'PATIENT',
    },
    deletionRetryCount: {
      type: Number,
      default: 0,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: String,
      default: null,
    },
    deletionError: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Strategic Compound Indexes for query performance
MedicalDocumentSchema.index({ patientId: 1, createdAt: -1 });
MedicalDocumentSchema.index({ patientId: 1, type: 1, status: 1 });
MedicalDocumentSchema.index({ status: 1, 'retentionPolicy.autoDelete': 1, 'retentionPolicy.expiresAt': 1, legalHold: 1 });
MedicalDocumentSchema.index({ department: 1, examinationDate: -1 });

export default mongoose.model('MedicalDocument', MedicalDocumentSchema);
