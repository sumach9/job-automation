// ─── Logs API Routes ──────────────────────────────────────────────────────────

import { Router } from "express";
import { getLogs } from "../../storage/db.js";

const router = Router();

// GET /api/logs?limit=100
router.get("/", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 200;
    const logs  = await getLogs(limit);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
