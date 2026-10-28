import { Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import type { CustomerMailer } from '../../../modules/customers/index.js';

/** The brand's email setup: the SMTP server (secret `smtp.url`), sender, and site address. */
export interface BrandMail {
  brandName: string;
  /** e.g. `smtps://user:password@smtp.example.com:465`; null = not set up. */
  smtpUrl: string | null;
  from: string | null;
  /** The brand site the links open (`TenantSettings.frontendUrl`). */
  siteUrl: string | null;
}

const logger = new Logger('CustomerMail');

/** An email that was not sent (no SMTP, outside production). */
export interface UnsentEmail {
  to: string;
  subject: string;
  /** The token in its link. */
  token: string;
  at: Date;
}

const OUTBOX_SIZE = 100;
/** The latest unsent emails, newest last, for the dev outbox route (404 in production). */
export const devOutbox: UnsentEmail[] = [];

/** The page on the brand site that takes the token: built by the frontend team. */
const PAGES = { verify: '/verify-email', reset: '/reset-password' } as const;

/**
 * Sends customer emails over the brand's own SMTP server (DISCUSSIONS #9.3). A brand without SMTP
 * set up outside production gets the email in the log instead, so sign-up can be tried locally.
 */
export class SmtpCustomerMailer implements CustomerMailer {
  constructor(
    private readonly brand: () => Promise<BrandMail>,
    private readonly production: boolean,
  ) {}

  async sendEmailVerification(to: string, token: string): Promise<void> {
    const brand = await this.brand();
    const link = linkTo(brand, PAGES.verify, token);
    await this.send(brand, to, token, `Confirm your email for ${brand.brandName}`, [
      `Open this link to confirm your email address:`,
      link,
      ``,
      `The link works once and for 24 hours. If you did not sign up, ignore this email.`,
    ]);
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const brand = await this.brand();
    const link = linkTo(brand, PAGES.reset, token);
    await this.send(brand, to, token, `Reset your ${brand.brandName} password`, [
      `Open this link to choose a new password:`,
      link,
      ``,
      `The link works once and for 1 hour. If you did not ask for it, ignore this email.`,
    ]);
  }

  private async send(
    brand: BrandMail,
    to: string,
    token: string,
    subject: string,
    lines: string[],
  ): Promise<void> {
    if (!brand.smtpUrl || !brand.from) {
      if (this.production) {
        throw new Error(
          `${brand.brandName}: email is not set up (secret smtp.url, config email.from)`,
        );
      }
      logger.warn(`Email not sent (no SMTP set up) to ${to}: ${subject}\n${lines.join('\n')}`);
      devOutbox.push({ to, subject, token, at: new Date() });
      devOutbox.splice(0, Math.max(0, devOutbox.length - OUTBOX_SIZE));
      return;
    }
    await createTransport(brand.smtpUrl).sendMail({
      from: brand.from,
      to,
      subject,
      text: lines.join('\n'),
    });
  }
}

function linkTo(brand: BrandMail, page: string, token: string): string {
  const base = (brand.siteUrl ?? 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}${page}?token=${encodeURIComponent(token)}`;
}
