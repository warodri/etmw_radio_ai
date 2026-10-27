import { RadioStation } from './station.models';

export type HostGender = 'male' | 'female';
export type HostSkill = string;
export type HostAvatarSource = 'upload' | 'ai';
export type HostVoiceEmotion =
  'calm' | 'mysterious' | 'happy' | 'sad' | 'energetic' | 'serious' | 'warm';

export interface HostVoiceOption {
  id: string;
  name: string;
  gender: HostGender;
  locale: string;
  age: string;
  description: string;
}

export interface HostVoiceEmotionOption {
  id: HostVoiceEmotion;
  label: string;
  description: string;
}

export interface HostVoiceCatalogResponse {
  voices: HostVoiceOption[];
  emotions: HostVoiceEmotionOption[];
}

export interface HostVoiceAssignment {
  id: string;
  name: string;
  emotion: HostVoiceEmotion;
  assignedAt: string;
}

export interface HostVoicePayload {
  voiceId: string;
  emotion: HostVoiceEmotion;
}

export interface HostPersona {
  id: string;
  name: string;
  gender: HostGender;
  personality: string;
  skills: HostSkill[];
  avatarUrl: string | null;
  avatarSource: HostAvatarSource | null;
  voice: HostVoiceAssignment | null;
  createdAt: string;
  updatedAt: string;
}

export interface HostListResponse {
  station: RadioStation;
  hosts: HostPersona[];
}

export interface HostResponse {
  host: HostPersona;
}

export interface HostPayload {
  name: string;
  gender: HostGender;
  personality: string;
  skills: HostSkill[];
  avatarDataUrl?: string | null;
  avatarSource?: HostAvatarSource;
  removeAvatar?: boolean;
}

export interface GenerateHostAvatarPayload {
  name: string;
  gender: HostGender;
  personality: string;
  skills: HostSkill[];
}

export interface GenerateHostAvatarResponse {
  avatarDataUrl: string;
  source: 'ai';
}

export const HOST_SKILL_SUGGESTIONS: string[] = [
  'Tech',
  'Science',
  'Art',
  'Music',
  'Culture',
  'Politics',
  'Business',
  'Health',
  'History',
  'Film',
  'Gaming',
  'Travel',
  'Comedy',
  'Sports',
];
