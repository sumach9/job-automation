# JobPilot — AI-Powered Job Automation

JobPilot is a self-hosted job automation platform that finds, scores, tracks, and applies to jobs on your behalf. It runs locally, searches multiple platforms simultaneously, uses AI to fill application forms, and emails you a daily digest of every result.

---

## Features

| Feature | Details |
|---------|---------|
| **Multi-platform job search** | LinkedIn (via Apify), Indeed, Google Jobs (SerpAPI), Greenhouse, Lever, Ashby, TickBig |
| **Date Posted filter** | Search by Today / This week / This month |
| **AI form filling** | Groq (Llama 3.3-70B) reads every field on a job form and maps your profile to it |
| **Auto-apply** | Playwright submits LinkedIn Easy Apply and ATS forms end-to-end |
| **Resume parsing** | Drag-and-drop PDF/DOCX — profile auto-fills from your resume |
| **Fit scoring** | Every job scored 0–5 against your skills, experience, and target roles |
| **Pipeline board** | Kanban: Queued → Applied → Interviewing → Offered → Rejected |
| **Ghosting Oracle** | TensorFlow.js classifier predicts which applications are at risk of being ghosted |
| **Interview War Room** | Streaming AI interviewer with voice input and session scoring |
| **Semantic Job Galaxy** | Canvas 2D job map — visualize your search results by seniority and domain |
| **Autopilot Apply** | Playwright scans live job application forms; AI maps your profile to each field |
| **Outreach writer** | AI drafts LinkedIn messages and recruiter emails per job |
| **Daily email digest** | All found jobs sent to your inbox at 8 AM, sorted by score |
| **Google Sheets export** | Jobs and applications auto-synced to a Google Sheet after every run |
| **JWT auth** | Password-protected dashboard |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 20+, Express |
| Frontend | React 18, Vite |
| Automation | Playwright (Chromium) |
| AI / Form filling | Groq (Llama 3.3-70B), Anthropic, OpenAI (fallback chain) |
| Machine learning | TensorFlow.js (in-browser, Ghosting Oracle classifier) |
| Job sources | Apify LinkedIn scraper, SerpAPI Google Jobs, Greenhouse / Lever / Ashby APIs, TickBig |
| Resume parsing | pdf-parse, mammoth |
| Email | Nodemailer (Gmail App Password) |
| Scheduler | node-schedule |
| Database | SQLite via Prisma |
| Sheets export | Google Sheets API v4 (service account) |
| Auth | JWT (jsonwebtoken) |

---

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/sumach9/job-automation.git
cd job-automation
npm run setup          # installs deps + builds the React frontend
```

### 2. Configure

Copy `.env.example` to `.env` and fill in your values — see [Configuration](#configuration) below.

### 3. Start

```bash
npm start
```

Open **http://localhost:3004** in your browser.

### 4. Log in

Default credentials (change in `.env`):
```
Username: admin
Password: jobpilot2024
```

### 5. Upload your resume

Go to **Settings → Profile** and drag your PDF or DOCX resume onto the upload zone. JobPilot parses it and auto-fills all profile fields. Review, adjust, and click **Save Profile**.

---

## Configuration

All configuration lives in `.env`. No values are hardcoded in the source.

```env
# ── Server ───────────────────────────────────────────────
PORT=3004

# ── Admin Login ──────────────────────────────────────────
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password
JWT_SECRET=replace_with_a_long_random_string

# ── Job Search ───────────────────────────────────────────
JOB_TITLES=Software Engineer,Data Scientist,Backend Engineer
JOB_LOCATIONS=Remote,New York,San Francisco
INTERVAL_MINUTES=5          # how often the scanner runs
MAX_APPS_PER_RUN=10         # max applications per cycle
MAX_BROWSER_OPENS=5         # max Playwright tabs open at once
AUTO_APPLY_ENABLED=true

# ── Apify (LinkedIn job scraping) ────────────────────────
# Get a free token at https://console.apify.com/account/integrations
APIFY_TOKEN=your_apify_token

# ── SerpAPI (Google Jobs) ────────────────────────────────
# Get a free key at https://serpapi.com
SERPAPI_KEY=your_serpapi_key

# ── LinkedIn ─────────────────────────────────────────────
LINKEDIN_EMAIL=you@email.com
LINKEDIN_PASSWORD=yourpassword

# ── TickBig (job discovery only — applying requires payment on site) ─────────
TICKBIG_EMAIL=you@email.com
TICKBIG_PASSWORD=yourpassword

# ── Gmail Notifications ──────────────────────────────────
# Use a Gmail App Password: https://myaccount.google.com/apppasswords
EMAIL_USER=you@gmail.com
EMAIL_PASS=your_app_password
NOTIFY_EMAIL=you@gmail.com
EMAIL_NOTIFICATIONS=true

# ── Applicant Profile ────────────────────────────────────
# Pre-fill form fields before a resume is uploaded
APPLICANT_NAME=Your Full Name
APPLICANT_PHONE=5550001234
APPLICANT_LOCATION=Seattle, WA
APPLICANT_LINKEDIN_URL=https://linkedin.com/in/yourprofile
APPLICANT_WEBSITE=https://github.com/yourusername
APPLICANT_YEARS_EXPERIENCE=5
APPLICANT_EXPECTED_SALARY=
APPLICANT_SKILLS=Python,SQL,Machine Learning
APPLICANT_SUMMARY=Brief professional summary for cover letters
RESUME_PATH=C:\path\to\your\resume.pdf

# ── AI Providers (form filling + outreach) ───────────────
# Groq is free and fast — get a key at https://console.groq.com
GROQ_API_KEY=your_groq_api_key
# ANTHROPIC_API_KEY=sk-ant-...    # optional fallback
# OPENAI_API_KEY=sk-...           # optional fallback

# ── Apply Mode ───────────────────────────────────────────
# playwright = AI fills and submits forms automatically
# shell      = opens jobs in Chrome for you to submit manually
# off        = only find and score jobs, no apply
SIMPLIFY_MODE=playwright
SIMPLIFY_AUTO_SUBMIT=true

# ── Google Sheets Export (optional) ─────────────────────
GOOGLE_SHEET_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=

# ── Misc ─────────────────────────────────────────────────
DATABASE_URL=file:./jobpilot.db
LOG_LEVEL=info
```

---

## How Auto-Apply Works

```
Every N minutes
  └─► Scrape jobs (LinkedIn via Apify, Google Jobs, ATS boards, TickBig)
        └─► Score each job against your profile (0–5 scale)
              └─► For each high-score job:
                    ├─ LinkedIn Easy Apply  → Playwright logs in, clicks Easy Apply, fills + submits
                    ├─ Greenhouse/Lever/Ashby → Playwright opens apply URL
                    │     └─► AI (Groq) reads all form fields
                    │           └─► Maps your profile to each field
                    │                 └─► Playwright fills + submits
                    └─ Other sources → skip (listing pages only)
  └─► Sync to Google Sheet (if configured)
  └─► Save to dashboard + send email digest at 8 AM
```

---

## Dashboard Tabs

| Tab | What it shows |
|-----|--------------|
| **Overview** | Live stats, top best-fit jobs, pipeline summary, activity feed |
| **Jobs** | Split-pane job list + detail, filter by platform / score / date posted / work type |
| **Pipeline** | Kanban board — drag cards between columns |
| **Applications** | Full history with status badges + Ghosting Oracle risk predictions |
| **Outreach** | AI-drafted LinkedIn messages and recruiter emails per job |
| **Settings** | Profile, search config, Google Sheets, AI keys |

---

## AI Features

### Ghosting Oracle
A TensorFlow.js binary classifier (trained on your application history) that predicts which of your tracked applications are at risk of ghosting. Shown above the Applications tab — displays top at-risk entries with a color-coded risk bar.

### Interview War Room
Full-screen AI interviewer powered by Groq (Llama 3.3-70B) with streaming responses. Supports voice input via the Web Speech API. Scores your performance after 5+ exchanges and displays a final rating.

### Semantic Job Galaxy
Canvas 2D visualization of your search results. Jobs are placed by seniority (X axis) and domain (Y axis) with physics-based repulsion to avoid overlap. Hover for details, click to select.

### Autopilot Apply
Playwright scans a live job application URL, extracts all form fields, and AI maps your resume/profile to each one. Shows a fill preview before submitting.

---

## Google Sheets Setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → **Enable the Google Sheets API**
3. IAM & Admin → Service Accounts → **Create service account** → download the JSON key
4. Open your Google Sheet → **Share** with the service account email (Editor access)
5. Copy the Sheet ID from the URL: `.../spreadsheets/d/<SHEET_ID>/edit`
6. Add to `.env`:
   ```env
   GOOGLE_SHEET_ID=your_sheet_id
   GOOGLE_SERVICE_ACCOUNT_EMAIL=sa@your-project.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```
7. Restart the server

JobPilot creates two tabs automatically: **Jobs Found** and **Applications**.

---

## Project Structure

```
job-automation/
├── server.js                        # Express API + scheduler + all routes
├── src/
│   ├── scrapers/
│   │   ├── atsScrapers.js           # Greenhouse / Lever / Ashby scrapers
│   │   └── tickbigScraper.js        # TickBig job discovery scraper
│   ├── automation/
│   │   ├── autoApply.js             # Playwright automation (LinkedIn, ATS, AI filler)
│   │   └── recruiterOutreach.js     # LinkedIn recruiter outreach automation
│   ├── utils/
│   │   ├── scorer.js                # Job fit scoring algorithm
│   │   ├── imageGen.js              # Viral job stats image generator
│   │   └── resumeParser.js          # PDF/DOCX resume parser
│   ├── ai/
│   │   ├── formMapper.js            # 3-layer AI form fill pipeline
│   │   ├── router/index.js          # AI provider router (Groq → Anthropic → OpenAI)
│   │   └── providers/               # groq.js, anthropic.js, openai.js
│   ├── adapters/                    # ATS platform adapters (Greenhouse, Lever, Ashby, LinkedIn)
│   ├── integrations/
│   │   └── googleSheets.js          # Google Sheets export (service account)
│   ├── storage/db.js                # Prisma/SQLite helpers
│   └── logging/logger.js            # Winston logger
├── client/
│   └── src/App.jsx                  # React dashboard (single-file)
├── extension/                       # Chrome extension (SAM AI assistant)
├── prisma/
│   └── schema.prisma                # Database schema
├── scripts/                         # Test and debug scripts (all use .env)
├── uploads/                         # Uploaded resumes (gitignored)
├── logs/                            # Runtime logs (gitignored)
├── .env                             # Your secrets (gitignored)
└── README.md
```

---

## Scripts

```bash
npm start          # start production server (default port 3004)
npm run dev        # start with auto-restart on file changes (nodemon)
npm run build      # build the React frontend only
npm run setup      # full first-time setup: install deps + build frontend
```

### Utility scripts (in `scripts/`)

```bash
node scripts/test-ai-mapper.mjs      # test AI form field mapping
node scripts/test-writer-form.mjs    # simulate a Writer.com application form
node scripts/test-ai-features.mjs    # test skill gap, outreach, interview prep
node scripts/tickbig-test.mjs        # verify TickBig login + job fetch
```

All scripts read credentials from `.env`.

---

## Security

- All credentials live in `.env` — never in source code
- `.env`, `uploads/`, and `cookies/` are gitignored
- Dashboard protected by JWT (30-day tokens) — change `JWT_SECRET` before sharing
- Sensitive fields (passwords, API keys) are stripped from all API responses

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Cannot reach server" | Run `npm start` and check the terminal for errors |
| Scanner finds 0 jobs | Verify `APIFY_TOKEN` and `SERPAPI_KEY` in `.env` |
| LinkedIn apply fails | Check `LINKEDIN_EMAIL` / `LINKEDIN_PASSWORD` in `.env` |
| Email not sending | Use a **Gmail App Password** (not your real password) |
| AI form fill fails | Check `GROQ_API_KEY` at [console.groq.com](https://console.groq.com) |
| Google Sheets 403 | Make sure you shared the sheet with the service account email |
| Port 3004 in use | Run `Get-Process node \| Stop-Process -Force` then restart |
| Resume parse fails | File must be a real PDF/DOCX — scanned images won't work |
| Blank page after login | Clear localStorage and hard-refresh (`Ctrl+Shift+R`) |

---

## License

MIT — build on it, ship it, make it yours.
