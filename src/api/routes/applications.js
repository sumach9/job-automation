// ─── Applications API Routes ──────────────────────────────────────────────────

import { Router } from "express";
import {
  getApplications,
  createApplication,
  updateApplication,
  getPipelineStages,
  getDb,
  enqueue,
} from "../../storage/db.js";

const router = Router();

// GET /api/applications
router.get("/", async (req, res) => {
  try {
    const { limit = 500, offset = 0 } = req.query;
    const result = await getApplications({ limit: parseInt(limit), offset: parseInt(offset) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/applications/pipeline
router.get("/pipeline", async (req, res) => {
  try {
    const stages = await getPipelineStages();
    res.json(stages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/applications  — create + enqueue
router.post("/", async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: "jobId required" });

    const app = await createApplication(jobId, "queued");
    await enqueue("apply", { applicationId: app.id }, { applicationId: app.id });
    res.json({ ok: true, application: app });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/applications/:id
router.patch("/:id", async (req, res) => {
  try {
    const updated = await updateApplication(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/applications/:id
router.delete("/:id", async (req, res) => {
  try {
    await getDb().application.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
