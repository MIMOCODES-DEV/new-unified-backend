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
// TV apps run from local files (Origin "null") and call the API from another origin, so browsers
// and the TV web engines need CORS. No cookies are used, so "*" is safe.
app.enableCors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  // x-client-origin and x-site-key: the cr brand sites send them on every call.
  allowedHeaders: [
    'authorization',
    'content-type',
    'custom-proxy-mode',
    'token',
    'x-client-origin',
    'x-site-key',
  ],
});
app.enableShutdownHooks();

const config = app.get(AppConfig);
await app.listen(config.env.PORT, '0.0.0.0');
