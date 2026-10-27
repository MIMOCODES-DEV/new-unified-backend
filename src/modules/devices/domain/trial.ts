const DAY_MS = 24 * 60 * 60 * 1000;

/** A trial ends at the end of the UTC day `days` days after it starts; 0 days = end of today. */
export function trialEndsAt(startedAt: Date, days: number): Date {
  const last = new Date(startedAt.getTime() + days * DAY_MS);
  return new Date(
    Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate(), 23, 59, 59, 999),
  );
}
