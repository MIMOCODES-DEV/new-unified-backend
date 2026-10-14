import { describe, expect, it } from 'vitest';
import { Money } from './money.js';

const money = (amount: number, currency: string): Money => {
  const result = Money.of(amount, currency);
  if (!result.ok) throw result.error;
  return result.value;
};

describe('Money', () => {
  it('normalizes the currency code', () => {
    expect(money(1999, 'eur').currency).toBe('EUR');
  });

  it('rejects fractional minor units', () => {
    expect(Money.of(19.99, 'EUR').ok).toBe(false);
  });

  it('rejects invalid currency codes', () => {
    expect(Money.of(100, 'EURO').ok).toBe(false);
  });

  it('adds amounts of the same currency', () => {
    expect(money(150, 'EGP').add(money(50, 'EGP')).equals(money(200, 'EGP'))).toBe(true);
  });

  it('refuses to add different currencies', () => {
    expect(() => money(1, 'EUR').add(money(1, 'USD'))).toThrow('different currencies');
  });
});
