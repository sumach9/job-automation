// ─── Retry Manager ────────────────────────────────────────────────────────────
// Centralized exponential-backoff retry with dead-letter support.

import { log } from "../logging/logger.js";

const DEFAULT_OPTS = {
  maxAttempts:   3,
  baseDelayMs:   1_000,   // 1s base
  maxDelayMs:    30_000,  // 30s cap
  jitterFactor:  0.2,     // ±20% jitter
};

export class RetryManager {
  constructor(opts = {}) {
    this.opts     = { ...DEFAULT_OPTS, ...opts };
    this.attempts = 0;
  }

  canRetry() {
    return this.attempts < this.opts.maxAttempts;
  }

  /**
   * Run `fn` with automatic retries.
   * @param {string}   label  — human-readable step name for logs
   * @param {function} fn     — async function to execute
   * @param {object}   ctx    — logging context (jobId, applicationId, etc.)
   * @returns result of fn on success
   * @throws last error after all attempts exhausted
   */
  async run(label, fn, ctx = {}) {
    let lastErr;
    for (let attempt = 1; attempt <= this.opts.maxAttempts; attempt++) {
      this.attempts = attempt;
      try {
        const result = await fn();
        if (attempt > 1) {
          log.info(`[${label}] succeeded after ${attempt} attempts`, { ...ctx, step: label, retryCount: attempt - 1 });
        }
        return result;
      } catch (err) {
        lastErr = err;
        const isLast = attempt === this.opts.maxAttempts;
        if (isLast) {
          log.error(`[${label}] failed after ${attempt} attempts: ${err.message}`, {
            ...ctx, step: label, retryCount: attempt, error: err.message,
          });
          break;
        }
        const delay = this._calcDelay(attempt);
        log.warn(`[${label}] attempt ${attempt} failed, retrying in ${delay}ms: ${err.message}`, {
          ...ctx, step: label, retryCount: attempt, error: err.message,
        });
        await sleep(delay);
      }
    }
    throw lastErr;
  }

  _calcDelay(attempt) {
    const base   = this.opts.baseDelayMs * Math.pow(2, attempt - 1);
    const capped = Math.min(base, this.opts.maxDelayMs);
    const jitter = capped * this.opts.jitterFactor * (Math.random() * 2 - 1);
    return Math.round(capped + jitter);
  }

  reset() {
    this.attempts = 0;
  }
}

// ── Standalone helper for one-shot retries ─────────────────────────────────
export async function withRetry(fn, opts = {}) {
  return new RetryManager(opts).run("task", fn);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
