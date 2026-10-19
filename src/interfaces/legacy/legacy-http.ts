import { type DecodedEnvelope, decodeEnvelope } from './codecs/envelope.codec.js';

/** Small request helpers shared by the legacy controllers (old apps send loosely typed bodies). */

/** Just enough of Fastify's reply for the legacy controllers (keeps fastify out of imports). */
export interface Reply {
  code(status: number): Reply;
  send(body: unknown): unknown;
}

export type RequestHeaders = Record<string, string | string[] | undefined>;

export type JsonBody = Record<string, unknown>;

export function asBody(value: unknown): JsonBody {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonBody)
    : {};
}

/** A trimmed non-empty string, or undefined for anything else. */
export function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Decodes the obfuscated `{data}` envelope of the legacy TV routes; null when absent or broken. */
export function openEnvelope(body: unknown): DecodedEnvelope | null {
  const data = text(asBody(body).data);
  if (!data) return null;
  const decoded = decodeEnvelope(data);
  return decoded.ok ? decoded.value : null;
}

export function header(headers: RequestHeaders, name: string): string {
  const value = headers[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

/** Cloudflare's client IP first, then the first X-Forwarded-For hop (old ibo behaviour). */
export function clientIp(headers: RequestHeaders): string {
  return (
    header(headers, 'cf-connecting-ip') ||
    header(headers, 'x-forwarded-for').split(',')[0]?.trim() ||
    ''
  );
}
