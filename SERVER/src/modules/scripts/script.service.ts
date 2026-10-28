import { ObjectId } from 'mongodb';
import { env } from '../../config/env.js';
import { ollamaText } from '../../services/ollama-text.service.js';
import { poirot } from '../../services/poirot.service.js';
import { ApiError } from '../../utils/errors.js';
import { HostRepository } from '../hosts/host.repository.js';
import { StationService } from '../stations/station.service.js';
import {
  ScriptDocument,
  ScriptListResult,
  ScriptView,
  toScriptView,
} from './script.model.js';
import { ScriptRepository } from './script.repository.js';
import { scriptLimits } from './script.validation.js';
import { scriptQueue } from './script.queue.js';
import {
  CreateScriptDraftInput,
  UpdateScriptDraftInput,
} from './script.validation.js';

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function deriveTitle(scriptText: string): string {
  const line = scriptText
    .split('\n')
    .map((value) => value.trim())
    .find((value) => value.length > 0);

  return (line ?? 'Untitled segment').slice(0, 120);
}

function toObjectId(value: string, message: string): ObjectId {
  if (!ObjectId.isValid(value)) {
    throw new ApiError(404, 'SCRIPT_NOT_FOUND', message);
  }

  return new ObjectId(value);
}

export class ScriptService {
  constructor(
    private readonly stations = new StationService(),
    private readonly hosts = new HostRepository(),
    private readonly scripts = new ScriptRepository(),
  ) {}

  async list(
    ownerIdInput: string,
    slugInput: string,
    page: number,
    pageSize: number,
  ): Promise<ScriptListResult> {
    const station = await this.stations.getOwnedBySlug(slugInput, ownerIdInput);
    const stationId = toObjectId(station.id, 'That station does not exist.');
    const ownerId = toObjectId(ownerIdInput, 'Authentication is required.');
    const total = await this.scripts.countByStation(stationId, ownerId);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const rows = await this.scripts.listByStation(
      stationId,
      ownerId,
      (currentPage - 1) * pageSize,
      pageSize,
    );

    return {
      scripts: rows.map(toScriptView),
      pagination: {
        page: currentPage,
        pageSize,
        total,
        totalPages,
      },
      limits: scriptLimits,
    };
  }

  async get(
    ownerIdInput: string,
    slugInput: string,
    scriptIdInput: string,
  ): Promise<ScriptView> {
    const station = await this.stations.getOwnedBySlug(slugInput, ownerIdInput);
    const stationId = toObjectId(station.id, 'That station does not exist.');
    const ownerId = toObjectId(ownerIdInput, 'Authentication is required.');
    const scriptId = toObjectId(scriptIdInput, 'That script does not exist.');
    const script = await this.scripts.findOwned(scriptId, stationId, ownerId);

    if (!script) {
      throw new ApiError(404, 'SCRIPT_NOT_FOUND', 'That script does not exist.');
    }

    return toScriptView(script);
  }

  async createDraft(
    ownerIdInput: string,
    slugInput: string,
    input: CreateScriptDraftInput,
  ): Promise<ScriptView> {
    const station = await this.stations.getOwnedBySlug(slugInput, ownerIdInput);
    const stationId = toObjectId(station.id, 'That station does not exist.');
    const ownerId = toObjectId(ownerIdInput, 'Authentication is required.');
    const hostId = toObjectId(input.hostId, 'That host does not exist.');
    const host = await this.hosts.findOwned(hostId, stationId, ownerId);

    if (!host) {
      throw new ApiError(404, 'HOST_NOT_FOUND', 'That host does not exist.');
    }

    if (!host.voice?.name) {
      throw new ApiError(
        400,
        'HOST_VOICE_MISSING',
        'Assign a voice to this host before creating a script.',
      );
    }

    if (input.mode === 'text') {
      const sourceWords = countWords(input.text);

      if (sourceWords > scriptLimits.maxWords) {
        throw new ApiError(
          400,
          'SCRIPT_TOO_LONG',
          `That text is too long for the 10-minute limit. Shorten it to ${scriptLimits.maxWords} words or fewer.`,
        );
      }
    }

    const researchRequested = input.mode === 'guideline' || input.research;
    const research = researchRequested
      ? await poirot.research(input.text)
      : { brief: null as string | null, sources: [] };

    const scriptText = await ollamaText.generateScript({
      hostName: host.name,
      personality: host.personality,
      skills: host.skills,
      emotion: host.voice.emotion,
      mode: input.mode,
      sourceText: input.text,
      researchBrief: research.brief,
      maxWords: scriptLimits.maxWords,
    });

    const wordCount = countWords(scriptText);
    const now = new Date();
    const document: ScriptDocument = {
      stationId,
      ownerId,
      hostId,
      hostName: host.name,
      language: station.language,
      title: input.title?.trim() || deriveTitle(scriptText),
      mode: input.mode,
      research: researchRequested,
      sourceText: input.text,
      researchBrief: research.brief,
      researchSources: research.sources,
      scriptText,
      wordCount,
      status: 'draft',
      error: null,
      durationSeconds: null,
      audio: null,
      createdAt: now,
      updatedAt: now,
      approvedAt: null,
      completedAt: null,
    };

    const created = await this.scripts.create(document);
    return toScriptView(created);
  }

  async updateDraft(
    ownerIdInput: string,
    slugInput: string,
    scriptIdInput: string,
    input: UpdateScriptDraftInput,
  ): Promise<ScriptView> {
    const station = await this.stations.getOwnedBySlug(slugInput, ownerIdInput);
    const stationId = toObjectId(station.id, 'That station does not exist.');
    const ownerId = toObjectId(ownerIdInput, 'Authentication is required.');
    const scriptId = toObjectId(scriptIdInput, 'That script does not exist.');
    const script = await this.scripts.findOwned(scriptId, stationId, ownerId);

    if (!script) {
      throw new ApiError(404, 'SCRIPT_NOT_FOUND', 'That script does not exist.');
    }

    if (script.status !== 'draft') {
      throw new ApiError(
        409,
        'SCRIPT_NOT_EDITABLE',
        'Only drafts can be edited.',
      );
    }

    const updated = await this.scripts.updateOwned(scriptId, stationId, ownerId, {
      scriptText: input.scriptText,
      title: input.title?.trim() || script.title,
      wordCount: countWords(input.scriptText),
    });

    if (!updated) {
      throw new ApiError(404, 'SCRIPT_NOT_FOUND', 'That script does not exist.');
    }

    return toScriptView(updated);
  }

  async approve(
    ownerIdInput: string,
    slugInput: string,
    scriptIdInput: string,
  ): Promise<ScriptView> {
    const station = await this.stations.getOwnedBySlug(slugInput, ownerIdInput);
    const stationId = toObjectId(station.id, 'That station does not exist.');
    const ownerId = toObjectId(ownerIdInput, 'Authentication is required.');
    const scriptId = toObjectId(scriptIdInput, 'That script does not exist.');
    const script = await this.scripts.findOwned(scriptId, stationId, ownerId);

    if (!script) {
      throw new ApiError(404, 'SCRIPT_NOT_FOUND', 'That script does not exist.');
    }

    if (script.status !== 'draft') {
      throw new ApiError(
        409,
        'SCRIPT_NOT_DRAFT',
        'This script has already been approved.',
      );
    }

    if (script.wordCount > scriptLimits.maxWords) {
      throw new ApiError(
        400,
        'SCRIPT_TOO_LONG',
        `The script is too long for the 10-minute limit. Shorten it to ${scriptLimits.maxWords} words or fewer.`,
      );
    }

    const updated = await this.scripts.updateOwned(scriptId, stationId, ownerId, {
      status: 'queued',
      error: null,
      approvedAt: new Date(),
    });

    if (!updated) {
      throw new ApiError(404, 'SCRIPT_NOT_FOUND', 'That script does not exist.');
    }

    scriptQueue.enqueue(scriptId.toHexString());
    return toScriptView(updated);
  }

  async retry(
    ownerIdInput: string,
    slugInput: string,
    scriptIdInput: string,
  ): Promise<ScriptView> {
    const station = await this.stations.getOwnedBySlug(slugInput, ownerIdInput);
    const stationId = toObjectId(station.id, 'That station does not exist.');
    const ownerId = toObjectId(ownerIdInput, 'Authentication is required.');
    const scriptId = toObjectId(scriptIdInput, 'That script does not exist.');
    const script = await this.scripts.findOwned(scriptId, stationId, ownerId);

    if (!script) {
      throw new ApiError(404, 'SCRIPT_NOT_FOUND', 'That script does not exist.');
    }

    if (script.status !== 'failed') {
      throw new ApiError(
        409,
        'SCRIPT_NOT_FAILED',
        'Only failed script audio can be retried.',
      );
    }

    const updated = await this.scripts.updateOwned(scriptId, stationId, ownerId, {
      status: 'queued',
      error: null,
      completedAt: null,
    });

    if (!updated) {
      throw new ApiError(404, 'SCRIPT_NOT_FOUND', 'That script does not exist.');
    }

    scriptQueue.enqueue(scriptId.toHexString());
    return toScriptView(updated);
  }

  async getAudio(
    ownerIdInput: string,
    slugInput: string,
    scriptIdInput: string,
  ): Promise<{ data: Buffer; mimeType: string }> {
    const station = await this.stations.getOwnedBySlug(slugInput, ownerIdInput);
    const stationId = toObjectId(station.id, 'That station does not exist.');
    const ownerId = toObjectId(ownerIdInput, 'Authentication is required.');
    const scriptId = toObjectId(scriptIdInput, 'That script does not exist.');
    const script = await this.scripts.findAudio(scriptId, stationId, ownerId);

    if (!script) {
      throw new ApiError(404, 'SCRIPT_NOT_FOUND', 'That script does not exist.');
    }

    if (
      script.status !== 'completed' ||
      !script.audio?.mimeType ||
      !script.audio.data
    ) {
      throw new ApiError(
        409,
        'SCRIPT_AUDIO_NOT_READY',
        'This script audio is not ready yet.',
      );
    }

    return {
      data: script.audio.data,
      mimeType: script.audio.mimeType,
    };
  }
}
