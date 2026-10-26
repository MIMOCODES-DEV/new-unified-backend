/** Draws captchas: the picture the TV shows. Only the picture leaves the backend, never the text. */
export abstract class CaptchaImage {
  /** Random text of `length` characters without look-alikes (0/O, 1/I/l), drawn as SVG. */
  abstract random(length: number): { text: string; svg: string };
  /** Draws a given text (the uid recovery captcha shows the stored uid). */
  abstract draw(text: string): string;
}
