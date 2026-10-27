import { spawn } from "child_process";
import { env } from "../config/env.js";
import { HostVoiceEmotion } from "../modules/hosts/host.model.js";
import { previewTextFor } from "../modules/hosts/voice-catalog.js";
import { ApiError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

interface EmotionEffect {
  pitchSemitones: number;
  tempo: number;
}

const EMOTION_EFFECTS: Record<HostVoiceEmotion, EmotionEffect> = {
  calm: { pitchSemitones: -0.6, tempo: 0.96 },
  mysterious: { pitchSemitones: -1.2, tempo: 0.94 },
  happy: { pitchSemitones: 0.7, tempo: 1.04 },
  sad: { pitchSemitones: -1.5, tempo: 0.92 },
  energetic: { pitchSemitones: 1, tempo: 1.06 },
  serious: { pitchSemitones: -0.5, tempo: 0.98 },
  warm: { pitchSemitones: -0.2, tempo: 0.97 },
};

function applyEmotionEffect(
  audio: Buffer,
  emotion: HostVoiceEmotion,
): Promise<Buffer> {
  const effect = EMOTION_EFFECTS[emotion];
  const rate = 2 ** (effect.pitchSemitones / 12);
  const atempo = effect.tempo / rate;
  const filter = `asetrate=24000*${rate.toFixed(6)},aresample=24000,atempo=${atempo.toFixed(6)}`;

  return new Promise((resolve) => {
    const process = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-af",
      filter,
      "-f",
      "wav",
      "pipe:1",
    ]);
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        process.kill("SIGKILL");
      }
    }, 20_000);

    process.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    process.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    process.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      logger.warn("phonon.emotion_effect_failed", { message: error.message });
      resolve(audio);
    });
    process.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);

      if (code === 0 && output.length > 0) {
        resolve(Buffer.concat(output));
        return;
      }

      logger.warn("phonon.emotion_effect_failed", {
        message: Buffer.concat(errors).toString("utf8").slice(0, 300),
        code,
      });
      resolve(audio);
    });

    process.stdin.end(audio);
  });
}

class PhononService {
  async preview(
    hostName: string,
    voiceName: string,
    emotion: HostVoiceEmotion,
  ): Promise<{ data: Buffer; contentType: string }> {
    let response: Response;

    try {
      response = await fetch(
        `${env.OLLAMA_BASE_URL.replace(/\/+$/, "")}/v1/audio/speech`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: env.PHONON_MODEL,
            input: previewTextFor(emotion, hostName),
            voice: voiceName,
            response_format: "wav",
            emotion,
          }),
          signal: AbortSignal.timeout(env.PHONON_TIMEOUT_MS),
        },
      );
    } catch {
      throw new ApiError(
        502,
        "VOICE_PREVIEW_UNAVAILABLE",
        "The voice studio is unavailable. Please try again in a moment.",
      );
    }

    if (!response.ok) {
      let message = `The voice preview failed (${response.status}).`;

      try {
        const body = (await response.json()) as {
          error?: { message?: string } | string;
          message?: string;
        };
        if (typeof body.error === "string") {
          message = body.error;
        } else if (body.error?.message) {
          message = body.error.message;
        } else if (body.message) {
          message = body.message;
        }
      } catch {
        // Keep the fallback message.
      }

      throw new ApiError(502, "VOICE_PREVIEW_FAILED", message.slice(0, 400));
    }

    const data = Buffer.from(await response.arrayBuffer());
    if (data.length < 1024) {
      throw new ApiError(
        502,
        "VOICE_PREVIEW_EMPTY",
        "The voice studio returned no audio. Please try again.",
      );
    }

    return {
      data: await applyEmotionEffect(data, emotion),
      contentType: "audio/wav",
    };
  }
}

export const phonon = new PhononService();
