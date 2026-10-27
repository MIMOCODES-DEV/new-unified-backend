import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../shared/config/app-config.js';

/** StarArcs answers in about a second; an app waits for the token before opening sports. */
const TIMEOUT_MS = 10_000;

/**
 * Registers a device as a guest on StarArcs (`POST /api/v3/tv/auth`), as the old backends' V4
 * `device/add` did, so the partner key never ships in an app. The reply is relayed as it is.
 */
@Injectable()
export class StarArcsGuests {
  private readonly logger = new Logger(StarArcsGuests.name);

  constructor(private readonly config: AppConfig) {}

  /** StarArcs' reply, or null when it is not set up, did not answer, or refused. */
  async register(mac: string, appName: string): Promise<unknown> {
    const token = this.config.env.STARARCS_GUEST_TOKEN;
    if (!token) {
      this.logger.error('STARARCS_GUEST_TOKEN is not set: device/add cannot register devices');
      return null;
    }
    try {
      const res = await fetch(new URL('/api/v3/tv/auth', this.config.env.STARARCS_URL), {
        method: 'POST',
        headers: {
          'X-Secret-Token': token,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ DeviceMac: mac, DeviceAppName: appName }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok || body === null) {
        this.logger.warn(`StarArcs refused ${appName} ${mac}: HTTP ${res.status}`);
        return null;
      }
      return body;
    } catch (error) {
      this.logger.warn(
        `StarArcs did not answer for ${appName} ${mac}: ${(error as Error).message}`,
      );
      return null;
    }
  }
}
