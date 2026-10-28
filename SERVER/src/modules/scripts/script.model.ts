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

export interface ScriptParticipant {
  hostId: ObjectId;
  hostName: string;
}

export interface ScriptTurn {
  hostId: ObjectId;
  hostName: string;
  text: string;
}

export interface ScriptTextSource {
  hostId: ObjectId;
  text: string;
}

export interface ScriptAudio {
  mimeType: string;
  data?: Buffer;
}

export interface ScriptDocument {
  _id?: ObjectId;
  stationId: ObjectId;
  ownerId: ObjectId;
  participants: ScriptParticipant[];
  mode: ScriptMode;
  research: boolean;
  sourceTexts: ScriptTextSource[];
  guideline: string | null;
  researchBrief: string | null;
  researchSources: ScriptSource[];
  turns: ScriptTurn[];
  wordCount: number;
  language: string;
  title: string;
  status: ScriptStatus;
  error: string | null;
  durationSeconds: number | null;
  audio: ScriptAudio | null;
  createdAt: Date;
  updatedAt: Date;
  approvedAt: Date | null;
  completedAt: Date | null;
  hostId?: ObjectId;
  hostName?: string;
  scriptText?: string;
  sourceText?: string;
}

export interface ScriptParticipantView {
  id: string;
  name: string;
}

export interface ScriptTurnView {
  hostId: string;
  hostName: string;
  text: string;
}

export interface ScriptView {
  id: string;
  participants: ScriptParticipantView[];
  turns: ScriptTurnView[];
  title: string;
  mode: ScriptMode;
  research: boolean;
  researchBrief: string | null;
  researchSources: ScriptSource[];
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
  const participants =
    script.participants?.length > 0
      ? script.participants
      : script.hostId && script.hostName
        ? [{ hostId: script.hostId, hostName: script.hostName }]
        : [];
  const turns =
    script.turns?.length > 0
      ? script.turns
      : script.scriptText && participants.length > 0
        ? [
            {
              hostId: participants[0].hostId,
              hostName: participants[0].hostName,
              text: script.scriptText,
            },
          ]
        : [];
  const wordCount =
    script.wordCount ??
    turns.reduce(
      (total, turn) =>
        total + turn.text.trim().split(/\s+/).filter(Boolean).length,
      0,
    );

  return {
    id: script._id.toHexString(),
    participants: participants.map((participant) => ({
      id: participant.hostId.toHexString(),
      name: participant.hostName,
    })),
    turns: turns.map((turn) => ({
      hostId: turn.hostId.toHexString(),
      hostName: turn.hostName,
      text: turn.text,
    })),
    title: script.title,
    mode: script.mode,
    research: script.research,
    researchBrief: script.researchBrief,
    researchSources: script.researchSources,
    wordCount,
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
  maxHosts: number;
}

export interface ScriptListResult {
  scripts: ScriptView[];
  pagination: ScriptPagination;
  limits: ScriptLimits;
}
