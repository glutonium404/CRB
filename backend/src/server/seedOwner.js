import { config } from '../config.js';
import { userRepo } from '../database/userRepo.js';
import { logger } from '../utils/logger.js';
import { adminRepo } from '../database/adminRepo.js';

/**
 * Auto-seeds the first OWNER_NUMBER as a super_admin dashboard user
 * on first boot (if no super_admin exists yet).
 * 
 * Default credentials: username = "admin", password = "crb-admin-2026"
 * The owner should change the password after first login.
 */
export function seedOwnerAccount() {
  if (userRepo.hasSuperAdmin()) {
    return; // Already seeded
  }

  const ownerPhone = config.ownerNumbers[0];
  if (!ownerPhone) {
    logger.warn('No OWNER_NUMBERS configured in .env — skipping super_admin seed.');
    return;
  }

  const defaultUsername = 'admin';
  const defaultPassword = 'crb-admin-2026';

  try {
    const userId = userRepo.createUser({
      username: defaultUsername,
      password: defaultPassword,
      displayName: 'Super Admin (Owner)',
      role: 'super_admin',
      phone: ownerPhone,
      createdBy: null
    });
    adminRepo.addAdmin(ownerPhone, 'Super Admin (Owner)', 'super_admin');

    logger.success(`══════════════════════════════════════════════════`);
    logger.success(`  🔑 Dashboard Super Admin Account Created!`);
    logger.success(`  👤 Username: ${defaultUsername}`);
    logger.success(`  🔒 Password: ${defaultPassword}`);
    logger.success(`  ⚠️  Change this password after first login!`);
    logger.success(`══════════════════════════════════════════════════`);
  } catch (err) {
    logger.error('Failed to seed owner account:', err.message);
  }
}
