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

export interface ScriptListResponse {
  scripts: ScriptView[];
  pagination: ScriptPagination;
  limits: ScriptLimits;
}

export interface ScriptResponse {
  script: ScriptView;
}

export interface CreateScriptDraftPayload {
  hostId: string;
  title?: string;
  mode: ScriptMode;
  text: string;
  research: boolean;
}

export interface UpdateScriptDraftPayload {
  title?: string;
  scriptText: string;
}

export const SCRIPT_STATUS_LABELS: Record<ScriptStatus, string> = {
  draft: 'Draft',
  queued: 'Queued',
  generating: 'Generating',
  completed: 'Ready',
  failed: 'Failed',
};
