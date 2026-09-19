import { ForbiddenException, Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';

const logger = new Logger('LocationAuth');

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  fullName?: string;
  userLocations?: Array<{ locationId: string }>;
}

/**
 * Validates and resolves allowed location IDs for a given user request.
 * - ADMIN / SUPER_MANAGER: Can request any locationId or undefined ('all').
 * - MANAGER / WORKER: Must be assigned to requestedLocationId. If requesting 'all', returns assigned locationIds.
 *
 * @returns Array of location IDs to filter by, or undefined if unrestricted ('all' for admin).
 */
export function validateLocationAccess(
  user?: AuthUser,
  requestedLocationId?: string,
): string[] | undefined {
  if (!user) return undefined;

  // ADMIN and SUPER_MANAGER have global access
  if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_MANAGER) {
    if (requestedLocationId && requestedLocationId !== 'all') {
      logger.debug(`[LocationAuth] User ${user.id} (${user.role}) granted direct access to location ${requestedLocationId}`);
      return [requestedLocationId];
    }
    logger.debug(`[LocationAuth] User ${user.id} (${user.role}) granted global unrestricted location access`);
    return undefined; // All locations allowed
  }

  // MANAGER and WORKER: restricted to assigned userLocations
  const assignedLocationIds = (user.userLocations || []).map((ul) => ul.locationId);

  if (requestedLocationId && requestedLocationId !== 'all') {
    if (!assignedLocationIds.includes(requestedLocationId)) {
      logger.warn(
        `[LocationAuth] DENIED: User ${user.id} (${user.role}) attempted unauthorized access to location "${requestedLocationId}". Assigned: [${assignedLocationIds.join(', ')}]`,
      );
      throw new ForbiddenException(`Access denied for location "${requestedLocationId}"`);
    }
    logger.debug(`[LocationAuth] User ${user.id} (${user.role}) granted access to assigned location ${requestedLocationId}`);
    return [requestedLocationId];
  }

  // If requesting 'all' or unspecified, filter to user's assigned locations
  logger.debug(
    `[LocationAuth] User ${user.id} (${user.role}) filtered to ${assignedLocationIds.length} assigned locations`,
  );
  return assignedLocationIds;
}
