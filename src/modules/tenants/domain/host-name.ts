import { DomainError } from '../../../shared/kernel/domain-error.js';
import { err, ok, type Result } from '../../../shared/kernel/result.js';

export class InvalidHostNameError extends DomainError {
  readonly code = 'tenants.invalid_host';
}

// One or more DNS labels: letters, digits and inner hyphens, max 253 characters in total.
const HOST_NAME =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

/**
 * A host name as it appears in the Host header, normalized: lowercase, no port, no trailing dot.
 * `CRTVPlayer.com:443` and `crtvplayer.com.` both become `crtvplayer.com`.
 * Matching is always exact — `crapi.crtvplayer.com` is NOT `crtvplayer.com`.
 */
export class HostName {
  private constructor(readonly value: string) {}

  static parse(input: string): Result<HostName, InvalidHostNameError> {
    const value = input.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
    if (!HOST_NAME.test(value)) {
      return err(new InvalidHostNameError('Invalid host name', { input }));
    }
    return ok(new HostName(value));
  }

  equals(other: HostName): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
