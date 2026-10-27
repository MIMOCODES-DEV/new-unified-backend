import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/kernel/clock.js';
import type { License } from '../domain/license.js';
import { LicenseRepository } from './ports/license.repository.js';

const DAY = 24 * 60 * 60_000;
const YEAR = 365 * DAY;

/**
 * Example licenses for local development (`pnpm cli seed:examples`), for the paid example devices
 * of the devices module (`example-paid-*`). Running it again refreshes the same rows.
 */
@Injectable()
export class SeedLicenseExamples {
  constructor(
    private readonly licenses: LicenseRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<{ licenses: number }> {
    const examples = licenseExamples(this.clock.now());
    for (const license of examples) {
      if (await this.licenses.findById(license.id)) await this.licenses.update(license);
      else await this.licenses.insert(license);
    }
    return { licenses: examples.length };
  }
}

function licenseExamples(now: Date): License[] {
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const firstYearEnds = new Date(ago(300).getTime() + YEAR);
  const license = (
    l: Partial<License> & Pick<License, 'id' | 'deviceId' | 'createdAt'>,
  ): License => ({
    type: 'yearly',
    expiresAt: null,
    revoked: false,
    revokedAt: null,
    activatedBy: { source: 'admin', actorId: 'example-staff-1' },
    creditCost: 1,
    multiActivate: false,
    sourceId: null,
    ...l,
  });
  return [
    // A yearly license, then a second one bought before it ended: it starts where the first ends.
    license({
      id: 'example-license-yearly-1',
      deviceId: 'example-paid-yearly',
      expiresAt: firstYearEnds,
      activatedBy: { source: 'reseller', actorId: 'example-reseller-1' },
      sourceId: 'example-code-1',
      createdAt: ago(300),
    }),
    license({
      id: 'example-license-yearly-2',
      deviceId: 'example-paid-yearly',
      expiresAt: new Date(firstYearEnds.getTime() + YEAR),
      activatedBy: { source: 'code', actorId: null },
      sourceId: 'example-code-2',
      createdAt: ago(10),
    }),
    // Lifetime from a multi-device store order: no end date, costs 2 credits, MAC switch refused.
    license({
      id: 'example-license-lifetime',
      deviceId: 'example-paid-lifetime',
      type: 'lifetime',
      creditCost: 2,
      multiActivate: true,
      activatedBy: { source: 'store', actorId: null },
      sourceId: 'example-store-order-1',
      createdAt: ago(300),
    }),
    // Paid online.
    license({
      id: 'example-license-switched',
      deviceId: 'example-paid-switched',
      expiresAt: new Date(ago(300).getTime() + YEAR),
      activatedBy: { source: 'payment', actorId: null },
      sourceId: 'example-transaction-1',
      createdAt: ago(300),
    }),
    // Revoked by staff: the row stays as history.
    license({
      id: 'example-license-revoked',
      deviceId: 'example-paid-revoked',
      expiresAt: new Date(ago(300).getTime() + YEAR),
      revoked: true,
      revokedAt: ago(1),
      createdAt: ago(300),
    }),
  ];
}
