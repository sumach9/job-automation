// ─── Storage Layer — Prisma + SQLite ─────────────────────────────────────────
// Single source of truth. Replaces data.json entirely.

import { PrismaClient } from "@prisma/client";

let _prisma = null;

export function getDb() {
  if (!_prisma) {
    _prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }
  return _prisma;
}

export async function connectDb() {
  const db = getDb();
  await db.$connect();
  return db;
}

export async function disconnectDb() {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}

// ─── Job helpers ──────────────────────────────────────────────────────────────
export async function upsertJob(job) {
  const db = getDb();
  return db.job.upsert({
    where: { url: job.url },
    create: {
      id:            job.id,
      title:         job.title,
      company:       job.company,
      location:      job.location || null,
      url:           job.url,
      applyUrl:      job.applyUrl || null,
      platform:      job.platform,
      easyApply:     job.easyApply || false,
      description:   job.description || null,
      salary:        job.salary || null,
      workMode:      job.workMode || null,
      jobType:       job.jobType || null,
      skills:        JSON.stringify(job.skills || []),
      score:         job.score ?? null,
      scoreBreakdown: job.scoreBreakdown ? JSON.stringify(job.scoreBreakdown) : null,
      scoreLabel:    job.scoreLabel || null,
      via:           job.via || null,
      atsProvider:   job.atsProvider || null,
      postedAt:      job.postedAt ? new Date(job.postedAt) : null,
    },
    update: {
      score:         job.score ?? undefined,
      scoreBreakdown: job.scoreBreakdown ? JSON.stringify(job.scoreBreakdown) : undefined,
      scoreLabel:    job.scoreLabel || undefined,
      description:   job.description || undefined,
    },
  });
}

export async function getJobs({ limit = 200, offset = 0, search = "", minScore = 0 } = {}) {
  const db = getDb();
  const where = {
    ...(search ? {
      OR: [
        { title:   { contains: search } },
        { company: { contains: search } },
        { location:{ contains: search } },
        { platform:{ contains: search } },
      ],
    } : {}),
    ...(minScore > 0 ? { score: { gte: minScore } } : {}),
  };
  const [total, items] = await Promise.all([
    db.job.count({ where }),
    db.job.findMany({ where, orderBy: { score: "desc" }, skip: offset, take: limit }),
  ]);
  return { total, items: items.map(deserializeJob) };
}

export function deserializeJob(j) {
  return {
    ...j,
    skills:        JSON.parse(j.skills || "[]"),
    scoreBreakdown: j.scoreBreakdown ? JSON.parse(j.scoreBreakdown) : null,
  };
}

// ─── Application helpers ──────────────────────────────────────────────────────
export async function createApplication(jobId, status = "queued") {
  const db = getDb();
  return db.application.create({ data: { jobId, status } });
}

export async function updateApplication(id, data) {
  return getDb().application.update({ where: { id }, data });
}

export async function getApplications({ limit = 500, offset = 0 } = {}) {
  const db = getDb();
  const [total, items] = await Promise.all([
    db.application.count(),
    db.application.findMany({
      include: { job: true },
      orderBy: { appliedAt: "desc" },
      skip: offset,
      take: limit,
    }),
  ]);
  return {
    total,
    items: items.map(a => ({
      id:       a.id,
      jobId:    a.jobId,
      title:    a.job.title,
      company:  a.job.company,
      location: a.job.location,
      platform: a.job.platform,
      url:      a.job.applyUrl || a.job.url,
      score:    a.job.score,
      status:   a.status,
      retryCount: a.retryCount,
      note:     a.note,
      postedAt: a.job.postedAt,
      appliedAt: a.appliedAt,
    })),
  };
}

export async function getPipelineStages() {
  const db = getDb();
  const apps = await db.application.findMany({ include: { job: true } });
  const stages = {};
  for (const a of apps) {
    if (!stages[a.status]) stages[a.status] = [];
    stages[a.status].push({
      id: a.id, jobId: a.jobId,
      title: a.job.title, company: a.job.company,
      score: a.job.score, status: a.status,
    });
  }
  return stages;
}

// ─── Queue helpers ────────────────────────────────────────────────────────────
export async function enqueue(type, payload, { applicationId = null, priority = 0, runAt = null, maxAttempts = 3 } = {}) {
  return getDb().queueJob.create({
    data: {
      type,
      payload: JSON.stringify(payload),
      applicationId,
      priority,
      maxAttempts,
      runAt: runAt ? new Date(runAt) : new Date(),
    },
  });
}

export async function dequeue(type, limit = 5) {
  const db = getDb();
  const now = new Date();
  // Claim jobs atomically by updating status to "processing"
  const jobs = await db.queueJob.findMany({
    where: { type, status: "pending", runAt: { lte: now }, attempts: { lt: db.queueJob.fields?.maxAttempts || 99 } },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: limit,
  });
  for (const job of jobs) {
    await db.queueJob.update({
      where: { id: job.id },
      data: { status: "processing", startedAt: new Date(), attempts: { increment: 1 } },
    });
  }
  return jobs.map(j => ({ ...j, payload: JSON.parse(j.payload) }));
}

export async function completeQueueJob(id, result = null) {
  return getDb().queueJob.update({
    where: { id },
    data: { status: "done", finishedAt: new Date(), result: result ? JSON.stringify(result) : null },
  });
}

export async function failQueueJob(id, error, retryAfterMs = 60000) {
  const job = await getDb().queueJob.findUnique({ where: { id } });
  if (!job) return;
  const isDead = job.attempts >= job.maxAttempts;
  return getDb().queueJob.update({
    where: { id },
    data: {
      status: isDead ? "dead" : "pending",
      error: String(error),
      finishedAt: isDead ? new Date() : null,
      runAt: isDead ? undefined : new Date(Date.now() + retryAfterMs),
    },
  });
}

// ─── Checkpoint helpers ───────────────────────────────────────────────────────
export async function saveCheckpoint(applicationId, step, state, { screenshotPath = null, cookiesPath = null } = {}) {
  return getDb().checkpoint.create({
    data: { applicationId, step, state: JSON.stringify(state), screenshotPath, cookiesPath },
  });
}

export async function getLastCheckpoint(applicationId) {
  const cp = await getDb().checkpoint.findFirst({
    where: { applicationId },
    orderBy: { createdAt: "desc" },
  });
  if (!cp) return null;
  return { ...cp, state: JSON.parse(cp.state) };
}

// ─── Log helpers ──────────────────────────────────────────────────────────────
export async function dbLog(entry) {
  return getDb().workflowLog.create({ data: { ...entry, meta: entry.meta ? JSON.stringify(entry.meta) : null } });
}

export async function getLogs(limit = 200) {
  const logs = await getDb().workflowLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  return logs.map(l => ({ ...l, meta: l.meta ? JSON.parse(l.meta) : null }));
}

// ─── Settings helpers ─────────────────────────────────────────────────────────
export async function loadSettings() {
  const db = getDb();
  const row = await db.settings.findUnique({ where: { id: "singleton" } });
  return row ? JSON.parse(row.data) : null;
}

export async function saveSettings(data) {
  return getDb().settings.upsert({
    where:  { id: "singleton" },
    create: { id: "singleton", data: JSON.stringify(data) },
    update: { data: JSON.stringify(data) },
  });
}

// ─── Semantic memory helpers ──────────────────────────────────────────────────
export async function rememberField(type, key, value) {
  return getDb().semanticMemory.upsert({
    where:  { type_key: { type, key } },
    create: { type, key, value: JSON.stringify(value) },
    update: { value: JSON.stringify(value), usedCount: { increment: 1 }, updatedAt: new Date() },
  });
}

export async function recallField(type, key) {
  const m = await getDb().semanticMemory.findUnique({ where: { type_key: { type, key } } });
  return m ? JSON.parse(m.value) : null;
}

export async function recallByType(type) {
  const rows = await getDb().semanticMemory.findMany({ where: { type } });
  return Object.fromEntries(rows.map(r => [r.key, JSON.parse(r.value)]));
}
