import { Params } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';

export function getLoggerConfig(): Params {
  const isProduction = process.env.NODE_ENV === 'production';
  const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

  return {
    pinoHttp: {
      level: logLevel,
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const existingId =
          req.headers['x-request-id'] ||
          req.headers['x-correlation-id'];
        const id = Array.isArray(existingId)
          ? existingId[0]
          : (existingId as string) || randomUUID();

        // Ensure the correlation ID is propagated back in response headers
        res.setHeader('x-request-id', id);
        return id;
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.passwordHash',
          'req.body.token',
          'req.body.slackBotToken',
          'req.body.slackUserToken',
          '*.password',
          '*.passwordHash',
          '*.token',
          '*.slackBotToken',
          '*.slackUserToken',
        ],
        censor: '[REDACTED]',
      },
      customProps: (req: any) => ({
        userId: req.user?.id,
        userRole: req.user?.role,
      }),
      transport: !isProduction
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'yyyy-mm-dd HH:MM:ss.l',
              ignore: 'pid,hostname',
              singleLine: false,
              messageFormat: '{msg}',
            },
          }
        : undefined,
      autoLogging: {
        ignore: (req: IncomingMessage) => {
          return req.url === '/favicon.ico';
        },
      },
      customSuccessMessage: (req: IncomingMessage, res: ServerResponse, responseTime: number) => {
        return `[HTTP] ${req.method} ${req.url} -> ${res.statusCode} (${responseTime.toFixed(1)}ms)`;
      },
      customErrorMessage: (req: IncomingMessage, res: ServerResponse, error: Error) => {
        return `[HTTP Error] ${req.method} ${req.url} -> ${res.statusCode}: ${error.message}`;
      },
    },
  };
}
