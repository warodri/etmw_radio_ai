import { ObjectId } from 'mongodb';
import { env } from '../../config/env.js';
import {
  GeneratedScriptTurn,
  ollamaText,
  ScriptSpeakerInput,
} from '../../services/ollama-text.service.js';
import { poirot } from '../../services/poirot.service.js';
import { ApiError } from '../../utils/errors.js';
import { HostRepository } from '../hosts/host.repository.js';
import { StationService } from '../stations/station.service.js';
import {
  ScriptDocument,
  ScriptListResult,
  ScriptParticipant,
  ScriptTextSource,
  ScriptTurn,
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

function deriveTitle(value: string): string {
  const line = value
    .split('\n')
    .map((part) => part.trim())
    .find((part) => part.length > 0);

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
      pagination: { page: currentPage, pageSize, total, totalPages },
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
    const participantIds = [...new Set(input.participants)];

    if (participantIds.length !== input.participants.length) {
      throw new ApiError(
        400,
        'DUPLICATE_HOST',
        'Choose each host only once.',
      );
    }

    if (participantIds.length > env.SCRIPT_MAX_HOSTS) {
      throw new ApiError(
        400,
        'TOO_MANY_HOSTS',
        `Choose up to ${env.SCRIPT_MAX_HOSTS} hosts for now.`,
      );
    }

    const participants: ScriptParticipant[] = [];
    const speakers: ScriptSpeakerInput[] = [];
    const labels = ['A', 'B'] as const;

    for (const [index, participantId] of participantIds.entries()) {
      const hostId = toObjectId(participantId, 'That host does not exist.');
      const host = await this.hosts.findOwned(hostId, stationId, ownerId);

      if (!host) {
        throw new ApiError(404, 'HOST_NOT_FOUND', 'That host does not exist.');
      }

      if (!host.voice?.name) {
        throw new ApiError(
          400,
          'HOST_VOICE_MISSING',
          `${host.name} has no voice assigned. Assign a voice before creating a script.`,
        );
      }

      participants.push({ hostId, hostName: host.name });
      speakers.push({
        label: labels[index],
        hostName: host.name,
        personality: host.personality,
        skills: host.skills,
        emotion: host.voice.emotion,
      });
    }

    let sourceTexts: ScriptTextSource[] = [];
    let guideline: string | null = null;

    if (input.mode === 'text') {
      const provided = new Map(
        (input.texts ?? []).map((source) => [source.hostId, source.text.trim()]),
      );

      for (const participant of participants) {
        const text = provided.get(participant.hostId.toHexString());

        if (!text) {
          throw new ApiError(
            400,
            'HOST_TEXT_REQUIRED',
            `Write the notes for ${participant.hostName}.`,
          );
        }

        sourceTexts.push({ hostId: participant.hostId, text });
      }

      const sourceWords = sourceTexts.reduce(
        (total, source) => total + countWords(source.text),
        0,
      );

      if (sourceWords > scriptLimits.maxWords) {
        throw new ApiError(
          400,
          'SCRIPT_TOO_LONG',
          `The notes are too long for the 10-minute limit. Shorten them to ${scriptLimits.maxWords} words or fewer.`,
        );
      }
    } else {
      if (!input.guideline?.trim()) {
        throw new ApiError(
          400,
          'GUIDELINE_REQUIRED',
          'Write a guideline for the conversation.',
        );
      }

      guideline = input.guideline.trim();
    }

    const researchRequested = input.mode === 'guideline' || input.research;
    const researchQuery =
      input.mode === 'guideline'
        ? guideline ?? ''
        : sourceTexts
            .map((source, index) => {
              const participant = participants[index];
              return `${participant.hostName}: ${source.text}`;
            })
            .join('\n\n');
    const research = researchRequested
      ? await poirot.research(researchQuery)
      : { brief: null as string | null, sources: [] };

    const generatedTurns = await ollamaText.generateConversation({
      speakers,
      mode: input.mode,
      sourceTexts: sourceTexts.map((source, index) => ({
        label: labels[index],
        hostName: participants[index].hostName,
        text: source.text,
      })),
      guideline,
      researchBrief: research.brief,
      maxWords: scriptLimits.maxWords,
    });

    const turns = generatedTurns.map((turn) => this.mapTurn(turn, participants));
    const wordCount = turns.reduce(
      (total, turn) => total + countWords(turn.text),
      0,
    );
    const title =
      input.title?.trim() ||
      deriveTitle(
        input.mode === 'guideline'
          ? guideline ?? ''
          : sourceTexts[0]?.text ?? turns[0]?.text ?? '',
      );
    const now = new Date();
    const document: ScriptDocument = {
      stationId,
      ownerId,
      participants,
      mode: input.mode,
      research: researchRequested,
      sourceTexts,
      guideline,
      researchBrief: research.brief,
      researchSources: research.sources,
      turns,
      wordCount,
      language: station.language,
      title,
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

    const participantMap = new Map(
      script.participants.map((participant) => [
        participant.hostId.toHexString(),
        participant,
      ]),
    );
    const turns: ScriptTurn[] = [];

    for (const turn of input.turns) {
      const participant = participantMap.get(turn.hostId);

      if (!participant) {
        throw new ApiError(
          400,
          'INVALID_TURN_HOST',
          'A turn uses a host that is not part of this conversation.',
        );
      }

      const text = turn.text.trim();

      if (!text) {
        continue;
      }

      turns.push({
        hostId: participant.hostId,
        hostName: participant.hostName,
        text,
      });
    }

    if (turns.length === 0) {
      throw new ApiError(
        400,
        'TURNS_REQUIRED',
        'The conversation needs at least one spoken turn.',
      );
    }

    const wordCount = turns.reduce(
      (total, turn) => total + countWords(turn.text),
      0,
    );
    const updated = await this.scripts.updateOwned(scriptId, stationId, ownerId, {
      turns,
      wordCount,
      title: input.title?.trim() || script.title,
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

    return { data: script.audio.data, mimeType: script.audio.mimeType };
  }

  private mapTurn(
    turn: GeneratedScriptTurn,
    participants: ScriptParticipant[],
  ): ScriptTurn {
    const participant = turn.speaker === 'A' ? participants[0] : participants[1];

    if (!participant) {
      throw new ApiError(
        502,
        'SCRIPT_WRITER_INVALID',
        'The script writer used a host that is not part of this conversation.',
      );
    }

    return {
      hostId: participant.hostId,
      hostName: participant.hostName,
      text: turn.text,
    };
  }
}
