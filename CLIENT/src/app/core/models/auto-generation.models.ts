import { CreatorSong } from './creator.models';
import { HostPersona } from './host.models';
import { ScriptView } from './script.models';
import { RadioStation } from './station.models';

export type AutoGenerationStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface AutoGenerationJob {
  id: string;
  status: AutoGenerationStatus;
  startedAt: string | null;
  endsAt: string | null;
  finishedAt: string | null;
  error: string | null;
  createdAt: string;
  songs: CreatorSong[];
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
  station: RadioStation;
  hosts: HostPersona[];
  job: AutoGenerationJob | null;
}

export interface AutoGenerationStatusResponse {
  statuses: Array<{ slug: string; status: AutoGenerationStatus }>;
}
