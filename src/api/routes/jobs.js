// ─── Jobs API Routes ──────────────────────────────────────────────────────────

import { Router } from "express";
import { getJobs, upsertJob, getDb } from "../../storage/db.js";
import { enqueue } from "../../storage/db.js";

const router = Router();

// GET /api/jobs
router.get("/", async (req, res) => {
  try {
    const { search = "", minScore = 0, limit = 200, offset = 0 } = req.query;
    const result = await getJobs({
      search,
      minScore: parseFloat(minScore) || 0,
      limit:    parseInt(limit)  || 200,
      offset:   parseInt(offset) || 0,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/:id
router.get("/:id", async (req, res) => {
  try {
    const job = await getDb().job.findUnique({ where: { id: req.params.id } });
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs/:id/scrape  — enqueue a scrape job
router.post("/:id/scrape", async (req, res) => {
  try {
    const qj = await enqueue("scrape", { jobId: req.params.id });
    res.json({ ok: true, queueJobId: qj.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
