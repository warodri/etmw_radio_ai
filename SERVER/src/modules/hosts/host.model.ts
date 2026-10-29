import { ObjectId } from "mongodb";

export const HOST_GENDERS = ["male", "female"] as const;
export type HostGender = (typeof HOST_GENDERS)[number];

export type HostSkill = string;

export const HOST_VOICE_EMOTIONS = [
  "calm",
  "mysterious",
  "happy",
  "sad",
  "energetic",
  "serious",
  "warm",
] as const;

export type HostVoiceEmotion = (typeof HOST_VOICE_EMOTIONS)[number];

export interface HostVoiceAssignment {
  id: string;
  name: string;
  emotion: HostVoiceEmotion;
  assignedAt: Date;
}

export interface HostVoiceView {
  id: string;
  name: string;
  emotion: HostVoiceEmotion;
  assignedAt: string;
}

export const HOST_AVATAR_SOURCES = ["upload", "ai"] as const;
export type HostAvatarSource = (typeof HOST_AVATAR_SOURCES)[number];

export interface HostAvatar {
  mimeType: string;
  data?: Buffer;
}

export interface HostVoiceReference {
  id: ObjectId;
  name: string;
  source: 'builtin' | 'upload';
  accent: string;
  assignedAt: Date;
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
  voice: HostVoiceAssignment | null;
  voiceReference: HostVoiceReference | null;
  voiceStudioProfileId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface HostVoiceReferenceView {
  id: string;
  name: string;
  source: 'builtin' | 'upload';
  accent: string;
  assignedAt: string;
}

export function hostHasVoice(host: HostDocument): boolean {
  return Boolean(
    host.voice?.name || host.voiceReference || host.voiceStudioProfileId,
  );
}

export interface HostView {
  id: string;
  name: string;
  gender: HostGender;
  personality: string;
  skills: HostSkill[];
  avatarUrl: string | null;
  avatarSource: HostAvatarSource | null;
  voice: HostVoiceView | null;
  referenceVoice: HostVoiceReferenceView | null;
  createdAt: string;
  updatedAt: string;
}

export function toHostView(host: HostDocument & { _id: ObjectId }): HostView {
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
    voice: host.voice
      ? {
          id: host.voice.id,
          name: host.voice.name,
          emotion: host.voice.emotion,
          assignedAt: host.voice.assignedAt.toISOString(),
        }
      : null,
    referenceVoice: host.voiceReference
      ? {
          id: host.voiceReference.id.toHexString(),
          name: host.voiceReference.name,
          source: host.voiceReference.source,
          accent: host.voiceReference.accent,
          assignedAt: host.voiceReference.assignedAt.toISOString(),
        }
      : null,
    createdAt: host.createdAt.toISOString(),
    updatedAt: host.updatedAt.toISOString(),
  };
}
