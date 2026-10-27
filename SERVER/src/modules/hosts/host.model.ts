import { ObjectId } from 'mongodb';

export const HOST_GENDERS = ['male', 'female'] as const;
export type HostGender = (typeof HOST_GENDERS)[number];

export type HostSkill = string;

export const HOST_AVATAR_SOURCES = ['upload', 'ai'] as const;
export type HostAvatarSource = (typeof HOST_AVATAR_SOURCES)[number];

export interface HostAvatar {
  mimeType: string;
  data?: Buffer;
}

export interface HostDocument {
  _id?: ObjectId;
  stationId: ObjectId;
  ownerId: ObjectId;
  name: string;
  gender: HostGender;
  personality: string;
  skills: HostSkill[];
  avatar: HostAvatar | null;
  avatarSource: HostAvatarSource | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface HostView {
  id: string;
  name: string;
  gender: HostGender;
  personality: string;
  skills: HostSkill[];
  avatarUrl: string | null;
  avatarSource: HostAvatarSource | null;
  createdAt: string;
  updatedAt: string;
}

export function toHostView(
  host: HostDocument & { _id: ObjectId },
): HostView {
  const id = host._id.toHexString();
  const hasAvatar = Boolean(host.avatar?.mimeType);

  return {
    id,
    name: host.name,
    gender: host.gender,
    personality: host.personality,
    skills: host.skills,
    avatarUrl: hasAvatar
      ? `/hosts/${id}/avatar?v=${host.updatedAt.getTime()}`
      : null,
    avatarSource: host.avatarSource,
    createdAt: host.createdAt.toISOString(),
    updatedAt: host.updatedAt.toISOString(),
  };
}
