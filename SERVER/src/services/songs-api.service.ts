import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';

export interface SongsGenerationJob {
  id: string;
  status: 'queued' | 'generating' | 'completed' | 'failed';
  title: string;
  durationSeconds: number;
  tags: string[];
  error: string | null;
  songId: string | null;
  queuePosition: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface CreateSongsGenerationInput {
  title?: string;
  lyrics: string;
  tags: string[];
  durationSeconds: number;
}

class SongsApiService {
  private readonly baseUrl = env.SONGS_API_URL.replace(/\/+$/, '');

  async createGeneration(
    input: CreateSongsGenerationInput,
  ): Promise<SongsGenerationJob> {
    const response = await this.request('/partner/generations', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const body = (await response.json()) as { job: SongsGenerationJob };
    return body.job;
  }

  async getGeneration(id: string): Promise<SongsGenerationJob> {
    const response = await this.request(
      `/partner/generations/${encodeURIComponent(id)}`,
    );
    const body = (await response.json()) as { job: SongsGenerationJob };
    return body.job;
  }

  async getSongAudio(
    id: string,
  ): Promise<{ data: Buffer; contentType: string }> {
    const response = await this.request(
      `/partner/songs/${encodeURIComponent(id)}/audio`,
      undefined,
      120_000,
    );
    const data = Buffer.from(await response.arrayBuffer());

    if (data.length === 0) {
      throw new ApiError(
        502,
        'SONGS_AUDIO_EMPTY',
        'ETMW Songs returned an empty audio file.',
      );
    }

    return {
      data,
      contentType: response.headers.get('content-type') || 'audio/mpeg',
    };
  }

  private async request(
    path: string,
    init?: RequestInit,
    timeoutMs = env.SONGS_API_TIMEOUT_MS,
  ): Promise<Response> {
    if (!env.SONGS_API_KEY) {
      throw new ApiError(
        503,
        'SONGS_NOT_CONFIGURED',
        'The ETMW Songs integration is not configured yet.',
      );
    }

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.SONGS_API_KEY,
          ...(init?.headers ?? {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new ApiError(
        502,
        'SONGS_UNAVAILABLE',
        'The ETMW Songs service is unavailable. Please try again in a moment.',
      );
    }

    if (!response.ok) {
      let message = 'ETMW Songs could not complete that request.';

      try {
        const body = (await response.json()) as { message?: string };
        if (body.message) {
          message = body.message;
        }
      } catch {
        // Keep the fallback message when the upstream response is not JSON.
      }

      if (response.status === 401 || response.status === 403) {
        throw new ApiError(
          503,
          'SONGS_API_KEY_INVALID',
          'The ETMW Songs API key is invalid. Update SONGS_API_KEY and try again.',
        );
      }

      throw new ApiError(502, 'SONGS_API_ERROR', message);
    }

    return response;
  }
}

export const songsApi = new SongsApiService();
