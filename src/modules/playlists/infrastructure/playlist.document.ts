import { z } from 'zod';
import {
  ADDED_VIA,
  MAX_BACKUP_HOSTS,
  PLAYLIST_TYPES,
  type Playlist,
  type PlaylistType,
} from '../domain/playlist.js';

export const PLAYLISTS_COLLECTION = 'playlists';

/** Which parts each type fills; every other part must be empty. */
const PARTS: Record<PlaylistType, readonly ('url' | 'xtream' | 'stalker' | 'code')[]> = {
  m3u: ['url'],
  xtream: ['url', 'xtream'],
  stalker: ['stalker'],
  code: ['code'],
};

/** Stored shape of a `playlists` row, checked on every read. */
export const playlistDocumentSchema = z
  .object({
    _id: z.string().min(1),
    deviceId: z.string().min(1),
    name: z.string().trim().min(1),
    type: z.enum(PLAYLIST_TYPES),
    url: z.string().min(1).nullable(),
    xtream: z
      .object({ server: z.string().min(1), username: z.string(), password: z.string() })
      .nullable(),
    stalker: z
      .object({
        portalName: z.string().nullable(),
        portalUrl: z.string().min(1),
        fallbackUrl: z.string().nullable(),
        mac: z.string().nullable(),
      })
      .nullable(),
    code: z
      .object({
        code: z.string().regex(/^\d+$/),
        expiresAt: z.date().nullable(),
        status: z.string().nullable(),
      })
      .nullable(),
    epgUrl: z.string().nullable(),
    backup: z.object({
      enabled: z.boolean(),
      hosts: z.array(z.string().min(1)).max(MAX_BACKUP_HOSTS),
    }),
    protected: z.boolean(),
    pinEnc: z.string().nullable(),
    provider: z
      .object({
        name: z.string().nullable(),
        logo: z.string().nullable(),
        whatsapp: z.string().nullable(),
        email: z.string().nullable(),
      })
      .nullable(),
    addedBy: z.object({ via: z.enum(ADDED_VIA), resellerId: z.string().nullable() }),
    legacy: z.looseObject({ id: z.string().optional(), brand: z.string().optional() }).nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .superRefine((doc, ctx) => {
    const filled = PARTS[doc.type];
    for (const part of ['url', 'xtream', 'stalker', 'code'] as const) {
      const has = doc[part] !== null;
      if (has !== filled.includes(part)) {
        ctx.addIssue({
          code: 'custom',
          path: [part],
          message: has
            ? `A ${doc.type} playlist does not use ${part}`
            : `A ${doc.type} playlist needs ${part}`,
        });
      }
    }
  });

export type PlaylistDocument = z.input<typeof playlistDocumentSchema>;

export function toPlaylist(raw: unknown): Playlist {
  const { _id, ...rest } = playlistDocumentSchema.parse(raw);
  return { id: _id, ...rest };
}

export function toPlaylistDocument(playlist: Playlist): PlaylistDocument {
  const { id, ...rest } = playlist;
  return playlistDocumentSchema.parse({ _id: id, ...rest });
}
