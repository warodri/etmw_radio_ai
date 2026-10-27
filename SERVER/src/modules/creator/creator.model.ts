import { ObjectId } from 'mongodb';

export const CREATOR_SONG_STATUSES = [
  'queued',
  'generating',
  'completed',
  'failed',
] as const;

export type CreatorSongStatus = (typeof CREATOR_SONG_STATUSES)[number];

export interface CreatorSongDocument {
  _id?: ObjectId;
  stationId: ObjectId;
  ownerId: ObjectId;
  songsJobId: string | null;
  songsSongId: string | null;
  title: string;
  lyrics: string;
  mood: string;
  genres: string[];
  style: string;
  tags: string[];
  durationSeconds: number;
  status: CreatorSongStatus;
  queuePosition: number;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface CreatorSongView {
  id: string;
  title: string;
  mood: string;
  genres: string[];
  style: string;
  tags: string[];
  durationSeconds: number;
  status: CreatorSongStatus;
  queuePosition: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export function toCreatorSongView(
  song: CreatorSongDocument & { _id: ObjectId },
): CreatorSongView {
  return {
    id: song._id.toHexString(),
    title: song.title,
    mood: song.mood,
    genres: song.genres,
    style: song.style,
    tags: song.tags,
    durationSeconds: song.durationSeconds,
    status: song.status,
    queuePosition: song.queuePosition,
    error: song.error,
    createdAt: song.createdAt.toISOString(),
    updatedAt: song.updatedAt.toISOString(),
    completedAt: song.completedAt ? song.completedAt.toISOString() : null,
  };
}

export interface CreatorPreferencesDocument {
  _id?: ObjectId;
  stationId: ObjectId;
  ownerId: ObjectId;
  mood: string;
  genres: string[];
  style: string;
  durationSeconds: number;
  updatedAt: Date;
}

export interface CreatorSettingsView {
  mood: string;
  genres: string[];
  style: string;
  durationSeconds: number;
}

export interface CreatorPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CreatorDashboardView {
  station: import('../stations/station.model.js').StationView;
  settings: CreatorSettingsView;
  songs: CreatorSongView[];
  pagination: CreatorPagination;
  hasPending: boolean;
  pendingCount: number;
  completedCount: number;
}
