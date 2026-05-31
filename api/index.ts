import express from 'express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

let cachedServer: express.Express | undefined;

async function bootstrapServer() {
  const expressApp = express();
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressApp),
  );

  configureApp(app);
  await app.init();

  return expressApp;
}

export default async function handler(req, res) {
  cachedServer ??= await bootstrapServer();
  return cachedServer(req, res);
}
