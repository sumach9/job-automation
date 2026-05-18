// ─── Scrape Worker ────────────────────────────────────────────────────────────
// Handles "scrape" queue jobs: fetches full job descriptions and enriches DB records.

import { getDb, upsertJob } from "../storage/db.js";
import { resolveAdapter } from "../adapters/registry.js";
import { browserManager } from "../browser/manager.js";
import { log } from "../logging/logger.js";

/**
 * Payload shape: { jobId }
 */
export async function scrapeHandler(payload) {
  const { jobId } = payload;
  if (!jobId) throw new Error("scrapeHandler: missing jobId");

  const db  = getDb();
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`Job not found: ${jobId}`);

  if (job.description?.length > 200) {
    log.debug(`Job already has description, skipping scrape: ${jobId}`);
    return { skipped: true };
  }

  const adapter   = await resolveAdapter(job.applyUrl || job.url);
  const browserId = await browserManager.acquire();
  let page;

  try {
    page = await browserManager.getPage(browserId);
    const scraped = await adapter.scrape(page, job);

    if (scraped?.description) {
      await upsertJob({ ...job, description: scraped.description });
      log.info(`Scraped description for job ${jobId}`, { jobId, platform: job.platform });
    }

    return { jobId, scraped: !!scraped?.description };
  } finally {
    if (page) await browserManager.releasePage(page);
  }
}
