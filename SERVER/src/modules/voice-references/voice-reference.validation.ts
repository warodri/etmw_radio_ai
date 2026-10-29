import { z } from 'zod';
import { HOST_GENDERS } from '../hosts/host.model.js';

export const createVoiceReferenceSchema = z.object({
  name: z.string().trim().min(2, 'Give the voice a name.').max(80),
  description: z.string().trim().max(500).default(''),
  gender: z.enum(HOST_GENDERS),
  accent: z.string().trim().min(2).max(30).default('en-US'),
  audioDataUrl: z.string().min(100).max(8_000_000),
});

export const assignVoiceReferenceSchema = z.object({
  referenceId: z.string().trim().min(1).max(80),
});

export type CreateVoiceReferenceInput = z.infer<typeof createVoiceReferenceSchema>;
export type AssignVoiceReferenceInput = z.infer<typeof assignVoiceReferenceSchema>;
