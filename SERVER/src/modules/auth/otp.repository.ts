import crypto from 'crypto';
import { Collection, ObjectId } from 'mongodb';
import { getDatabase } from '../../config/database.js';
import { env } from '../../config/env.js';

export interface OtpRecord {
  _id?: ObjectId;
  email: string;
  codeHash: string;
  attempts: number;
  createdAt: Date;
  expiresAt: Date;
}

export type OtpVerificationResult = 'ok' | 'invalid' | 'expired' | 'locked';

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

export class OtpRepository {
  private collection(): Collection<OtpRecord> {
    return getDatabase().collection<OtpRecord>('otp_codes');
  }

  async deleteCode(email: string): Promise<void> {
    await this.collection().deleteMany({ email });
  }

  async saveCode(email: string, code: string): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + env.AUTH_CODE_TTL_MINUTES * 60 * 1000);

    await this.deleteCode(email);

    await this.collection().insertOne({
      email,
      codeHash: hashCode(code),
      attempts: 0,
      createdAt: now,
      expiresAt,
    });
  }

  async verifyCode(email: string, code: string): Promise<OtpVerificationResult> {
    const record = await this.collection().findOne({ email });

    if (!record) {
      return 'invalid';
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      await this.collection().deleteOne({ _id: record._id });
      return 'expired';
    }

    if (record.attempts >= env.AUTH_CODE_MAX_ATTEMPTS) {
      await this.collection().deleteOne({ _id: record._id });
      return 'locked';
    }

    const suppliedHash = Buffer.from(hashCode(code), 'hex');
    const storedHash = Buffer.from(record.codeHash, 'hex');
    const matches =
      suppliedHash.length === storedHash.length &&
      crypto.timingSafeEqual(suppliedHash, storedHash);

    if (!matches) {
      await this.collection().updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
      return 'invalid';
    }

    await this.collection().deleteOne({ _id: record._id });
    return 'ok';
  }
}
