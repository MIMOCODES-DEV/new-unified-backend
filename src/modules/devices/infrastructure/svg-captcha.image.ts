import { randomInt } from 'node:crypto';
import svgCaptcha from 'svg-captcha';
import { CaptchaImage } from '../application/ports/captcha-image.js';

/** Letters and digits that cannot be mistaken for one another, as in the old backends. */
const CHARACTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ2345789';

/** The package's default export draws a given text; its typings only describe `create`. */
const drawText = svgCaptcha as unknown as (text: string, options: object) => string;

/** Same look as the old backends: white on black, a little noise. */
export class SvgCaptchaImage extends CaptchaImage {
  random(length: number): { text: string; svg: string } {
    const text = Array.from({ length }, () => CHARACTERS[randomInt(CHARACTERS.length)]).join('');
    return { text, svg: this.draw(text) };
  }

  draw(text: string): string {
    return drawText(text, {
      noise: text.length > 2 ? 2 : 1,
      color: true,
      background: '#000',
      fontSize: 100,
      width: Math.max(150, text.length * 60),
      height: 120,
    });
  }
}
