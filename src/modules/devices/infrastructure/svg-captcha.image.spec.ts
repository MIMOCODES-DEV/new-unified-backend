import { describe, expect, it } from 'vitest';
import { SvgCaptchaImage } from './svg-captcha.image.js';

describe('SvgCaptchaImage', () => {
  const image = new SvgCaptchaImage();

  it('makes random text of the asked length, without look-alike characters', () => {
    const { text, svg } = image.random(6);

    expect(text).toMatch(/^[A-HJ-KM-NP-Z2-57-9]{6}$/);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toContain(text);
  });

  it('draws a given text', () => {
    expect(image.draw('QW12ER').startsWith('<svg')).toBe(true);
  });
});
