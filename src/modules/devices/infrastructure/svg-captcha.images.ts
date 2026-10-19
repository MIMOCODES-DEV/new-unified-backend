import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import svgCaptcha from 'svg-captcha';
import { CaptchaImages } from '../application/ports/captcha.js';

/**
 * Captcha images as the old V4 backends drew them, so installed apps display them the same way:
 * svg-captcha with the old options, and the same white-text patch on the root element.
 */
@Injectable()
export class SvgCaptchaImages extends CaptchaImages {
  registration(): { text: string; svg: string } {
    const captcha = svgCaptcha.create({
      size: 4,
      noise: 2,
      color: true,
      background: '#000',
      fontSize: 100,
      ignoreChars: '0O1lI',
      charPreset: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ2345789',
    });
    return {
      text: captcha.text.toUpperCase(),
      svg: captcha.data.replace('<svg', '<svg style="color: white;" width="300" height="120"'),
    };
  }

  /** Same layout as the old hand-built image: 300×120, dark background, rotated characters, noise. */
  uidRecovery(uid: string): string {
    const chars = [...uid]
      .map((char, i) => {
        const x = 40 + i * 40;
        const y = 70 + randomInt(-8, 9);
        const angle = randomInt(-20, 21);
        return `<text x="${x}" y="${y}" font-size="40" font-family="Arial, sans-serif" font-weight="bold" fill="#fff" transform="rotate(${angle} ${x} ${y})">${escapeXml(char)}</text>`;
      })
      .join('');
    const lines = Array.from(
      { length: 8 },
      () =>
        `<line x1="${randomInt(0, 300)}" y1="${randomInt(0, 120)}" x2="${randomInt(0, 300)}" y2="${randomInt(0, 120)}" stroke="#888" stroke-width="1"/>`,
    ).join('');
    const dots = Array.from(
      { length: 25 },
      () => `<circle cx="${randomInt(0, 300)}" cy="${randomInt(0, 120)}" r="1.5" fill="#aaa"/>`,
    ).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="120" viewBox="0 0 300 120"><rect width="300" height="120" fill="#1a1a2e"/>${lines}${dots}${chars}</svg>`;
  }
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
