/** Ends a staff member's sessions on every server (disabled, new password, 2FA reset). */
export abstract class StaffSessions {
  abstract revokeAll(staffId: string): Promise<void>;
}

/** Encrypts the 2FA secret at rest; bound to the staff id, so a copied row does not open. */
export abstract class TwoFactorSecretCipher {
  abstract seal(staffId: string, secret: string): string;
  abstract open(staffId: string, sealed: string): string;
}
