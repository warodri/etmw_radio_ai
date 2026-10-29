import { ObjectId, WithId } from 'mongodb';
import { env } from '../../config/env.js';
import { EmailService } from '../../services/email.service.js';
import { ollamaText } from '../../services/ollama-text.service.js';
import { ApiError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { CreatorService } from '../creator/creator.service.js';
import { CreatorSongRepository } from '../creator/creator.repository.js';
import { toCreatorSongView } from '../creator/creator.model.js';
import { HostRepository } from '../hosts/host.repository.js';
import { toHostView } from '../hosts/host.model.js';
import { ScriptRepository } from '../scripts/script.repository.js';
import { ScriptService } from '../scripts/script.service.js';
import { toScriptView } from '../scripts/script.model.js';
import { StationService } from '../stations/station.service.js';
import { UserRepository } from '../users/user.repository.js';
import {
  AutoGenerationDashboard,
  AutoGenerationJobDocument,
  AutoGenerationJobView,
  AutoGenerationStatus,
  AutoGenerationStatusView,
} from './auto-generation.model.js';
import { AutoGenerationRepository } from './auto-generation.repository.js';

const RUN_DURATION_MS = 60 * 60 * 1000;
const STOP_GUARD_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;
const HARD_STOP_GRACE_MS = 5 * 60 * 1000;

const ANGLES = [
  'a surprising true story',
  'a listener question worth unpacking',
  'a small piece of history',
  'a cultural obsession',
  'a future scenario',
  'a myth worth revisiting',
  'a sound or detail people overlook',
  'a conversation about craft',
  'a local mystery',
  'a practical idea for everyday life',
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toObjectId(value: string, code: string, message: string): ObjectId {
  if (!ObjectId.isValid(value)) {
    throw new ApiError(404, code, message);
  }

  return new ObjectId(value);
}

export class AutoGenerationService {
  private started = false;
  private draining = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly stations = new StationService(),
    private readonly hosts = new HostRepository(),
    private readonly songs = new CreatorSongRepository(),
    private readonly scripts = new ScriptRepository(),
    private readonly jobs = new AutoGenerationRepository(),
    private readonly users = new UserRepository(),
    private readonly email = new EmailService(),
    private readonly scriptService = new ScriptService(),
    private readonly creatorService = new CreatorService(),
  ) {}

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;
    const reset = await this.jobs.resetRunning();

    if (reset > 0) {
      logger.warn('auto_generation.resumed_after_restart', { jobs: reset });
    }

    this.timer = setInterval(() => {
      void this.drain();
    }, POLL_INTERVAL_MS);
    this.timer.unref?.();
    void this.drain();
  }

  async getDashboard(
    ownerId: string,
    slug: string,
  ): Promise<AutoGenerationDashboard> {
    const station = await this.stations.getOwnedBySlug(slug, ownerId);
    const stationId = toObjectId(
      station.id,
      'STATION_NOT_FOUND',
      'That station does not exist.',
    );
    const owner = toObjectId(
      ownerId,
      'AUTH_REQUIRED',
      'Authentication is required.',
    );
    const [hosts, job] = await Promise.all([
      this.hosts.listByStation(stationId, owner),
      this.jobs.findLatestByStation(stationId),
    ]);

    return {
      station,
      hosts: hosts.map(toHostView),
      job: job ? await this.toJobView(job) : null,
    };
  }

  async startJob(
    ownerId: string,
    slug: string,
  ): Promise<AutoGenerationDashboard> {
    const station = await this.stations.getOwnedBySlug(slug, ownerId);
    const stationId = toObjectId(
      station.id,
      'STATION_NOT_FOUND',
      'That station does not exist.',
    );
    const owner = toObjectId(
      ownerId,
      'AUTH_REQUIRED',
      'Authentication is required.',
    );

    const active = await this.jobs.findActiveByStation(stationId);

    if (active) {
      throw new ApiError(
        409,
        'AUTO_GENERATION_ACTIVE',
        'This station already has an automatic generation job in the queue.',
      );
    }

    const hosts = await this.hosts.listByStation(stationId, owner);
    const voiced = hosts
      .filter((host) => Boolean(host.voice?.name))
      .slice(0, env.SCRIPT_MAX_HOSTS);

    if (voiced.length === 0) {
      throw new ApiError(
        400,
        'NO_VOICED_HOSTS',
        'Assign a voice to at least one host before starting automatic generation.',
      );
    }

    const user = await this.users.findById(ownerId);
    const now = new Date();
    const created = await this.jobs.create({
      stationId,
      ownerId: owner,
      ownerEmail: user?.email ?? '',
      config: {
        stationName: station.name,
        stationSlug: station.slug,
        description: station.description,
        language: station.language,
        genres: station.genres,
        presentationStyle: station.presentationStyle,
        hostIds: voiced.map((host) => host._id),
        hostNames: voiced.map((host) => host.name),
      },
      status: 'queued',
      startedAt: null,
      endsAt: null,
      finishedAt: null,
      error: null,
      generatedSongIds: [],
      generatedScriptIds: [],
      cycles: 0,
      createdAt: now,
      updatedAt: now,
    });

    logger.info('auto_generation.queued', {
      jobId: created._id.toHexString(),
      station: station.slug,
    });

    void this.drain();

    return this.getDashboard(ownerId, station.slug);
  }

  async getActiveStatuses(): Promise<AutoGenerationStatusView> {
    const active = await this.jobs.findActive();

    return {
      statuses: active.map((job) => ({
        slug: job.config.stationSlug,
        status: job.status,
      })),
    };
  }

  private async drain(): Promise<void> {
    if (this.draining) {
      return;
    }

    this.draining = true;

    try {
      while (true) {
        const job = await this.jobs.claimNextQueued();

        if (!job) {
          break;
        }

        await this.runJob(job);
      }
    } catch (error) {
      logger.error('auto_generation.watcher_failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.draining = false;
    }
  }

  private async runJob(job: WithId<AutoGenerationJobDocument>): Promise<void> {
    let current = job;

    try {
      current =
        (await this.jobs.update(current._id, {
          status: 'running',
          startedAt: current.startedAt ?? new Date(),
          endsAt:
            current.endsAt ??
            new Date(
              (current.startedAt ?? new Date()).getTime() + RUN_DURATION_MS,
            ),
        })) ?? current;

      while (true) {
        current = await this.refresh(current._id);
        const deadline =
          current.endsAt?.getTime() ?? Date.now() + RUN_DURATION_MS;

        if (Date.now() >= deadline - STOP_GUARD_MS) {
          break;
        }

        await this.generateVoice(current);
        current = await this.refresh(current._id);
        const afterVoiceDeadline =
          current.endsAt?.getTime() ?? deadline;

        if (Date.now() >= afterVoiceDeadline - STOP_GUARD_MS) {
          break;
        }

        await this.generateSong(current);
        current = await this.refresh(current._id);
        const afterSongDeadline =
          current.endsAt?.getTime() ?? deadline;

        if (Date.now() >= afterSongDeadline - STOP_GUARD_MS) {
          break;
        }

        await this.jobs.update(current._id, {
          cycles: current.cycles + 1,
        });
      }

      const finished =
        (await this.jobs.update(current._id, {
          status: 'completed',
          finishedAt: new Date(),
          error: null,
        })) ?? current;
      const summary = await this.toJobView(finished);

      await this.email.sendAutoGenerationSummary({
        toEmail: finished.ownerEmail,
        stationName: finished.config.stationName,
        stationSlug: finished.config.stationSlug,
        jobId: finished._id.toHexString(),
        startedAt: finished.startedAt,
        finishedAt: finished.finishedAt,
        totalAudioSeconds: summary.totalAudioSeconds,
        totalAudioHours: summary.totalAudioHours,
        songs: summary.songs,
        scripts: summary.scripts.map((script) => ({
          title: script.title,
          durationSeconds: script.durationSeconds,
          status: script.status,
        })),
      });

      logger.info('auto_generation.completed', {
        jobId: finished._id.toHexString(),
        station: finished.config.stationSlug,
        songs: summary.songs.length,
        scripts: summary.scripts.length,
        totalAudioSeconds: summary.totalAudioSeconds,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Automatic generation failed.';
      const failed =
        (await this.jobs.update(current._id, {
          status: 'failed',
          finishedAt: new Date(),
          error: message,
        })) ?? current;

      logger.error('auto_generation.failed', {
        jobId: failed._id.toHexString(),
        station: failed.config.stationSlug,
        message,
      });

      const adminEmail = env.adminEmails[0] ?? 'warodri@gmail.com';
      await this.email.sendAutoGenerationFailure({
        toEmail: adminEmail,
        stationName: failed.config.stationName,
        stationSlug: failed.config.stationSlug,
        jobId: failed._id.toHexString(),
        error: message,
        startedAt: failed.startedAt,
        finishedAt: failed.finishedAt,
      });
    }
  }

  private async generateVoice(
    job: WithId<AutoGenerationJobDocument>,
  ): Promise<void> {
    const config = job.config;
    const genre =
      config.genres[job.cycles % Math.max(1, config.genres.length)] ??
      'culture';
    const angle = ANGLES[job.cycles % ANGLES.length];
    const title = `${genre}: ${angle}`.slice(0, 120);
    const texts = config.hostIds.map((hostId, index) => {
      const name = config.hostNames[index] ?? 'the host';
      const secondAngle = ANGLES[(job.cycles + index + 1) % ANGLES.length];

      return {
        hostId: hostId.toHexString(),
        text: [
          `This is an unscripted radio segment for ${config.stationName}.`,
          `You are ${name}. The station is about ${config.description}`,
          `Focus on ${genre} through ${index === 0 ? angle : secondAngle}.`,
          'Share a specific observation or story, keep it conversational, and hand the conversation to the other host.',
        ].join(' '),
      };
    });

    const draft = await this.scriptService.createDraft(
      job.ownerId.toHexString(),
      config.stationSlug,
      {
        participants: config.hostIds.map((hostId) => hostId.toHexString()),
        title,
        mode: 'text',
        texts,
        research: false,
      },
    );
    const scriptId = new ObjectId(draft.id);

    await this.jobs.addScript(job._id, scriptId);
    await this.scriptService.approve(
      job.ownerId.toHexString(),
      config.stationSlug,
      draft.id,
    );
    await this.waitForScript(job, scriptId);
  }

  private async generateSong(
    job: WithId<AutoGenerationJobDocument>,
  ): Promise<void> {
    const config = job.config;
    const genres = config.genres.length > 0 ? config.genres.slice(0, 12) : ['Ambient'];
    const idea = await ollamaText.generateSongIdea({
      stationName: config.stationName,
      description: config.description,
      genres,
      style: `${config.presentationStyle}. ${config.description}`.slice(0, 600),
      language: config.language,
      seed: job.cycles + 1,
    });
    const created = await this.creatorService.createSong(
      job.ownerId.toHexString(),
      config.stationSlug,
      {
        title: idea.title,
        lyrics: idea.lyrics,
        mood: idea.mood,
        genres,
        style: `${config.presentationStyle}. ${config.description}`.slice(0, 600),
        durationSeconds: 180,
      },
    );
    const songId = new ObjectId(created.song.id);

    await this.jobs.addSong(job._id, songId);
    await this.waitForSong(job, songId);
  }

  private async waitForScript(
    job: WithId<AutoGenerationJobDocument>,
    scriptId: ObjectId,
  ): Promise<void> {
    while (true) {
      if (this.pastHardStop(job)) {
        logger.warn('auto_generation.wait_abandoned', {
          jobId: job._id.toHexString(),
          kind: 'script',
          scriptId: scriptId.toHexString(),
        });
        return;
      }

      const script = await this.scripts.findOwned(
        scriptId,
        job.stationId,
        job.ownerId,
      );

      if (!script) {
        throw new Error('The generated conversation disappeared from the library.');
      }

      if (script.status === 'completed') {
        return;
      }

      if (script.status === 'failed') {
        throw new Error(
          script.error || 'The generated conversation audio failed.',
        );
      }

      await sleep(POLL_INTERVAL_MS);
    }
  }

  private async waitForSong(
    job: WithId<AutoGenerationJobDocument>,
    songId: ObjectId,
  ): Promise<void> {
    while (true) {
      if (this.pastHardStop(job)) {
        logger.warn('auto_generation.wait_abandoned', {
          jobId: job._id.toHexString(),
          kind: 'song',
          songId: songId.toHexString(),
        });
        return;
      }

      const song = await this.creatorService.getSongStatus(
        job.ownerId.toHexString(),
        job.config.stationSlug,
        songId.toHexString(),
      );

      if (song.status === 'completed') {
        return;
      }

      if (song.status === 'failed') {
        throw new Error(song.error || 'The generated song failed.');
      }

      await sleep(POLL_INTERVAL_MS);
    }
  }

  private pastHardStop(job: WithId<AutoGenerationJobDocument>): boolean {
    return Boolean(
      job.endsAt &&
        Date.now() > job.endsAt.getTime() + HARD_STOP_GRACE_MS,
    );
  }

  private async refresh(
    id: ObjectId,
  ): Promise<WithId<AutoGenerationJobDocument>> {
    const job = await this.jobs.findById(id);

    if (!job) {
      throw new Error('The automatic generation job could not be found.');
    }

    return job;
  }

  private async toJobView(
    job: WithId<AutoGenerationJobDocument>,
  ): Promise<AutoGenerationJobView> {
    const [songs, scripts] = await Promise.all([
      this.songs.findByIds(
        job.generatedSongIds,
        job.stationId,
        job.ownerId,
      ),
      this.scripts.findByIds(
        job.generatedScriptIds,
        job.stationId,
        job.ownerId,
      ),
    ]);
    const songViews = songs.map(toCreatorSongView);
    const scriptViews = scripts.map(toScriptView);
    const completedSongs = songViews.filter((song) => song.status === 'completed');
    const completedScripts = scriptViews.filter(
      (script) => script.status === 'completed',
    );
    const pendingSongs = songViews.filter(
      (song) => song.status === 'queued' || song.status === 'generating',
    ).length;
    const pendingScripts = scriptViews.filter(
      (script) =>
        script.status === 'draft' ||
        script.status === 'queued' ||
        script.status === 'generating',
    ).length;
    const totalAudioSeconds =
      completedSongs.reduce(
        (total, song) => total + (song.durationSeconds || 0),
        0,
      ) +
      completedScripts.reduce(
        (total, script) => total + (script.durationSeconds || 0),
        0,
      );

    return {
      id: job._id.toHexString(),
      status: job.status,
      startedAt: job.startedAt?.toISOString() ?? null,
      endsAt: job.endsAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      songs: songViews,
      scripts: scriptViews,
      totalAudioSeconds,
      totalAudioHours: Math.round((totalAudioSeconds / 3600) * 100) / 100,
      completedSongs: completedSongs.length,
      completedScripts: completedScripts.length,
      pendingSongs,
      pendingScripts,
      cycles: job.cycles,
    };
  }
}

export const autoGeneration = new AutoGenerationService();
