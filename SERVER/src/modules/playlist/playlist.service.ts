import { randomUUID } from 'crypto';
import { ObjectId } from 'mongodb';
import { env } from '../../config/env.js';
import { radioStream, RadioStreamContext } from '../../services/radio-stream.service.js';
import { ApiError } from '../../utils/errors.js';
import {
  CreatorSongRepository,
} from '../creator/creator.repository.js';
import { toCreatorSongView } from '../creator/creator.model.js';
import { ScriptRepository } from '../scripts/script.repository.js';
import { toScriptView } from '../scripts/script.model.js';
import { StationService } from '../stations/station.service.js';
import { StationView } from '../stations/station.model.js';
import {
  PlaylistDocument,
  PlaylistEditorResponse,
  PlaylistItemDocument,
  PlaylistItemKind,
  PlaylistVolumePoint,
  PlaylistView,
  PublicRadioResponse,
  toPlaylistSummary,
  toPlaylistView,
  totalDurationOf,
} from './playlist.model.js';
import { PlaylistRepository } from './playlist.repository.js';
import { SavePlaylistInput } from './playlist.validation.js';

function toObjectId(value: string, message: string): ObjectId {
  if (!ObjectId.isValid(value)) {
    throw new ApiError(404, 'STATION_NOT_FOUND', message);
  }

  return new ObjectId(value);
}

function cleanKeyframes(
  keyframes: PlaylistVolumePoint[] | undefined,
  durationSeconds: number,
): PlaylistVolumePoint[] {
  if (!keyframes?.length) {
    return [];
  }

  const seen = new Set<number>();
  return keyframes
    .map((point) => ({
      atSeconds: Math.min(durationSeconds, Math.max(0, point.atSeconds)),
      volume: Math.min(1, Math.max(0, point.volume)),
    }))
    .sort((a, b) => a.atSeconds - b.atSeconds)
    .filter((point) => {
      const key = Math.round(point.atSeconds * 1000);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 40);
}

function songSubtitle(song: ReturnType<typeof toCreatorSongView>): string {
  const style = song.style.trim();

  if (style) {
    return style;
  }

  if (song.tags.length > 0) {
    return song.tags.slice(0, 4).join(' · ');
  }

  return song.genres.slice(0, 4).join(' · ') || 'Song';
}

function scriptSubtitle(script: ReturnType<typeof toScriptView>): string {
  const names = script.participants.map((participant) => participant.name);
  return names.length > 0 ? names.join(' & ') : 'Host conversation';
}

function streamUrl(slug: string): string {
  return `${env.PUBLIC_BASE_URL.replace(/\/+$/, '')}/api/stations/${encodeURIComponent(slug)}/stream.mp3`;
}

export class PlaylistService {
  constructor(
    private readonly stations = new StationService(),
    private readonly playlists = new PlaylistRepository(),
    private readonly songs = new CreatorSongRepository(),
    private readonly scripts = new ScriptRepository(),
  ) {}

  async getEditor(ownerId: string, slug: string): Promise<PlaylistEditorResponse> {
    const station = await this.stations.getOwnedBySlug(slug, ownerId);
    const stationId = toObjectId(station.id, 'That station does not exist.');
    const owner = toObjectId(ownerId, 'Authentication is required.');

    const [playlist, songs, scripts] = await Promise.all([
      this.playlists.findByStation(stationId),
      this.songs.listCompletedByStation(stationId, owner),
      this.scripts.listReadyByStation(stationId, owner),
    ]);

    return this.buildEditor(station, toPlaylistView(playlist), songs, scripts);
  }

  async save(
    ownerId: string,
    slug: string,
    input: SavePlaylistInput,
  ): Promise<PlaylistEditorResponse> {
    const station = await this.stations.getOwnedBySlug(slug, ownerId);
    const stationId = toObjectId(station.id, 'That station does not exist.');
    const owner = toObjectId(ownerId, 'Authentication is required.');

    const [songs, scripts] = await Promise.all([
      this.songs.listCompletedByStation(stationId, owner),
      this.scripts.listReadyByStation(stationId, owner),
    ]);

    const songMap = new Map(
      songs.map((song) => [song._id.toHexString(), toCreatorSongView(song)]),
    );
    const scriptMap = new Map(
      scripts.map((script) => [script._id.toHexString(), toScriptView(script)]),
    );
    const seenIds = new Set<string>();
    const items: PlaylistItemDocument[] = [];

    for (const candidate of input.items) {
      const kind = candidate.kind as PlaylistItemKind;
      const source =
        kind === 'song'
          ? songMap.get(candidate.sourceId)
          : scriptMap.get(candidate.sourceId);

      if (!source) {
        throw new ApiError(
          400,
          'PLAYLIST_SOURCE_NOT_READY',
          kind === 'song'
            ? 'One of the selected songs is not ready yet.'
            : 'One of the selected conversations is not ready yet.',
        );
      }

      const duration = Number(source.durationSeconds ?? 0);

      if (!Number.isFinite(duration) || duration <= 0) {
        throw new ApiError(
          400,
          'PLAYLIST_SOURCE_INVALID',
          'One of the selected items has no playable duration.',
        );
      }

      let id = candidate.id?.trim() || randomUUID();

      while (seenIds.has(id)) {
        id = randomUUID();
      }
      seenIds.add(id);

      items.push({
        id,
        kind,
        sourceId: candidate.sourceId,
        title: source.title.slice(0, 160),
        subtitle:
          kind === 'song'
            ? songSubtitle(source as ReturnType<typeof toCreatorSongView>)
            : scriptSubtitle(source as ReturnType<typeof toScriptView>),
        durationSeconds: duration,
        startAt: candidate.startAt,
        volume:
          kind === 'song'
            ? Math.min(1, Math.max(0, candidate.volume ?? 1))
            : 1,
        volumeKeyframes:
          kind === 'song'
            ? cleanKeyframes(candidate.volumeKeyframes, duration)
            : [],
      });
    }

    items.sort((a, b) => a.startAt - b.startAt || a.title.localeCompare(b.title));
    const now = new Date();
    const saved = await this.playlists.save(stationId, owner, items, now);

    return this.buildEditor(
      station,
      toPlaylistView(saved),
      songs,
      scripts,
    );
  }

  async getPublicRadio(slug: string): Promise<PublicRadioResponse> {
    const station = await this.stations.getVisibleBySlug(slug);

    if (station.status !== 'published') {
      throw new ApiError(404, 'STATION_NOT_FOUND', 'That station does not exist.');
    }

    const stationId = toObjectId(station.id, 'That station does not exist.');
    const playlist = toPlaylistView(await this.playlists.findByStation(stationId));
    const total = playlist.totalDurationSeconds;

    return {
      station,
      playlist: toPlaylistSummary(playlist),
      streamUrl: streamUrl(station.slug),
      liveOffsetSeconds:
        total > 0 ? Math.floor(Date.now() / 1000) % Math.max(1, Math.floor(total)) : 0,
    };
  }

  async getPublicStreamContext(
    slug: string,
  ): Promise<RadioStreamContext> {
    const station = await this.stations.getVisibleBySlug(slug);

    if (station.status !== 'published') {
      throw new ApiError(404, 'STATION_NOT_FOUND', 'That station does not exist.');
    }

    const stationId = toObjectId(station.id, 'That station does not exist.');
    const playlist = await this.playlists.findByStation(stationId);
    const items = playlist?.items ?? [];

    if (items.length === 0 || totalDurationOf(items) <= 0) {
      throw new ApiError(
        404,
        'PLAYLIST_EMPTY',
        'This station does not have a playlist yet.',
      );
    }

    return {
      stationId,
      ownerId: playlist!.ownerId,
      station,
      items,
      totalDurationSeconds: totalDurationOf(items),
    };
  }

  async getPreviewContext(
    ownerId: string,
    slug: string,
  ): Promise<RadioStreamContext> {
    const station = await this.stations.getOwnedBySlug(slug, ownerId);
    const stationId = toObjectId(station.id, 'That station does not exist.');
    const owner = toObjectId(ownerId, 'Authentication is required.');
    const playlist = await this.playlists.findByStation(stationId);
    const items = playlist?.items ?? [];

    if (items.length === 0 || totalDurationOf(items) <= 0) {
      throw new ApiError(
        400,
        'PLAYLIST_EMPTY',
        'Add at least one item to the playlist before previewing.',
      );
    }

    return {
      stationId,
      ownerId: owner,
      station,
      items,
      totalDurationSeconds: totalDurationOf(items),
    };
  }

  async renderPreview(
    ownerId: string,
    slug: string,
    atSeconds: number,
    durationSeconds: number,
  ): Promise<Buffer> {
    const context = await this.getPreviewContext(ownerId, slug);
    return radioStream.renderPreview(context, atSeconds, durationSeconds);
  }

  private buildEditor(
    station: StationView,
    playlist: PlaylistView,
    songs: Awaited<ReturnType<CreatorSongRepository['listCompletedByStation']>>,
    scripts: Awaited<ReturnType<ScriptRepository['listReadyByStation']>>,
  ): PlaylistEditorResponse {
    return {
      station,
      playlist,
      songs: songs.map(toCreatorSongView),
      scripts: scripts.map(toScriptView),
      streamUrl: streamUrl(station.slug),
      publicStreamReady:
        station.status === 'published' && playlist.itemCount > 0,
    };
  }
}
