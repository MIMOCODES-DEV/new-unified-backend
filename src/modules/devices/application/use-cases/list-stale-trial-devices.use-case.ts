import { Injectable } from '@nestjs/common';
import type { TrialDevice } from '../../domain/device.js';
import { TrialDeviceRepository } from '../ports/trial-device.repository.js';

export interface StaleTrialQuery {
  /** The trial ended before this. */
  endedBefore: Date;
  /** Not seen since this. */
  notSeenSince: Date;
  limit: number;
}

/** LIC-4: trial devices the cleanup may remove: trial ended, no playlist, not seen for a while. */
@Injectable()
export class ListStaleTrialDevicesUseCase {
  constructor(private readonly trials: TrialDeviceRepository) {}

  execute(query: StaleTrialQuery): Promise<TrialDevice[]> {
    return this.trials.listStale(query.endedBefore, query.notSeenSince, query.limit);
  }
}
