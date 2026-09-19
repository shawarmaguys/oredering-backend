import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';

interface RateLimitOptions {
  windowMs: number;
  max: number;
}

const hitsMap = new Map<string, number[]>();
const logger = new Logger('RateLimitGuard');

const DEFAULT_RATE_LIMIT_OPTIONS: RateLimitOptions = { windowMs: 60000, max: 10 };

export function createRateLimitGuard(options: RateLimitOptions = DEFAULT_RATE_LIMIT_OPTIONS) {
  @Injectable()
  class CustomRateLimitGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const req = context.switchToHttp().getRequest<Request>();
      const ip = (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown';
      const route = req.path;
      const key = `${ip}:${route}`;
      const now = Date.now();
      const reqId = (req as any).id || req.headers['x-request-id'] || 'no-req-id';

      const timestamps = hitsMap.get(key) || [];
      const validTimestamps = timestamps.filter(
        (ts) => now - ts < options.windowMs,
      );

      if (validTimestamps.length >= options.max) {
        logger.warn(
          `[RateLimit] BLOCKED ${key}: exceeded ${options.max} requests per ${options.windowMs}ms (reqId: ${reqId})`,
        );
        throw new HttpException(
          'Too many requests. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      validTimestamps.push(now);
      hitsMap.set(key, validTimestamps);
      logger.debug(
        `[RateLimit] ALLOWED ${key}: hit ${validTimestamps.length}/${options.max} (reqId: ${reqId})`,
      );
      return true;
    }
  }

  return CustomRateLimitGuard;
}
