import type { Env } from './env.schema.js';

/** Typed, validated configuration. Inject this class; never read `process.env` elsewhere. */
export class AppConfig {
  constructor(readonly env: Readonly<Env>) {}

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }
}
