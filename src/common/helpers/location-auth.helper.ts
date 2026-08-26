import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

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
      return [requestedLocationId];
    }
    return undefined; // All locations allowed
  }

  // MANAGER and WORKER: restricted to assigned userLocations
  const assignedLocationIds = (user.userLocations || []).map((ul) => ul.locationId);

  if (requestedLocationId && requestedLocationId !== 'all') {
    if (!assignedLocationIds.includes(requestedLocationId)) {
      throw new ForbiddenException(`Access denied for location "${requestedLocationId}"`);
    }
    return [requestedLocationId];
  }

  // If requesting 'all' or unspecified, filter to user's assigned locations
  return assignedLocationIds;
}
