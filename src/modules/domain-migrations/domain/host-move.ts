import type { DomainMigration, Scheme } from './domain-migration.js';

/** A move learned from one playlist edit: the provider's host changed, nothing else did. */
export interface HostMove {
  /** Lowercase host[:port]; the port only when it is not the scheme's default. */
  readonly fromHost: string;
  readonly toHost: string;
  readonly fromScheme: Scheme;
  readonly toScheme: Scheme;
}

/** A move shows up for approval once this many paid devices on different IPs reported it. */
export const CONFIRMATIONS_FOR_APPROVAL = 3;

function parse(link: string): URL | null {
  const text = link.trim();
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`);
  } catch {
    return null;
  }
}

function scheme(url: URL): Scheme {
  return url.protocol === 'https:' ? 'https' : url.protocol === 'http:' ? 'http' : '';
}

/**
 * DOM-1: the move one edit shows, as the old cr backend learned it: the link before and after
 * differ only by host (and port or scheme). Same path, same query parameter names; the values may
 * differ, because a provider that moves often reissues logins. Anything else (another provider, a
 * fixed typo in the path, an M3U link turned Xtream) is not a move: null.
 */
export function hostMoveBetween(before: string | null, after: string | null): HostMove | null {
  if (!before || !after) return null;
  const a = parse(before);
  const b = parse(after);
  if (!a || !b || !scheme(a) || !scheme(b)) return null;
  // URL.host is lower case, with the port only when it is not the default one.
  if (!a.host || !b.host || a.host === b.host) return null;
  if (a.pathname.replace(/\/+$/, '') !== b.pathname.replace(/\/+$/, '')) return null;
  const names = (u: URL) => [...u.searchParams.keys()].sort().join('&');
  if (names(a) !== names(b)) return null;
  return { fromHost: a.host, toHost: b.host, fromScheme: scheme(a), toScheme: scheme(b) };
}

/** Confirmations that count: one per IP. */
export function confirmationCount(move: DomainMigration): number {
  return new Set(move.confirmations.map((c) => c.ipHash)).size;
}

/** DOM-1: a pending move confirmed from enough IPs; a staff member approves or blocks it. */
export function awaitsApproval(move: DomainMigration): boolean {
  return move.status === 'pending' && confirmationCount(move) >= CONFIRMATIONS_FOR_APPROVAL;
}
