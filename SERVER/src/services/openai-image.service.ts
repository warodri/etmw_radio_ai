import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';

export interface GeneratedHostAvatar {
  data: Buffer;
  mimeType: string;
}

export interface HostAvatarPromptInput {
  name: string;
  gender: 'male' | 'female';
  personality: string;
  skills: string[];
}

interface OpenAiImagesResponse {
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
  output_format?: string;
}

const MAX_GENERATED_AVATAR_BYTES = 4 * 1024 * 1024;

function promptForHost(input: HostAvatarPromptInput): string {
  const gender = input.gender === 'female' ? 'woman' : 'man';
  const topics = input.skills.join(' and ');
  const personality = input.personality.trim() || 'curious, warm and engaging';

  return [
    `Square portrait avatar for an adult radio show host named ${input.name}.`,
    `The host is a ${gender}.`,
    `Personality: ${personality}.`,
    `Their expertise and conversation topics are ${topics}.`,
    'Editorial studio portrait, head and shoulders, looking toward the camera with a confident friendly expression.',
    'Deep charcoal background with a warm orange rim light, cinematic and polished.',
    'High detail, photorealistic, centered composition, no text, no logos, no watermark.',
  ].join(' ');
}

function mimeFromOutputFormat(value: string | undefined): string {
  switch ((value ?? '').toLowerCase()) {
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/png';
  }
}

class OpenAiImageService {
  async generateHostAvatar(
    input: HostAvatarPromptInput,
  ): Promise<GeneratedHostAvatar> {
    if (!env.OPENAI_API_KEY) {
      throw new ApiError(
        503,
        'AVATAR_GENERATION_NOT_CONFIGURED',
        'AI avatar creation is not configured yet.',
      );
    }

    let response: Response;

    try {
      response = await fetch(`${env.OPENAI_BASE_URL}/images/generations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: env.OPENAI_IMAGE_MODEL,
          prompt: promptForHost(input),
          n: 1,
          size: env.OPENAI_IMAGE_SIZE,
          quality: env.OPENAI_IMAGE_QUALITY,
        }),
        signal: AbortSignal.timeout(env.OPENAI_IMAGE_TIMEOUT_MS),
      });
    } catch {
      throw new ApiError(
        502,
        'AVATAR_GENERATION_UNAVAILABLE',
        'The avatar service is unavailable. Please try again in a moment.',
      );
    }

    if (!response.ok) {
      let message = 'The host avatar could not be generated. Please try again.';

      try {
        const body = (await response.json()) as {
          error?: { message?: string };
        };
        if (body.error?.message) {
          message = body.error.message.slice(0, 400);
        }
      } catch {
        // Keep the fallback message when the provider response is not JSON.
      }

      throw new ApiError(502, 'AVATAR_GENERATION_FAILED', message);
    }

    const body = (await response.json()) as OpenAiImagesResponse;
    const item = body.data?.[0];
    let data: Buffer;
    let mimeType = mimeFromOutputFormat(body.output_format);

    if (item?.b64_json) {
      data = Buffer.from(item.b64_json, 'base64');
    } else if (item?.url) {
      let imageResponse: Response;

      try {
        imageResponse = await fetch(item.url, {
          signal: AbortSignal.timeout(env.OPENAI_IMAGE_TIMEOUT_MS),
        });
      } catch {
        throw new ApiError(
          502,
          'AVATAR_GENERATION_FAILED',
          'The generated avatar could not be downloaded. Please try again.',
        );
      }

      if (!imageResponse.ok) {
        throw new ApiError(
          502,
          'AVATAR_GENERATION_FAILED',
          'The generated avatar could not be downloaded. Please try again.',
        );
      }

      data = Buffer.from(await imageResponse.arrayBuffer());
      const contentType = imageResponse.headers.get('content-type');
      if (contentType?.startsWith('image/')) {
        mimeType = contentType.split(';')[0];
      }
    } else {
      throw new ApiError(
        502,
        'AVATAR_GENERATION_FAILED',
        'The avatar service returned no image. Please try again.',
      );
    }

    if (data.length === 0) {
      throw new ApiError(
        502,
        'AVATAR_GENERATION_FAILED',
        'The avatar service returned an empty image. Please try again.',
      );
    }

    if (data.length > MAX_GENERATED_AVATAR_BYTES) {
      throw new ApiError(
        502,
        'AVATAR_TOO_LARGE',
        'The generated avatar is too large to store. Please try again.',
      );
    }

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
      mimeType = 'image/png';
    }

    return { data, mimeType };
  }
}

export const openAiImage = new OpenAiImageService();
