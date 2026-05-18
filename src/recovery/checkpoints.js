// ─── Checkpoint Recovery ──────────────────────────────────────────────────────
// Saves workflow progress after every critical step.
// On restart, resumes from the last saved checkpoint.

import { saveCheckpoint, getLastCheckpoint, updateApplication } from "../storage/db.js";
import { log } from "../logging/logger.js";
import fs from "fs";
import path from "path";

const SCREENSHOTS_DIR = path.resolve("screenshots");
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

/**
 * Save a checkpoint after a step completes.
 * Optionally captures a screenshot.
 */
export async function checkpoint(applicationId, step, state, page = null) {
  let screenshotPath = null;

  if (page) {
    try {
      screenshotPath = path.join(SCREENSHOTS_DIR, `${applicationId}_${step}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
    } catch {
      screenshotPath = null;
    }
  }

  await saveCheckpoint(applicationId, step, state, { screenshotPath });
  log.info(`Checkpoint saved: ${step}`, { applicationId, step, status: state.status || step });
}

/**
 * Attempt to restore a workflow from its last checkpoint.
 * Returns the saved state object, or null if none found.
 */
export async function restoreCheckpoint(applicationId) {
  const cp = await getLastCheckpoint(applicationId);
  if (!cp) return null;

  log.info(`Restoring checkpoint: ${cp.step}`, { applicationId, step: cp.step });
  return cp.state;
}

/**
 * Clear checkpoints for a completed application (optional cleanup).
 */
export async function clearCheckpoints(applicationId) {
  try {
    await import("../storage/db.js").then(({ getDb }) =>
      getDb().checkpoint.deleteMany({ where: { applicationId } })
    );
  } catch {}
}
