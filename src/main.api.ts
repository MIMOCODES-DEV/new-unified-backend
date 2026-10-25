import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { ApiModule } from './api.module.js';
import { AppConfig } from './shared/config/app-config.js';
import { createFastifyAdapter } from './shared/http/fastify-adapter.js';

const app = await NestFactory.create<NestFastifyApplication>(ApiModule, createFastifyAdapter(), {
  bufferLogs: true,
});
app.useLogger(app.get(Logger));
app.enableShutdownHooks();

const config = app.get(AppConfig);
await app.listen(config.env.PORT, '0.0.0.0');
