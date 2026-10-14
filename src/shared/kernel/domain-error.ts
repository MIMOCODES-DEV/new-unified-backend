/**
 * Base class for expected business errors.
 * `code` is a stable, dotted identifier (e.g. `devices.invalid_mac`) that each interface
 * maps to its own wire format; never rely on `message` for logic.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
