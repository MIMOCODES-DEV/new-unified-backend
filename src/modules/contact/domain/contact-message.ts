/** A message from a brand site's contact form, kept in that brand's database for staff to read. */
export interface ContactMessage {
  readonly id: string;
  readonly name: string | null;
  /** Lowercase; where staff answer. */
  readonly email: string;
  readonly subject: string | null;
  readonly message: string;
  /** Where it came from, to spot spam. */
  readonly ip: string;
  readonly userAgent: string | null;
  readonly createdAt: Date;
}

export const MAX_NAME = 100;
export const MAX_SUBJECT = 200;
export const MAX_MESSAGE = 5000;
