import { ObjectId, WithId } from 'mongodb';
import { ApiError } from '../../utils/errors.js';
import {
  slugify,
  StationDocument,
  StationView,
  toStationView,
} from './station.model.js';
import {
  CreatorPreferencesRepository,
  CreatorSongRepository,
} from '../creator/creator.repository.js';
import { HostRepository } from '../hosts/host.repository.js';
import { PlaylistRepository } from '../playlist/playlist.repository.js';
import { VoiceReferenceRepository } from '../voice-references/voice-reference.repository.js';
import { ScriptRepository } from '../scripts/script.repository.js';
import { StationRepository } from './station.repository.js';
import {
  CreateStationInput,
  parseArtworkDataUrl,
  UpdateStationInput,
} from './station.validation.js';

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();

    if (!trimmed || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function normalizeSlug(value: string): string {
  const slug = value.trim().toLowerCase();

  if (
    slug.length < 3 ||
    slug.length > 60 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  ) {
    throw new ApiError(
      400,
      'INVALID_SLUG',
      'Use a slug of 3-60 lowercase letters, numbers and single hyphens.',
    );
  }

  return slug;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function toObjectId(value: string): ObjectId | null {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

export class StationService {
  constructor(
    private readonly stations = new StationRepository(),
    private readonly creatorSongs = new CreatorSongRepository(),
    private readonly creatorPreferences = new CreatorPreferencesRepository(),
    private readonly hosts = new HostRepository(),
    private readonly scripts = new ScriptRepository(),
    private readonly playlists = new PlaylistRepository(),
    private readonly voiceReferences = new VoiceReferenceRepository(),
  ) {}

  async listPublic(): Promise<StationView[]> {
    const stations = await this.stations.listPublic();
    return stations.map((station) => toStationView(station));
  }

  async listMine(ownerIdInput: string): Promise<StationView[]> {
    const ownerId = toObjectId(ownerIdInput);

    if (!ownerId) {
      throw new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    }

    const stations = await this.stations.listByOwner(ownerId);
    return stations.map((station) =>
      toStationView(station, { viewerId: ownerIdInput, includePrivate: true }),
    );
  }

  async getVisibleBySlug(
    slugInput: string,
    viewerId?: string,
  ): Promise<StationView> {
    const slug = slugInput.trim().toLowerCase();
    const station = await this.stations.findBySlug(slug);

    if (!station) {
      throw new ApiError(404, 'STATION_NOT_FOUND', 'That station does not exist.');
    }

    const isOwner = Boolean(
      viewerId && station.ownerId.toHexString() === viewerId,
    );

    if (station.status !== 'published' && !isOwner) {
      throw new ApiError(404, 'STATION_NOT_FOUND', 'That station does not exist.');
    }

    return toStationView(station, { viewerId });
  }

  async getOwnedBySlug(
    slugInput: string,
    ownerIdInput: string,
  ): Promise<StationView> {
    const slug = slugInput.trim().toLowerCase();
    const station = await this.stations.findBySlug(slug);

    if (
      !station ||
      station.ownerId.toHexString() !== ownerIdInput
    ) {
      throw new ApiError(404, 'STATION_NOT_FOUND', 'That station does not exist.');
    }

    return toStationView(station, {
      viewerId: ownerIdInput,
      includePrivate: true,
    });
  }

  async create(
    ownerIdInput: string,
    input: CreateStationInput,
  ): Promise<StationView> {
    const ownerId = toObjectId(ownerIdInput);

    if (!ownerId) {
      throw new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    }

    const slug = normalizeSlug(input.slug ?? slugify(input.name));

    if (!slug) {
      throw new ApiError(
        400,
        'INVALID_SLUG',
        'Enter a custom slug for this station.',
      );
    }

    const now = new Date();
    const status = input.status ?? 'draft';
    const artwork = parseArtworkDataUrl(input.artworkDataUrl) ?? null;

    const document: StationDocument = {
      ownerId,
      name: input.name.trim(),
      slug,
      description: input.description.trim(),
      language: input.language.trim(),
      tags: uniqueStrings(input.tags),
      region: input.region?.trim() || null,
      genres: uniqueStrings(input.genres),
      presentationStyle: input.presentationStyle.trim(),
      presentationNotes: input.presentationNotes?.trim() || null,
      status,
      artwork,
      createdAt: now,
      updatedAt: now,
      publishedAt: status === 'published' ? now : null,
    };

    let created: WithId<StationDocument>;

    try {
      created = await this.stations.create(document);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ApiError(
          409,
          'SLUG_TAKEN',
          'That slug is already taken. Choose a different one.',
        );
      }

      throw error;
    }

    return toStationView(created, {
      viewerId: ownerIdInput,
      includePrivate: true,
    });
  }

  async update(
    ownerIdInput: string,
    idInput: string,
    input: UpdateStationInput,
  ): Promise<StationView> {
    const ownerId = toObjectId(ownerIdInput);
    const id = toObjectId(idInput);

    if (!ownerId) {
      throw new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    }

    if (!id) {
      throw new ApiError(404, 'STATION_NOT_FOUND', 'That station does not exist.');
    }

    const existing = await this.stations.findById(idInput);

    if (!existing || existing.ownerId.toHexString() !== ownerIdInput) {
      throw new ApiError(404, 'STATION_NOT_FOUND', 'That station does not exist.');
    }

    const now = new Date();
    const fields: Partial<StationDocument> = { updatedAt: now };

    if (input.name !== undefined) {
      fields.name = input.name;
    }

    if (input.slug !== undefined) {
      fields.slug = normalizeSlug(input.slug);
    }

    if (input.description !== undefined) {
      fields.description = input.description;
    }

    if (input.language !== undefined) {
      fields.language = input.language;
    }

    if (input.tags !== undefined) {
      fields.tags = uniqueStrings(input.tags);
    }

    if (input.region !== undefined) {
      fields.region = input.region?.trim() || null;
    }

    if (input.genres !== undefined) {
      fields.genres = uniqueStrings(input.genres);
    }

    if (input.presentationStyle !== undefined) {
      fields.presentationStyle = input.presentationStyle;
    }

    if (input.presentationNotes !== undefined) {
      fields.presentationNotes = input.presentationNotes?.trim() || null;
    }

    if (input.status !== undefined) {
      fields.status = input.status;

      if (input.status === 'published' && existing.status !== 'published') {
        fields.publishedAt = now;
      }
    }

    if (input.artworkDataUrl !== undefined) {
      fields.artwork = parseArtworkDataUrl(input.artworkDataUrl) ?? null;
    } else if (input.removeArtwork === true) {
      fields.artwork = null;
    }

    let updated: WithId<StationDocument> | null;

    try {
      updated = await this.stations.updateOwned(id, ownerId, fields);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ApiError(
          409,
          'SLUG_TAKEN',
          'That slug is already taken. Choose a different one.',
        );
      }

      throw error;
    }

    if (!updated) {
      throw new ApiError(404, 'STATION_NOT_FOUND', 'That station does not exist.');
    }

    return toStationView(updated, {
      viewerId: ownerIdInput,
      includePrivate: true,
    });
  }

  async delete(ownerIdInput: string, idInput: string): Promise<void> {
    const ownerId = toObjectId(ownerIdInput);
    const id = toObjectId(idInput);

    if (!ownerId) {
      throw new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    }

    if (!id) {
      throw new ApiError(404, 'STATION_NOT_FOUND', 'That station does not exist.');
    }

    const deleted = await this.stations.deleteOwned(id, ownerId);

    if (!deleted) {
      throw new ApiError(404, 'STATION_NOT_FOUND', 'That station does not exist.');
    }

    await this.creatorSongs.deleteByStation(id, ownerId);
    await this.creatorPreferences.deleteByStation(id, ownerId);
    await this.hosts.deleteByStation(id, ownerId);
    await this.scripts.deleteByStation(id, ownerId);
    await this.playlists.deleteByStation(id, ownerId);
    await this.voiceReferences.deleteByStation(id, ownerId);
  }

  async getArtwork(
    idInput: string,
  ): Promise<{ mimeType: string; data: Buffer } | null> {
    const id = toObjectId(idInput);

    if (!id) {
      return null;
    }

    const station = await this.stations.findArtwork(id);

    if (!station?.artwork?.mimeType || !station.artwork.data) {
      return null;
    }

    return {
      mimeType: station.artwork.mimeType,
      data: station.artwork.data,
    };
  }
}
