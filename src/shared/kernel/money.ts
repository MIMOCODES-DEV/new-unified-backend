import { DomainError } from './domain-error.js';
import { err, ok, type Result } from './result.js';

export class InvalidMoneyError extends DomainError {
  readonly code = 'kernel.invalid_money';
}

/** An amount in integer minor units (cents) with an ISO 4217 currency. Never a float. */
export class Money {
  private constructor(
    readonly amountMinor: number,
    readonly currency: string,
  ) {}

  static of(amountMinor: number, currency: string): Result<Money, InvalidMoneyError> {
    if (!Number.isSafeInteger(amountMinor)) {
      return err(
        new InvalidMoneyError('Amount must be an integer number of minor units', { amountMinor }),
      );
    }
    const code = currency.toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      return err(new InvalidMoneyError('Currency must be a 3-letter ISO 4217 code', { currency }));
    }
    return ok(new Money(amountMinor, code));
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinor + other.amountMinor, this.currency);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amountMinor === other.amountMinor;
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new InvalidMoneyError('Cannot combine different currencies', {
        left: this.currency,
        right: other.currency,
      });
    }
  }
}
