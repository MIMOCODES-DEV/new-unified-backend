/** Reading the untrusted JSON old apps send. */

/** A field from the app's JSON, or '' when it is missing or not text. */
export const text = (value: unknown): string => (typeof value === 'string' ? value : '');
