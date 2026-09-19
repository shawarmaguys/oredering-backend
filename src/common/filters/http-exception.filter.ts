import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const reqId =
      (request as any).id ||
      request.headers['x-request-id'] ||
      (response.getHeader ? (response.getHeader('x-request-id') as string) : undefined) ||
      'no-req-id';
    const user = (request as any).user;
    const userStr = user ? ` [User: ${user.id} (${user.role})]` : ' [Guest]';

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | object = 'Internal server error';
    if (isHttpException) {
      const errorResponse = exception.getResponse();
      message =
        typeof errorResponse === 'object' && errorResponse !== null && 'message' in errorResponse
          ? (errorResponse as any).message
          : errorResponse;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const errorDetails = {
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      requestId: reqId,
    };

    if (status >= 500 || !isHttpException) {
      const stack =
        exception instanceof Error ? exception.stack : JSON.stringify(exception);
      this.logger.error(
        `[5xx Unhandled Error] ${request.method} ${request.url} -> ${status}${userStr} (reqId: ${reqId})\nError: ${JSON.stringify(message)}\nStack: ${stack}`,
      );
    } else if (status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN) {
      this.logger.warn(
        `[Auth Failure] ${request.method} ${request.url} -> ${status}${userStr} (reqId: ${reqId}): ${JSON.stringify(message)}`,
      );
    } else {
      this.logger.warn(
        `[Client Error] ${request.method} ${request.url} -> ${status}${userStr} (reqId: ${reqId}): ${JSON.stringify(message)}`,
      );
    }

    response.status(status).json(errorDetails);
  }
}
