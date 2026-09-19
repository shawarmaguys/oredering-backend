import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger('RolesGuard');

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    const reqId = req.id || req.headers['x-request-id'] || 'no-req-id';
    const isAllowed = requiredRoles.includes(user?.role);

    if (!isAllowed) {
      this.logger.warn(
        `[RolesGuard] DENIED user ${user?.id || 'guest'} (role: ${user?.role || 'none'}) on ${req.method} ${req.url}. Required roles: [${requiredRoles.join(', ')}] (reqId: ${reqId})`,
      );
    } else {
      this.logger.debug(
        `[RolesGuard] GRANTED user ${user?.id} (role: ${user?.role}) for [${requiredRoles.join(', ')}] (reqId: ${reqId})`,
      );
    }

    return isAllowed;
  }
}
