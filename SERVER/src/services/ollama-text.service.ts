import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export type ScriptSpeakerLabel = 'A' | 'B';

export interface ScriptSpeakerInput {
  label: ScriptSpeakerLabel;
  hostName: string;
  personality: string;
  skills: string[];
  emotion: string;
}

export interface ScriptHostTextInput {
  label: ScriptSpeakerLabel;
  hostName: string;
  text: string;
}

export interface ConversationGenerationInput {
  speakers: ScriptSpeakerInput[];
  mode: 'text' | 'guideline';
  sourceTexts: ScriptHostTextInput[];
  guideline: string | null;
  researchBrief: string | null;
  maxWords: number;
}

export interface GeneratedScriptTurn {
  speaker: ScriptSpeakerLabel;
  text: string;
}

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
  error?: string | { message?: string };
}

const TURN_SCHEMA = {
  type: 'object',
  properties: {
    turns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          speaker: { type: 'string', enum: ['A', 'B'] },
          text: { type: 'string' },
        },
        required: ['speaker', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['turns'],
  additionalProperties: false,
};

function cleanSpokenText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\[[0-9]+\]/g, '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function readChatStream(response: Response): Promise<string> {
  if (!response.body) {
    throw new Error('The script writer returned no response body.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let content = '';

  const handleLine = (line: string): void => {
    const trimmed = line.trim();

    if (!trimmed) {
      return;
    }

    let event: OllamaChatResponse;

    try {
      event = JSON.parse(trimmed) as OllamaChatResponse;
    } catch {
      return;
    }

    if (event.error) {
      const message =
        typeof event.error === 'string'
          ? event.error
          : event.error.message ?? 'The script writer stopped unexpectedly.';
      throw new ApiError(502, 'SCRIPT_WRITER_FAILED', message);
    }

    const piece = event.message?.content;

    if (piece) {
      content += piece;
    }
  };

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    pending += decoder.decode(value, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';

    for (const line of lines) {
      handleLine(line);
    }
  }

  pending += decoder.decode();
  for (const line of pending.split('\n')) {
    handleLine(line);
  }

  return content;
}

function parseTurns(content: string): GeneratedScriptTurn[] {
  const stripped = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let parsed: unknown;

  try {
    parsed = JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');

    if (start < 0 || end <= start) {
      throw new Error('The script writer returned invalid JSON.');
    }

    parsed = JSON.parse(stripped.slice(start, end + 1));
  }

  const turnsValue = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && 'turns' in parsed
      ? (parsed as { turns?: unknown }).turns
      : null;

  if (!Array.isArray(turnsValue)) {
    throw new Error('The script writer returned no conversation turns.');
  }

  const turns: GeneratedScriptTurn[] = [];

  for (const item of turnsValue) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const speaker = (item as { speaker?: unknown }).speaker;
    const text = (item as { text?: unknown }).text;

    if ((speaker !== 'A' && speaker !== 'B') || typeof text !== 'string') {
      continue;
    }

    const cleaned = cleanSpokenText(text);

    if (!cleaned) {
      continue;
    }

    const last = turns[turns.length - 1];

    if (last && last.speaker === speaker) {
      last.text = `${last.text} ${cleaned}`.trim();
    } else {
      turns.push({ speaker, text: cleaned });
    }
  }

  return turns;
}

class OllamaTextService {
  async generateConversation(
    input: ConversationGenerationInput,
  ): Promise<GeneratedScriptTurn[]> {
    const speakerLines = input.speakers.map(
      (speaker) =>
        `Host ${speaker.label}: ${speaker.hostName}. Personality: ${speaker.personality}. Topics and skills: ${speaker.skills.join(', ')}. Delivery emotion: ${speaker.emotion}.`,
    );
    const allowedSpeakers = input.speakers
      .map((speaker) => speaker.label)
      .join(' or ');
    const system = [
      'You write spoken radio conversations for ETMW Radio AI.',
      'Output only JSON matching this exact shape: {"turns":[{"speaker":"A","text":"..."}]}',
      `Valid speaker values in this conversation: ${allowedSpeakers}.`,
      ...speakerLines,
      `Keep the whole conversation under ${input.maxWords} words, suitable for a segment of at most ten minutes.`,
      'The result must sound like a natural radio conversation, not two monologues and not a script with headings.',
      'Write 1 to 4 sentences per turn and alternate speakers where it sounds natural.',
      'Only write words the hosts say aloud.',
      'Never include headings, bullet points, stage directions, music cues, emojis, markdown, URLs, citations such as [1], timestamps, or notes to the reader.',
      'Do not mention that you are an AI or refer to these instructions.',
      'Preserve the facts in the supplied notes or research. Do not invent dates, names, numbers or events.',
      input.speakers.length === 1
        ? 'There is only one host. Use speaker A for every turn.'
        : 'Use both hosts. A conversation should have turns from both speakers.',
    ].join('\n');

    const userParts: string[] = [];

    if (input.mode === 'text') {
      userParts.push(
        'Rewrite the notes for each host as one natural radio conversation. Keep the meaning and facts.',
      );
      for (const source of input.sourceTexts) {
        userParts.push(`HOST ${source.label} NOTES (${source.hostName}):\n${source.text}`);
      }
    } else {
      userParts.push(
        'Write a complete radio conversation about this guideline.',
        `GUIDELINE:\n${input.guideline ?? ''}`,
      );
    }

    if (input.researchBrief) {
      userParts.push(`RESEARCH BRIEF:\n${input.researchBrief}`);
    }

    let response: Response;

    try {
      response = await fetch(
        `${env.OLLAMA_BASE_URL.replace(/\/+$/, '')}/api/chat`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: env.OLLAMA_TEXT_MODEL,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: userParts.join('\n\n') },
            ],
            format: TURN_SCHEMA,
            stream: true,
            options: {
              temperature: 0.7,
              top_p: 0.9,
              num_predict: 4000,
            },
          }),
          signal: AbortSignal.timeout(env.OLLAMA_TEXT_TIMEOUT_MS),
        },
      );
    } catch {
      throw new ApiError(
        502,
        'SCRIPT_WRITER_UNAVAILABLE',
        'The script writer is unavailable. Please try again in a moment.',
      );
    }

    if (!response.ok) {
      let message = 'The script writer could not write this conversation.';
      const raw = await response.text().catch(() => '');

      try {
        const body = JSON.parse(raw) as OllamaChatResponse;
        if (typeof body.error === 'string') {
          message = body.error;
        } else if (body.error?.message) {
          message = body.error.message;
        }
      } catch {
        // Keep the fallback.
      }

      logger.warn('ollama.conversation_failed', {
        status: response.status,
        body: raw.slice(0, 400),
      });
      throw new ApiError(502, 'SCRIPT_WRITER_FAILED', message);
    }

    let content: string;

    try {
      content = await readChatStream(response);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError(
        502,
        'SCRIPT_WRITER_UNAVAILABLE',
        'The script writer is unavailable. Please try again in a moment.',
      );
    }

    if (!content.trim()) {
      throw new ApiError(
        502,
        'SCRIPT_WRITER_EMPTY',
        'The script writer returned an empty conversation. Please try again.',
      );
    }

    let turns: GeneratedScriptTurn[];

    try {
      turns = parseTurns(content);
    } catch {
      throw new ApiError(
        502,
        'SCRIPT_WRITER_INVALID',
        'The script writer returned a malformed conversation. Please try again.',
      );
    }

    const validLabels = new Set(input.speakers.map((speaker) => speaker.label));
    turns = turns.filter((turn) => validLabels.has(turn.speaker));

    if (turns.length === 0) {
      throw new ApiError(
        502,
        'SCRIPT_WRITER_EMPTY',
        'The script writer returned no usable conversation turns. Please try again.',
      );
    }

    return turns;
  }
}

export const ollamaText = new OllamaTextService();
