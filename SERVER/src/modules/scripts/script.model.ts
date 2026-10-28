import { ObjectId } from 'mongodb';

export const SCRIPT_STATUSES = [
  'draft',
  'queued',
  'generating',
  'completed',
  'failed',
] as const;

export type ScriptStatus = (typeof SCRIPT_STATUSES)[number];

export const SCRIPT_MODES = ['text', 'guideline'] as const;
export type ScriptMode = (typeof SCRIPT_MODES)[number];

export interface ScriptSource {
  index: number;
  title: string;
  url: string;
}

export interface ScriptAudio {
  mimeType: string;
  data?: Buffer;
}

export interface ScriptDocument {
  _id?: ObjectId;
  stationId: ObjectId;
  ownerId: ObjectId;
  hostId: ObjectId;
  hostName: string;
  language: string;
  title: string;
  mode: ScriptMode;
  research: boolean;
  sourceText: string;
  researchBrief: string | null;
  researchSources: ScriptSource[];
  scriptText: string;
  wordCount: number;
  status: ScriptStatus;
  error: string | null;
  durationSeconds: number | null;
  audio: ScriptAudio | null;
  createdAt: Date;
  updatedAt: Date;
  approvedAt: Date | null;
  completedAt: Date | null;
}

export interface ScriptView {
  id: string;
  hostId: string;
  hostName: string;
  title: string;
  mode: ScriptMode;
  research: boolean;
  researchBrief: string | null;
  researchSources: ScriptSource[];
  scriptText: string;
  wordCount: number;
  status: ScriptStatus;
  error: string | null;
  durationSeconds: number | null;
  hasAudio: boolean;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  completedAt: string | null;
}

export function toScriptView(
  script: ScriptDocument & { _id: ObjectId },
): ScriptView {
  return {
    id: script._id.toHexString(),
    hostId: script.hostId.toHexString(),
    hostName: script.hostName,
    title: script.title,
    mode: script.mode,
    research: script.research,
    researchBrief: script.researchBrief,
    researchSources: script.researchSources,
    scriptText: script.scriptText,
    wordCount: script.wordCount,
    status: script.status,
    error: script.error,
    durationSeconds: script.durationSeconds,
    hasAudio: Boolean(script.audio?.mimeType),
    createdAt: script.createdAt.toISOString(),
    updatedAt: script.updatedAt.toISOString(),
    approvedAt: script.approvedAt ? script.approvedAt.toISOString() : null,
    completedAt: script.completedAt ? script.completedAt.toISOString() : null,
  };
}

export interface ScriptPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ScriptLimits {
  maxWords: number;
  maxDurationSeconds: number;
}

export interface ScriptListResult {
  scripts: ScriptView[];
  pagination: ScriptPagination;
  limits: ScriptLimits;
}
