import express from 'express';
import bcrypt from 'bcryptjs';
import Doctor from '../models/Doctor.js';
import Patient from '../models/Patient.js';
import { signAccessToken, signRefreshToken, verifyToken } from '../middleware/authenticate.js';

const router = express.Router();

const REFRESH_COOKIE = 'halo_refresh';
const JWT_SECRET = process.env.JWT_SECRET || 'halo-dev-secret-change-me';

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((c) => {
      const idx = c.indexOf('=');
      return [c.slice(0, idx).trim(), decodeURIComponent(c.slice(idx + 1).trim())];
    })
  );
}

function setRefreshCookie(req, res, token) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isHttps,
    // 'none' is required for cross-origin PWA requests (e.g. Vercel → Railway).
    // 'lax' blocks the cookie on cross-site POST requests, causing refresh failures.
    sameSite: isHttps ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

router.post('/login', async (req, res, next) => {
  const { role, phone, id, pin } = req.body;

  if (!role || !phone || !id) {
    return res.status(400).json({ message: 'Role, phone number, and unique ID are required.' });
  }

  try {
    const cleanPhone = String(phone).trim();
    const cleanId = String(id).trim().toUpperCase();
    const cleanPin = pin ? String(pin).trim() : '';

    let payload = null;

    if (role === 'ADMIN') {
      const normalize = (p) => String(p).replace(/\D/g, '').slice(-10);
      const adminPhone = normalize(process.env.ADMIN_PHONE || '9999999999');
      const adminId = (process.env.ADMIN_ID || 'HALO-ADMIN').toUpperCase();

      if (normalize(cleanPhone) === adminPhone && cleanId === adminId) {
        payload = { sub: 'admin', role: 'ADMIN', name: 'Sarah Jenkins (Admin)' };
      } else {
        return res.status(401).json({ message: 'Invalid admin credentials.' });
      }
    } else if (role === 'DOCTOR') {
      if (!cleanPin) {
        return res.status(400).json({ message: '6-digit Security PIN is required.' });
      }

      const digits = cleanPhone.replace(/\D/g, '');
      const last10 = digits.slice(-10);

      // Case-insensitive ID match and flexible phone match (+91, without +91, spaces)
      const doctor = await Doctor.findOne({
        status: 'ACTIVE',
        $and: [
          { $expr: { $eq: [{ $toUpper: '$doctorId' }, cleanId] } },
          {
            $or: [
              { phone: cleanPhone },
              ...(last10 ? [
                { phone: `+91${last10}` },
                { phone: last10 },
                { phone: { $regex: `${last10}$` } }
              ] : [])
            ]
          }
        ]
      });

      if (!doctor) {
        return res.status(401).json({ message: 'Invalid credentials or doctor profile inactive.' });
      }

      const isPinValid = doctor.pin 
        ? bcrypt.compareSync(cleanPin, doctor.pin) 
        : (cleanPin === '123456');

      if (!isPinValid) {
        return res.status(401).json({ message: 'Incorrect 6-digit Security PIN. (Default: 123456)' });
      }

      payload = { sub: doctor.doctorId, role: 'DOCTOR', name: doctor.name };
    } else if (role === 'PATIENT') {
      if (!cleanPin) {
        return res.status(400).json({ message: '6-digit Security PIN is required.' });
      }

      const digits = cleanPhone.replace(/\D/g, '');
      const last10 = digits.slice(-10);

      // Allow patient to login even if their profile status is INACTIVE
      // Case-insensitive ID match and flexible phone match (+91, without +91, spaces)
      const patient = await Patient.findOne({
        $and: [
          { $expr: { $eq: [{ $toUpper: '$patientId' }, cleanId] } },
          {
            $or: [
              { phone: cleanPhone },
              ...(last10 ? [
                { phone: `+91${last10}` },
                { phone: last10 },
                { phone: { $regex: `${last10}$` } }
              ] : [])
            ]
          }
        ]
      });

      if (!patient) {
        return res.status(401).json({ message: 'Invalid credentials or patient profile not found.' });
      }

      const isPinValid = patient.pin 
        ? bcrypt.compareSync(cleanPin, patient.pin) 
        : (cleanPin === '123456');

      if (!isPinValid) {
        return res.status(401).json({ message: 'Incorrect 6-digit Security PIN. (Default: 123456)' });
      }

      payload = { sub: patient.patientId, role: 'PATIENT', name: patient.fullName, patientId: patient.patientId };
    } else {
      return res.status(400).json({ message: 'Invalid role for credentials-based authentication.' });
    }

    setRefreshCookie(req, res, signRefreshToken(payload));

    return res.json({
      token: signAccessToken(payload),
      user: {
        id: payload.sub,
        role: payload.role,
        name: payload.name,
        ...(payload.patientId && { patientId: payload.patientId })
      }
    });
  } catch (err) {
    next(err);
  }
});

// Self-Service PIN Change for Doctor & Patient
router.post('/change-pin', async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ message: 'Authentication required to update PIN.' });
  }

  const decoded = verifyToken(token);
  if (!decoded || !decoded.sub) {
    return res.status(401).json({ message: 'Invalid or expired session token.' });
  }

  const { currentPin, newPin } = req.body;
  if (!currentPin || !newPin) {
    return res.status(400).json({ message: 'Current PIN and new 6-digit PIN are required.' });
  }

  const cleanNewPin = String(newPin).trim();
  const cleanCurrentPin = String(currentPin).trim();

  if (!/^\d{4,6}$/.test(cleanNewPin)) {
    return res.status(400).json({ message: 'New PIN must be 4 to 6 numeric digits.' });
  }

  try {
    if (decoded.role === 'DOCTOR') {
      const doctor = await Doctor.findOne({ doctorId: decoded.sub });
      if (!doctor) return res.status(404).json({ message: 'Doctor profile not found.' });

      const isCurrentValid = doctor.pin ? bcrypt.compareSync(cleanCurrentPin, doctor.pin) : (cleanCurrentPin === '123456');
      if (!isCurrentValid) {
        return res.status(400).json({ message: 'Current PIN is incorrect.' });
      }

      doctor.pin = bcrypt.hashSync(cleanNewPin, 10);
      doctor.pinUpdatedAt = new Date();
      await doctor.save();
      return res.json({ message: 'Doctor security PIN changed successfully.' });
    } else if (decoded.role === 'PATIENT') {
      const patient = await Patient.findOne({ patientId: decoded.patientId || decoded.sub });
      if (!patient) return res.status(404).json({ message: 'Patient profile not found.' });

      const isCurrentValid = patient.pin ? bcrypt.compareSync(cleanCurrentPin, patient.pin) : (cleanCurrentPin === '123456');
      if (!isCurrentValid) {
        return res.status(400).json({ message: 'Current PIN is incorrect.' });
      }

      patient.pin = bcrypt.hashSync(cleanNewPin, 10);
      patient.pinUpdatedAt = new Date();
      await patient.save();
      return res.json({ message: 'Patient security PIN changed successfully.' });
    } else {
      return res.status(400).json({ message: 'PIN change is only applicable for Doctor and Patient accounts.' });
    }
  } catch (err) {
    next(err);
  }
});

// Silent session refresh using the httpOnly cookie — keeps installed PWAs
// signed in across server restarts and long periods of non-use.
router.post('/refresh', async (req, res, next) => {
  const cookies = parseCookies(req);
  const refreshToken = cookies[REFRESH_COOKIE];

  if (!refreshToken) {
    return res.status(401).json({ message: 'No active session.' });
  }

  const decoded = verifyToken(refreshToken);
  if (!decoded || !decoded.sub) {
    clearRefreshCookie(res);
    return res.status(401).json({ message: 'Session expired. Please sign in again.' });
  }

  // Validate the account still exists — prevents ghost sessions carrying
  // deleted/migrated IDs from silently re-entering the system.
  if (decoded.role === 'DOCTOR') {
    const doctor = await Doctor.findOne({ doctorId: decoded.sub });
    if (!doctor || doctor.status !== 'ACTIVE') {
      clearRefreshCookie(res);
      return res.status(401).json({ message: 'Your doctor profile is no longer active. Please sign in again.' });
    }
  } else if (decoded.role === 'PATIENT') {
    const patient = await Patient.findOne({ patientId: decoded.sub });
    if (!patient) {
      clearRefreshCookie(res);
      return res.status(401).json({ message: 'Your patient profile no longer exists. Please sign in again.' });
    }
  }

  const payload = {
    sub: decoded.sub,
    role: decoded.role,
    name: decoded.name,
    ...(decoded.patientId && { patientId: decoded.patientId })
  };

  // Rotate the refresh cookie to extend the sliding 30-day window
  setRefreshCookie(req, res, signRefreshToken(payload));

  return res.json({
    token: signAccessToken(payload),
    user: {
      id: payload.sub,
      role: payload.role,
      name: payload.name,
      ...(payload.patientId && { patientId: payload.patientId })
    }
  });
});

router.post('/logout', (req, res) => {
  clearRefreshCookie(res);
  res.json({ message: 'Signed out.' });
});

export default router;
