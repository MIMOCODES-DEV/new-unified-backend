import { Injectable } from '@nestjs/common';
import type { Result } from '../../../../shared/kernel/result.js';
import type { InvalidTrialDaysError } from '../../domain/device.errors.js';
import { TrialDays } from '../../domain/trial-days.js';
import { DeviceSettings } from '../ports/device-settings.js';

/** Changes how long new devices of the current brand stay on trial. Existing trials keep their dates. */
@Injectable()
export class SetTrialDaysUseCase {
  constructor(private readonly settings: DeviceSettings) {}

  async execute(input: { days: unknown }): Promise<Result<TrialDays, InvalidTrialDaysError>> {
    const days = TrialDays.parse(input.days);
    if (days.ok) await this.settings.setTrialDays(days.value);
    return days;
  }
}
