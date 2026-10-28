import { describe, expect, it } from 'vitest';
import {
  customer,
  InMemoryCustomerRepository,
  InMemoryCustomerTokenRepository,
  PlainPasswordHasher,
  RecordingMailer,
  RecordingSessions,
} from '../../../../../test/support/account-fakes.js';
import { FixedClock } from '../../../../shared/kernel/clock.js';
import { CustomerLinks } from '../customer-links.js';
import {
  CustomerLoginUseCase,
  RequestPasswordResetUseCase,
  ResetPasswordUseCase,
  SignUpCustomerUseCase,
  UpdateCustomerProfileUseCase,
  VerifyCustomerEmailUseCase,
} from './customer-account.use-cases.js';

function setup(start = new Date('2026-10-28T12:00:00Z')) {
  const customers = new InMemoryCustomerRepository();
  const tokens = new InMemoryCustomerTokenRepository();
  const clock = new FixedClock(start);
  const hasher = new PlainPasswordHasher();
  const mailer = new RecordingMailer();
  const sessions = new RecordingSessions();
  const links = new CustomerLinks(tokens, clock);
  return {
    customers,
    tokens,
    mailer,
    sessions,
    setNow: (date: Date) => Object.assign(clock, { current: date }),
    signUp: new SignUpCustomerUseCase(customers, hasher, links, mailer, clock),
    verify: new VerifyCustomerEmailUseCase(customers, links, clock),
    login: new CustomerLoginUseCase(customers, hasher),
    requestReset: new RequestPasswordResetUseCase(customers, links, mailer),
    reset: new ResetPasswordUseCase(customers, links, hasher, sessions, clock),
    update: new UpdateCustomerProfileUseCase(customers, hasher, links, mailer, sessions, clock),
  };
}

const codeOf = <T>(r: { ok: true; value: T } | { ok: false; error: { code: string } }) =>
  r.ok ? 'ok' : r.error.code;

describe('CUS-1 sign-up and email verification', () => {
  it('signs up unverified, emails a link that verifies once', async () => {
    const t = setup();
    const signed = await t.signUp.execute({ email: ' Ana@Example.com', password: 'secret-pass' });
    if (!signed.ok) throw signed.error;
    expect(signed.value).toMatchObject({ email: 'ana@example.com', emailVerifiedAt: null });
    const token = t.mailer.last('verify')!.token;
    // Only the hash of the link's token is stored.
    expect([...t.tokens.items.keys()]).not.toContain(token);

    const verified = await t.verify.execute(token);
    expect(verified.ok && verified.value.emailVerifiedAt).toBeInstanceOf(Date);
    expect(codeOf(await t.verify.execute(token))).toBe('customers.invalid_link');
  });

  it('the email is unique in the brand, whatever the case', async () => {
    const t = setup();
    await t.signUp.execute({ email: 'ana@example.com', password: 'secret-pass' });
    const again = await t.signUp.execute({ email: 'ANA@example.com', password: 'secret-pass' });
    expect(codeOf(again)).toBe('customers.email_taken');
  });

  it('refuses a bad email or a short password', async () => {
    const t = setup();
    expect(codeOf(await t.signUp.execute({ email: 'nope', password: 'secret-pass' }))).toBe(
      'customers.invalid_input',
    );
    expect(codeOf(await t.signUp.execute({ email: 'a@b.co', password: 'short' }))).toBe(
      'customers.invalid_input',
    );
  });

  it('an expired link is refused', async () => {
    const t = setup();
    await t.signUp.execute({ email: 'ana@example.com', password: 'secret-pass' });
    t.setNow(new Date('2026-10-29T12:00:01Z'));
    expect(codeOf(await t.verify.execute(t.mailer.last('verify')!.token))).toBe(
      'customers.invalid_link',
    );
  });

  it('a new link replaces the older one', async () => {
    const t = setup();
    await t.signUp.execute({ email: 'ana@example.com', password: 'secret-pass' });
    const first = t.mailer.last('verify')!.token;
    const links = new CustomerLinks(t.tokens, new FixedClock(new Date('2026-10-28T12:00:00Z')));
    const second = await links.issue([...t.customers.items.values()][0]!, 'verifyEmail');
    expect(codeOf(await t.verify.execute(first))).toBe('customers.invalid_link');
    expect(codeOf(await t.verify.execute(second))).toBe('ok');
  });
});

describe('CUS-2 login and password reset', () => {
  it('a wrong password and an unknown email give the same answer', async () => {
    const t = setup();
    t.customers.items.set('customer-1', customer());
    const wrong = await t.login.execute({ email: 'ana@example.com', password: 'wrong-pass' });
    const unknown = await t.login.execute({ email: 'who@example.com', password: 'secret-pass' });
    expect(!wrong.ok && wrong.error).toEqual(!unknown.ok && unknown.error);
    expect((await t.login.execute({ email: 'ANA@example.com', password: 'secret-pass' })).ok).toBe(
      true,
    );
  });

  it('an unverified account cannot log in yet', async () => {
    const t = setup();
    t.customers.items.set('customer-1', customer({ emailVerifiedAt: null }));
    const result = await t.login.execute({ email: 'ana@example.com', password: 'secret-pass' });
    expect(codeOf(result)).toBe('customers.email_not_verified');
  });

  it('a reset link sets the password once and logs out every session', async () => {
    const t = setup();
    t.customers.items.set('customer-1', customer());
    await t.requestReset.execute('ana@example.com');
    const token = t.mailer.last('reset')!.token;
    // A weak password does not use up the link.
    expect(codeOf(await t.reset.execute({ token, password: 'short' }))).toBe(
      'customers.invalid_input',
    );
    expect(codeOf(await t.reset.execute({ token, password: 'brand-new-pass' }))).toBe('ok');
    expect(t.customers.items.get('customer-1')!.passwordHash).toBe('hashed:brand-new-pass');
    expect(t.sessions.revoked).toEqual(['customer-1']);
    expect(codeOf(await t.reset.execute({ token, password: 'brand-new-pass' }))).toBe(
      'customers.invalid_link',
    );
  });

  it('a reset request for an unknown email sends nothing and says nothing', async () => {
    const t = setup();
    await expect(t.requestReset.execute('who@example.com')).resolves.toBeUndefined();
    expect(t.mailer.sent).toEqual([]);
  });
});

describe('CUS-4 profile', () => {
  it('a new email clears emailVerifiedAt until its own link is opened', async () => {
    const t = setup();
    t.customers.items.set('customer-1', customer());
    const updated = await t.update.execute({
      customerId: 'customer-1',
      email: 'new@example.com',
      currentPassword: 'secret-pass',
    });
    expect(updated.ok && updated.value).toMatchObject({
      email: 'new@example.com',
      emailVerifiedAt: null,
    });
    const sent = t.mailer.last('verify')!;
    expect(sent.to).toBe('new@example.com');
    expect(codeOf(await t.verify.execute(sent.token))).toBe('ok');
    expect(t.customers.items.get('customer-1')!.emailVerifiedAt).not.toBeNull();
  });

  it('a link sent to the old address does not verify the new one', async () => {
    const t = setup();
    t.customers.items.set('customer-1', customer({ emailVerifiedAt: null }));
    const links = new CustomerLinks(t.tokens, new FixedClock(new Date('2026-10-28T12:00:00Z')));
    const oldLink = await links.issue(customer(), 'resetPassword');
    await t.update.execute({
      customerId: 'customer-1',
      email: 'new@example.com',
      currentPassword: 'secret-pass',
    });
    expect(codeOf(await t.reset.execute({ token: oldLink, password: 'whatever-pass' }))).toBe(
      'customers.invalid_link',
    );
  });

  it('changing the email or password needs the current password', async () => {
    const t = setup();
    t.customers.items.set('customer-1', customer());
    expect(
      codeOf(await t.update.execute({ customerId: 'customer-1', newPassword: 'another-pass' })),
    ).toBe('customers.invalid_credentials');
    expect(
      codeOf(
        await t.update.execute({
          customerId: 'customer-1',
          newPassword: 'another-pass',
          currentPassword: 'secret-pass',
        }),
      ),
    ).toBe('ok');
    expect(t.sessions.revoked).toEqual(['customer-1']);
    // A name alone needs nothing.
    expect(codeOf(await t.update.execute({ customerId: 'customer-1', firstName: 'Anna' }))).toBe(
      'ok',
    );
  });
});
