import { z } from 'zod';
import { ApiError } from '../../utils/errors.js';
import {
  HOST_AVATAR_SOURCES,
  HOST_GENDERS,
  HOST_SKILLS,
  HostAvatar,
} from './host.model.js';

export const MAX_HOST_AVATAR_BYTES = 4 * 1024 * 1024;
const MAX_AVATAR_DATA_URL_LENGTH = 8_000_000;

const hostFields = {
  name: z
    .string()
    .trim()
    .min(2, 'Give the host a name.')
    .max(80, 'Keep the host name under 80 characters.'),
  gender: z.enum(HOST_GENDERS, {
    message: 'Choose male or female.',
  }),
  personality: z
    .string()
    .trim()
    .min(10, 'Describe the host personality in at least 10 characters.')
    .max(4000, 'Keep the personality under 4,000 characters.'),
  skills: z
    .array(z.enum(HOST_SKILLS))
    .min(1, 'Choose at least one skill.')
    .max(HOST_SKILLS.length, 'Choose no more than three skills.'),
};

const avatarDataUrlSchema = z
  .string()
  .max(MAX_AVATAR_DATA_URL_LENGTH)
  .nullable()
  .optional();

export const createHostSchema = z.object({
  ...hostFields,
  avatarDataUrl: avatarDataUrlSchema,
  avatarSource: z.enum(HOST_AVATAR_SOURCES).optional(),
});

export const updateHostSchema = z
  .object({
    ...hostFields,
    avatarDataUrl: avatarDataUrlSchema,
    avatarSource: z.enum(HOST_AVATAR_SOURCES).optional(),
    removeAvatar: z.boolean().optional(),
  })
  .partial();

export const generateHostAvatarSchema = z.object({
  name: z.string().trim().min(2).max(80),
  gender: z.enum(HOST_GENDERS),
  personality: z.string().trim().max(4000).default(''),
  skills: z.array(z.enum(HOST_SKILLS)).min(1).max(HOST_SKILLS.length),
});

export type CreateHostInput = z.infer<typeof createHostSchema>;
export type UpdateHostInput = z.infer<typeof updateHostSchema>;
export type GenerateHostAvatarInput = z.infer<typeof generateHostAvatarSchema>;

function isPng(data: Buffer): boolean {
  return (
    data.length >= 8 &&
    data.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  );
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
 * Parses a browser data URL into a compact binary avatar.
 * `undefined` means "leave unchanged", `null` means "remove the avatar".
 */
export function parseHostAvatarDataUrl(
  value: string | null | undefined,
): HostAvatar | null | undefined {
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
      'INVALID_AVATAR',
      'Upload a PNG, JPEG, WebP or GIF image for the host avatar.',
    );
  }

  const mimeType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
  const data = Buffer.from(match[2].replace(/\s/g, ''), 'base64');

  if (data.length === 0) {
    throw new ApiError(400, 'INVALID_AVATAR', 'That avatar file is empty.');
  }

  if (data.length > MAX_HOST_AVATAR_BYTES) {
    throw new ApiError(
      400,
      'AVATAR_TOO_LARGE',
      'The host avatar must be 4 MB or smaller.',
    );
  }

  if (!matchesImageSignature(mimeType, data)) {
    throw new ApiError(
      400,
      'INVALID_AVATAR',
      'That file does not look like a valid image. Try a different file.',
    );
  }

  return { mimeType, data };
}
