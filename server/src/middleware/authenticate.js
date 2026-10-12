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
 * Verifies the Bearer access token. Doctor/Patient sessions use real JWTs.
 * The Admin web app is intentionally open (no auth): requests carrying the
 * well-known admin bypass token are admitted as ADMIN.
 */
export function authenticate(req, res, next) {
  // Public endpoints: mock storage stubs and direct local file downloads (download URLs are pre-signed capability URLs)
  if (
    req.path.startsWith('/documents/mock-upload') ||
    req.path.startsWith('/documents/mock-file') ||
    req.path.startsWith('/documents/file/')
  ) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  // Admin web app bypass — no authentication required
  if (token === 'mock-admin-token') {
    req.user = { id: 'admin', role: 'ADMIN', name: 'Sarah Jenkins (Admin)' };
    return next();
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
