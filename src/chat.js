// ── AI Chat Assistant routes ──────────────────────────────────────────────────
// Registers POST /api/chat  (streaming SSE)
//          POST /api/chat/score-url
import Groq from "groq-sdk";
import axios from "axios";
import { scoreJob, scoreLabel } from "../scorer.js";

export function registerChatRoutes(app, getState) {
  // ── POST /api/chat  (streaming SSE) ─────────────────────────────────────────
  app.post("/api/chat", async (req, res) => {
    const { messages = [], jobContext = null } = req.body || {};
    res.setHeader("Content-Type",  "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection",    "keep-alive");
    res.flushHeaders();

    const send = (obj) => res.write("data: " + JSON.stringify(obj) + "\n\n");

    try {
      const { settings, foundJobs, applications } = getState();
      const p = settings.profile || {};

      const systemPrompt = [
        "You are JobPilot Assistant - an intelligent job search co-pilot for " + (p.name || "a job seeker") + ".",
        "",
        "PROFILE:",
        "- Target roles: " + (p.targetRoles || "Data Scientist, Data Engineer"),
        "- Skills: " + ((p.skills || []).slice(0, 20).join(", ") || "Not set"),
        "- Experience: " + (p.yearsExperience || "?") + " years | Location: " + (p.location || "Seattle, WA"),
        "- Summary: " + (p.summary || "").slice(0, 250),
        "",
        "LIVE STATS: " + foundJobs.length + " jobs found | " +
          applications.filter(a => a.status === "auto-applied").length + " auto-applied | " +
          applications.filter(a => a.status === "interviewing").length + " interviewing",
        "",
        jobContext ? ("CURRENT JOB CONTEXT:\n" + JSON.stringify(jobContext)) : "",
        "",
        "You help with: job scoring, skill gap analysis, resume tailoring, recruiter outreach, interview prep.",
        "When scoring jobs use [SCORE:X.X] for the score badge, [SKILL:name] for matched skills, [MISSING:name] for missing skills.",
        "Be concise, specific, and actionable. Use markdown for bold/lists.",
      ].join("\n");

      const groqMessages = [
        { role: "system", content: systemPrompt },
        ...messages.slice(-12).map(m => ({ role: m.role, content: m.content })),
      ];

      // Auto-score if message looks like a job description
      const lastMsg = messages[messages.length - 1]?.content || "";
      if (lastMsg.length > 300 && /responsibilities|qualifications|requirements|we are looking/i.test(lastMsg)) {
        const fakeJob = { title: "Job from description", description: lastMsg, location: "", company: "" };
        const { score, breakdown } = scoreJob(fakeJob, {
          skills: p.skills,
          summary: p.summary,
          targetRoles: p.targetRoles,
          yearsExperience: p.yearsExperience,
          preferredLocations: settings.locations,
        });
        const note = "[AUTO-SCORE: " + score + "/5 | Jaccard:" + breakdown.jaccardPct +
          " | Cosine:" + breakdown.cosinePct +
          " | Matched:" + (breakdown.matchedSkills || []).join(",") +
          " | Missing:" + (breakdown.missingSkills || []).join(",") + "]";
        groqMessages[groqMessages.length - 1].content += "\n\n" + note;
      }

      const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const stream = await client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: groqMessages,
        max_tokens: 1200,
        temperature: 0.7,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) send({ type: "delta", content: delta });
      }
      send({ type: "done" });
    } catch (err) {
      send({ type: "error", message: err.message });
    }
    res.end();
  });

  // ── POST /api/chat/score-url ────────────────────────────────────────────────
  app.post("/api/chat/score-url", async (req, res) => {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: "url required" });
    try {
      const { settings } = getState();
      const p = settings.profile || {};
      const { data: html } = await axios.get(url, {
        timeout: 10000,
        headers: { "User-Agent": "Mozilla/5.0" },
      }).catch(() => ({ data: "" }));
      const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 4000);
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      let hostname = "";
      try { hostname = new URL(url).hostname.replace("www.", "").split(".")[0]; } catch {}
      const job = {
        title: (titleMatch ? titleMatch[1] : "Job from URL").replace(/\s*[-|].*/, "").trim(),
        description: text,
        location: "",
        company: hostname,
        url,
      };
      const { score, breakdown } = scoreJob(job, {
        skills: p.skills,
        summary: p.summary,
        targetRoles: p.targetRoles,
        yearsExperience: p.yearsExperience,
        preferredLocations: settings.locations,
      });
      res.json({ ok: true, job: { ...job, score, scoreBreakdown: breakdown }, scoreLabel: scoreLabel(score) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
