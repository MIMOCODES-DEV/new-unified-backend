import svgCaptcha from 'svg-captcha';
import { CaptchaImageGenerator } from '../application/ports/captcha.ports.js';

/** Same look as the old cr backend: 2 characters, no look-alike letters, white on black. */
export class SvgCaptchaGenerator extends CaptchaImageGenerator {
  create(): { text: string; svg: string } {
    const captcha = svgCaptcha.create({
      size: 2,
      noise: 1,
      color: true,
      background: '#000',
      fontSize: 100,
      ignoreChars: '0O1lI',
      charPreset: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ2345789',
    });
    return {
      text: captcha.text,
      svg: captcha.data.replace('<svg', '<svg style="color: white;" width="200" height="120"'),
    };
  }
}
