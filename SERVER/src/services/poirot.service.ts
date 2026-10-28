import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';

export interface ResearchSource {
  index: number;
  title: string;
  url: string;
}

export interface ResearchResult {
  brief: string;
  sources: ResearchSource[];
}

class PoirotService {
  async research(query: string): Promise<ResearchResult> {
    if (!env.POIROT_API_KEY) {
      throw new ApiError(
        503,
        'RESEARCH_NOT_CONFIGURED',
        'Poirot research is not configured yet.',
      );
    }

    let response: Response;

    try {
      response = await fetch(
        `${env.POIROT_API_URL.replace(/\/+$/, '')}/api/partner/research`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Authorization: `Bearer ${env.POIROT_API_KEY}`,
          },
          body: JSON.stringify({ query: query.slice(0, 8000), maxSources: 6 }),
          signal: AbortSignal.timeout(env.POIROT_TIMEOUT_MS),
        },
      );
    } catch {
      throw new ApiError(
        502,
        'RESEARCH_UNAVAILABLE',
        'Poirot is unavailable. Please try again in a moment.',
      );
    }

    if (!response.ok) {
      let message = 'Poirot could not complete that research request.';

      try {
        const body = (await response.json()) as { message?: string };
        if (body.message) {
          message = body.message;
        }
      } catch {
        // Keep the fallback.
      }

      throw new ApiError(502, 'RESEARCH_FAILED', message);
    }

    const body = (await response.json()) as {
      brief?: string;
      sources?: ResearchSource[];
    };

    if (!body.brief?.trim()) {
      throw new ApiError(
        502,
        'RESEARCH_EMPTY',
        'Poirot returned no research for that topic. Try a more specific guideline.',
      );
    }

    return {
      brief: body.brief.trim(),
      sources: Array.isArray(body.sources) ? body.sources : [],
    };
  }
}

export const poirot = new PoirotService();
