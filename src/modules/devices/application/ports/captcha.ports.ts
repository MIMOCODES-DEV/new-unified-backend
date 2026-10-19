import type { MacAddress } from '../../../../shared/kernel/mac-address.js';
import type { DeviceCaptcha } from '../../domain/device-captcha.js';

/** Stores one captcha per MAC, in the current brand's database. */
export abstract class CaptchaRepository {
  abstract findByMac(mac: MacAddress): Promise<DeviceCaptcha | null>;
  /** Creates or replaces the captcha of that MAC. */
  abstract save(captcha: DeviceCaptcha): Promise<void>;
}

/** How the captcha looks (V4 apps: 4 characters, 300px wide). */
export interface CaptchaStyle {
  length: number;
  width: number;
}

/** Draws a captcha: the text to type and the picture (SVG) the TV shows. */
export abstract class CaptchaImageGenerator {
  abstract create(style: CaptchaStyle): { text: string; svg: string };
}
