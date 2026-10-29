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

interface ScriptBlock {
  hostId: ObjectId;
  hostName: string;
  text: string;
}

const TURN_GAP_SECONDS = 0.35;

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

    const turns =
      script.turns?.length > 0
        ? script.turns
        : script.scriptText && script.hostId && script.hostName
          ? [
              {
                hostId: script.hostId,
                hostName: script.hostName,
                text: script.scriptText,
              },
            ]
          : [];

    if (turns.length === 0) {
      await this.scripts.updateById(id, {
        status: 'failed',
        error: 'This script has no spoken turns to render.',
        completedAt: new Date(),
      });
      return;
    }

    await this.scripts.updateById(id, {
      status: 'generating',
      error: null,
    });
    logger.info('script.started', {
      scriptId,
      turns: turns.length,
      hosts: script.participants.length,
    });

    try {
      const blocks: ScriptBlock[] = [];

      for (const turn of turns) {
        const last = blocks[blocks.length - 1];

        if (last && last.hostId.equals(turn.hostId)) {
          last.text = `${last.text} ${turn.text}`.trim();
        } else {
          blocks.push({
            hostId: turn.hostId,
            hostName: turn.hostName,
            text: turn.text,
          });
        }
      }

      const profileIds = new Map<string, string>();
      const wavs: Buffer[] = [];
      let totalDuration = 0;

      for (const block of blocks) {
        const hostKey = block.hostId.toHexString();
        let profileId = profileIds.get(hostKey);

        if (!profileId) {
          profileId = await this.ensureProfile(
            block.hostId,
            script.stationId,
            script.ownerId,
            script.language,
          );
          profileIds.set(hostKey, profileId);
        }

        const generated = await voiceStudio.generate({
          profileId,
          text: block.text,
          language: script.language,
        });

        totalDuration += generated.durationSeconds;
        wavs.push(generated.audio);

        if (
          totalDuration +
            TURN_GAP_SECONDS * Math.max(0, blocks.length - 1) >
          env.SCRIPT_MAX_DURATION_SECONDS
        ) {
          throw new ApiError(
            400,
            'SCRIPT_TOO_LONG',
            'The generated conversation is longer than the 10-minute limit. Shorten the script and create a new draft.',
          );
        }
      }

      const mp3 = await audioTranscode.concatWavsToMp3(
        wavs,
        TURN_GAP_SECONDS,
      );
      const durationSeconds =
        totalDuration + TURN_GAP_SECONDS * Math.max(0, blocks.length - 1);

      await this.scripts.updateById(id, {
        status: 'completed',
        audio: { mimeType: 'audio/mpeg', data: mp3 },
        durationSeconds,
        error: null,
        completedAt: new Date(),
      });

      logger.info('script.completed', {
        scriptId,
        turns: turns.length,
        blocks: blocks.length,
        durationSeconds,
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

  private async ensureProfile(
    hostId: ObjectId,
    stationId: ObjectId,
    ownerId: ObjectId,
    language: string,
  ): Promise<string> {
    const override = env.VOICE_STUDIO_PROFILE_OVERRIDE.trim();

    if (override) {
      const existing = await voiceStudio.getProfile(override);

      if (!existing) {
        throw new ApiError(
          400,
          'VOICE_PROFILE_OVERRIDE_MISSING',
          `The VoiceStudio profile override "${override}" does not exist.`,
        );
      }

      return override;
    }

    const host = await this.hosts.findOwned(hostId, stationId, ownerId);

    if (!host?.voice?.name) {
      throw new ApiError(
        400,
        'HOST_VOICE_MISSING',
        'A host in this conversation has no voice assigned.',
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
        language,
      });
      profileId = profile.id;

      await this.hosts.updateOwned(hostId, stationId, ownerId, {
        voiceStudioProfileId: profileId,
        updatedAt: new Date(),
      });
    }

    return profileId;
  }
}

export const scriptQueue = new ScriptQueue();
