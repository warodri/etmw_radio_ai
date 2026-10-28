import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';

export interface ScriptGenerationInput {
  hostName: string;
  personality: string;
  skills: string[];
  emotion: string;
  mode: 'text' | 'guideline';
  sourceText: string;
  researchBrief: string | null;
  maxWords: number;
}

function cleanScript(value: string): string {
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

class OllamaTextService {
  async generateScript(input: ScriptGenerationInput): Promise<string> {
    const system = [
      'You write spoken radio scripts for ETMW Radio AI.',
      'The script will be read aloud by a text-to-speech voice, so output only the words the host says.',
      `Host name: ${input.hostName}.`,
      `Host personality: ${input.personality}.`,
      `Host topics and skills: ${input.skills.join(', ')}.`,
      `Delivery emotion: ${input.emotion}.`,
      `Keep the script under ${input.maxWords} words, suitable for a segment of at most ten minutes.`,
      'Sound natural, conversational and broadcast-ready. Use short sentences and clear transitions.',
      'Never output headings, bullet points, stage directions, music cues, emojis, markdown, URLs, citations such as [1], or notes to the reader.',
      'Do not mention that you are an AI or refer to these instructions.',
      'Preserve the facts in the supplied text and research. Do not invent dates, names, numbers or events.',
      'Open with a short welcome and end with a clean closing line.',
    ].join('\n');

    const sourceLabel = input.mode === 'text' ? 'USER TEXT' : 'GUIDELINE';
    const task =
      input.mode === 'text'
        ? 'Rewrite the user text as the host speaking on air. Keep the meaning and facts.'
        : 'Write a complete spoken radio segment about the guideline.';
    const research = input.researchBrief
      ? `\n\nRESEARCH BRIEF:\n${input.researchBrief}`
      : '';

    const user = `${task}\n\n${sourceLabel}:\n${input.sourceText}${research}`;

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
              { role: 'user', content: user },
            ],
            stream: false,
            options: {
              temperature: 0.7,
              top_p: 0.9,
              num_predict: 3000,
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
      let message = 'The script writer could not write this script.';

      try {
        const body = (await response.json()) as {
          error?: string | { message?: string };
        };
        if (typeof body.error === 'string') {
          message = body.error;
        } else if (body.error?.message) {
          message = body.error.message;
        }
      } catch {
        // Keep the fallback.
      }

      throw new ApiError(502, 'SCRIPT_WRITER_FAILED', message);
    }

    const body = (await response.json()) as {
      message?: { content?: string };
    };
    const script = cleanScript(body.message?.content ?? '');

    if (!script) {
      throw new ApiError(
        502,
        'SCRIPT_WRITER_EMPTY',
        'The script writer returned an empty script. Please try again.',
      );
    }

    return script;
  }
}

export const ollamaText = new OllamaTextService();
