import { ObjectId } from 'mongodb';
import { HostGender } from '../hosts/host.model.js';

export const VOICE_REFERENCE_SOURCES = ['builtin', 'upload'] as const;
export type VoiceReferenceSource = (typeof VOICE_REFERENCE_SOURCES)[number];

export interface VoiceReferenceDocument {
  _id?: ObjectId;
  builtinKey: string | null;
  ownerId: ObjectId | null;
  stationId: ObjectId | null;
  name: string;
  description: string;
  gender: HostGender;
  accent: string;
  region: string;
  age: string;
  source: VoiceReferenceSource;
  license: string;
  attribution: string;
  sourceUrl: string;
  transcript: string;
  mimeType: string;
  data: Buffer;
  durationSeconds: number;
  voiceStudioProfileId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VoiceReferenceView {
  id: string;
  name: string;
  description: string;
  gender: HostGender;
  accent: string;
  region: string;
  age: string;
  source: VoiceReferenceSource;
  isBuiltIn: boolean;
  license: string;
  attribution: string;
  sourceUrl: string;
  durationSeconds: number;
  createdAt: string;
}

export function toVoiceReferenceView(
  reference: VoiceReferenceDocument & { _id: ObjectId },
): VoiceReferenceView {
  return {
    id: reference._id.toHexString(),
    name: reference.name,
    description: reference.description,
    gender: reference.gender,
    accent: reference.accent,
    region: reference.region,
    age: reference.age,
    source: reference.source,
    isBuiltIn: reference.source === 'builtin',
    license: reference.license,
    attribution: reference.attribution,
    sourceUrl: reference.sourceUrl,
    durationSeconds: reference.durationSeconds,
    createdAt: reference.createdAt.toISOString(),
  };
}
