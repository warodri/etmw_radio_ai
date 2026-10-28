import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { ApiError } from '../utils/errors.js';

function runFfmpeg(args: string[], input?: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const process = spawn('ffmpeg', args);
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        process.kill('SIGKILL');
        reject(
          new ApiError(
            500,
            'AUDIO_TRANSCODE_TIMEOUT',
            'The generated audio took too long to encode.',
          ),
        );
      }
    }, 240_000);

    process.stdout.on('data', (chunk: Buffer) => output.push(chunk));
    process.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    process.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new ApiError(
          500,
          'AUDIO_TRANSCODE_FAILED',
          `The generated audio could not be encoded: ${error.message}`,
        ),
      );
    });
    process.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code === 0 && output.length > 0) {
        resolve(Buffer.concat(output));
        return;
      }

      reject(
        new ApiError(
          500,
          'AUDIO_TRANSCODE_FAILED',
          `The generated audio could not be encoded (ffmpeg ${code}): ${Buffer.concat(errors)
            .toString('utf8')
            .slice(0, 300)}`,
        ),
      );
    });

    process.stdin.end(input);
  });
}

class AudioTranscodeService {
  async wavToMp3(wav: Buffer): Promise<Buffer> {
    return runFfmpeg(
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'wav',
        '-i',
        'pipe:0',
        '-codec:a',
        'libmp3lame',
        '-b:a',
        '128k',
        '-f',
        'mp3',
        'pipe:1',
      ],
      wav,
    );
  }

  async concatWavsToMp3(
    wavs: Buffer[],
    gapSeconds = 0.35,
  ): Promise<Buffer> {
    if (wavs.length === 0) {
      throw new ApiError(
        500,
        'AUDIO_CONCAT_EMPTY',
        'There is no generated audio to assemble.',
      );
    }

    if (wavs.length === 1) {
      return this.wavToMp3(wavs[0]);
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'etmw-radio-script-'));
    const files: string[] = [];

    try {
      for (let index = 0; index < wavs.length; index += 1) {
        const file = path.join(tempDir, `turn-${String(index).padStart(3, '0')}.wav`);
        await fs.writeFile(file, wavs[index]);
        files.push(file);
      }

      const args = ['-hide_banner', '-loglevel', 'error'];
      for (const file of files) {
        args.push('-i', file);
      }

      const filters: string[] = [];
      for (let index = 0; index < wavs.length; index += 1) {
        filters.push(
          `[${index}:a]aresample=24000,aformat=sample_fmts=s16:channel_layouts=mono,asetpts=PTS-STARTPTS[a${index}]`,
        );
      }
      for (let index = 0; index < wavs.length - 1; index += 1) {
        filters.push(
          `anullsrc=r=24000:cl=mono,atrim=duration=${gapSeconds},asetpts=PTS-STARTPTS,aformat=sample_fmts=s16:channel_layouts=mono[g${index}]`,
        );
      }

      const concatInputs: string[] = [];
      for (let index = 0; index < wavs.length; index += 1) {
        concatInputs.push(`[a${index}]`);
        if (index < wavs.length - 1) {
          concatInputs.push(`[g${index}]`);
        }
      }
      filters.push(
        `${concatInputs.join('')}concat=n=${wavs.length * 2 - 1}:v=0:a=1[out]`,
      );

      args.push(
        '-filter_complex',
        filters.join(';'),
        '-map',
        '[out]',
        '-codec:a',
        'libmp3lame',
        '-b:a',
        '128k',
        '-f',
        'mp3',
        'pipe:1',
      );

      return await runFfmpeg(args);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

export const audioTranscode = new AudioTranscodeService();
