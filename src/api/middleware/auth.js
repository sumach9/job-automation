// ─── JWT Auth Middleware ──────────────────────────────────────────────────────

import jwt from "jsonwebtoken";

const PUBLIC = ["/api/auth/login", "/api/health"];

export function authMiddleware(req, res, next) {
  // Skip public routes
  if (PUBLIC.some(p => req.path.startsWith(p))) return next();

  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: "No token" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || "change-me");
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}
