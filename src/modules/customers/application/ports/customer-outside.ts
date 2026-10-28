/** A device linked to a customer account, as the account page shows it. */
export interface CustomerDevice {
  readonly id: string;
  readonly macAddress: string;
  readonly platform: string;
  readonly lastSeenAt: Date;
}

export type LinkOutcome =
  | { readonly status: 'linked'; readonly device: CustomerDevice }
  | { readonly status: 'mismatch' | 'not_paid' | 'linked_elsewhere' };

/** The brand's devices, as the customers module sees them (bound by the process root). */
export abstract class CustomerDevices {
  /** By MAC and device key (CUS-3). `mismatch` also for an unknown or invalid MAC. */
  abstract link(mac: string, deviceKey: string, customerId: string): Promise<LinkOutcome>;
  /** False when the device is not linked to this customer. */
  abstract unlink(deviceId: string, customerId: string): Promise<boolean>;
  abstract listFor(customerId: string): Promise<CustomerDevice[]>;
}

/** Sends the one-time links by email, from the brand's sender, to the brand site's pages. */
export abstract class CustomerMailer {
  abstract sendEmailVerification(to: string, token: string): Promise<void>;
  abstract sendPasswordReset(to: string, token: string): Promise<void>;
}

/** Ends a customer's sessions in the current brand (password reset or change). */
export abstract class CustomerSessions {
  abstract revokeAll(customerId: string): Promise<void>;
}
