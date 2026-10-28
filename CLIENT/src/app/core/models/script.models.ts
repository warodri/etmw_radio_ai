export type ScriptStatus =
  | 'draft'
  | 'queued'
  | 'generating'
  | 'completed'
  | 'failed';

export type ScriptMode = 'text' | 'guideline';

export interface ScriptSource {
  index: number;
  title: string;
  url: string;
}

export interface ScriptParticipant {
  id: string;
  name: string;
}

export interface ScriptTurn {
  hostId: string;
  hostName: string;
  text: string;
}

export interface ScriptView {
  id: string;
  participants: ScriptParticipant[];
  turns: ScriptTurn[];
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

export interface ScriptListResponse {
  scripts: ScriptView[];
  pagination: ScriptPagination;
  limits: ScriptLimits;
}

export interface ScriptResponse {
  script: ScriptView;
}

export interface ScriptTextSourcePayload {
  hostId: string;
  text: string;
}

export interface CreateScriptDraftPayload {
  participants: string[];
  title?: string;
  mode: ScriptMode;
  texts?: ScriptTextSourcePayload[];
  guideline?: string;
  research: boolean;
}

export interface ScriptTurnPayload {
  hostId: string;
  text: string;
}

export interface UpdateScriptDraftPayload {
  title?: string;
  turns: ScriptTurnPayload[];
}

export const SCRIPT_STATUS_LABELS: Record<ScriptStatus, string> = {
  draft: 'Draft',
  queued: 'Queued',
  generating: 'Generating',
  completed: 'Ready',
  failed: 'Failed',
};
