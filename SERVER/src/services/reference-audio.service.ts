import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

export interface NormalizedReferenceAudio {
  data: Buffer;
  durationSeconds: number;
}

function run(command: string, args: string[]): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGKILL');
        reject(new Error('The voice reference took too long to process.'));
      }
    }, 60_000);

    child.stdout.on('data', (chunk: Buffer) => output.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code === 0) {
        resolve({
          stdout: Buffer.concat(output),
          stderr: Buffer.concat(errors).toString('utf8'),
        });
        return;
      }

      reject(
        new Error(
          `The voice reference could not be processed: ${Buffer.concat(errors)
            .toString('utf8')
            .slice(0, 300)}`,
        ),
      );
    });
  });
}

class ReferenceAudioService {
  async normalize(input: Buffer): Promise<NormalizedReferenceAudio> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'etmw-voice-ref-'));
    const inputFile = path.join(dir, 'input.audio');
    const outputFile = path.join(dir, 'reference.wav');

    try {
      await fs.writeFile(inputFile, input);
      await run('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        inputFile,
        '-t',
        '15',
        '-ar',
        '24000',
        '-ac',
        '1',
        '-c:a',
        'pcm_s16le',
        outputFile,
      ]);

      const probe = await run('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        outputFile,
      ]);
      const durationSeconds = Number(probe.stdout.toString('utf8').trim());
      const data = await fs.readFile(outputFile);

      if (!Number.isFinite(durationSeconds) || durationSeconds < 3) {
        throw new Error('The reference must be at least 3 seconds long. Use a 5–15 second clip.');
      }

      if (data.length === 0) {
        throw new Error('The reference audio is empty.');
      }

      return { data, durationSeconds };
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

export const referenceAudio = new ReferenceAudioService();
