import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const ADMIN_ALERT_COOLDOWN_MS = 10 * 60 * 1000;

export class EmailService {
  private readonly transporter: Transporter;
  private lastAdminAlertAt = 0;
  private suppressedAlerts = 0;

  constructor(transporter?: Transporter) {
    this.transporter =
      transporter ??
      nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });
  }

  async sendVerificationCode(toEmail: string, code: string): Promise<void> {
    const expiresInMinutes = env.AUTH_CODE_TTL_MINUTES;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:40px 16px;background:#faf7f3;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1714;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">
    <tr>
      <td style="background:#0b0908;border-radius:24px 24px 0 0;padding:32px 36px;">
        <div style="font-size:12px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#f97316;">ETMW Radio AI</div>
        <div style="margin-top:10px;font-size:26px;line-height:1.2;font-weight:700;color:#ffffff;">Your sign-in code</div>
      </td>
    </tr>
    <tr>
      <td style="background:#ffffff;padding:36px;border:1px solid #e8ded3;border-top:0;border-radius:0 0 24px 24px;">
        <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#57534e;">
          Use the code below to finish signing in to ETMW Radio AI. It expires in ${expiresInMinutes} minutes.
        </p>
        <div style="margin:0 0 22px;padding:20px;border:1.5px dashed #ea580c;border-radius:16px;background:#fff7ed;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#c2410c;">
          ${code}
        </div>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#78716c;">
          If you did not request this code, you can safely ignore this email. Nobody can sign in without it.
        </p>
        <div style="margin-top:28px;padding-top:18px;border-top:1px solid #f4eee7;font-size:12px;color:#a8a29e;">
          ETMW Radio AI · Generated with AI, broadcast from ETMW
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;

    try {
      await this.transporter.sendMail({
        from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM}>`,
        to: toEmail,
        subject: `ETMW Radio AI sign-in code: ${code}`,
        text: `Your ETMW Radio AI sign-in code is: ${code}\n\nIt expires in ${expiresInMinutes} minutes. If you did not request it, ignore this email.`,
        html,
      });

      logger.info('email.verification_code_sent', { toEmail });
    } catch (error) {
      logger.error('email.verification_code_failed', {
        toEmail,
        message: error instanceof Error ? error.message : String(error),
      });
      throw new Error('FAILED_TO_SEND_EMAIL');
    }
  }

  async notifyAdminOfCodeRequest(details: {
    email: string;
    requestedAt: Date;
    ip?: string;
    userAgent?: string;
  }): Promise<void> {
    const adminEmail = env.ADMIN_EMAIL?.trim();

    if (!adminEmail) {
      return;
    }

    const now = details.requestedAt.getTime();

    if (now - this.lastAdminAlertAt < ADMIN_ALERT_COOLDOWN_MS) {
      this.suppressedAlerts += 1;
      return;
    }

    const suppressed = this.suppressedAlerts;
    this.suppressedAlerts = 0;
    this.lastAdminAlertAt = now;

    const email = this.escapeHtml(details.email);
    const requestedAt = details.requestedAt.toISOString();
    const ip = this.escapeHtml(details.ip ?? 'unknown');
    const userAgent = this.escapeHtml(details.userAgent ?? 'unknown');

    try {
      await this.transporter.sendMail({
        from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM}>`,
        to: adminEmail,
        subject: `ETMW Radio AI login code requested: ${details.email}`,
        text: [
          'A login code was requested for ETMW Radio AI.',
          `Email: ${details.email}`,
          `Time (UTC): ${requestedAt}`,
          `IP: ${details.ip ?? 'unknown'}`,
          `User agent: ${details.userAgent ?? 'unknown'}`,
          suppressed > 0 ? `Suppressed additional requests: ${suppressed}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:32px;background:#faf7f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1714;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e8ded3;border-radius:20px;padding:32px;">
    <div style="font-size:12px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#ea580c;">ETMW Radio AI</div>
    <h1 style="margin:12px 0 20px;font-size:20px;color:#1a1714;">Login code requested</h1>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
      <tr><td style="padding:8px 0;color:#78716c;">Email</td><td style="padding:8px 0;text-align:right;font-weight:600;">${email}</td></tr>
      <tr><td style="padding:8px 0;color:#78716c;">Time (UTC)</td><td style="padding:8px 0;text-align:right;font-weight:600;">${requestedAt}</td></tr>
      <tr><td style="padding:8px 0;color:#78716c;">IP address</td><td style="padding:8px 0;text-align:right;font-weight:600;">${ip}</td></tr>
      <tr><td style="padding:8px 0;color:#78716c;">User agent</td><td style="padding:8px 0;text-align:right;font-weight:600;word-break:break-all;">${userAgent}</td></tr>
      ${suppressed > 0 ? `<tr><td style="padding:8px 0;color:#78716c;">Suppressed</td><td style="padding:8px 0;text-align:right;font-weight:600;">${suppressed} additional request(s)</td></tr>` : ''}
    </table>
  </div>
</body>
</html>`,
      });

      logger.info('email.admin_notification_sent', { toEmail: adminEmail, requester: details.email });
    } catch (error) {
      logger.error('email.admin_notification_failed', {
        requester: details.email,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async sendAutoGenerationSummary(details: {
    toEmail: string;
    stationName: string;
    stationSlug: string;
    jobId: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    totalAudioHours: number;
    totalAudioSeconds: number;
    songs: Array<{ title: string; durationSeconds: number; status: string }>;
    scripts: Array<{ title: string; durationSeconds: number | null; status: string }>;
  }): Promise<void> {
    if (!details.toEmail) {
      return;
    }

    const station = this.escapeHtml(details.stationName);
    const jobId = this.escapeHtml(details.jobId);
    const startedAt = details.startedAt?.toISOString() ?? 'unknown';
    const finishedAt = details.finishedAt?.toISOString() ?? 'unknown';
    const songs = details.songs
      .map(
        (song) =>
          `<li style="margin:6px 0;">${this.escapeHtml(song.title)} — ${this.formatAudioDuration(song.durationSeconds)} <span style="color:#78716c;">(${this.escapeHtml(song.status)})</span></li>`,
      )
      .join('');
    const scripts = details.scripts
      .map(
        (script) =>
          `<li style="margin:6px 0;">${this.escapeHtml(script.title)} — ${this.formatAudioDuration(script.durationSeconds ?? 0)} <span style="color:#78716c;">(${this.escapeHtml(script.status)})</span></li>`,
      )
      .join('');

    try {
      await this.transporter.sendMail({
        from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM}>`,
        to: details.toEmail,
        subject: `ETMW Radio AI generation finished for ${details.stationName}`,
        text: [
          `ETMW Radio AI generation finished for ${details.stationName}.`,
          `Total material: ${details.totalAudioHours.toFixed(2)} hours (${this.formatAudioDuration(details.totalAudioSeconds)}).`,
          `Songs: ${details.songs.length}`,
          `Conversations: ${details.scripts.length}`,
          `Started: ${startedAt}`,
          `Finished: ${finishedAt}`,
          `Job: ${details.jobId}`,
        ].join('\n'),
        html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:36px 16px;background:#faf7f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1714;">
  <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e8ded3;border-radius:22px;overflow:hidden;">
    <div style="background:#0b0908;padding:26px 30px;">
      <div style="font-size:12px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#f97316;">ETMW Radio AI</div>
      <h1 style="margin:10px 0 0;font-size:23px;color:#ffffff;">Your generation is complete</h1>
    </div>
    <div style="padding:28px 30px;">
      <p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#57534e;">
        ETMW Radio AI finished its one-hour generation run for <strong>${station}</strong>.
        <strong>${details.totalAudioHours.toFixed(2)} hours</strong> of finished audio material are now in your station library.
      </p>
      <div style="display:flex;gap:10px;margin:0 0 20px;">
        <div style="flex:1;border:1px solid #e8ded3;border-radius:14px;padding:14px;background:#faf7f3;">
          <div style="font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#78716c;">Songs</div>
          <div style="font-size:26px;font-weight:800;color:#1a1714;">${details.songs.length}</div>
        </div>
        <div style="flex:1;border:1px solid #e8ded3;border-radius:14px;padding:14px;background:#faf7f3;">
          <div style="font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#78716c;">Conversations</div>
          <div style="font-size:26px;font-weight:800;color:#1a1714;">${details.scripts.length}</div>
        </div>
      </div>
      ${songs ? `<h2 style="margin:20px 0 8px;font-size:14px;color:#1a1714;">Songs</h2><ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6;color:#57534e;">${songs}</ul>` : ''}
      ${scripts ? `<h2 style="margin:20px 0 8px;font-size:14px;color:#1a1714;">Conversations</h2><ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6;color:#57534e;">${scripts}</ul>` : ''}
      <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#a8a29e;">
        Started ${startedAt} · Finished ${finishedAt} · Job ${jobId}
      </p>
      <a href="https://entertomyworld.com/apps/radio-ai/#/studio/${this.escapeHtml(details.stationSlug)}/creator/auto-generation" style="display:inline-block;margin-top:20px;padding:11px 18px;border-radius:999px;background:#ea580c;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;">Open ETMW AI Generation</a>
    </div>
  </div>
</body>
</html>`,
      });

      logger.info('email.auto_generation_summary_sent', {
        toEmail: details.toEmail,
        jobId: details.jobId,
      });
    } catch (error) {
      logger.error('email.auto_generation_summary_failed', {
        toEmail: details.toEmail,
        jobId: details.jobId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async sendAutoGenerationFailure(details: {
    toEmail: string;
    stationName: string;
    stationSlug: string;
    jobId: string;
    error: string;
    startedAt: Date | null;
    finishedAt: Date | null;
  }): Promise<void> {
    if (!details.toEmail) {
      return;
    }

    const station = this.escapeHtml(details.stationName);
    const jobId = this.escapeHtml(details.jobId);
    const error = this.escapeHtml(details.error);
    const startedAt = details.startedAt?.toISOString() ?? 'unknown';
    const finishedAt = details.finishedAt?.toISOString() ?? 'unknown';

    try {
      await this.transporter.sendMail({
        from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM}>`,
        to: details.toEmail,
        subject: `ETMW Radio AI generation FAILED — ${details.stationName}`,
        text: [
          `ETMW Radio AI auto generation FAILED for ${details.stationName}.`,
          `Error: ${details.error}`,
          `Started: ${startedAt}`,
          `Failed: ${finishedAt}`,
          `Job: ${details.jobId}`,
        ].join('\n'),
        html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:36px 16px;background:#faf7f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1714;">
  <div style="max-width:620px;margin:0 auto;background:#ffffff;border:2px solid #dc2626;border-radius:22px;overflow:hidden;">
    <div style="background:#7f1d1d;padding:26px 30px;">
      <div style="font-size:12px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#fecaca;">ETMW Radio AI · Admin alert</div>
      <h1 style="margin:10px 0 0;font-size:23px;color:#ffffff;">Auto generation failed</h1>
    </div>
    <div style="padding:28px 30px;">
      <p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#7f1d1d;">
        The automatic generation run for <strong>${station}</strong> stopped because of an error.
      </p>
      <div style="margin:0 0 20px;padding:16px;border:1px solid #fca5a5;border-radius:14px;background:#fef2f2;color:#991b1b;font-size:13px;line-height:1.65;word-break:break-word;">
        <strong style="display:block;margin-bottom:6px;color:#b91c1c;">Exact failure</strong>
        ${error}
      </div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#57534e;">
        <tr><td style="padding:6px 0;color:#78716c;">Station</td><td style="padding:6px 0;text-align:right;font-weight:600;">${station}</td></tr>
        <tr><td style="padding:6px 0;color:#78716c;">Job</td><td style="padding:6px 0;text-align:right;font-weight:600;">${jobId}</td></tr>
        <tr><td style="padding:6px 0;color:#78716c;">Started</td><td style="padding:6px 0;text-align:right;font-weight:600;">${startedAt}</td></tr>
        <tr><td style="padding:6px 0;color:#78716c;">Failed</td><td style="padding:6px 0;text-align:right;font-weight:600;">${finishedAt}</td></tr>
      </table>
      <a href="https://entertomyworld.com/apps/radio-ai/#/studio/${this.escapeHtml(details.stationSlug)}/creator/auto-generation" style="display:inline-block;margin-top:20px;padding:11px 18px;border-radius:999px;background:#b91c1c;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;">Review generation</a>
    </div>
  </div>
</body>
</html>`,
      });

      logger.info('email.auto_generation_failure_sent', {
        toEmail: details.toEmail,
        jobId: details.jobId,
      });
    } catch (error) {
      logger.error('email.auto_generation_failure_failed', {
        toEmail: details.toEmail,
        jobId: details.jobId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private formatAudioDuration(seconds: number): string {
    const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const rest = String(safe % 60).padStart(2, '0');

    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}`
      : `${minutes}:${rest}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
