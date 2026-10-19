import { CaptchaRepository } from '../../src/modules/devices/application/ports/captcha.ports.js';
import type { DeviceCaptcha } from '../../src/modules/devices/domain/device-captcha.js';
import type { MacAddress } from '../../src/shared/kernel/mac-address.js';

/** Test double: one captcha per MAC in a Map. */
export class InMemoryCaptchaRepository extends CaptchaRepository {
  readonly items = new Map<string, DeviceCaptcha>();

  findByMac(mac: MacAddress): Promise<DeviceCaptcha | null> {
    return Promise.resolve(this.items.get(mac.value) ?? null);
  }

  save(captcha: DeviceCaptcha): Promise<void> {
    this.items.set(captcha.macAddress, captcha);
    return Promise.resolve();
  }
}
