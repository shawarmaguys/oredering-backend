import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for development origins including 192.168.1.3
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://192.168.1.5:3000',
      'http://localhost:3001',
      'http://192.168.1.5:3001',
      'https://oredering-frontend.vercel.app',
      // allow everyone
      '*',
    ],
    credentials: true,
  });

  // Set global API prefix matching oas.yaml
  app.setGlobalPrefix('v1');

  // Use global validation pipe with automatic transformation
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

  const port = process.env.PORT ?? 3000;
  // Listen on '0.0.0.0' to allow traffic on all local network interfaces
  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on: http://0.0.0.0:${port}/v1 (accessible at local network IP)`);
}
bootstrap();
