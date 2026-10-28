import { Injectable } from '@nestjs/common';
import { SessionStore } from '../../../shared/auth/session-store.js';
import { AppConfig } from '../../../shared/config/app-config.js';
import {
  EnvelopeEncryption,
  type SealedSecret,
} from '../../../shared/crypto/envelope-encryption.js';
import { StaffSessions, TwoFactorSecretCipher } from '../application/ports/staff-security.js';

@Injectable()
export class RedisStaffSessions extends StaffSessions {
  constructor(private readonly sessions: SessionStore) {
    super();
  }

  async revokeAll(staffId: string): Promise<void> {
    await this.sessions.revokeAll({ kind: 'staff', id: staffId, tenantId: null });
    await this.sessions.revokeAll({ kind: 'staff-2fa', id: staffId, tenantId: null });
  }
}

/** Sealed with the same master key as brand secrets (`TENANT_SECRETS_KEY`). */
@Injectable()
export class EnvelopeTwoFactorCipher extends TwoFactorSecretCipher {
  private encryption: EnvelopeEncryption | null = null;

  constructor(private readonly config: AppConfig) {
    super();
  }

  seal(staffId: string, secret: string): string {
    return JSON.stringify(this.envelope().seal(secret, context(staffId)));
  }

  open(staffId: string, sealed: string): string {
    return this.envelope().open(JSON.parse(sealed) as SealedSecret, context(staffId));
  }

  private envelope(): EnvelopeEncryption {
    if (!this.encryption) {
      const key = this.config.env.TENANT_SECRETS_KEY;
      if (!key) throw new Error('TENANT_SECRETS_KEY is not set (see .env.example)');
      this.encryption = EnvelopeEncryption.fromBase64(key);
    }
    return this.encryption;
  }
}

const context = (staffId: string) => `staff/${staffId}/totp`;
