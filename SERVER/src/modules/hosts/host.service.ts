import { ObjectId } from 'mongodb';
import { ApiError } from '../../utils/errors.js';
import { openAiImage } from '../../services/openai-image.service.js';
import {
  HostDocument,
  HostView,
  toHostView,
} from './host.model.js';
import { HostRepository } from './host.repository.js';
import {
  CreateHostInput,
  GenerateHostAvatarInput,
  parseHostAvatarDataUrl,
  UpdateHostInput,
} from './host.validation.js';
import { StationService } from '../stations/station.service.js';

function toObjectId(value: string, message = 'That host does not exist.'): ObjectId {
  if (!ObjectId.isValid(value)) {
    throw new ApiError(404, 'HOST_NOT_FOUND', message);
  }

  return new ObjectId(value);
}

function uniqueSkills<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export class HostService {
  constructor(
    private readonly stations = new StationService(),
    private readonly hosts = new HostRepository(),
  ) {}

  async list(
    ownerIdInput: string,
    slugInput: string,
  ): Promise<{ station: Awaited<ReturnType<StationService['getOwnedBySlug']>>; hosts: HostView[] }> {
    const station = await this.stations.getOwnedBySlug(slugInput, ownerIdInput);
    const stationId = toObjectId(station.id, 'That station does not exist.');
    const ownerId = toObjectId(ownerIdInput, 'Authentication is required.');
    const hosts = await this.hosts.listByStation(stationId, ownerId);

    return {
      station,
      hosts: hosts.map(toHostView),
    };
  }

  async create(
    ownerIdInput: string,
    slugInput: string,
    input: CreateHostInput,
  ): Promise<{ host: HostView }> {
    const station = await this.stations.getOwnedBySlug(slugInput, ownerIdInput);
    const stationId = toObjectId(station.id, 'That station does not exist.');
    const ownerId = toObjectId(ownerIdInput, 'Authentication is required.');
    const avatar = parseHostAvatarDataUrl(input.avatarDataUrl);
    const now = new Date();

    const document: HostDocument = {
      stationId,
      ownerId,
      name: input.name.trim(),
      gender: input.gender,
      personality: input.personality.trim(),
      skills: uniqueSkills(input.skills),
      avatar: avatar ?? null,
      avatarSource: avatar ? input.avatarSource ?? 'upload' : null,
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.hosts.create(document);

    return { host: toHostView(created) };
  }

  async update(
    ownerIdInput: string,
    slugInput: string,
    hostIdInput: string,
    input: UpdateHostInput,
  ): Promise<{ host: HostView }> {
    const station = await this.stations.getOwnedBySlug(slugInput, ownerIdInput);
    const stationId = toObjectId(station.id, 'That station does not exist.');
    const ownerId = toObjectId(ownerIdInput, 'Authentication is required.');
    const hostId = toObjectId(hostIdInput);
    const existing = await this.hosts.findOwned(hostId, stationId, ownerId);

    if (!existing) {
      throw new ApiError(404, 'HOST_NOT_FOUND', 'That host does not exist.');
    }

    const fields: Partial<HostDocument> = { updatedAt: new Date() };

    if (input.name !== undefined) {
      fields.name = input.name;
    }
    if (input.gender !== undefined) {
      fields.gender = input.gender;
    }
    if (input.personality !== undefined) {
      fields.personality = input.personality;
    }
    if (input.skills !== undefined) {
      fields.skills = uniqueSkills(input.skills);
    }

    if (input.avatarDataUrl !== undefined) {
      const avatar = parseHostAvatarDataUrl(input.avatarDataUrl);
      fields.avatar = avatar;
      fields.avatarSource = avatar ? input.avatarSource ?? 'upload' : null;
    } else if (input.removeAvatar === true) {
      fields.avatar = null;
      fields.avatarSource = null;
    }

    const updated = await this.hosts.updateOwned(hostId, stationId, ownerId, fields);

    if (!updated) {
      throw new ApiError(404, 'HOST_NOT_FOUND', 'That host does not exist.');
    }

    return { host: toHostView(updated) };
  }

  async remove(
    ownerIdInput: string,
    slugInput: string,
    hostIdInput: string,
  ): Promise<void> {
    const station = await this.stations.getOwnedBySlug(slugInput, ownerIdInput);
    const stationId = toObjectId(station.id, 'That station does not exist.');
    const ownerId = toObjectId(ownerIdInput, 'Authentication is required.');
    const hostId = toObjectId(hostIdInput);
    const deleted = await this.hosts.deleteOwned(hostId, stationId, ownerId);

    if (!deleted) {
      throw new ApiError(404, 'HOST_NOT_FOUND', 'That host does not exist.');
    }
  }

  async generateAvatar(
    ownerIdInput: string,
    slugInput: string,
    input: GenerateHostAvatarInput,
  ): Promise<{ avatarDataUrl: string; source: 'ai' }> {
    await this.stations.getOwnedBySlug(slugInput, ownerIdInput);
    const generated = await openAiImage.generateHostAvatar(input);

    return {
      avatarDataUrl: `data:${generated.mimeType};base64,${generated.data.toString('base64')}`,
      source: 'ai',
    };
  }

  async avatar(
    hostIdInput: string,
  ): Promise<{ mimeType: string; data: Buffer } | null> {
    if (!ObjectId.isValid(hostIdInput)) {
      return null;
    }

    const host = await this.hosts.findAvatar(new ObjectId(hostIdInput));

    if (!host?.avatar?.mimeType || !host.avatar.data) {
      return null;
    }

    return {
      mimeType: host.avatar.mimeType,
      data: host.avatar.data,
    };
  }
}
