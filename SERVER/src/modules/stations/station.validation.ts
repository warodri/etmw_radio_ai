import { z } from 'zod';
import { ApiError } from '../../utils/errors.js';
import { STATION_STATUSES, StationArtwork } from './station.model.js';

export const MAX_ARTWORK_BYTES = 2 * 1024 * 1024;
const MAX_ARTWORK_DATA_URL_LENGTH = 4_000_000;

const slugSchema = z
  .string()
  .trim()
  .min(3, 'The slug must be at least 3 characters.')
  .max(60, 'The slug must be 60 characters or fewer.')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use lowercase letters, numbers and single hyphens only.',
  );

const tagsSchema = z
  .array(z.string().trim().min(1).max(40))
  .min(1, 'Add at least one tag or topic.')
  .max(12, 'Add no more than 12 tags.');

const genresSchema = z
  .array(z.string().trim().min(1).max(40))
  .min(1, 'Choose at least one musical genre.')
  .max(12, 'Choose no more than 12 genres.');

const artworkDataUrlSchema = z.string().max(MAX_ARTWORK_DATA_URL_LENGTH).nullable();

const stationFields = {
  name: z.string().trim().min(2, 'Give the station a name.').max(80, 'Keep the name under 80 characters.'),
  slug: slugSchema,
  description: z
    .string()
    .trim()
    .min(10, 'Write at least 10 characters about the station.')
    .max(2000, 'Keep the description under 2000 characters.'),
  language: z.string().trim().min(2, 'Choose a language.').max(40),
  tags: tagsSchema,
  region: z.string().trim().max(80).nullable().optional(),
  genres: genresSchema,
  presentationStyle: z
    .string()
    .trim()
    .min(2, 'Choose a presentation style.')
    .max(60),
  presentationNotes: z.string().trim().max(2000).nullable().optional(),
  artworkDataUrl: artworkDataUrlSchema.optional(),
};

export const createStationSchema = z.object({
  ...stationFields,
  slug: slugSchema.optional(),
  status: z.enum(STATION_STATUSES).default('draft'),
});

export const updateStationSchema = z.object({
  ...stationFields,
  status: z.enum(STATION_STATUSES).optional(),
  removeArtwork: z.boolean().optional(),
}).partial();

export type CreateStationInput = z.infer<typeof createStationSchema>;
export type UpdateStationInput = z.infer<typeof updateStationSchema>;

function isPng(data: Buffer): boolean {
  return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function isJpeg(data: Buffer): boolean {
  return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
}

function isGif(data: Buffer): boolean {
  return data.length >= 6 && data.subarray(0, 3).toString('ascii') === 'GIF';
}

function isWebp(data: Buffer): boolean {
  return (
    data.length >= 12 &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}

function matchesImageSignature(mimeType: string, data: Buffer): boolean {
  switch (mimeType) {
    case 'image/png':
      return isPng(data);
    case 'image/jpeg':
      return isJpeg(data);
    case 'image/gif':
      return isGif(data);
    case 'image/webp':
      return isWebp(data);
    default:
      return false;
  }
}

/**
 * Parses a browser data URL into a compact binary artwork payload.
 * `undefined` means "leave unchanged", `null` means "remove the artwork".
 */
export function parseArtworkDataUrl(
  value: string | null | undefined,
): StationArtwork | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value.trim() === '') {
    return null;
  }

  const match = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(
    value.trim(),
  );

  if (!match) {
    throw new ApiError(
      400,
      'INVALID_ARTWORK',
      'Upload a PNG, JPEG, WebP or GIF image for the station artwork.',
    );
  }

  const mimeType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
  const data = Buffer.from(match[2].replace(/\s/g, ''), 'base64');

  if (data.length === 0) {
    throw new ApiError(400, 'INVALID_ARTWORK', 'That artwork file is empty.');
  }

  if (data.length > MAX_ARTWORK_BYTES) {
    throw new ApiError(400, 'ARTWORK_TOO_LARGE', 'Artwork must be 2 MB or smaller.');
  }

  if (!matchesImageSignature(mimeType, data)) {
    throw new ApiError(
      400,
      'INVALID_ARTWORK',
      'That file does not look like a valid image. Try a different file.',
    );
  }

  return { mimeType, data };
}
