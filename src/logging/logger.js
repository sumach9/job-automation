// ─── Structured Logger (Winston) ─────────────────────────────────────────────
// Every event is structured JSON. Supports debugging, replay, and observability.

import winston from "winston";
import path from "path";
import { fileURLToPath } from "url";
import { dbLog } from "../storage/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, "../../logs");

const { combine, timestamp, json, colorize, printf } = winston.format;

const consoleFormat = printf(({ level, message, timestamp, ...meta }) => {
  const extras = Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
  return `[${timestamp}] ${level.toUpperCase()}: ${message}${extras}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(timestamp(), json()),
  transports: [
    new winston.transports.Console({
      format: combine(timestamp({ format: "HH:mm:ss" }), consoleFormat),
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      maxsize: 5_000_000,
      maxFiles: 3,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
      maxsize: 10_000_000,
      maxFiles: 5,
    }),
  ],
});

// Ensure logs directory exists
import fs from "fs";
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// ─── Workflow-aware log ───────────────────────────────────────────────────────
// Logs to console + file AND persists to DB for dashboard display.
export async function wfLog(level, message, context = {}) {
  const entry = {
    workflowId:  context.workflowId  || null,
    jobId:       context.jobId       || null,
    platform:    context.platform    || null,
    step:        context.step        || null,
    status:      context.status      || level,
    retryCount:  context.retryCount  ?? 0,
    browserId:   context.browserId   || null,
    error:       context.error       || null,
    fallbackUsed: context.fallbackUsed || false,
    message,
    applicationId: context.applicationId || null,
    meta: context.meta || null,
  };

  logger[level]?.(message, context);

  // Persist to DB (fire-and-forget, don't block caller)
  dbLog(entry).catch(() => {});

  return entry;
}

export const log = {
  info:    (msg, ctx = {}) => wfLog("info",    msg, ctx),
  success: (msg, ctx = {}) => wfLog("info",    msg, { ...ctx, status: "success" }),
  warn:    (msg, ctx = {}) => wfLog("warn",    msg, ctx),
  error:   (msg, ctx = {}) => wfLog("error",   msg, ctx),
  debug:   (msg, ctx = {}) => wfLog("debug",   msg, ctx),
};
