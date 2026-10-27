import { timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '../../../shared/kernel/result.js';
import type { Playlist, PlaylistActor } from '../domain/playlist.js';
import { PinRequiredError, WrongPinError } from '../domain/playlist.errors.js';
import { PinCipher } from './ports/pin-cipher.js';

/**
 * PL-3: the PIN of a protected playlist hides its data on the website dashboard. The dashboard
 * needs it to show, change or delete that playlist; the device's own app never does.
 */
@Injectable()
export class PlaylistPins {
  constructor(private readonly cipher: PinCipher) {}

  /** Passes for the app, an unprotected playlist, or a protected one with its PIN. */
  async check(
    playlist: Playlist,
    pin: string | null | undefined,
    by: PlaylistActor,
  ): Promise<Result<void, PinRequiredError | WrongPinError>> {
    if (by === 'app' || !playlist.protected || playlist.pinEnc === null) return ok(undefined);
    if (!pin)
      return err(new PinRequiredError('This playlist is protected', { playlistId: playlist.id }));
    const stored = Buffer.from(await this.cipher.decrypt(playlist.pinEnc));
    const sent = Buffer.from(pin);
    const same = stored.length === sent.length && timingSafeEqual(stored, sent);
    return same ? ok(undefined) : err(new WrongPinError('Wrong PIN', { playlistId: playlist.id }));
  }

  /** The PIN in clear, for the replies that send it to the app (Roku, iOS); null when none. */
  async reveal(playlist: Playlist): Promise<string | null> {
    return playlist.pinEnc === null ? null : this.cipher.decrypt(playlist.pinEnc);
  }

  encrypt(pin: string): Promise<string> {
    return this.cipher.encrypt(pin);
  }
}
