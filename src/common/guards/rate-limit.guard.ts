import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';

interface RateLimitOptions {
  windowMs: number;
  max: number;
}

const hitsMap = new Map<string, number[]>();

export function createRateLimitGuard(options: RateLimitOptions = { windowMs: 60000, max: 10 }) {
  @Injectable()
  class CustomRateLimitGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const req = context.switchToHttp().getRequest<Request>();
      const ip = (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown';
      const route = req.path;
      const key = `${ip}:${route}`;
      const now = Date.now();

      const timestamps = hitsMap.get(key) || [];
      const validTimestamps = timestamps.filter(
        (ts) => now - ts < options.windowMs,
      );

      if (validTimestamps.length >= options.max) {
        throw new HttpException(
          'Too many requests. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      validTimestamps.push(now);
      hitsMap.set(key, validTimestamps);
      return true;
    }
  }

  return CustomRateLimitGuard;
}
