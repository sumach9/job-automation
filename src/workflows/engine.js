// ─── Workflow Engine ──────────────────────────────────────────────────────────
// Orchestrates a single application end-to-end. Persists state at every step.
// Calls adapter layer, never contains ATS-specific logic.

import { States, canTransition, isTerminal } from "./states.js";
import { updateApplication, saveCheckpoint, getLastCheckpoint } from "../storage/db.js";
import { log } from "../logging/logger.js";
import { RetryManager } from "../retry/manager.js";

export class WorkflowEngine {
  /**
   * @param {object} opts
   * @param {string}  opts.applicationId
   * @param {object}  opts.job        — full job record from DB
   * @param {object}  opts.profile    — applicant profile from settings
   * @param {object}  opts.adapter    — ATSAdapter instance
   * @param {object}  [opts.browser]  — Playwright page (injected by worker)
   */
  constructor(opts) {
    this.applicationId = opts.applicationId;
    this.job           = opts.job;
    this.profile       = opts.profile;
    this.adapter       = opts.adapter;
    this.page          = opts.browser || null;
    this.retryMgr      = new RetryManager({ maxAttempts: 3 });
    this.state         = States.QUEUED;
    this.ctx = {
      applicationId: this.applicationId,
      jobId:         this.job.id,
      platform:      this.job.platform,
    };
  }

  // ── Transition helper ───────────────────────────────────────────────────────
  async _transition(next, stepName, extra = {}) {
    if (!canTransition(this.state, next)) {
      log.warn(`Skipping illegal transition ${this.state}→${next}`, this.ctx);
      return;
    }
    this.state = next;
    await updateApplication(this.applicationId, { status: next });
    await saveCheckpoint(this.applicationId, stepName, { state: next, ...extra });
    log.info(`[${stepName}] → ${next}`, { ...this.ctx, step: stepName, status: next });
  }

  // ── Resume from last checkpoint ─────────────────────────────────────────────
  async resume() {
    const cp = await getLastCheckpoint(this.applicationId);
    if (cp && cp.state) {
      this.state = cp.state;
      log.info(`Resuming from checkpoint: ${this.state}`, this.ctx);
    }
    return this;
  }

  // ── Main run loop ───────────────────────────────────────────────────────────
  async run() {
    await this.resume();

    if (isTerminal(this.state)) {
      log.info(`Workflow already terminal: ${this.state}`, this.ctx);
      return { state: this.state };
    }

    try {
      // 1. ANALYZING — validate job is still reachable
      if (this.state === States.QUEUED) {
        await this._transition(States.ANALYZING, "analyze");
      }

      if (this.state === States.ANALYZING) {
        const detectable = await this._withRetry("detect", () => this.adapter.detect(this.page, this.job.applyUrl || this.job.url));
        if (!detectable) {
          await this._transition(States.MANUAL_REVIEW, "detect_failed", { reason: "adapter_mismatch" });
          return { state: this.state };
        }
        await this._transition(States.SCRAPING, "detected");
      }

      // 2. SCRAPING — get full job description if missing
      if (this.state === States.SCRAPING) {
        const scraped = await this._withRetry("scrape", () => this.adapter.scrape(this.page, this.job));
        await this._transition(States.FILLING_FORM, "scraped", { scraped });
      }

      // 3. FILLING_FORM
      if (this.state === States.FILLING_FORM) {
        await this._withRetry("fill_form", () => this.adapter.apply(this.page, this.job, this.profile));
        await this._transition(States.VALIDATING, "form_filled");
      }

      // 4. VALIDATING
      if (this.state === States.VALIDATING) {
        const valid = await this._withRetry("validate", () => this.adapter.validate(this.page));
        if (!valid) {
          await this._transition(States.MANUAL_REVIEW, "validation_failed", { reason: "could_not_confirm_submit" });
          return { state: this.state };
        }
        await this._transition(States.SUBMITTED, "validated");
      }

      // 5. COMPLETED
      if (this.state === States.SUBMITTED) {
        await this._transition(States.COMPLETED, "completed");
      }

    } catch (err) {
      log.error(`Workflow error at ${this.state}: ${err.message}`, { ...this.ctx, error: err.message });
      const canRetry = this.retryMgr.canRetry();
      await this._transition(canRetry ? States.RETRYING : States.FAILED, "error", { error: err.message });
    }

    return { state: this.state };
  }

  // ── Retry wrapper ───────────────────────────────────────────────────────────
  async _withRetry(label, fn) {
    return this.retryMgr.run(label, fn, this.ctx);
  }
}
