import { ObjectId } from 'mongodb';
import { env } from '../../config/env.js';
import { audioTranscode } from '../../services/audio-transcode.service.js';
import { phonon } from '../../services/phonon.service.js';
import { voiceStudio } from '../../services/voice-studio.service.js';
import { ApiError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { HostRepository } from '../hosts/host.repository.js';
import { previewTextFor } from '../hosts/voice-catalog.js';
import { ScriptRepository } from './script.repository.js';

class ScriptQueue {
  private readonly queue: string[] = [];
  private readonly scripts = new ScriptRepository();
  private readonly hosts = new HostRepository();
  private running = false;
  private started = false;

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;
    await this.scripts.markGeneratingFailed();
    const queued = await this.scripts.listQueued();

    for (const script of queued) {
      this.queue.push(script._id.toHexString());
    }

    if (this.queue.length > 0) {
      logger.info('scripts.queue_resumed', { count: this.queue.length });
    }

    void this.drain();
  }

  enqueue(scriptId: string): void {
    this.queue.push(scriptId);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      while (this.queue.length > 0) {
        const scriptId = this.queue.shift();
        if (scriptId) {
          await this.run(scriptId);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async run(scriptId: string): Promise<void> {
    if (!ObjectId.isValid(scriptId)) {
      return;
    }

    const id = new ObjectId(scriptId);
    const script = await this.scripts.findById(id);

    if (!script || script.status !== 'queued') {
      return;
    }

    await this.scripts.updateById(id, {
      status: 'generating',
      error: null,
    });
    logger.info('script.started', { scriptId, hostId: script.hostId.toHexString() });

    try {
      const host = await this.hosts.findOwned(
        script.hostId,
        script.stationId,
        script.ownerId,
      );

      if (!host?.voice?.name) {
        throw new ApiError(
          400,
          'HOST_VOICE_MISSING',
          'This host has no voice assigned. Assign a voice before generating audio.',
        );
      }

      let profileId = host.voiceStudioProfileId;

      if (profileId) {
        const existing = await voiceStudio.getProfile(profileId);
        if (!existing) {
          profileId = null;
        }
      }

      if (!profileId) {
        const referenceText = previewTextFor(host.voice.emotion, host.name);
        const reference = await phonon.preview(
          host.name,
          host.voice.name,
          host.voice.emotion,
        );
        const profile = await voiceStudio.createProfile({
          name: `ETMW Host — ${host.name} — ${host.voice.name}`,
          audio: reference.data,
          refText: referenceText,
          language: script.language,
        });
        profileId = profile.id;

        await this.hosts.updateOwned(
          host._id,
          script.stationId,
          script.ownerId,
          {
            voiceStudioProfileId: profileId,
            updatedAt: new Date(),
          },
        );
      }

      const generated = await voiceStudio.generate({
        profileId,
        text: script.scriptText,
        language: script.language,
      });

      if (
        generated.durationSeconds > 0 &&
        generated.durationSeconds > env.SCRIPT_MAX_DURATION_SECONDS
      ) {
        throw new ApiError(
          400,
          'SCRIPT_TOO_LONG',
          'The generated audio is longer than the 10-minute limit. Shorten the script and create a new draft.',
        );
      }

      const mp3 = await audioTranscode.wavToMp3(generated.audio);

      await this.scripts.updateById(id, {
        status: 'completed',
        audio: { mimeType: 'audio/mpeg', data: mp3 },
        durationSeconds: generated.durationSeconds || null,
        error: null,
        completedAt: new Date(),
      });

      logger.info('script.completed', {
        scriptId,
        durationSeconds: generated.durationSeconds,
        bytes: mp3.length,
      });
    } catch (error) {
      const message =
        error instanceof ApiError || error instanceof Error
          ? error.message
          : 'The script could not be generated. Please try again.';

      await this.scripts.updateById(id, {
        status: 'failed',
        error: message,
        completedAt: new Date(),
      });
      logger.error('script.failed', { scriptId, message });
    }
  }
}

export const scriptQueue = new ScriptQueue();
