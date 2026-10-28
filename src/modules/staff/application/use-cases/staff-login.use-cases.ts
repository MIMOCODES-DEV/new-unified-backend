import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { EmailAddress } from '../../../../shared/kernel/email-address.js';
import { PasswordHasher } from '../../../../shared/kernel/password-hasher.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { newTotpSecret, totpUri, verifyTotp } from '../../../../shared/kernel/totp.js';
import type { StaffUser } from '../../domain/staff.js';
import {
  InvalidStaffCredentialsError,
  InvalidTwoFactorCodeError,
  StaffDisabledError,
  StaffNotFoundError,
  TwoFactorStateError,
} from '../../domain/staff.errors.js';
import { StaffSessions, TwoFactorSecretCipher } from '../ports/staff-security.js';
import { StaffUserRepository } from '../ports/staff.repositories.js';

const TOTP_ISSUER = 'Unified admin';

/** Whether this staff member must give an authenticator code after the password. */
const twoFactorOn = (staff: StaffUser) => staff.twoFactor?.enabledAt != null;

/**
 * STF-1: email and password. A wrong password and an unknown email give the same error and take
 * about the same time. With 2FA on, the login is not done yet: the caller asks for the code.
 */
@Injectable()
export class StaffLoginUseCase {
  private decoy: Promise<string> | null = null;

  constructor(
    private readonly staff: StaffUserRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    email: string;
    password: string;
  }): Promise<
    Result<
      { staff: StaffUser; twoFactorRequired: boolean },
      InvalidStaffCredentialsError | StaffDisabledError
    >
  > {
    const invalid = new InvalidStaffCredentialsError('Email or password is not correct');
    const email = EmailAddress.parse(input.email);
    const found = email.ok ? await this.staff.findByEmail(email.value) : null;
    if (!found) {
      // Same work as a real check, so the answer time does not tell which emails exist.
      await this.hasher.verify(input.password, await (this.decoy ??= this.hasher.hash('decoy')));
      return err(invalid);
    }
    if (!(await this.hasher.verify(input.password, found.passwordHash))) return err(invalid);
    if (found.status !== 'active') return err(new StaffDisabledError('This account is disabled'));
    if (twoFactorOn(found)) return ok({ staff: found, twoFactorRequired: true });
    return ok({ staff: await this.loggedIn(found), twoFactorRequired: false });
  }

  async loggedIn(staff: StaffUser): Promise<StaffUser> {
    const now = this.clock.now();
    const updated = { ...staff, lastLoginAt: now };
    await this.staff.update(updated);
    return updated;
  }
}

/** Second step of a login with 2FA: the code from the authenticator app. */
@Injectable()
export class StaffTwoFactorLoginUseCase {
  constructor(
    private readonly staff: StaffUserRepository,
    private readonly cipher: TwoFactorSecretCipher,
    private readonly login: StaffLoginUseCase,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    staffId: string;
    code: string;
  }): Promise<
    Result<StaffUser, InvalidStaffCredentialsError | StaffDisabledError | InvalidTwoFactorCodeError>
  > {
    const found = await this.staff.findById(input.staffId);
    if (!found || !twoFactorOn(found)) {
      return err(new InvalidStaffCredentialsError('Log in again'));
    }
    if (found.status !== 'active') return err(new StaffDisabledError('This account is disabled'));
    const secret = this.cipher.open(found.id, found.twoFactor!.secretEnc);
    if (!verifyTotp(secret, input.code, this.clock.now())) {
      return err(new InvalidTwoFactorCodeError('The code is not correct'));
    }
    return ok(await this.login.loggedIn(found));
  }
}

/**
 * Starts 2FA for the caller: a new secret, shown once as a link for the QR code. Not required at
 * login until confirmed with a first code (`EnableTwoFactorUseCase`).
 */
@Injectable()
export class SetUpTwoFactorUseCase {
  constructor(
    private readonly staff: StaffUserRepository,
    private readonly cipher: TwoFactorSecretCipher,
    private readonly clock: Clock,
  ) {}

  async execute(
    staffId: string,
  ): Promise<Result<{ secret: string; uri: string }, StaffNotFoundError | TwoFactorStateError>> {
    const found = await this.staff.findById(staffId);
    if (!found) return err(new StaffNotFoundError('Staff member not found'));
    if (twoFactorOn(found)) {
      return err(new TwoFactorStateError('Two-factor login is already on; turn it off first'));
    }
    const secret = newTotpSecret();
    await this.staff.update({
      ...found,
      twoFactor: { secretEnc: this.cipher.seal(found.id, secret), enabledAt: null },
      updatedAt: this.clock.now(),
    });
    return ok({ secret, uri: totpUri(TOTP_ISSUER, found.email, secret) });
  }
}

/** Turns 2FA on (with the first code from the app) or off (with a current code). */
@Injectable()
export class ToggleTwoFactorUseCase {
  constructor(
    private readonly staff: StaffUserRepository,
    private readonly cipher: TwoFactorSecretCipher,
    private readonly sessions: StaffSessions,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    staffId: string;
    on: boolean;
    code: string;
  }): Promise<
    Result<
      { enabled: boolean },
      StaffNotFoundError | TwoFactorStateError | InvalidTwoFactorCodeError
    >
  > {
    const found = await this.staff.findById(input.staffId);
    if (!found) return err(new StaffNotFoundError('Staff member not found'));
    if (!found.twoFactor || twoFactorOn(found) === input.on) {
      return err(
        new TwoFactorStateError(
          input.on ? 'Set up two-factor login first' : 'Two-factor login is not on',
        ),
      );
    }
    const now = this.clock.now();
    const secret = this.cipher.open(found.id, found.twoFactor.secretEnc);
    if (!verifyTotp(secret, input.code, now)) {
      return err(new InvalidTwoFactorCodeError('The code is not correct'));
    }
    await this.staff.update({
      ...found,
      twoFactor: input.on ? { ...found.twoFactor, enabledAt: now } : null,
      updatedAt: now,
    });
    // Turning it off weakens the account: other sessions must log in again.
    if (!input.on) await this.sessions.revokeAll(found.id);
    return ok({ enabled: input.on });
  }
}
