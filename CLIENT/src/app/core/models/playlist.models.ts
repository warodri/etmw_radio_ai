import { CreatorSong } from './creator.models';
import { ScriptView } from './script.models';
import { RadioStation } from './station.models';

export type PlaylistItemKind = 'song' | 'script';

export interface PlaylistVolumePoint {
  atSeconds: number;
  volume: number;
}

export interface PlaylistItem {
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

export interface PlaylistView {
  items: PlaylistItem[];
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
  station: RadioStation;
  playlist: PlaylistView;
  songs: CreatorSong[];
  scripts: ScriptView[];
  streamUrl: string;
  publicStreamReady: boolean;
}

export interface PublicRadioResponse {
  station: RadioStation;
  playlist: PlaylistSummary;
  streamUrl: string;
  liveOffsetSeconds: number;
}

export interface PlaylistSaveItem {
  id?: string;
  kind: PlaylistItemKind;
  sourceId: string;
  startAt: number;
  volume?: number;
  volumeKeyframes?: PlaylistVolumePoint[];
}

export interface PlaylistSavePayload {
  items: PlaylistSaveItem[];
}
