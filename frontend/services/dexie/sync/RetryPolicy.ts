export interface RetryPolicyConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitter: boolean;
}

export const DEFAULT_RETRY_POLICY: RetryPolicyConfig = {
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
  jitter: true,
};

export class RetryPolicy {
  private config: RetryPolicyConfig;

  constructor(config: Partial<RetryPolicyConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_POLICY, ...config };
  }

  get maxRetries(): number { return this.config.maxRetries; }

  getDelayMs(attempt: number): number {
    const delay = Math.min(
      this.config.maxDelayMs,
      this.config.baseDelayMs * Math.pow(this.config.multiplier, Math.max(0, attempt - 1))
    );

    if (this.config.jitter) {
      return Math.floor(delay * (0.5 + Math.random() * 0.5));
    }

    return delay;
  }

  getNextRetryAt(attempt: number): string {
    return new Date(Date.now() + this.getDelayMs(attempt)).toISOString();
  }

  shouldRetry(attempt: number): boolean {
    return attempt < this.config.maxRetries;
  }
}

export const defaultRetryPolicy = new RetryPolicy();
