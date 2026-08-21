import express from 'express';
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
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

router.post('/login', async (req, res, next) => {
  const { role, phone, id } = req.body;

  if (!role || !phone || !id) {
    return res.status(400).json({ message: 'Role, phone number, and unique ID are required.' });
  }

  try {
    const cleanPhone = String(phone).trim();
    const cleanId = String(id).trim().toUpperCase();

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
      // Case-insensitive ID match so stored IDs of any casing work
      const doctor = await Doctor.findOne({
        phone: cleanPhone,
        status: 'ACTIVE',
        $expr: { $eq: [{ $toUpper: '$doctorId' }, cleanId] }
      });

      if (!doctor) {
        return res.status(401).json({ message: 'Invalid credentials or doctor profile inactive.' });
      }

      payload = { sub: doctor.doctorId, role: 'DOCTOR', name: doctor.name };
    } else if (role === 'PATIENT') {
      // Allow patient to login even if their profile status is INACTIVE
      // Case-insensitive ID match so stored IDs of any casing work
      const patient = await Patient.findOne({
        phone: cleanPhone,
        $expr: { $eq: [{ $toUpper: '$patientId' }, cleanId] }
      });

      if (!patient) {
        return res.status(401).json({ message: 'Invalid credentials or patient profile not found.' });
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

// Silent session refresh using the httpOnly cookie — keeps installed PWAs
// signed in across server restarts and long periods of non-use.
router.post('/refresh', (req, res) => {
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
