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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
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
  // Public endpoints: mock storage stubs, direct local file downloads, replication sync, and device vault status
  if (
    req.path.startsWith('/documents/mock-upload') ||
    req.path.startsWith('/documents/mock-file') ||
    req.path.startsWith('/documents/file/') ||
    req.path.startsWith('/documents/sync-file') ||
    req.path.startsWith('/vault/')
  ) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];
  if (!token && req.query?.token) {
    token = req.query.token;
  }
  const referer = req.headers['referer'] || '';

  // 1. If valid JWT provided, authenticate as decoded user (Doctor or Patient)
  if (token && token !== 'mock-admin-token') {
    const decoded = verifyToken(token);
    if (decoded && decoded.sub) {
      req.user = {
        id: decoded.sub,
        role: decoded.role,
        name: decoded.name,
        ...(decoded.patientId && { patientId: decoded.patientId }),
      };
      return next();
    }
    // Token was supplied but is expired / invalid
    // If request originates from Doctor or Patient portal, reject so client can re-login
    if (
      referer.includes('/doctor') ||
      referer.includes('/patient') ||
      req.headers['x-role'] === 'DOCTOR' ||
      req.headers['x-role'] === 'PATIENT'
    ) {
      return res.status(401).json({ message: 'Session expired. Please sign in again.' });
    }
  }

  // 2. Doctor or Patient portal request with NO token -> require authentication
  if (
    !token &&
    (referer.includes('/doctor') ||
     referer.includes('/patient') ||
     req.headers['x-role'] === 'DOCTOR' ||
     req.headers['x-role'] === 'PATIENT')
  ) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  // 3. Admin web app is intentionally open (no auth requirement):
  // Any request carrying mock-admin-token, referencing /admin, or touching administrative
  // resources (or general web requests without Doctor/Patient role) is admitted as ADMIN.
  req.user = { id: 'admin', role: 'ADMIN', name: 'Sarah Jenkins (Admin)' };
  next();
}
