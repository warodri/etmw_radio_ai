import { ObjectId, WithId } from 'mongodb';
import { env } from '../../config/env.js';
import { songsApi } from '../../services/songs-api.service.js';
import { logger } from '../../utils/logger.js';
import { ApiError } from '../../utils/errors.js';
import { StationService } from '../stations/station.service.js';
import { StationView } from '../stations/station.model.js';
import {
  CreatorDashboardView,
  CreatorPreferencesDocument,
  CreatorSettingsView,
  CreatorSongDocument,
  CreatorSongStatus,
  CreatorSongView,
  toCreatorSongView,
} from './creator.model.js';
import {
  CreatorPreferencesRepository,
  CreatorSongRepository,
} from './creator.repository.js';
import { CreateCreatorSongInput } from './creator.validation.js';

const DEFAULT_DURATION_SECONDS = 60;

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();

    if (!trimmed) {
      continue;
    }

    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function deriveTitle(lyrics: string): string {
  const line = lyrics
    .split('\n')
    .map((value) => value.trim())
    .find((value) => value.length > 0 && !/^\[.+\]$/.test(value));

  return (line ?? 'Untitled song').slice(0, 120);
}

function buildTags(input: CreateCreatorSongInput): string[] {
  const candidates = [
    ...input.genres,
    ...input.mood.split(','),
    ...input.style.split(','),
  ];

  return uniqueStrings(candidates)
    .map((tag) => tag.slice(0, 60))
    .slice(0, 30);
}

function toObjectId(value: string): ObjectId {
  if (!ObjectId.isValid(value)) {
    throw new ApiError(404, 'STATION_NOT_FOUND', 'That station does not exist.');
  }

  return new ObjectId(value);
}

function defaultSettings(station: StationView): CreatorSettingsView {
  return {
    mood: '',
    genres: station.genres,
    style: station.presentationStyle,
    durationSeconds: DEFAULT_DURATION_SECONDS,
  };
}

function settingsFromPreferences(
  preferences: CreatorPreferencesDocument | null,
  station: StationView,
): CreatorSettingsView {
  if (!preferences) {
    return defaultSettings(station);
  }

  return {
    mood: preferences.mood,
    genres: preferences.genres.length > 0 ? preferences.genres : station.genres,
    style: preferences.style,
    durationSeconds: preferences.durationSeconds,
  };
}

function isSongStatus(value: string): value is CreatorSongStatus {
  return ['queued', 'generating', 'completed', 'failed'].includes(value);
}

export class CreatorService {
  constructor(
    private readonly stations = new StationService(),
    private readonly songRepository = new CreatorSongRepository(),
    private readonly preferences = new CreatorPreferencesRepository(),
  ) {}

  async getDashboard(
    ownerIdInput: string,
    slugInput: string,
    page: number,
    pageSize: number,
  ): Promise<CreatorDashboardView> {
    const station = await this.stations.getOwnedBySlug(slugInput, ownerIdInput);
    const stationId = toObjectId(station.id);
    const ownerId = toObjectId(ownerIdInput);

    await this.syncPending(stationId, ownerId);

    const total = await this.songRepository.countByStation(stationId, ownerId);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const skip = (currentPage - 1) * pageSize;

    const [songs, preferences, pendingCount, completedCount] = await Promise.all([
      this.songRepository.listByStation(stationId, ownerId, skip, pageSize),
      this.preferences.find(stationId, ownerId),
      this.songRepository.countPending(stationId, ownerId),
      this.songRepository.countCompleted(stationId, ownerId),
    ]);

    return {
      station,
      settings: settingsFromPreferences(preferences, station),
      songs: songs.map(toCreatorSongView),
      pagination: {
        page: currentPage,
        pageSize,
        total,
        totalPages,
      },
      hasPending: pendingCount > 0,
      pendingCount,
      completedCount,
    };
  }

  async createSong(
    ownerIdInput: string,
    slugInput: string,
    input: CreateCreatorSongInput,
  ): Promise<{ song: CreatorSongView }> {
    const station = await this.stations.getOwnedBySlug(slugInput, ownerIdInput);
    const stationId = toObjectId(station.id);
    const ownerId = toObjectId(ownerIdInput);
    const tags = buildTags(input);

    if (tags.length === 0) {
      throw new ApiError(
        400,
        'STYLE_REQUIRED',
        'Add at least one mood, genre or style tag for the song.',
      );
    }

    const job = await songsApi.createGeneration({
      title: input.title?.trim() || undefined,
      lyrics: input.lyrics,
      tags,
      durationSeconds: input.durationSeconds,
    });

    const now = new Date();
    const status = isSongStatus(job.status) ? job.status : 'queued';
    const document: CreatorSongDocument = {
      stationId,
      ownerId,
      songsJobId: job.id,
      songsSongId: job.songId,
      title: input.title?.trim() || job.title || deriveTitle(input.lyrics),
      lyrics: input.lyrics,
      mood: input.mood.trim(),
      genres: uniqueStrings(input.genres),
      style: input.style.trim(),
      tags,
      durationSeconds: input.durationSeconds,
      status,
      queuePosition: job.queuePosition || 1,
      error: null,
      createdAt: now,
      updatedAt: now,
      completedAt: job.completedAt ? new Date(job.completedAt) : null,
    };

    const created = await this.songRepository.create(document);

    await this.preferences.upsert(stationId, ownerId, {
      mood: document.mood,
      genres: document.genres,
      style: document.style,
      durationSeconds: document.durationSeconds,
      updatedAt: now,
    });

    return { song: toCreatorSongView(created) };
  }

  async getAudio(
    ownerIdInput: string,
    slugInput: string,
    songIdInput: string,
  ): Promise<{ data: Buffer; contentType: string }> {
    const station = await this.stations.getOwnedBySlug(slugInput, ownerIdInput);
    const stationId = toObjectId(station.id);
    const ownerId = toObjectId(ownerIdInput);

    if (!ObjectId.isValid(songIdInput)) {
      throw new ApiError(404, 'SONG_NOT_FOUND', 'That song does not exist.');
    }

    const song = await this.songRepository.findOwnedSong(
      new ObjectId(songIdInput),
      stationId,
      ownerId,
    );

    if (!song) {
      throw new ApiError(404, 'SONG_NOT_FOUND', 'That song does not exist.');
    }

    if (song.status !== 'completed' || !song.songsSongId) {
      throw new ApiError(
        409,
        'SONG_NOT_READY',
        'This song is still being created. Try again in a moment.',
      );
    }

    return songsApi.getSongAudio(song.songsSongId);
  }

  private async syncPending(
    stationId: ObjectId,
    ownerId: ObjectId,
  ): Promise<void> {
    if (!env.SONGS_API_KEY) {
      return;
    }

    const pending = await this.songRepository.listPending(stationId, ownerId);

    await Promise.allSettled(
      pending.map((song) => this.syncSong(song)),
    );
  }

  private async syncSong(
    song: WithId<CreatorSongDocument>,
  ): Promise<void> {
    if (!song.songsJobId) {
      return;
    }

    try {
      const job = await songsApi.getGeneration(song.songsJobId);
      const fields: Partial<CreatorSongDocument> = {};

      if (job.status === 'completed') {
        if (!job.songId) {
          fields.status = 'failed';
          fields.error =
            'ETMW Songs finished the job without returning a song. Please try again.';
          fields.completedAt = new Date();
        } else {
          fields.status = 'completed';
          fields.songsSongId = job.songId;
          fields.title = job.title || song.title;
          fields.queuePosition = 0;
          fields.error = null;
          fields.completedAt = job.completedAt
            ? new Date(job.completedAt)
            : new Date();
        }
      } else if (job.status === 'failed') {
        fields.status = 'failed';
        fields.error =
          job.error || 'The song could not be generated. Please try again.';
        fields.queuePosition = 0;
        fields.completedAt = job.completedAt
          ? new Date(job.completedAt)
          : new Date();
      } else if (isSongStatus(job.status) && job.status !== song.status) {
        fields.status = job.status;
        fields.queuePosition = job.queuePosition || 0;
      }

      if (Object.keys(fields).length > 0) {
        await this.songRepository.updateSong(song._id, fields);
      }
    } catch (error) {
      logger.warn('creator.song_sync_failed', {
        songId: song._id.toHexString(),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
