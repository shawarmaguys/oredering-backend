import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  configureApp(app);

  const port = process.env.PORT ?? 3000;
  // Listen on '0.0.0.0' to allow traffic on all local network interfaces
  await app.listen(port, '0.0.0.0');
  const logger = new Logger('Bootstrap');
  logger.log(`Application is running on: http://0.0.0.0:${port}/v1 (accessible at local network IP)`);
}
bootstrap();
