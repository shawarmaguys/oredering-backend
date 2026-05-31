import { INestApplication, ValidationPipe } from '@nestjs/common';

function addAllowedOrigins(allowedOrigins: Set<string>, origins?: string) {
  origins
    ?.split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
    .forEach((origin) => allowedOrigins.add(origin));
}

export function configureApp(app: INestApplication) {
  const allowedOrigins = new Set([
    'http://localhost:3000',
    'http://localhost:3001',
    'http://192.168.1.5:3000',
    'http://192.168.1.5:3001',
    'https://oredering-frontend.vercel.app',
  ]);

  addAllowedOrigins(allowedOrigins, process.env.FRONTEND_URL);
  addAllowedOrigins(allowedOrigins, process.env.CORS_ORIGINS);

  const allowedOriginPatterns = [
    /^https:\/\/oredering-frontend(?:-[a-z0-9-]+)?\.vercel\.app$/,
  ];

  app.enableCors({
    origin: (origin, callback) => {
      const normalizedOrigin = origin?.replace(/\/$/, '');
      const isAllowed =
        !normalizedOrigin ||
        allowedOrigins.has(normalizedOrigin) ||
        allowedOriginPatterns.some((pattern) =>
          pattern.test(normalizedOrigin),
        );

      if (isAllowed) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
  });

  app.setGlobalPrefix('v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
}
