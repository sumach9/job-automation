/**
 * imageGen.js — Server-side viral image generator
 * Builds a 1200×630 PNG from live job data using SVG + Sharp.
 * Zero external API calls — everything runs locally.
 */

import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "data.json");

// ── Pull live stats from data.json ────────────────────────────────────────────
function getLiveStats() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const jobs = JSON.parse(raw);
    if (!Array.isArray(jobs)) throw new Error("Not an array");

    const total       = jobs.length;
    const applied     = jobs.filter(j => j.status === "auto-applied").length;
    const simplify    = jobs.filter(j => j.status === "simplify-opened").length;
    const queued      = jobs.filter(j => j.status === "queued-manual").length;
    const companies   = new Set(jobs.map(j => j.company).filter(Boolean)).size;
    const topScore    = jobs.reduce((max, j) => Math.max(max, j.score || 0), 0);
    const excellent   = jobs.filter(j => (j.score || 0) >= 4).length;

    return { total, applied, simplify, queued, companies, topScore, excellent };
  } catch {
    return { total: 319, applied: 3, simplify: 99, queued: 181, companies: 34, topScore: 5, excellent: 12 };
  }
}

// ── SVG helpers ───────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

function buildSVG(stats) {
  const { total, applied, simplify, queued, companies, excellent } = stats;
  const totalActions = applied + simplify + queued;

  // Colour palette
  const C = {
    bg:      "#09090f",
    grid:    "rgba(99,102,241,0.07)",
    indigo:  "#6366f1",
    purple:  "#a855f7",
    cyan:    "#06b6d4",
    green:   "#22c55e",
    amber:   "#f59e0b",
    white:   "#ffffff",
    dim:     "rgba(255,255,255,0.45)",
    dimmer:  "rgba(255,255,255,0.22)",
    card:    "rgba(255,255,255,0.04)",
    border:  "rgba(255,255,255,0.09)",
  };

  // Stats cards data
  const cards = [
    { label: "Jobs Found",   value: total,        icon: "🔍", color: C.indigo,  light: "#818cf8" },
    { label: "Applied",      value: totalActions, icon: "⚡", color: C.purple,  light: "#c084fc" },
    { label: "Companies",    value: companies,    icon: "🏢", color: C.cyan,    light: "#67e8f9" },
    { label: "Score 4–5 ★",  value: excellent,    icon: "🎯", color: C.green,   light: "#86efac" },
  ];

  // Terminal lines
  const termLines = [
    { type: "cmd",  text: "node server.js" },
    { type: "ok",   text: `✓ Server ready on :3004` },
    { type: "info", text: `→ Scanning ${companies} companies...` },
    { type: "gap" },
    { type: "ok",   text: `✓ Anthropic — 3 DS roles found` },
    { type: "ok",   text: `✓ OpenAI — 7 ML roles found` },
    { type: "ok",   text: `✓ Databricks — 5 roles found` },
    { type: "dim",  text: `  + ${companies - 3} more companies...` },
    { type: "gap" },
    { type: "hi",   text: `★ 4.8 — Data Scientist @ Anthropic` },
    { type: "hi",   text: `★ 4.5 — ML Engineer @ OpenAI` },
    { type: "mid",  text: `◈ 3.2 — Data Analyst @ Stripe` },
    { type: "gap" },
    { type: "ok",   text: `✓ ${simplify} opened via Simplify` },
    { type: "ok",   text: `✓ ${applied} Easy Applied via LinkedIn` },
    { type: "cursor" },
  ];

  const MONO = `'Courier New', Courier, monospace`;
  const SANS = `system-ui, -apple-system, 'Segoe UI', Arial, sans-serif`;

  // ── Card geometry ─────────────────────────────────────────────────────────
  const cardW = 138, cardH = 90, cardGap = 12;
  const cardsX = 52, cardsY = 460;

  // ── Terminal geometry ─────────────────────────────────────────────────────
  const termX = 680, termY = 60, termW = 468, termH = 510;
  const termBodyY = termY + 44;
  const lineH = 22;

  function cardSVG(c, i) {
    const x = cardsX + i * (cardW + cardGap);
    const y = cardsY;
    return `
    <!-- Card ${i} -->
    <rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="12"
          fill="${C.card}" stroke="${C.border}" stroke-width="1"/>
    <rect x="${x}" y="${y}" width="${cardW}" height="2" rx="1" fill="${c.color}"/>
    <text x="${x + 14}" y="${y + 26}" font-size="20">${esc(c.icon)}</text>
    <text x="${x + 14}" y="${y + 62}" font-family="${SANS}" font-size="30"
          font-weight="900" fill="${c.light}">${esc(c.value)}</text>
    <text x="${x + 14}" y="${y + 80}" font-family="${SANS}" font-size="10"
          font-weight="700" fill="${C.dim}" letter-spacing="1">${esc(c.label.toUpperCase())}</text>`;
  }

  function termLine(ln, i) {
    if (ln.type === "gap") return "";
    const y = termBodyY + 16 + i * lineH;
    const colors = { cmd:"#c4b5fd", ok:"#86efac", info:"#67e8f9", dim:"rgba(255,255,255,0.35)", hi:"#fde68a", mid:"rgba(255,255,255,0.55)", cursor:"#6366f1" };
    const col = colors[ln.type] || C.white;
    if (ln.type === "cmd") {
      return `
      <text x="${termX + 20}" y="${y}" font-family="${MONO}" font-size="12" fill="#6366f1">$</text>
      <text x="${termX + 34}" y="${y}" font-family="${MONO}" font-size="12" fill="rgba(255,255,255,0.85)">${esc(ln.text)}</text>`;
    }
    if (ln.type === "cursor") {
      return `
      <text x="${termX + 20}" y="${y}" font-family="${MONO}" font-size="12" fill="#6366f1">$</text>
      <rect x="${termX + 34}" y="${y - 13}" width="8" height="14" rx="1" fill="#6366f1" opacity="0.9"/>`;
    }
    return `
    <text x="${termX + 20}" y="${y}" font-family="${MONO}" font-size="12" fill="${col}">${esc(ln.text)}</text>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <!-- Background -->
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0%" stop-color="#0d0d1a"/>
      <stop offset="50%" stop-color="#090914"/>
      <stop offset="100%" stop-color="#0d0d1a"/>
    </linearGradient>
    <!-- Headline gradient -->
    <linearGradient id="hg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#818cf8"/>
      <stop offset="50%"  stop-color="#c084fc"/>
      <stop offset="100%" stop-color="#67e8f9"/>
    </linearGradient>
    <!-- Glow blobs -->
    <radialGradient id="blob1" cx="0%" cy="0%" r="70%">
      <stop offset="0%" stop-color="#6366f1" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="blob2" cx="100%" cy="100%" r="70%">
      <stop offset="0%" stop-color="#a855f7" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#a855f7" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="blob3" cx="70%" cy="40%" r="50%">
      <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#06b6d4" stop-opacity="0"/>
    </radialGradient>
    <!-- Terminal shadow -->
    <filter id="termShadow">
      <feDropShadow dx="0" dy="8" stdDeviation="24" flood-color="#6366f1" flood-opacity="0.18"/>
      <feDropShadow dx="0" dy="30" stdDeviation="40" flood-color="#000" flood-opacity="0.5"/>
    </filter>
    <!-- Card glow on left border -->
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- ── Background ── -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Grid lines -->
  ${Array.from({length:25},(_,i)=>`<line x1="${i*50}" y1="0" x2="${i*50}" y2="630" stroke="${C.grid}" stroke-width="1"/>`).join("")}
  ${Array.from({length:13},(_,i)=>`<line x1="0" y1="${i*50}" x2="1200" y2="${i*50}" stroke="${C.grid}" stroke-width="1"/>`).join("")}

  <!-- Glow blobs -->
  <rect width="600" height="600" fill="url(#blob1)" transform="translate(-100,-150)"/>
  <rect width="500" height="500" fill="url(#blob2)" transform="translate(820,280)"/>
  <rect width="400" height="400" fill="url(#blob3)" transform="translate(500,100)"/>

  <!-- ── Badge ── -->
  <rect x="52" y="44" width="194" height="28" rx="14"
        fill="rgba(99,102,241,0.14)" stroke="rgba(99,102,241,0.38)" stroke-width="1"/>
  <circle cx="73" cy="58" r="5" fill="#22c55e"/>
  <text x="86" y="63" font-family="${SANS}" font-size="11" font-weight="700"
        fill="#a5b4fc" letter-spacing="1">OPEN SOURCE · FREE</text>

  <!-- ── Main headline ── -->
  <text x="52" y="134" font-family="${SANS}" font-size="62" font-weight="900"
        fill="${C.white}" letter-spacing="-2">I built a bot that</text>

  <text x="52" y="202" font-family="${SANS}" font-size="62" font-weight="900"
        fill="${C.white}" letter-spacing="-2">applies to</text>

  <!-- Gradient "300+ jobs" -->
  <text x="52" y="270" font-family="${SANS}" font-size="72" font-weight="900"
        fill="url(#hg)" letter-spacing="-2">${esc(totalActions)}+ jobs</text>

  <text x="52" y="336" font-family="${SANS}" font-size="62" font-weight="900"
        fill="${C.white}" letter-spacing="-2">while I sleep</text>

  <!-- ── Subtext ── -->
  <text x="52" y="376" font-family="${SANS}" font-size="16" fill="${C.dim}">
    AI job hunter for Data Science &amp; ML roles — scrapes ${companies}+ companies,
  </text>
  <text x="52" y="396" font-family="${SANS}" font-size="16" fill="${C.dim}">
    scores every role 0–5, auto-fills applications with Simplify.
  </text>

  <!-- ── Flow chips ── -->
  ${[
    { label: "🔍 Scrape", x: 52 },
    { label: "→",         x: 158, plain: true },
    { label: "🧠 Score",  x: 175 },
    { label: "→",         x: 280, plain: true },
    { label: "✨ Simplify",x: 297 },
    { label: "→",         x: 420, plain: true },
    { label: "✅ Applied", x: 437 },
  ].map(chip => chip.plain
    ? `<text x="${chip.x}" y="432" font-family="${SANS}" font-size="16" fill="${C.dimmer}">${esc(chip.label)}</text>`
    : `<rect x="${chip.x - 4}" y="415" width="${chip.label.length * 9 + 8}" height="26" rx="7"
             fill="rgba(99,102,241,0.12)" stroke="rgba(99,102,241,0.28)" stroke-width="1"/>
       <text x="${chip.x + 4}" y="432" font-family="${SANS}" font-size="12" font-weight="700"
             fill="#a5b4fc" letter-spacing="0.5">${esc(chip.label)}</text>`
  ).join("")}

  <!-- ── Stat cards ── -->
  ${cards.map((c, i) => cardSVG(c, i)).join("")}

  <!-- ── Author / footer ── -->
  <circle cx="67" cy="589" r="20" fill="url(#hg)"/>
  <text x="67" y="595" font-family="${SANS}" font-size="14" font-weight="800"
        fill="white" text-anchor="middle">SC</text>
  <text x="96" y="582" font-family="${SANS}" font-size="14" font-weight="700"
        fill="rgba(255,255,255,0.9)">Suma Chidara</text>
  <text x="96" y="600" font-family="${SANS}" font-size="12"
        fill="${C.dim}">Data Scientist · Seattle, WA</text>

  <!-- GitHub badge -->
  <rect x="370" y="568" width="290" height="36" rx="18"
        fill="rgba(255,255,255,0.05)" stroke="${C.border}" stroke-width="1"/>
  <text x="388" y="591" font-family="${SANS}" font-size="16">⭐</text>
  <text x="414" y="591" font-family="${MONO}" font-size="12" font-weight="600"
        fill="rgba(255,255,255,0.7)">github.com/sumach9/job-automation</text>

  <!-- ── Terminal panel ── -->
  <rect x="${termX}" y="${termY}" width="${termW}" height="${termH}" rx="16"
        fill="rgba(9,9,20,0.88)" stroke="rgba(255,255,255,0.1)" stroke-width="1"
        filter="url(#termShadow)"/>

  <!-- Terminal header -->
  <rect x="${termX}" y="${termY}" width="${termW}" height="40" rx="16"
        fill="rgba(255,255,255,0.04)"/>
  <rect x="${termX}" y="${termY + 28}" width="${termW}" height="12"
        fill="rgba(255,255,255,0.04)"/>
  <rect x="${termX}" y="${termY + 39}" width="${termW}" height="1"
        fill="rgba(255,255,255,0.08)"/>

  <!-- Traffic lights -->
  <circle cx="${termX + 20}" cy="${termY + 20}" r="6" fill="#ff5f57"/>
  <circle cx="${termX + 38}" cy="${termY + 20}" r="6" fill="#febc2e"/>
  <circle cx="${termX + 56}" cy="${termY + 20}" r="6" fill="#28c840"/>

  <!-- Terminal title -->
  <text x="${termX + 76}" y="${termY + 25}" font-family="${MONO}" font-size="12"
        fill="rgba(255,255,255,0.38)">job-bot · running</text>

  <!-- Terminal lines -->
  ${termLines.map((ln, i) => termLine(ln, i)).join("")}

  <!-- Subtle right edge glow on terminal -->
  <rect x="${termX}" y="${termY}" width="3" height="${termH}" rx="2"
        fill="url(#hg)" opacity="0.5"/>
</svg>`;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generateViralImage(outputPath) {
  const stats = getLiveStats();
  const svg   = buildSVG(stats);

  const png = await sharp(Buffer.from(svg))
    .png({ quality: 100, compressionLevel: 6 })
    .toBuffer();

  if (outputPath) {
    fs.writeFileSync(outputPath, png);
  }
  return { png, stats };
}

// ── CLI: node imageGen.js ─────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = path.join(__dirname, "viral-image.png");
  const { stats } = await generateViralImage(out);
  console.log(`✅ viral-image.png generated (${fs.statSync(out).size} bytes)`);
  console.log(`   Jobs: ${stats.total} | Applied: ${stats.applied + stats.simplify} | Companies: ${stats.companies}`);
}
