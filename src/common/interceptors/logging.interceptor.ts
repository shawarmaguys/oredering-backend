import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('RequestFlow');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest<Request>();
    const handler = context.getHandler().name;
    const controller = context.getClass().name;
    const reqId = (req as any).id || req.headers['x-request-id'] || 'no-req-id';
    const user = (req as any).user;
    const userStr = user ? ` [User: ${user.id} (${user.role})]` : ' [Guest]';

    const startTime = performance.now();

    // Summarize params and query for clean readability
    const hasParams = Object.keys(req.params || {}).length > 0;
    const hasQuery = Object.keys(req.query || {}).length > 0;
    const contextDetails: string[] = [];

    if (hasParams) {
      contextDetails.push(`params=${JSON.stringify(req.params)}`);
    }
    if (hasQuery) {
      contextDetails.push(`query=${JSON.stringify(req.query)}`);
    }

    const detailsStr = contextDetails.length > 0 ? ` with ${contextDetails.join(', ')}` : '';

    this.logger.log(
      `--> [${controller}#${handler}]${userStr}${detailsStr} (reqId: ${reqId})`,
    );

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = (performance.now() - startTime).toFixed(1);
          let summary = '';
          if (Array.isArray(data)) {
            summary = ` [Returned ${data.length} items]`;
          } else if (data && typeof data === 'object' && 'id' in data) {
            summary = ` [Item ID: ${data.id}]`;
          }
          this.logger.log(
            `<-- [${controller}#${handler}] COMPLETED in ${duration}ms${summary} (reqId: ${reqId})`,
          );
        },
        error: (error) => {
          const duration = (performance.now() - startTime).toFixed(1);
          this.logger.warn(
            `<-- [${controller}#${handler}] FAILED in ${duration}ms: ${error.message} (reqId: ${reqId})`,
          );
        },
      }),
    );
  }
}
