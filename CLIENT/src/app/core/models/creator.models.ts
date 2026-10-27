import { RadioStation } from './station.models';

export type CreatorSongStatus = 'queued' | 'generating' | 'completed' | 'failed';

export interface CreatorSong {
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

export interface CreatorSettings {
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

export interface CreatorDashboardResponse {
  station: RadioStation;
  settings: CreatorSettings;
  songs: CreatorSong[];
  pagination: CreatorPagination;
  hasPending: boolean;
  pendingCount: number;
  completedCount: number;
}

export interface CreateCreatorSongPayload {
  title?: string;
  lyrics: string;
  mood: string;
  genres: string[];
  style: string;
  durationSeconds: number;
}

export interface CreateCreatorSongResponse {
  song: CreatorSong;
}

export const CREATOR_SONG_STATUS_LABELS: Record<CreatorSongStatus, string> = {
  queued: 'Queued',
  generating: 'Composing',
  completed: 'Ready',
  failed: 'Failed',
};
