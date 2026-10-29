import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { ObjectId } from 'mongodb';
import { Response } from 'express';
import { CreatorSongRepository } from '../modules/creator/creator.repository.js';
import { PlaylistItemDocument } from '../modules/playlist/playlist.model.js';
import { ScriptRepository } from '../modules/scripts/script.repository.js';
import { StationView } from '../modules/stations/station.model.js';
import { logger } from '../utils/logger.js';
import { songsApi } from './songs-api.service.js';

const MAX_BLOCK_SECONDS = 20;
const OUTPUT_BYTES_PER_SECOND = 16_000;
const WRITE_INTERVAL_MS = 500;
const WRITE_CHUNK_BYTES = 8_000;
const FFMPEG_TIMEOUT_MS = 120_000;
const MAX_CACHE_FILES = 24;
const MAX_CACHE_BYTES = 300 * 1024 * 1024;

export interface RadioStreamContext {
  stationId: ObjectId;
  ownerId: ObjectId;
  station: StationView;
  items: PlaylistItemDocument[];
  totalDurationSeconds: number;
}

interface ActiveSource {
  item: PlaylistItemDocument;
  startOffset: number;
  volume: number;
}

interface TimelineBlock {
  start: number;
  duration: number;
  active: ActiveSource[];
}

interface SourceEntry {
  path: string;
  size: number;
  lastUsed: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runFfmpeg(args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill('SIGKILL');
      reject(new Error('The audio block took too long to render.'));
    }, FFMPEG_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => output.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    child.on('error', (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      const data = Buffer.concat(output);

      if (code === 0 && data.length > 0) {
        resolve(data);
        return;
      }

      reject(
        new Error(
          `Audio render failed (ffmpeg ${code}): ${Buffer.concat(errors)
            .toString('utf8')
            .slice(0, 300)}`,
        ),
      );
    });
  });
}

function songVolumeAt(item: PlaylistItemDocument, relativeSeconds: number): number {
  if (item.kind !== 'song') {
    return 1;
  }

  let volume = item.volume;

  for (const point of item.volumeKeyframes) {
    if (relativeSeconds + 0.001 >= point.atSeconds) {
      volume = point.volume;
    } else {
      break;
    }
  }

  return Math.min(1, Math.max(0, volume));
}

function buildBlocks(items: PlaylistItemDocument[], totalDuration: number): TimelineBlock[] {
  if (totalDuration <= 0) {
    return [];
  }

  const boundaries = new Set<number>([0, totalDuration]);

  for (const item of items) {
    boundaries.add(Math.min(totalDuration, Math.max(0, item.startAt)));
    boundaries.add(
      Math.min(totalDuration, Math.max(0, item.startAt + item.durationSeconds)),
    );

    for (const point of item.volumeKeyframes) {
      boundaries.add(
        Math.min(totalDuration, Math.max(0, item.startAt + point.atSeconds)),
      );
    }
  }

  const sorted = [...boundaries].sort((a, b) => a - b);
  const blocks: TimelineBlock[] = [];

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];

    if (end - start <= 0.0001) {
      continue;
    }

    for (let cursor = start; cursor < end - 0.0001; cursor += MAX_BLOCK_SECONDS) {
      const blockEnd = Math.min(end, cursor + MAX_BLOCK_SECONDS);
      const duration = blockEnd - cursor;
      const active = items
        .filter(
          (item) =>
            item.startAt < blockEnd - 0.0001 &&
            item.startAt + item.durationSeconds > cursor + 0.0001,
        )
        .map((item) => ({
          item,
          startOffset: Math.max(0, cursor - item.startAt),
          volume: songVolumeAt(item, cursor - item.startAt),
        }));

      blocks.push({ start: cursor, duration, active });
    }
  }

  return blocks;
}

function trimBlock(block: TimelineBlock, offset: number): TimelineBlock | null {
  if (offset <= block.start + 0.0001) {
    return block;
  }

  if (offset >= block.start + block.duration - 0.0001) {
    return null;
  }

  const delta = offset - block.start;

  return {
    start: offset,
    duration: block.duration - delta,
    active: block.active.map((source) => ({
      ...source,
      startOffset: source.startOffset + delta,
    })),
  };
}

function blocksFromOffset(blocks: TimelineBlock[], offset: number): TimelineBlock[] {
  const index = blocks.findIndex(
    (block) => offset < block.start + block.duration - 0.0001,
  );

  if (index < 0) {
    return [];
  }

  const first = trimBlock(blocks[index], offset);
  return first ? [first, ...blocks.slice(index + 1)] : blocks.slice(index + 1);
}

function normalizeStart(startAt: number | null, totalDuration: number): number {
  if (totalDuration <= 0) {
    return 0;
  }

  const liveOffset = Math.floor(Date.now() / 1000) % Math.max(1, Math.floor(totalDuration));
  const requested =
    typeof startAt === 'number' && Number.isFinite(startAt) && startAt >= 0
      ? startAt
      : liveOffset;
  const normalized = requested % totalDuration;
  return normalized < 0 ? normalized + totalDuration : normalized;
}

class SourceCache {
  private readonly entries = new Map<string, SourceEntry>();
  private readonly loading = new Map<string, Promise<SourceEntry>>();
  private readonly songs = new CreatorSongRepository();
  private readonly scripts = new ScriptRepository();
  private dirPromise: Promise<string> | null = null;
  private totalBytes = 0;
  private counter = 0;

  constructor(
    private readonly stationId: ObjectId,
    private readonly ownerId: ObjectId,
  ) {}

  async get(item: PlaylistItemDocument): Promise<string> {
    const key = `${item.kind}:${item.sourceId}`;
    const existing = this.entries.get(key);

    if (existing) {
      existing.lastUsed = Date.now();
      return existing.path;
    }

    const pending = this.loading.get(key);

    if (pending) {
      return (await pending).path;
    }

    const promise = this.load(item)
      .then((entry) => {
        this.entries.set(key, entry);
        this.totalBytes += entry.size;
        this.evict();
        return entry;
      })
      .finally(() => this.loading.delete(key));

    this.loading.set(key, promise);
    return (await promise).path;
  }

  async cleanup(): Promise<void> {
    const dir = this.dirPromise ? await this.dirPromise.catch(() => null) : null;

    if (dir) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async load(item: PlaylistItemDocument): Promise<SourceEntry> {
    const data = await this.readSource(item);
    const dir = await this.ensureDir();
    const file = path.join(dir, `source-${String(++this.counter).padStart(4, '0')}.audio`);
    await fs.writeFile(file, data);
    const stat = await fs.stat(file);

    return { path: file, size: stat.size, lastUsed: Date.now() };
  }

  private async readSource(item: PlaylistItemDocument): Promise<Buffer> {
    if (!ObjectId.isValid(item.sourceId)) {
      throw new Error('The playlist contains an invalid source.');
    }

    const sourceId = new ObjectId(item.sourceId);

    if (item.kind === 'song') {
      const song = await this.songs.findOwnedSong(sourceId, this.stationId, this.ownerId);

      if (!song || song.status !== 'completed' || !song.songsSongId) {
        throw new Error('A song in this playlist is no longer available.');
      }

      const audio = await songsApi.getSongAudio(song.songsSongId);
      return audio.data;
    }

    const script = await this.scripts.findAudio(sourceId, this.stationId, this.ownerId);

    if (!script?.audio?.data) {
      throw new Error('A conversation in this playlist is no longer available.');
    }

    return script.audio.data;
  }

  private async ensureDir(): Promise<string> {
    if (!this.dirPromise) {
      this.dirPromise = fs.mkdtemp(path.join(os.tmpdir(), 'etmw-radio-live-'));
    }

    return this.dirPromise;
  }

  private evict(): void {
    while (
      this.entries.size > MAX_CACHE_FILES ||
      this.totalBytes > MAX_CACHE_BYTES
    ) {
      let oldestKey: string | null = null;
      let oldest: SourceEntry | null = null;

      for (const [key, entry] of this.entries) {
        if (!oldest || entry.lastUsed < oldest.lastUsed) {
          oldestKey = key;
          oldest = entry;
        }
      }

      if (!oldestKey || !oldest) {
        return;
      }

      this.entries.delete(oldestKey);
      this.totalBytes = Math.max(0, this.totalBytes - oldest.size);
      void fs.unlink(oldest.path).catch(() => undefined);
    }
  }
}

class RadioStreamService {
  async stream(
    context: RadioStreamContext,
    response: Response,
    startAt: number | null,
  ): Promise<void> {
    const blocks = buildBlocks(context.items, context.totalDurationSeconds);

    if (blocks.length === 0) {
      throw new Error('This station does not have a playlist yet.');
    }

    const start = normalizeStart(startAt, context.totalDurationSeconds);
    const initial = blocksFromOffset(blocks, start);
    const cache = new SourceCache(context.stationId, context.ownerId);
    let initialIndex = 0;
    let cycleIndex = 0;
    let initialDone = initial.length === 0;
    let closed = false;

    response.on('close', () => {
      closed = true;
    });

    const nextBlock = (): TimelineBlock | null => {
      if (!initialDone) {
        if (initialIndex < initial.length) {
          return initial[initialIndex++];
        }

        initialDone = true;
      }

      const block = blocks[cycleIndex % blocks.length];
      cycleIndex += 1;
      return block;
    };

    try {
      let current = nextBlock();
      let currentPromise = current ? this.renderBlock(current, cache) : null;

      while (!closed && !response.destroyed && currentPromise) {
        const buffer = await currentPromise;

        if (closed || response.destroyed) {
          break;
        }

        current = nextBlock();
        const nextPromise = current ? this.renderBlock(current, cache) : null;
        const wrote = await this.writePaced(response, buffer, () => closed);

        if (!wrote) {
          break;
        }

        currentPromise = nextPromise;
      }
    } finally {
      await cache.cleanup();
    }
  }

  async renderPreview(
    context: RadioStreamContext,
    atSeconds: number,
    durationSeconds: number,
  ): Promise<Buffer> {
    const blocks = buildBlocks(context.items, context.totalDurationSeconds);

    if (blocks.length === 0) {
      throw new Error('This station does not have a playlist yet.');
    }

    const start = normalizeStart(atSeconds, context.totalDurationSeconds);
    const initial = blocksFromOffset(blocks, start);
    const pool = initial.length > 0 ? [...initial, ...blocks] : [...blocks];
    const cache = new SourceCache(context.stationId, context.ownerId);
    const chunks: Buffer[] = [];
    let remaining = durationSeconds;
    let index = 0;

    try {
      while (remaining > 0.01 && index < pool.length) {
        const block = pool[index % pool.length];
        index += 1;
        const piece: TimelineBlock = {
          ...block,
          duration: Math.min(block.duration, remaining),
        };

        chunks.push(await this.renderBlock(piece, cache));
        remaining -= piece.duration;
      }
    } finally {
      await cache.cleanup();
    }

    return Buffer.concat(chunks);
  }

  private async renderBlock(
    block: TimelineBlock,
    cache: SourceCache,
  ): Promise<Buffer> {
    const resolved = (
      await Promise.all(
        block.active.map(async (source) => {
          try {
            return { ...source, path: await cache.get(source.item) };
          } catch (error) {
            logger.warn('radio.stream_source_unavailable', {
              kind: source.item.kind,
              sourceId: source.item.sourceId,
              message: error instanceof Error ? error.message : String(error),
            });
            return null;
          }
        }),
      )
    ).filter((source): source is ActiveSource & { path: string } => Boolean(source));

    const audible = resolved.filter((source) => source.volume > 0.0001);

    if (audible.length === 0) {
      return runFfmpeg([
        '-nostdin',
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'anullsrc=r=44100:cl=stereo',
        '-t',
        block.duration.toFixed(3),
        '-c:a',
        'libmp3lame',
        '-b:a',
        '128k',
        '-ar',
        '44100',
        '-ac',
        '2',
        '-id3v2_version',
        '0',
        '-write_xing',
        '0',
        '-f',
        'mp3',
        'pipe:1',
      ]);
    }

    const args = ['-nostdin', '-hide_banner', '-loglevel', 'error'];
    const count = audible.length;

    for (const source of audible) {
      if (source.startOffset > 0.0001) {
        args.push('-ss', source.startOffset.toFixed(3));
      }

      args.push('-t', block.duration.toFixed(3), '-i', source.path);
    }

    const filters: string[] = [];
    const labels: string[] = [];

    audible.forEach((source, index) => {
      const scaled = source.volume * count;
      filters.push(
        `[${index}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${scaled.toFixed(4)},atrim=duration=${block.duration.toFixed(3)},apad,atrim=duration=${block.duration.toFixed(3)},asetpts=PTS-STARTPTS[a${index}]`,
      );
      labels.push(`[a${index}]`);
    });

    if (count === 1) {
      filters.push('[a0]anull[out]');
    } else {
      filters.push(
        `${labels.join('')}amix=inputs=${count}:duration=longest:dropout_transition=0,alimiter=limit=0.95:level=0[out]`,
      );
    }

    args.push(
      '-filter_complex',
      filters.join(';'),
      '-map',
      '[out]',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '128k',
      '-ar',
      '44100',
      '-ac',
      '2',
      '-id3v2_version',
      '0',
      '-write_xing',
      '0',
      '-f',
      'mp3',
      'pipe:1',
    );

    return runFfmpeg(args);
  }

  private async writePaced(
    response: Response,
    buffer: Buffer,
    closed: () => boolean,
  ): Promise<boolean> {
    for (let offset = 0; offset < buffer.length; offset += WRITE_CHUNK_BYTES) {
      if (closed() || response.destroyed) {
        return false;
      }

      const chunk = buffer.subarray(offset, offset + WRITE_CHUNK_BYTES);

      if (!response.write(chunk)) {
        await new Promise<void>((resolve) => {
          const done = (): void => {
            response.off('drain', done);
            response.off('close', done);
            resolve();
          };

          response.once('drain', done);
          response.once('close', done);
        });
      }

      if (closed() || response.destroyed) {
        return false;
      }

      await delay(WRITE_INTERVAL_MS);
    }

    return true;
  }
}

export const radioStream = new RadioStreamService();
