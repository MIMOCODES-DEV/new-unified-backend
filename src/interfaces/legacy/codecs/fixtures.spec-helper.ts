import { readFileSync } from 'node:fs';

/** Reads a recorded legacy test vector file from test/fixtures/legacy/codecs (generated, never edited). */
export function loadVectors<T>(name: string): T {
  const url = new URL(`../../../../test/fixtures/legacy/codecs/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

export interface FakeKeys {
  TOKEN_KEY: string;
  ANDROID_AES_SECRET: string;
  ANDROID_AES_NEW_SECRET: string;
  TV_AES_NEW_SECRET: string;
  ANDROID_V3_AES_NEW_SECRET: string;
  ANDROID_SIGNING_SECRET: string;
  TV_SIGNING_SECRET: string;
}
