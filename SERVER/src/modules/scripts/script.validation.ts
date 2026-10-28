import { z } from 'zod';
import { env } from '../../config/env.js';
import { SCRIPT_MODES } from './script.model.js';

export const scriptPageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(24).default(6),
});

const textSourceSchema = z.object({
  hostId: z.string().trim().min(1),
  text: z
    .string()
    .trim()
    .min(10, 'Write at least a few words for this host.')
    .max(20000, 'Keep each host text under 20,000 characters.'),
});

const turnSchema = z.object({
  hostId: z.string().trim().min(1),
  text: z
    .string()
    .trim()
    .min(1, 'A spoken turn cannot be empty.')
    .max(20000, 'Keep each turn under 20,000 characters.'),
});

export const createScriptDraftSchema = z.object({
  participants: z
    .array(z.string().trim().min(1))
    .min(1, 'Choose at least one host.')
    .max(
      env.SCRIPT_MAX_HOSTS,
      `Choose up to ${env.SCRIPT_MAX_HOSTS} hosts for now.`,
    ),
  title: z.string().trim().max(120).optional(),
  mode: z.enum(SCRIPT_MODES),
  texts: z.array(textSourceSchema).max(env.SCRIPT_MAX_HOSTS).optional(),
  guideline: z
    .string()
    .trim()
    .min(10, 'Write at least a few words about the topic.')
    .max(8000, 'Keep the topic guideline under 8,000 characters.')
    .optional(),
  research: z.boolean().default(false),
});

export const updateScriptDraftSchema = z.object({
  title: z.string().trim().max(120).optional(),
  turns: z
    .array(turnSchema)
    .min(1, 'A script needs at least one spoken turn.')
    .max(100, 'Keep the conversation under 100 turns.'),
});

export type CreateScriptDraftInput = z.infer<typeof createScriptDraftSchema>;
export type UpdateScriptDraftInput = z.infer<typeof updateScriptDraftSchema>;

export const scriptLimits = {
  maxWords: env.SCRIPT_MAX_WORDS,
  maxDurationSeconds: env.SCRIPT_MAX_DURATION_SECONDS,
  maxHosts: env.SCRIPT_MAX_HOSTS,
};
