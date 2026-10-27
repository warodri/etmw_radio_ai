import { env } from '../../config/env.js';

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface BucketDecision {
  exceeded: boolean;
  retryMs: number;
}

const MAX_TRACKED_KEYS = 5000;
const PRUNE_EVERY = 200;

/**
 * Bounded, in-memory rolling-window limiter for login-code requests.
 * A request counts against the email bucket and the IP bucket. The reply never
 * says which one tripped, only that the caller should wait.
 */
export class AuthRateLimitService {
  private readonly buckets = new Map<string, number[]>();
  private operations = 0;

  constructor(private readonly now: () => number = () => Date.now()) {}

  check(email: string, ip?: string): RateLimitDecision {
    const windowMs = env.AUTH_CODE_RATE_WINDOW_MINUTES * 60 * 1000;
    const emailDecision = this.hit(
      `email:${email.trim().toLowerCase()}`,
      env.AUTH_CODE_RATE_EMAIL_MAX,
      windowMs,
    );
    const ipDecision =
      ip && ip.trim().length > 0
        ? this.hit(`ip:${ip.trim()}`, env.AUTH_CODE_RATE_IP_MAX, windowMs)
        : { exceeded: false, retryMs: 0 };

    if (emailDecision.exceeded || ipDecision.exceeded) {
      const retryMs = Math.max(emailDecision.retryMs, ipDecision.retryMs);
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)) };
    }

    return { allowed: true, retryAfterSeconds: 0 };
  }

  private hit(key: string, max: number, windowMs: number): BucketDecision {
    const now = this.now();
    const hits = (this.buckets.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
    const exceeded = hits.length + 1 > max;

    if (!exceeded) {
      hits.push(now);
    }

    this.buckets.set(key, hits);
    this.prune(now, windowMs);

    if (exceeded) {
      const oldest = hits[0] ?? now;
      return { exceeded: true, retryMs: Math.max(0, windowMs - (now - oldest)) };
    }

    return { exceeded: false, retryMs: 0 };
  }

  private prune(now: number, windowMs: number): void {
    this.operations += 1;

    if (this.operations % PRUNE_EVERY !== 0) {
      return;
    }

    for (const [key, hits] of this.buckets) {
      if (hits.every((stamp) => now - stamp >= windowMs)) {
        this.buckets.delete(key);
      }
    }

    if (this.buckets.size > MAX_TRACKED_KEYS) {
      const excess = this.buckets.size - MAX_TRACKED_KEYS;
      let removed = 0;

      for (const key of this.buckets.keys()) {
        this.buckets.delete(key);
        removed += 1;

        if (removed >= excess) {
          break;
        }
      }
    }
  }
}

export const authRateLimitService = new AuthRateLimitService();
