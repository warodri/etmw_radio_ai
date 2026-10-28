import { z } from 'zod';
import { env } from '../../config/env.js';
import { SCRIPT_MODES } from './script.model.js';

export const scriptPageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(24).default(6),
});

export const createScriptDraftSchema = z.object({
  hostId: z.string().trim().min(1),
  title: z.string().trim().max(120).optional(),
  mode: z.enum(SCRIPT_MODES),
  text: z
    .string()
    .trim()
    .min(10, 'Write at least a few words.')
    .max(20000, 'Keep the source text under 20,000 characters.'),
  research: z.boolean().default(false),
});

export const updateScriptDraftSchema = z.object({
  title: z.string().trim().max(120).optional(),
  scriptText: z
    .string()
    .trim()
    .min(10, 'The script needs at least a few words.')
    .max(20000, 'Keep the script under 20,000 characters.'),
});

export type CreateScriptDraftInput = z.infer<typeof createScriptDraftSchema>;
export type UpdateScriptDraftInput = z.infer<typeof updateScriptDraftSchema>;

export const scriptLimits = {
  maxWords: env.SCRIPT_MAX_WORDS,
  maxDurationSeconds: env.SCRIPT_MAX_DURATION_SECONDS,
};
