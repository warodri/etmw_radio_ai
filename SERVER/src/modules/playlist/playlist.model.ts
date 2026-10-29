import { ObjectId } from 'mongodb';
import { CreatorSongView } from '../creator/creator.model.js';
import { ScriptView } from '../scripts/script.model.js';
import { StationView } from '../stations/station.model.js';

export const PLAYLIST_ITEM_KINDS = ['song', 'script'] as const;
export type PlaylistItemKind = (typeof PLAYLIST_ITEM_KINDS)[number];

export interface PlaylistVolumePoint {
  atSeconds: number;
  volume: number;
}

export interface PlaylistItemDocument {
  id: string;
  kind: PlaylistItemKind;
  sourceId: string;
  title: string;
  subtitle: string;
  durationSeconds: number;
  startAt: number;
  volume: number;
  volumeKeyframes: PlaylistVolumePoint[];
}

export interface PlaylistDocument {
  _id?: ObjectId;
  stationId: ObjectId;
  ownerId: ObjectId;
  items: PlaylistItemDocument[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PlaylistView {
  items: PlaylistItemDocument[];
  itemCount: number;
  totalDurationSeconds: number;
  updatedAt: string | null;
}

export interface PlaylistSummary {
  itemCount: number;
  totalDurationSeconds: number;
  updatedAt: string | null;
}

export interface PlaylistEditorResponse {
  station: StationView;
  playlist: PlaylistView;
  songs: CreatorSongView[];
  scripts: ScriptView[];
  streamUrl: string;
  publicStreamReady: boolean;
}

export interface PublicRadioResponse {
  station: StationView;
  playlist: PlaylistSummary;
  streamUrl: string;
  liveOffsetSeconds: number;
}

export function totalDurationOf(items: PlaylistItemDocument[]): number {
  return items.reduce(
    (longest, item) =>
      Math.max(longest, item.startAt + item.durationSeconds),
    0,
  );
}

export function toPlaylistView(
  playlist: (PlaylistDocument & { _id: ObjectId }) | null,
): PlaylistView {
  const items = playlist?.items ?? [];

  return {
    items,
    itemCount: items.length,
    totalDurationSeconds: totalDurationOf(items),
    updatedAt: playlist ? playlist.updatedAt.toISOString() : null,
  };
}

export function toPlaylistSummary(playlist: PlaylistView): PlaylistSummary {
  return {
    itemCount: playlist.itemCount,
    totalDurationSeconds: playlist.totalDurationSeconds,
    updatedAt: playlist.updatedAt,
  };
}
