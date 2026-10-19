import type { Device } from '../../domain/device.entity.js';
import type { Uid } from '../../domain/uid.js';
import type { CaptchaImages, CaptchaStore } from '../ports/captcha.js';

/** The app must type the device's current u_id from an image before its new u_id is accepted. */
export interface UidChallenge {
  kind: 'uid_challenge';
  /** True when the app already answered once and got it wrong. */
  retry: boolean;
  svg: string;
  token: string;
}

/**
 * The V4 ownership rule (same in the three old backends): a device keeps the first u_id it was seen
 * with. Another install (other u_id) is challenged with an image of the current u_id; typing it back
 * proves physical access to the device and swaps the u_id.
 * Returns null when the request may continue (the device's u_id is updated in memory).
 */
export async function checkUidOwnership(
  input: {
    device: Device;
    uid: Uid;
    uidCaptchaCode?: string | undefined;
    uidCaptchaToken?: string | undefined;
  },
  captchas: CaptchaStore,
  images: CaptchaImages,
): Promise<UidChallenge | null> {
  const { device, uid, uidCaptchaCode, uidCaptchaToken } = input;
  const current = device.uid;
  if (!current) {
    device.adoptUidIfMissing(uid);
    return null;
  }
  if (current.equals(uid)) return null;

  const answered = Boolean(uidCaptchaCode && uidCaptchaToken);
  if (
    uidCaptchaCode &&
    uidCaptchaToken &&
    (await captchas.consume({
      purpose: 'uid_recovery',
      mac: device.macAddress,
      token: uidCaptchaToken,
      answer: uidCaptchaCode,
    }))
  ) {
    device.replaceUid(uid);
    return null;
  }
  const token = await captchas.create({
    purpose: 'uid_recovery',
    mac: device.macAddress,
    text: current.value,
  });
  return { kind: 'uid_challenge', retry: answered, svg: images.uidRecovery(current.value), token };
}
