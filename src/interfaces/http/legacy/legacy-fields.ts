/** Reading the untrusted JSON old apps send. */

/** A field from the app's JSON, or '' when it is missing or not text. */
export const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Parses decrypted text into a JSON object; null for anything else (array, number, garbage). */
export function parseObject(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const value: unknown = JSON.parse(json);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
