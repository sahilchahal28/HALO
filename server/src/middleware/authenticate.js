import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'halo-dev-secret-change-me';

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (_) {
    return null;
  }
}

export function signAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

/**
 * Replaces the old demoUser middleware. Verifies the Bearer access token.
 * No silent fallback to ADMIN — missing/invalid tokens get 401.
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const decoded = verifyToken(token);
  if (!decoded || !decoded.sub) {
    return res.status(401).json({ message: 'Session expired. Please sign in again.' });
  }

  req.user = {
    id: decoded.sub,
    role: decoded.role,
    name: decoded.name,
    ...(decoded.patientId && { patientId: decoded.patientId }),
  };
  next();
}
