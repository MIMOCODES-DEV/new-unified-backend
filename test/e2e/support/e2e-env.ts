import { execFile } from 'node:child_process';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { startInfrastructure, type TestInfrastructure } from '../../support/infrastructure.js';

const run = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

export interface E2eEnv {
  infra: TestInfrastructure;
  /** Environment for anything that talks to the throwaway MongoDB and Redis. */
  env: NodeJS.ProcessEnv;
}

/** Starts throwaway MongoDB + Redis and returns the environment that points at them (never .env). */
export async function startE2eEnv(): Promise<E2eEnv> {
  const infra = await startInfrastructure();
  return {
    infra,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: 'info',
      MONGO_URI: infra.mongoUri,
      MONGO_CENTRAL_DB: 'unified_central',
      REDIS_URL: infra.redisUrl,
      LEGACY_TOKEN_KEY: 'e2e-legacy-token-key',
      ANDROID_SIGNING_SECRET: 'e2e-android-signing-secret',
      ANDROID_AES_NEW_SECRET: 'e2e-android-aes-secret',
    },
  };
}

export interface CliResult {
  exitCode: number;
  /** The `msg` of every log line the command printed, in order. */
  messages: string[];
}

/** Runs `pnpm cli <args>` as a real child process, exactly as a developer or deploy script would. */
export async function cli(env: NodeJS.ProcessEnv, ...args: string[]): Promise<CliResult> {
  const argv = ['--import', '@swc-node/register/esm-register', 'src/main.cli.ts', ...args];
  let stdout: string;
  let exitCode = 0;
  try {
    ({ stdout } = await run(process.execPath, argv, { cwd: repoRoot, env, timeout: 60_000 }));
  } catch (error) {
    const failed = error as { code?: number; stdout?: string };
    exitCode = typeof failed.code === 'number' ? failed.code : 1;
    stdout = failed.stdout ?? '';
  }
  const messages = stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as { msg?: string; context?: string })
    // NestJS's own boot lines carry a `context` (NestFactory, InstanceLoader…); commands' don't.
    .filter((entry) => entry.context === undefined && entry.msg)
    .map((entry) => entry.msg ?? '');
  return { exitCode, messages };
}

export interface HttpResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

/** A real HTTP request over the network, with any Host header (that is how the brand is chosen). */
export function http(
  port: number,
  path: string,
  host: string,
  headers: Record<string, string> = {},
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path, method: 'GET', headers: { host, ...headers } },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (raw += chunk));
        res.on('end', () => {
          let body: unknown = raw;
          try {
            body = JSON.parse(raw);
          } catch {
            // not JSON: keep the text
          }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/** A POST with a JSON body over the network, with any Host header and extra headers. */
export function httpPost(
  port: number,
  path: string,
  host: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          host,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (raw += chunk));
        res.on('end', () => {
          let parsed: unknown = raw;
          try {
            parsed = JSON.parse(raw);
          } catch {
            // not JSON: keep the text
          }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: parsed });
        });
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';

/** Encodes a request like the TV apps' encryptRequest (btoa of the JSON, a random key spliced in). */
export function appEncode(body: unknown): { data: string; key: string } {
  const base64 = Buffer.from(JSON.stringify(body), 'latin1').toString('base64');
  const key = 'k3yAbC9xYz12';
  const position = Math.min(7, base64.length);
  return {
    key,
    data:
      ALPHABET.charAt(position) +
      ALPHABET.charAt(key.length) +
      base64.slice(0, position) +
      key +
      base64.slice(position),
  };
}

/** Decodes a `{data}` response like the apps' decryptResponse (locators at the end, key removed). */
export function appDecode(data: string, key: string): unknown {
  const position = ALPHABET.indexOf(data.charAt(data.length - 2));
  const body = data.slice(0, -2);
  const base64 = body.slice(0, position) + body.slice(position + key.length);
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
}

/** A POST with an `application/x-www-form-urlencoded` body (how the legacy TV apps send `data`). */
export function httpForm(
  port: number,
  path: string,
  host: string,
  fields: Record<string, string>,
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const payload = new URLSearchParams(fields).toString();
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          host,
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (raw += chunk));
        res.on('end', () => {
          let parsed: unknown = raw;
          try {
            parsed = JSON.parse(raw);
          } catch {
            // not JSON: keep the text
          }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: parsed });
        });
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}
