import { DomainError } from '../../../shared/kernel/domain-error.js';

/** The `{data}` body is not a valid obfuscated envelope (bad locator chars, base64 or JSON). */
export class BadEnvelopeError extends DomainError {
  readonly code = 'legacy.bad_envelope';
}

/** The XOR device token does not decode to `<deviceId>,<mac>` with the expected key. */
export class BadTokenError extends DomainError {
  readonly code = 'legacy.bad_token';
}

/** The AES ciphertext is malformed, too long, or was made with another key. */
export class BadCiphertextError extends DomainError {
  readonly code = 'legacy.bad_ciphertext';
}
