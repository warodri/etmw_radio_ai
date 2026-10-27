import { z } from 'zod';
import { env } from '../../config/env.js';

export const creatorPageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(24).default(6),
});

export const createCreatorSongSchema = z.object({
  title: z.string().trim().max(120).optional(),
  lyrics: z
    .string()
    .trim()
    .min(10, 'Write at least a few lines of lyrics.')
    .max(20000, 'Lyrics must be 20,000 characters or fewer.'),
  mood: z
    .string()
    .trim()
    .min(2, 'Describe the mood for this song.')
    .max(120, 'Keep the mood under 120 characters.'),
  genres: z
    .array(z.string().trim().min(1).max(40))
    .min(1, 'Choose at least one genre.')
    .max(12, 'Choose no more than 12 genres.'),
  style: z
    .string()
    .trim()
    .max(600, 'Keep the style description under 600 characters.')
    .default(''),
  durationSeconds: z.coerce
    .number()
    .int()
    .min(5)
    .max(
      Math.min(env.CREATOR_MAX_DURATION_SECONDS, 240),
      `Choose a duration of ${Math.min(env.CREATOR_MAX_DURATION_SECONDS, 240)} seconds or less.`,
    )
    .default(60),
});

export type CreateCreatorSongInput = z.infer<typeof createCreatorSongSchema>;
