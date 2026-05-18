// ─── Browser Manager ──────────────────────────────────────────────────────────
// Pools Playwright browser instances with context isolation, recycling, and
// crash recovery. Never shares browser state between workflows.

import { chromium } from "playwright";
import { log } from "../logging/logger.js";
import { getDb } from "../storage/db.js";
import { nanoid } from "nanoid";

const DEFAULT_OPTS = {
  maxBrowsers:   3,     // pool size
  maxJobsPerBrowser: 10, // recycle after N jobs
  launchTimeout: 30_000,
  headless:      true,
};

export class BrowserManager {
  constructor(opts = {}) {
    this.opts  = { ...DEFAULT_OPTS, ...opts };
    this.pool  = new Map();   // browserId → { browser, jobCount, contexts }
    this._lock = false;
  }

  // ── Get or create a browser slot ──────────────────────────────────────────
  async acquire() {
    // Try to find an available slot under the job limit
    for (const [id, slot] of this.pool) {
      if (slot.jobCount < this.opts.maxJobsPerBrowser && slot.status === "active") {
        slot.jobCount++;
        await this._updateDb(id, { jobCount: slot.jobCount, lastUsedAt: new Date() });
        log.info(`Browser reused`, { browserId: id, jobCount: slot.jobCount });
        return id;
      }
    }

    // Create a new browser if pool not full
    if (this.pool.size < this.opts.maxBrowsers) {
      return this._launch();
    }

    // Recycle the most-used browser
    const oldest = [...this.pool.entries()].sort((a, b) => a[1].jobCount - b[1].jobCount).pop();
    if (oldest) {
      await this.recycle(oldest[0]);
      return this._launch();
    }

    throw new Error("Browser pool exhausted");
  }

  // ── Create an isolated page for one workflow ───────────────────────────────
  async getPage(browserId, { cookiesPath = null } = {}) {
    const slot = this.pool.get(browserId);
    if (!slot) throw new Error(`Unknown browser: ${browserId}`);

    const context = await slot.browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport:  { width: 1280, height: 800 },
      ...(cookiesPath ? { storageState: cookiesPath } : {}),
    });

    slot.contexts.push(context);
    const page = await context.newPage();
    page._contextRef = context;
    page._browserId  = browserId;
    return page;
  }

  // ── Close a page and its context ──────────────────────────────────────────
  async releasePage(page) {
    try {
      const ctx = page._contextRef;
      if (ctx) {
        const slot = this.pool.get(page._browserId);
        if (slot) {
          slot.contexts = slot.contexts.filter(c => c !== ctx);
        }
        await ctx.close();
      }
    } catch { /* ignore close errors */ }
  }

  // ── Save cookies for a platform ───────────────────────────────────────────
  async saveCookies(page, cookiesPath) {
    try {
      const ctx = page._contextRef || page.context();
      await ctx.storageState({ path: cookiesPath });
    } catch (err) {
      log.warn(`Could not save cookies: ${err.message}`);
    }
  }

  // ── Recycle a browser (close + remove from pool) ──────────────────────────
  async recycle(browserId) {
    const slot = this.pool.get(browserId);
    if (!slot) return;

    log.info(`Recycling browser`, { browserId, jobCount: slot.jobCount });
    slot.status = "recycling";
    await this._updateDb(browserId, { status: "recycling" });

    try {
      for (const ctx of slot.contexts) await ctx.close().catch(() => {});
      await slot.browser.close().catch(() => {});
    } catch {}

    this.pool.delete(browserId);
    await this._updateDb(browserId, { status: "closed" });
  }

  // ── Close all browsers ────────────────────────────────────────────────────
  async closeAll() {
    for (const [id] of this.pool) await this.recycle(id);
  }

  // ── Internal: launch a new browser ────────────────────────────────────────
  async _launch() {
    const browserId = nanoid(8);
    log.info(`Launching browser`, { browserId });

    const browser = await chromium.launch({
      headless: this.opts.headless,
      timeout:  this.opts.launchTimeout,
      args: [
        "--no-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
      ],
    });

    // Auto-recover on disconnect
    browser.on("disconnected", () => {
      log.warn(`Browser disconnected`, { browserId });
      this.pool.delete(browserId);
    });

    const slot = { browser, jobCount: 1, contexts: [], status: "active" };
    this.pool.set(browserId, slot);

    await this._createDb(browserId, "active");
    return browserId;
  }

  async _createDb(browserId, status) {
    try {
      await getDb().browserSession.upsert({
        where:  { browserId },
        create: { browserId, platform: "pool", status, maxJobs: this.opts.maxJobsPerBrowser },
        update: { status },
      });
    } catch {}
  }

  async _updateDb(browserId, data) {
    try {
      await getDb().browserSession.update({ where: { browserId }, data });
    } catch {}
  }
}

// Singleton instance for the whole process
export const browserManager = new BrowserManager();
