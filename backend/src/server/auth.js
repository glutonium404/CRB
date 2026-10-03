import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { userRepo } from '../database/userRepo.js';
import { logger } from '../utils/logger.js';

const JWT_SECRET = config.jwtSecret;
const JWT_EXPIRY = '7d';

/**
 * Generates a JWT token for a user.
 */
export function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

/**
 * Verifies a JWT token and returns the decoded payload.
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * Express middleware: Authenticates JWT from Authorization header.
 * Attaches `req.user` on success.
 */
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const token = authHeader.slice(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  // Fetch fresh user data to ensure account is still active
  const user = userRepo.getUserById(decoded.id);
  if (!user || !user.is_active) {
    return res.status(401).json({ success: false, error: 'Account deactivated' });
  }

  req.user = user;
  next();
}

/**
 * Express middleware factory: Requires user to have one of the specified roles.
 * Must be used after authMiddleware.
 * @param {...string} roles Allowed roles (e.g., 'super_admin', 'admin', 'cr')
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // super_admin can access everything
    if (req.user.role === 'super_admin') {
      return next();
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }

    next();
  };
}

/**
 * Helper: checks if user role is at least admin-level.
 */
export function isAdminOrAbove(role) {
  return role === 'super_admin' || role === 'admin';
}
