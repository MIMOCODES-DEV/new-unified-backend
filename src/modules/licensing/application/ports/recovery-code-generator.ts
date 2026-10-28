/** Draws new recovery codes: 8 characters from RECOVERY_CODE_ALPHABET. */
export abstract class RecoveryCodeGenerator {
  abstract next(): string;
}
