/** `true`, `12`, `null`, `["a","b"]` are read as JSON; anything else is a plain string. */
export function parseValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** `features.maintenance` + `true` → `{ features: { maintenance: true } }`. */
export function patchFromPath(path: string, value: unknown): Record<string, unknown> {
  const keys = path.split('.').filter(Boolean);
  if (keys.length === 0) throw new Error('A setting name is required, e.g. features.maintenance');
  return keys.reduceRight<unknown>((inner, key) => ({ [key]: inner }), value) as Record<
    string,
    unknown
  >;
}

/** Everything piped to the command (`echo value | pnpm cli …`), so secrets stay out of shell history. */
export async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '');
}
