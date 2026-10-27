/**
 * The per-IP limit on changing playlists by MAC alone (no login), bound at the process root
 * (src/module-settings.ts). One call counts once, whatever its outcome.
 */
export abstract class MacOnlyRateLimit {
  abstract take(ip: string): Promise<{ allowed: boolean; retryAfterMs: number }>;
}
