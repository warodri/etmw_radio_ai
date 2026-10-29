import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';

export interface VoiceStudioProfile {
  id: string;
  name: string;
}

export interface VoiceStudioGeneration {
  audio: Buffer;
  durationSeconds: number;
}

class VoiceStudioService {
  private readonly baseUrl = env.VOICE_STUDIO_API_URL.replace(/\/+$/, '');

  private authHeaders(): Record<string, string> {
    if (!env.VOICE_STUDIO_API_KEY) {
      throw new ApiError(
        503,
        'VOICE_STUDIO_NOT_CONFIGURED',
        'VoiceStudio is not configured yet.',
      );
    }

    return { Authorization: `Bearer ${env.VOICE_STUDIO_API_KEY}` };
  }

  async createProfile(input: {
    name: string;
    audio: Buffer;
    refText: string;
    language: string;
  }): Promise<VoiceStudioProfile> {
    const form = new FormData();
    form.append('name', input.name.slice(0, 120));
    form.append('kind', 'clone');
    form.append('ref_text', input.refText);
    form.append('language', input.language || 'English');
    form.append(
      'ref_audio',
      new Blob([new Uint8Array(input.audio)], { type: 'audio/wav' }),
      'reference.wav',
    );

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/profiles`, {
        method: 'POST',
        headers: this.authHeaders(),
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new ApiError(
        502,
        'VOICE_STUDIO_UNAVAILABLE',
        'VoiceStudio is unavailable. Please try again in a moment.',
      );
    }

    if (!response.ok) {
      throw new ApiError(
        502,
        'VOICE_PROFILE_FAILED',
        await this.errorMessage(response, 'VoiceStudio could not create the host voice.'),
      );
    }

    const body = (await response.json()) as { id?: string; name?: string };
    if (!body.id) {
      throw new ApiError(
        502,
        'VOICE_PROFILE_FAILED',
        'VoiceStudio returned no voice profile id.',
      );
    }

    return { id: body.id, name: body.name ?? input.name };
  }

  async getProfile(id: string): Promise<VoiceStudioProfile | null> {
    let response: Response;

    try {
      response = await fetch(
        `${this.baseUrl}/profiles/${encodeURIComponent(id)}`,
        {
          headers: this.authHeaders(),
          signal: AbortSignal.timeout(30_000),
        },
      );
    } catch {
      throw new ApiError(
        502,
        'VOICE_STUDIO_UNAVAILABLE',
        'VoiceStudio is unavailable. Please try again in a moment.',
      );
    }

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new ApiError(
        502,
        'VOICE_PROFILE_FAILED',
        await this.errorMessage(response, 'VoiceStudio could not read the host voice.'),
      );
    }

    const body = (await response.json()) as { id?: string; name?: string };
    return body.id ? { id: body.id, name: body.name ?? '' } : null;
  }

  async generate(input: {
    profileId: string;
    text: string;
    language: string;
  }): Promise<VoiceStudioGeneration> {
    const form = new FormData();
    form.append('text', input.text);
    form.append('profile_id', input.profileId);
    form.append('language', input.language || 'English');
    form.append('max_chunk_chars', String(env.VOICE_STUDIO_MAX_CHUNK_CHARS));
    form.append('crossfade_ms', String(env.VOICE_STUDIO_CROSSFADE_MS));
    form.append('effect_preset', env.VOICE_STUDIO_EFFECT_PRESET);
    form.append('stream', 'true');

    if (env.VOICE_STUDIO_ENGINE) {
      form.append('engine', env.VOICE_STUDIO_ENGINE);
    }

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/generate`, {
        method: 'POST',
        headers: this.authHeaders(),
        body: form,
        signal: AbortSignal.timeout(env.VOICE_STUDIO_TIMEOUT_MS),
      });
    } catch {
      throw new ApiError(
        502,
        'VOICE_STUDIO_UNAVAILABLE',
        'The voice studio did not finish this render. Please try again.',
      );
    }

    if (!response.ok) {
      throw new ApiError(
        502,
        'VOICE_RENDER_FAILED',
        await this.errorMessage(response, 'VoiceStudio could not render the host audio.'),
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('ndjson')) {
      throw new ApiError(
        502,
        'VOICE_RENDER_FAILED',
        'VoiceStudio returned an unexpected response instead of a progress stream.',
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new ApiError(
        502,
        'VOICE_RENDER_FAILED',
        'VoiceStudio returned no progress stream.',
      );
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let audioPath: string | null = null;
    let durationSeconds = 0;
    let streamError: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');

        if (!line) {
          continue;
        }

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }

        if (event['type'] === 'done') {
          audioPath =
            typeof event['audio_path'] === 'string' ? event['audio_path'] : null;
          durationSeconds = Number(event['duration'] ?? 0);
        } else if (event['type'] === 'error') {
          streamError =
            typeof event['message'] === 'string'
              ? event['message']
              : typeof event['detail'] === 'string'
                ? event['detail']
                : 'The voice studio could not render this script.';
        }
      }
    }

    if (streamError) {
      throw new ApiError(502, 'VOICE_RENDER_FAILED', streamError);
    }

    if (!audioPath) {
      throw new ApiError(
        502,
        'VOICE_RENDER_FAILED',
        'VoiceStudio did not return a finished audio file. Please try again.',
      );
    }

    let audioResponse: Response;
    try {
      audioResponse = await fetch(
        `${this.baseUrl}/audio/${encodeURIComponent(audioPath)}`,
        {
          headers: this.authHeaders(),
          signal: AbortSignal.timeout(120_000),
        },
      );
    } catch {
      throw new ApiError(
        502,
        'VOICE_RENDER_FAILED',
        'The finished voice audio could not be downloaded. Please try again.',
      );
    }

    if (!audioResponse.ok) {
      throw new ApiError(
        502,
        'VOICE_RENDER_FAILED',
        await this.errorMessage(audioResponse, 'The finished voice audio could not be downloaded.'),
      );
    }

    const audio = Buffer.from(await audioResponse.arrayBuffer());
    if (audio.length < 1024) {
      throw new ApiError(
        502,
        'VOICE_RENDER_EMPTY',
        'VoiceStudio returned empty audio. Please try again.',
      );
    }

    return {
      audio,
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
    };
  }

  private async errorMessage(response: Response, fallback: string): Promise<string> {
    try {
      const text = await response.text();
      try {
        const body = JSON.parse(text) as {
          detail?: string | { message?: string };
          message?: string;
        };
        if (typeof body.detail === 'string') {
          return body.detail;
        }
        if (body.detail?.message) {
          return body.detail.message;
        }
        if (body.message) {
          return body.message;
        }
      } catch {
        if (text.trim()) {
          return text.slice(0, 400);
        }
      }
    } catch {
      // Keep the fallback.
    }

    return fallback;
  }
}

export const voiceStudio = new VoiceStudioService();
