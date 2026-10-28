import { spawn } from 'child_process';
import { ApiError } from '../utils/errors.js';

class AudioTranscodeService {
  async wavToMp3(wav: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const process = spawn('ffmpeg', [
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
      ]);
      const output: Buffer[] = [];
      const errors: Buffer[] = [];
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          process.kill('SIGKILL');
          settled = true;
          reject(
            new ApiError(
              500,
              'AUDIO_TRANSCODE_TIMEOUT',
              'The generated audio took too long to encode.',
            ),
          );
        }
      }, 180_000);

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

      process.stdin.end(wav);
    });
  }
}

export const audioTranscode = new AudioTranscodeService();
