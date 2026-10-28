import { randomInt } from 'node:crypto';
import { RecoveryCodeGenerator } from '../application/ports/recovery-code-generator.js';
import { RECOVERY_CODE_ALPHABET, RECOVERY_CODE_LENGTH } from '../domain/recovery-code.js';

/** 31^8 (about 850 billion) codes, from a cryptographic random source. */
export class RandomRecoveryCodeGenerator extends RecoveryCodeGenerator {
  next(): string {
    let code = '';
    for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) {
      code += RECOVERY_CODE_ALPHABET[randomInt(RECOVERY_CODE_ALPHABET.length)];
    }
    return code;
  }
}
