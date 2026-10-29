import { ObjectId } from 'mongodb';
import { CreatorSongView } from '../creator/creator.model.js';
import { HostView } from '../hosts/host.model.js';
import { ScriptView } from '../scripts/script.model.js';
import { StationView } from '../stations/station.model.js';

export const AUTO_GENERATION_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
] as const;

export type AutoGenerationStatus = (typeof AUTO_GENERATION_STATUSES)[number];

export interface AutoGenerationConfig {
  stationName: string;
  stationSlug: string;
  description: string;
  language: string;
  genres: string[];
  presentationStyle: string;
  hostIds: ObjectId[];
  hostNames: string[];
}

export interface AutoGenerationJobDocument {
  _id?: ObjectId;
  stationId: ObjectId;
  ownerId: ObjectId;
  ownerEmail: string;
  config: AutoGenerationConfig;
  status: AutoGenerationStatus;
  startedAt: Date | null;
  endsAt: Date | null;
  finishedAt: Date | null;
  error: string | null;
  generatedSongIds: ObjectId[];
  generatedScriptIds: ObjectId[];
  cycles: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AutoGenerationJobView {
  id: string;
  status: AutoGenerationStatus;
  startedAt: string | null;
  endsAt: string | null;
  finishedAt: string | null;
  error: string | null;
  createdAt: string;
  songs: CreatorSongView[];
  scripts: ScriptView[];
  totalAudioSeconds: number;
  totalAudioHours: number;
  completedSongs: number;
  completedScripts: number;
  pendingSongs: number;
  pendingScripts: number;
  cycles: number;
}

export interface AutoGenerationDashboard {
  station: StationView;
  hosts: HostView[];
  job: AutoGenerationJobView | null;
}

export interface AutoGenerationStatusView {
  statuses: Array<{ slug: string; status: AutoGenerationStatus }>;
}
