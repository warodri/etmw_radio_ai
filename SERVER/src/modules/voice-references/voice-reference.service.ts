import { ObjectId } from 'mongodb';
import { referenceAudio } from '../../services/reference-audio.service.js';
import { voiceStudio } from '../../services/voice-studio.service.js';
import { ApiError } from '../../utils/errors.js';
import { HostRepository } from '../hosts/host.repository.js';
import { HostView, toHostView } from '../hosts/host.model.js';
import { StationService } from '../stations/station.service.js';
import { VoiceReferenceRepository } from './voice-reference.repository.js';
import {
  CreateVoiceReferenceInput,
  AssignVoiceReferenceInput,
} from './voice-reference.validation.js';
import {
  toVoiceReferenceView,
  VoiceReferenceView,
} from './voice-reference.model.js';

function toObjectId(value: string, code: string, message: string): ObjectId {
  if (!ObjectId.isValid(value)) {
    throw new ApiError(404, code, message);
  }

  return new ObjectId(value);
}

function parseAudioDataUrl(value: string): Buffer {
  const match = /^data:(audio\/(?:wav|x-wav|mpeg|mp3));base64,([A-Za-z0-9+/=\s]+)$/.exec(
    value.trim(),
  );

  if (!match) {
    throw new ApiError(
      400,
      'INVALID_VOICE_REFERENCE',
      'Upload a WAV or MP3 audio file for the voice reference.',
    );
  }

  const data = Buffer.from(match[2].replace(/\s/g, ''), 'base64');

  if (data.length === 0) {
    throw new ApiError(400, 'INVALID_VOICE_REFERENCE', 'That audio file is empty.');
  }

  if (data.length > 6 * 1024 * 1024) {
    throw new ApiError(
      400,
      'VOICE_REFERENCE_TOO_LARGE',
      'Keep the voice reference under 6 MB.',
    );
  }

  return data;
}

export class VoiceReferenceService {
  constructor(
    private readonly stations = new StationService(),
    private readonly hosts = new HostRepository(),
    private readonly references = new VoiceReferenceRepository(),
  ) {}

  async list(ownerId: string, slug: string): Promise<VoiceReferenceView[]> {
    const station = await this.stations.getOwnedBySlug(slug, ownerId);
    const stationId = toObjectId(
      station.id,
      'STATION_NOT_FOUND',
      'That station does not exist.',
    );
    const owner = toObjectId(
      ownerId,
      'AUTH_REQUIRED',
      'Authentication is required.',
    );
    const references = await this.references.listForStation(stationId, owner);

    return references.map(toVoiceReferenceView);
  }

  async upload(
    ownerId: string,
    slug: string,
    input: CreateVoiceReferenceInput,
  ): Promise<VoiceReferenceView> {
    const station = await this.stations.getOwnedBySlug(slug, ownerId);
    const stationId = toObjectId(
      station.id,
      'STATION_NOT_FOUND',
      'That station does not exist.',
    );
    const owner = toObjectId(
      ownerId,
      'AUTH_REQUIRED',
      'Authentication is required.',
    );
    const raw = parseAudioDataUrl(input.audioDataUrl);

    let normalized;

    try {
      normalized = await referenceAudio.normalize(raw);
    } catch (error) {
      throw new ApiError(
        400,
        'VOICE_REFERENCE_INVALID_AUDIO',
        error instanceof Error ? error.message : 'That audio could not be used.',
      );
    }

    if (normalized.durationSeconds > 15.5) {
      throw new ApiError(
        400,
        'VOICE_REFERENCE_TOO_LONG',
        'Use a voice reference of 15 seconds or less.',
      );
    }

    const now = new Date();
    const created = await this.references.create({
      builtinKey: null,
      ownerId: owner,
      stationId,
      name: input.name.trim(),
      description: input.description.trim(),
      gender: input.gender,
      accent: input.accent.trim(),
      region: '',
      age: '',
      source: 'upload',
      license: 'User-provided',
      attribution: '',
      sourceUrl: '',
      transcript: '',
      mimeType: 'audio/wav',
      data: normalized.data,
      durationSeconds: normalized.durationSeconds,
      voiceStudioProfileId: null,
      createdAt: now,
      updatedAt: now,
    });

    return toVoiceReferenceView(created);
  }

  async preview(
    ownerId: string,
    slug: string,
    referenceId: string,
  ): Promise<{ data: Buffer; mimeType: string }> {
    const station = await this.stations.getOwnedBySlug(slug, ownerId);
    const stationId = toObjectId(
      station.id,
      'STATION_NOT_FOUND',
      'That station does not exist.',
    );
    const owner = toObjectId(
      ownerId,
      'AUTH_REQUIRED',
      'Authentication is required.',
    );
    const id = toObjectId(
      referenceId,
      'VOICE_REFERENCE_NOT_FOUND',
      'That voice reference does not exist.',
    );
    const reference = await this.references.findAudio(id, stationId, owner);

    if (!reference) {
      throw new ApiError(
        404,
        'VOICE_REFERENCE_NOT_FOUND',
        'That voice reference does not exist.',
      );
    }

    return { data: reference.data, mimeType: reference.mimeType };
  }

  async assignToHost(
    ownerId: string,
    slug: string,
    hostIdInput: string,
    input: AssignVoiceReferenceInput,
  ): Promise<{ host: HostView }> {
    const station = await this.stations.getOwnedBySlug(slug, ownerId);
    const stationId = toObjectId(
      station.id,
      'STATION_NOT_FOUND',
      'That station does not exist.',
    );
    const owner = toObjectId(
      ownerId,
      'AUTH_REQUIRED',
      'Authentication is required.',
    );
    const hostId = toObjectId(hostIdInput, 'HOST_NOT_FOUND', 'That host does not exist.');
    const host = await this.hosts.findOwned(hostId, stationId, owner);

    if (!host) {
      throw new ApiError(404, 'HOST_NOT_FOUND', 'That host does not exist.');
    }

    const referenceId = toObjectId(
      input.referenceId,
      'VOICE_REFERENCE_NOT_FOUND',
      'That voice reference does not exist.',
    );
    const reference = await this.references.findAudio(
      referenceId,
      stationId,
      owner,
    );

    if (!reference) {
      throw new ApiError(
        404,
        'VOICE_REFERENCE_NOT_FOUND',
        'That voice reference does not exist.',
      );
    }

    let profileId = reference.voiceStudioProfileId;

    if (profileId) {
      const existing = await voiceStudio.getProfile(profileId);
      if (!existing) {
        profileId = null;
      }
    }

    if (!profileId) {
      const profile = await voiceStudio.createProfile({
        name: `ETMW Voice — ${reference.name}`,
        audio: reference.data,
        refText: reference.transcript,
        language: station.language,
      });
      profileId = profile.id;
      await this.references.update(reference._id, {
        voiceStudioProfileId: profileId,
      });
    }

    const updated = await this.hosts.updateOwned(hostId, stationId, owner, {
      voice: null,
      voiceReference: {
        id: reference._id,
        name: reference.name,
        source: reference.source,
        accent: reference.accent,
        assignedAt: new Date(),
      },
      voiceStudioProfileId: profileId,
      updatedAt: new Date(),
    });

    if (!updated) {
      throw new ApiError(404, 'HOST_NOT_FOUND', 'That host does not exist.');
    }

    return { host: toHostView(updated) };
  }

  async removeFromHost(
    ownerId: string,
    slug: string,
    hostIdInput: string,
  ): Promise<{ host: HostView }> {
    const station = await this.stations.getOwnedBySlug(slug, ownerId);
    const stationId = toObjectId(
      station.id,
      'STATION_NOT_FOUND',
      'That station does not exist.',
    );
    const owner = toObjectId(
      ownerId,
      'AUTH_REQUIRED',
      'Authentication is required.',
    );
    const hostId = toObjectId(hostIdInput, 'HOST_NOT_FOUND', 'That host does not exist.');
    const updated = await this.hosts.updateOwned(hostId, stationId, owner, {
      voice: null,
      voiceReference: null,
      voiceStudioProfileId: null,
      updatedAt: new Date(),
    });

    if (!updated) {
      throw new ApiError(404, 'HOST_NOT_FOUND', 'That host does not exist.');
    }

    return { host: toHostView(updated) };
  }
}
