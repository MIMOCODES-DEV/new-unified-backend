import { z } from 'zod';

/** A site captcha's token (GET /site/captcha) and what the person typed. */
export const captchaAnswer = z.object({
  token: z.string().max(100),
  answer: z.string().max(20),
});

/** What a playlist points to, as the site's forms send it. */
export const playlistSource = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('link'), url: z.string().max(2048) }),
  z.object({
    kind: z.literal('xtream'),
    server: z.string().max(2048),
    username: z.string().max(200),
    password: z.string().max(200),
  }),
  z.object({
    kind: z.literal('stalker'),
    portalUrl: z.string().max(2048),
    portalName: z.string().max(200).nullable().optional(),
    fallbackUrl: z.string().max(2048).nullable().optional(),
    mac: z.string().max(64).nullable().optional(),
  }),
  z.object({ kind: z.literal('code'), code: z.string().max(64) }),
]);
