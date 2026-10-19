import svgCaptcha from 'svg-captcha';
import { CaptchaImageGenerator, type CaptchaStyle } from '../application/ports/captcha.ports.js';

/** Same look as the old backends: no look-alike letters, white on black. */
export class SvgCaptchaGenerator extends CaptchaImageGenerator {
  create(style: CaptchaStyle): { text: string; svg: string } {
    const captcha = svgCaptcha.create({
      size: style.length,
      noise: style.length > 2 ? 2 : 1,
      color: true,
      background: '#000',
      fontSize: 100,
      ignoreChars: '0O1lI',
      charPreset: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ2345789',
    });
    return {
      text: captcha.text,
      svg: captcha.data.replace(
        '<svg',
        `<svg style="color: white;" width="${style.width}" height="120"`,
      ),
    };
  }
}
