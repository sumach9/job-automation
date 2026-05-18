// ─── System Bootstrap ─────────────────────────────────────────────────────────
// Initialises all new architecture components alongside the existing server.
// Called once after Express starts listening.

import { connectDb } from "./storage/db.js";
import { startProcessor, registerHandler } from "./queues/processor.js";
import { applyHandler } from "./workers/applyWorker.js";
import { scrapeHandler } from "./workers/scrapeWorker.js";
import { log } from "./logging/logger.js";

export async function bootstrap() {
  try {
    // 1. Connect to SQLite via Prisma
    await connectDb();
    log.info("Database connected (SQLite/Prisma)");

    // 2. Register queue handlers
    registerHandler("apply",  applyHandler);
    registerHandler("scrape", scrapeHandler);

    // 3. Start queue processor
    startProcessor();
    log.info("Queue processor started");

    log.info("JobPilot bootstrap complete ✓");
  } catch (err) {
    log.error(`Bootstrap error: ${err.message}`);
    // Non-fatal: old server.js paths still work even if new layer fails
  }
}
