// ── SAM Assistant — agentic career workflow for job seekers ──────────────────
// POST /api/chat           streaming SSE (text + structured step events)
// POST /api/chat/score-url score a job URL against profile
import Groq from "groq-sdk";
import axios from "axios";
import { scoreJob, scoreLabel } from "../scorer.js";

// ── Detect if the message is a workflow trigger ───────────────────────────────
const WORKFLOW_INTENTS = [
  /find\s+(me\s+)?.{0,40}jobs?/i,
  /search\s+(for\s+)?.{0,40}jobs?/i,
  /show\s+(me\s+)?.{0,40}jobs?/i,
  /look\s+(for|up)\s+.{0,40}jobs?/i,
  /help\s+me\s+(find|get|land)/i,
  /run\s+(a\s+)?job\s+search/i,
  /what\s+.{0,30}jobs?\s+(are|do)/i,
  /job\s+market/i,
  /analyze\s+my\s+(fit|profile|resume)/i,
  /jobs?\s+(for|as|in)\s+/i,
];

function isWorkflowRequest(text) {
  return WORKFLOW_INTENTS.some(r => r.test(text));
}

// ── Run the 7-step workflow ───────────────────────────────────────────────────
async function runJobWorkflow(userMessage, settings, foundJobs, applications) {
  const p = settings.profile || {};
  const profileSkills = (p.skills || []).map(s => s.toLowerCase());
  const targetRoles   = (p.targetRoles || "Data Scientist").split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  const locations     = settings.locations || ["Seattle", "Washington"];

  // Extract query intent from message
  const roleMatch = userMessage.match(/(?:for|as|a|an)\s+([a-z\s]+?(?:scientist|engineer|analyst|developer|manager))/i);
  const queryRole = roleMatch ? roleMatch[1].trim() : targetRoles[0];

  // ── STEP 1: Market Analysis ────────────────────────────────────────────────
  const allMatchingJobs = foundJobs.filter(j => {
    const t = (j.title || "").toLowerCase();
    return targetRoles.some(r => t.includes(r.toLowerCase())) ||
           (queryRole && t.includes(queryRole.toLowerCase()));
  });

  const companyCount = {};
  const skillCount   = {};
  const salaries     = [];
  const platforms    = {};

  for (const j of allMatchingJobs) {
    if (j.company) companyCount[j.company] = (companyCount[j.company] || 0) + 1;
    if (j.platform) platforms[j.platform] = (platforms[j.platform] || 0) + 1;
    if (j.salary) { const n = parseInt(j.salary.replace(/[^0-9]/g, "")); if (n > 0) salaries.push(n); }
    for (const sk of profileSkills) {
      const jd = (j.description || j.title || "").toLowerCase();
      if (jd.includes(sk)) skillCount[sk] = (skillCount[sk] || 0) + 1;
    }
  }

  const topCompanies = Object.entries(companyCount).sort((a,b) => b[1]-a[1]).slice(0,5);
  const topSkills    = Object.entries(skillCount).sort((a,b) => b[1]-a[1]).slice(0,8).map(([k]) => k);
  const avgSalary    = salaries.length ? Math.round(salaries.reduce((a,b)=>a+b,0)/salaries.length) : null;
  const topPlatform  = Object.entries(platforms).sort((a,b) => b[1]-a[1])[0]?.[0] || "Google Jobs";

  // ── STEP 2: Ranked Shortlist ───────────────────────────────────────────────
  const scoredJobs = allMatchingJobs
    .map(j => {
      const { score, breakdown } = scoreJob(j, {
        skills: p.skills, summary: p.summary,
        targetRoles: p.targetRoles, yearsExperience: p.yearsExperience,
        preferredLocations: locations,
      });
      return { ...j, score, scoreBreakdown: breakdown };
    })
    .filter(j => j.score >= 2.0)
    .sort((a,b) => b.score - a.score)
    .slice(0, 8);

  // ── STEP 3: Recruiter search URLs ─────────────────────────────────────────
  const topJobsWithLinks = scoredJobs.slice(0, 5).map(j => ({
    ...j,
    recruiterSearchUrl: j.company
      ? "https://www.linkedin.com/search/results/people/?keywords=" +
        encodeURIComponent(j.company + " recruiter technical")
      : null,
  }));

  // ── STEP 6: Pool expansion (adjacent titles) ──────────────────────────────
  const ADJACENT_TITLES = {
    "data scientist":     ["Applied Scientist", "ML Engineer", "Research Scientist", "Analytics Engineer"],
    "data engineer":      ["Platform Engineer", "Analytics Engineer", "Data Architect", "MLOps Engineer"],
    "data analyst":       ["Business Intelligence Analyst", "Analytics Engineer", "Product Analyst", "Insights Analyst"],
    "ml engineer":        ["Data Scientist", "Research Scientist", "AI Engineer", "MLOps Engineer"],
    "ai engineer":        ["ML Engineer", "Data Scientist", "LLM Engineer", "Applied AI Engineer"],
    "software engineer":  ["Backend Engineer", "Full Stack Engineer", "Platform Engineer"],
  };
  const adjKey    = Object.keys(ADJACENT_TITLES).find(k => queryRole.toLowerCase().includes(k));
  const adjacents = adjKey ? ADJACENT_TITLES[adjKey] : ["ML Engineer", "Analytics Engineer", "Applied Scientist"];

  // ── STEP 7: Past applications to follow up ────────────────────────────────
  const cutoff   = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const followUp = applications
    .filter(a => {
      const t = (a.title || "").toLowerCase();
      const isOld = new Date(a.appliedAt || 0) < cutoff;
      const noResponse = !["interviewing","offered","rejected"].includes(a.status);
      const matchesRole = targetRoles.some(r => t.includes(r.toLowerCase()));
      return isOld && noResponse && matchesRole && (a.status === "auto-applied" || a.status === "browser-opened");
    })
    .slice(0, 3);

  return {
    queryRole,
    totalFound: allMatchingJobs.length,
    topCompanies,
    topSkills,
    avgSalary,
    topPlatform,
    scoredJobs: topJobsWithLinks,
    adjacents,
    followUp,
    profileName: p.name || "you",
  };
}

// ── Build the system prompt for workflow mode ─────────────────────────────────
function buildWorkflowPrompt(workflow, settings) {
  const p = settings.profile || {};
  const { queryRole, totalFound, topCompanies, topSkills, avgSalary, scoredJobs, adjacents, followUp } = workflow;

  const jobLines = scoredJobs.map((j, i) =>
    `${i+1}. **${j.title}** @ **${j.company}** (${j.location || "?"})\n` +
    `   Score: [SCORE:${j.score}] | Matched: ${(j.scoreBreakdown?.matchedSkills||[]).slice(0,4).map(s=>"[SKILL:"+s+"]").join(" ")}\n` +
    `   Missing: ${(j.scoreBreakdown?.missingSkills||[]).slice(0,3).map(s=>"[MISSING:"+s+"]").join(" ")}\n` +
    `   Apply: ${j.url || "N/A"} | Recruiter: ${j.recruiterSearchUrl ? "[RECRUITER:Find on LinkedIn]" : "N/A"}`
  ).join("\n\n");

  const followUpLines = followUp.length
    ? followUp.map(a => `- **${a.title}** @ ${a.company} — applied ${new Date(a.appliedAt).toLocaleDateString()}, status: ${a.status}`).join("\n")
    : "No past applications to follow up on.";

  return `You are JobPilot Assistant. A job seeker (${p.name || "user"}, ${p.yearsExperience||"?"} yrs exp, skills: ${(p.skills||[]).slice(0,8).join(", ")}) asked about jobs.

You have ALREADY run the full 7-step job search workflow. Present results clearly using the data below.

== WORKFLOW RESULTS ==

STEP 1 — MARKET ANALYSIS for "${queryRole}":
- Total matching jobs found: ${totalFound}
- Top hiring companies: ${topCompanies.map(([c,n])=>`${c} (${n})`).join(", ") || "N/A"}
- Top skills demanded: ${topSkills.join(", ") || "N/A"}
- Avg salary signal: ${avgSalary ? "$"+avgSalary.toLocaleString() : "Not available"}

STEP 2 — RANKED SHORTLIST (top ${scoredJobs.length} jobs scored against your profile):
${jobLines || "No strong matches found yet. Run the scanner first."}

STEP 5 — OUTREACH: For the top 2-3 companies, draft a short personalized LinkedIn message (2-3 sentences max) referencing their company and the candidate's top matching skills. Mark each as [OUTREACH_DRAFT].

STEP 6 — POOL EXPANSION:
Adjacent titles to 4x your job pool: ${adjacents.join(", ")}

STEP 7 — PAST APPLICATIONS TO FOLLOW UP:
${followUpLines}

== INSTRUCTIONS ==
Present this as a structured report with clear sections. Use the score/skill tags exactly as given. Be concise — job seekers are busy. End with 1-2 quick next actions.`;
}

// ── Register routes ───────────────────────────────────────────────────────────
export function registerChatRoutes(app, getState) {

  // ── POST /api/chat — streaming SSE ────────────────────────────────────────
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
      const lastMsg = (messages[messages.length - 1]?.content || "");

      let systemPrompt;
      let isWorkflow = false;

      if (isWorkflowRequest(lastMsg)) {
        // ── Full 7-step agentic workflow ──────────────────────────────────────
        isWorkflow = true;
        send({ type: "step", step: 1, label: "Scanning job market..." });
        const workflow = await runJobWorkflow(lastMsg, settings, foundJobs, applications);
        send({ type: "step", step: 2, label: "Scoring " + workflow.scoredJobs.length + " top matches..." });
        send({ type: "step", step: 3, label: "Finding recruiter contacts..." });
        send({ type: "workflow-data", data: {
          totalFound: workflow.totalFound,
          topCompanies: workflow.topCompanies,
          topSkills: workflow.topSkills,
          scoredJobs: workflow.scoredJobs.map(j => ({
            id: j.id, title: j.title, company: j.company,
            location: j.location, score: j.score, url: j.url,
            scoreBreakdown: j.scoreBreakdown, recruiterSearchUrl: j.recruiterSearchUrl,
          })),
          adjacents: workflow.adjacents,
          followUp: workflow.followUp,
        }});
        send({ type: "step", step: 4, label: "Drafting outreach messages..." });
        systemPrompt = buildWorkflowPrompt(workflow, settings);
      } else {
        // ── Standard Q&A mode ─────────────────────────────────────────────────
        const expLines = (p.experiences || []).slice(0, 5).map(e =>
          `  • ${e.title || "Role"} @ ${e.company || "Company"} (${e.startDate || ""}–${e.endDate || "present"})\n    ${(e.description || "").slice(0, 200)}`
        ).join("\n");

        const eduLines = (p.education || []).slice(0, 3).map(e =>
          `  • ${e.degree || "Degree"} in ${e.major || "field"} — ${e.school || "School"} (${e.endYear || ""})`
        ).join("\n");

        const isResumeRequest = /generate.*(resume|cv)|write.*resume|build.*resume|create.*resume|resume.*generate|my.*resume/i.test(lastMsg);

        systemPrompt = [
          "You are SAM — JobPilot's AI career assistant for " + (p.name || "a job seeker") + ".",
          "",
          "== CANDIDATE PROFILE ==",
          "Name: " + (p.name || ""),
          "Email: " + (p.email || "") + (p.phone ? " | Phone: " + p.phone : "") + (p.location ? " | Location: " + p.location : ""),
          "Target Roles: " + (p.targetRoles || ""),
          "Experience: " + (p.yearsExperience || "?") + " years",
          "Skills: " + (p.skills || []).join(", "),
          "Summary: " + (p.summary || ""),
          expLines ? "\n== WORK HISTORY ==\n" + expLines : "",
          eduLines ? "\n== EDUCATION ==\n" + eduLines : "",
          (p.linkedinUrl ? "\nLinkedIn: " + p.linkedinUrl : ""),
          "",
          "== LIVE STATS ==",
          foundJobs.length + " jobs found | " +
            applications.filter(a=>a.status==="auto-applied").length + " auto-applied | " +
            applications.filter(a=>a.status==="interviewing").length + " interviewing",
          jobContext ? "\n== CURRENT JOB CONTEXT ==\n" + JSON.stringify(jobContext) : "",
          "",
          isResumeRequest
            ? `== RESUME GENERATION INSTRUCTIONS ==
Generate a complete, ATS-optimized resume for ${p.name || "the candidate"} in clean markdown format.
Structure:
1. Header: Name, email, phone, location, LinkedIn
2. Professional Summary (3-4 sentences, keyword-rich)
3. Skills (grouped: Languages, Frameworks, Tools, Cloud)
4. Work Experience (each role: title, company, dates, 4-5 STAR bullet points with metrics)
5. Education
6. Certifications (if any in the profile)
Make it specific, metric-driven, and tailored to ${jobContext?.title ? "the " + jobContext.title + " role" : "their target role"}.
Use strong action verbs. Format in valid markdown. Start with the candidate's name as H1.`
            : "Help with: job scoring, skill gaps, resume tailoring, recruiter outreach, interview prep.",
          "Use [SCORE:X.X] for scores, [SKILL:name] for matched, [MISSING:name] for missing skills.",
          "Be concise and actionable. Use markdown.",
        ].filter(Boolean).join("\n");

        // Auto-score pasted JDs
        if (lastMsg.length > 300 && /responsibilities|qualifications|requirements|we are looking/i.test(lastMsg)) {
          const fakeJob = { title: "Pasted Job", description: lastMsg, location: "", company: "" };
          const { score, breakdown } = scoreJob(fakeJob, {
            skills: p.skills, summary: p.summary,
            targetRoles: p.targetRoles, yearsExperience: p.yearsExperience,
            preferredLocations: settings.locations,
          });
          const note = "[AUTO-SCORE: " + score + "/5 | Jaccard:" + breakdown.jaccardPct +
            " | Matched:" + (breakdown.matchedSkills||[]).join(",") +
            " | Missing:" + (breakdown.missingSkills||[]).join(",") + "]";
          if (messages.length > 0) messages[messages.length-1].content += "\n\n" + note;
        }
      }

      const groqMessages = [
        { role: "system", content: systemPrompt },
        ...messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
      ];

      const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const stream = await client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: groqMessages,
        max_tokens: isWorkflow ? 1800 : 1200,
        temperature: isWorkflow ? 0.4 : 0.7,
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
        timeout: 10000, headers: { "User-Agent": "Mozilla/5.0" },
      }).catch(() => ({ data: "" }));
      const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 4000);
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      let hostname = "";
      try { hostname = new URL(url).hostname.replace("www.", "").split(".")[0]; } catch {}
      const job = {
        title: (titleMatch ? titleMatch[1] : "Job from URL").replace(/\s*[-|].*/, "").trim(),
        description: text, location: "", company: hostname, url,
      };
      const { score, breakdown } = scoreJob(job, {
        skills: p.skills, summary: p.summary,
        targetRoles: p.targetRoles, yearsExperience: p.yearsExperience,
        preferredLocations: settings.locations,
      });
      res.json({ ok: true, job: { ...job, score, scoreBreakdown: breakdown }, scoreLabel: scoreLabel(score) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
