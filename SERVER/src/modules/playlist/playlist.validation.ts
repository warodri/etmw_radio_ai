import { z } from 'zod';
import { PLAYLIST_ITEM_KINDS } from './playlist.model.js';

const volumePointSchema = z.object({
  atSeconds: z.number().finite().min(0).max(86_400),
  volume: z.number().finite().min(0).max(1),
});

const playlistItemSchema = z.object({
  id: z.string().trim().max(80).optional(),
  kind: z.enum(PLAYLIST_ITEM_KINDS),
  sourceId: z.string().trim().min(1).max(80),
  startAt: z.number().finite().min(0).max(86_400),
  volume: z.number().finite().min(0).max(1).optional(),
  volumeKeyframes: z.array(volumePointSchema).max(40).optional(),
});

export const savePlaylistSchema = z.object({
  items: z.array(playlistItemSchema).max(500),
});

export const previewPlaylistSchema = z.object({
  at: z.coerce.number().finite().min(0).max(86_400).default(0),
  duration: z.coerce.number().finite().min(5).max(60).default(30),
});

export type SavePlaylistInput = z.infer<typeof savePlaylistSchema>;
