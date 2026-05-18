// ─── Apply Worker ─────────────────────────────────────────────────────────────
// Handles "apply" queue jobs: fetches job + profile, selects adapter, runs workflow.

import { getDb, updateApplication, loadSettings } from "../storage/db.js";
import { WorkflowEngine } from "../workflows/engine.js";
import { resolveAdapter } from "../adapters/registry.js";
import { browserManager } from "../browser/manager.js";
import { log } from "../logging/logger.js";

/**
 * Payload shape: { applicationId }
 */
export async function applyHandler(payload) {
  const { applicationId } = payload;
  if (!applicationId) throw new Error("applyHandler: missing applicationId");

  const db = getDb();

  // Load application + job
  const app = await db.application.findUnique({
    where:   { id: applicationId },
    include: { job: true },
  });
  if (!app) throw new Error(`Application not found: ${applicationId}`);

  const job     = app.job;
  const settings = await loadSettings();
  const profile  = settings?.profile || {};

  const ctx = { applicationId, jobId: job.id, platform: job.platform };
  log.info(`Apply worker starting: ${job.title} @ ${job.company}`, ctx);

  // Pick adapter
  const applyUrl = job.applyUrl || job.url;
  const adapter  = await resolveAdapter(applyUrl);
  log.info(`Adapter selected: ${adapter.name}`, ctx);

  // Acquire browser + page
  const browserId = await browserManager.acquire();
  let page;
  try {
    page = await browserManager.getPage(browserId, {
      cookiesPath: profile.cookiesPath?.[job.platform] || null,
    });

    // Run workflow
    const engine = new WorkflowEngine({ applicationId, job, profile, adapter, browser: page });
    const result = await engine.run();

    log.info(`Apply worker done: ${result.state}`, { ...ctx, status: result.state });
    return result;

  } finally {
    if (page) await browserManager.releasePage(page);
  }
}
