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

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
