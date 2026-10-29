import { HostGender } from './host.models';

export interface VoiceReference {
  id: string;
  name: string;
  description: string;
  gender: HostGender;
  accent: string;
  region: string;
  age: string;
  source: 'builtin' | 'upload';
  isBuiltIn: boolean;
  license: string;
  attribution: string;
  sourceUrl: string;
  durationSeconds: number;
  createdAt: string;
}

export interface VoiceReferenceListResponse {
  references: VoiceReference[];
}

export interface CreateVoiceReferencePayload {
  name: string;
  description: string;
  gender: HostGender;
  accent: string;
  audioDataUrl: string;
}
