// ─── SQLite Queue Processor ───────────────────────────────────────────────────
// Polls the SQLite queueJob table and dispatches jobs to workers.
// No Redis required — works entirely with the local DB.

import { dequeue, completeQueueJob, failQueueJob } from "../storage/db.js";
import { log } from "../logging/logger.js";

const POLL_INTERVAL_MS = 5_000;  // check every 5 seconds
const CONCURRENCY      = 3;      // max parallel jobs

let _running    = false;
let _workers    = new Map();   // jobId → Promise
let _pollTimer  = null;

const HANDLERS = {};

/**
 * Register a handler for a queue job type.
 * @param {string}   type    — e.g. "apply", "scrape", "digest"
 * @param {function} handler — async (payload) => result
 */
export function registerHandler(type, handler) {
  HANDLERS[type] = handler;
}

/** Start the queue polling loop */
export function startProcessor() {
  if (_running) return;
  _running = true;
  log.info("Queue processor started");
  _poll();
}

/** Stop the queue polling loop */
export function stopProcessor() {
  _running = false;
  if (_pollTimer) clearTimeout(_pollTimer);
  log.info("Queue processor stopped");
}

async function _poll() {
  if (!_running) return;

  const available = CONCURRENCY - _workers.size;
  if (available > 0) {
    try {
      // Fetch one batch per registered type
      const types = Object.keys(HANDLERS);
      for (const type of types) {
        const jobs = await dequeue(type, Math.max(1, Math.floor(available / types.length)));
        for (const job of jobs) {
          if (_workers.size >= CONCURRENCY) break;
          _dispatch(job);
        }
      }
    } catch (err) {
      log.error(`Queue poll error: ${err.message}`);
    }
  }

  _pollTimer = setTimeout(_poll, POLL_INTERVAL_MS);
}

function _dispatch(job) {
  const handler = HANDLERS[job.type];
  if (!handler) {
    log.warn(`No handler for queue job type: ${job.type}`, { step: "dispatch" });
    failQueueJob(job.id, "no_handler").catch(() => {});
    return;
  }

  const promise = (async () => {
    try {
      log.info(`Running queue job [${job.type}] ${job.id}`, { step: job.type });
      const result = await handler(job.payload);
      await completeQueueJob(job.id, result);
      log.info(`Queue job done [${job.type}] ${job.id}`, { step: job.type, status: "success" });
    } catch (err) {
      log.error(`Queue job failed [${job.type}] ${job.id}: ${err.message}`, { step: job.type, error: err.message });
      await failQueueJob(job.id, err.message).catch(() => {});
    } finally {
      _workers.delete(job.id);
    }
  })();

  _workers.set(job.id, promise);
}
