import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { AppConfig } from '../config/app-config.js';

/** Never log credentials, whatever the route or payload shape. */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers.token',
  'req.headers["x-api-key"]',
  '*.password',
  '*.secret',
  '*.token',
  '*.apiKey',
];

// The request id (`req.id`) is set by Fastify, see shared/http/fastify-adapter.ts; pino-http reuses it.
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.env.LOG_LEVEL,
          redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
          transport:
            config.env.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
  ],
})
export class LoggerModule {}
