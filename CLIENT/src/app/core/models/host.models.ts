import { RadioStation } from './station.models';

export type HostGender = 'male' | 'female';
export type HostSkill = 'Tech' | 'Science' | 'Art';
export type HostAvatarSource = 'upload' | 'ai';

export interface HostPersona {
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

export const HOST_SKILLS: HostSkill[] = ['Tech', 'Science', 'Art'];

export const HOST_SKILL_DESCRIPTIONS: Record<HostSkill, string> = {
  Tech: 'Technology, products and the future',
  Science: 'Science, discovery and the natural world',
  Art: 'Culture, music, books and creativity',
};
