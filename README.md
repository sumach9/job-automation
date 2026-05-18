# ⚡ JobPilot — Automated Job Search

JobPilot is a self-hosted job automation platform that finds, scores, and applies to jobs on your behalf. It runs locally on your Windows machine, searches multiple job platforms, auto-applies to Easy Apply jobs, and emails you a daily digest of all results.

---

## Features

- **Multi-platform job search** — Google Jobs (SerpAPI), LinkedIn Easy Apply, Greenhouse, Lever, Ashby
- **Fit scoring** — each job scored against your skills, experience, and target roles
- **Auto-apply** — LinkedIn Easy Apply and ATS forms filled and submitted automatically via Playwright
- **Resume upload** — drag-and-drop PDF/DOCX, profile auto-filled from your resume
- **Daily email digest** — all found jobs sent to your inbox every morning at 8 AM
- **Pipeline tracking** — Kanban board (Queued → Applied → Interviewing → Offered)
- **JWT authentication** — password-protected dashboard
- **Stripe billing** — optional subscription plans

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 20, Express |
| Frontend | React 18, Vite |
| Automation | Playwright (Chromium) |
| Job Sources | SerpAPI (Google Jobs), LinkedIn Direct, ATS scrapers |
| Resume Parse | pdf-parse, mammoth |
| Email | Nodemailer (Gmail) |
| Auth | JWT (jsonwebtoken) |
| Scheduler | node-schedule |
| Payments | Stripe |

---

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/sumach9/job-automation.git
cd job-automation
```

### 2. Install dependencies & build

```bash
npm run setup
```

### 3. Configure environment

Edit the `.env` file with your API keys and credentials (see [Configuration](#configuration) below).

### 4. Start the server

```bash
npm start
```

Open **http://localhost:3004** in your browser.

### 5. Log in

```
Username: admin
Password: jobpilot2024
```

> Change these in your `.env` via `ADMIN_USERNAME` and `ADMIN_PASSWORD`.

---

## Configuration

All settings live in `.env`:

```env
# ── Server ──────────────────────────────────────
PORT=3004

# ── Admin Login ───────────────────────────────────
ADMIN_USERNAME=admin
ADMIN_PASSWORD=jobpilot2024
JWT_SECRET=change-this-to-a-random-secret

# ── SerpAPI (Google Jobs) ────────────────────────
# Get yours at https://serpapi.com/dashboard
SERPAPI_KEY=your_key_here

# ── Job Search Config ────────────────────────────
JOB_TITLES=Data Scientist,Data Engineer,Data Analyst
JOB_LOCATIONS=Seattle,Washington
INTERVAL_MINUTES=5
MAX_APPS_PER_RUN=10
MAX_BROWSER_OPENS=5

# ── Gmail Notifications ──────────────────────────
EMAIL_USER=you@gmail.com
EMAIL_PASS=your_app_password        # Gmail App Password, not your real password
NOTIFY_EMAIL=you@gmail.com
EMAIL_NOTIFICATIONS=true

# ── LinkedIn Auto Apply ───────────────────────────
AUTO_APPLY_ENABLED=true
LINKEDIN_EMAIL=you@email.com
LINKEDIN_PASSWORD=yourpassword

# ── Applicant Profile ────────────────────────────
APPLICANT_PHONE=8001234567
APPLICANT_LOCATION=Seattle, WA
RESUME_PATH=C:\path\to\your\resume.pdf

# ── Apify (optional, for extra job sources) ──────
APIFY_TOKEN=your_token_here

# ── Stripe (optional, for billing) ──────────────
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## Usage

### Dashboard — Overview
- Live stats: jobs found, applications, interviews, hot matches
- Top 5 best-fit jobs
- Pipeline summary and recent activity feed

### Jobs tab
- Split-pane view: job list on the left, full detail on the right
- Filter by platform, score, Easy Apply
- Sort by best match, newest, or company name
- Skill Gap analysis and Resume Draft per job

### Pipeline tab
- Kanban board: Queued → Applied → Interviewing → Offered → Rejected
- Move cards between columns with one click
- Click any card to view job details and get interview prep talking points

### Applications tab
- Full history table with status badges
- Delete individual applications

### Settings

| Tab | What you configure |
|-----|--------------------|
| **Profile** | Upload resume (auto-fills all fields), personal info, education, experience |
| **Search** | Job titles, locations, platforms, interval, auto-apply toggle |
| **Agents** | AI agent suite (skill gap, outreach writer, etc.) |
| **Billing** | Stripe subscription plans |

---

## Resume Upload

Go to **Settings → Profile** and drag-and-drop your PDF or DOCX resume.

JobPilot automatically extracts:
- Name, email, phone, location
- Skills (40+ tech keywords detected)
- Work experience (company, title, dates, description)
- Education (school, degree, major, GPA, years)
- LinkedIn URL, years of experience

All fields auto-populate in the form. Review, edit if needed, then click **Save Profile**.

---

## Email Digest

A daily digest is sent every morning at **8:00 AM** containing:
- Stats bar: total jobs, hot matches, auto-applied, interviewing
- Every found job sorted by fit score with a direct **Apply →** link

To send the digest immediately: **Settings → Search → Send Digest Now**

---

## How Auto-Apply Works

1. Scanner runs every N minutes (default: 5)
2. Searches Google Jobs + LinkedIn + ATS job boards
3. Each job is scored against your profile (0–5 scale)
4. **LinkedIn Easy Apply** jobs → Playwright logs in and submits automatically
5. **Greenhouse / Lever / Ashby** → Playwright fills the form and clicks Submit
6. Results logged with status: `✅ Auto-applied`, `Form filled`, or `Apply failed`

> **Note:** Workday, Taleo, and SuccessFactors require account creation — these are marked `apply-failed` for manual apply.

---

## Scripts

```bash
npm start          # Start production server
npm run dev        # Start with auto-restart on file changes
npm run build      # Build the React frontend
npm run setup      # Install all deps + build frontend (first-time setup)
```

---

## Project Structure

```
job-automation/
├── server.js          # Express API + scheduler + all routes
├── autoApply.js       # Playwright automation (LinkedIn, ATS, direct)
├── atsScrapers.js     # Greenhouse / Lever / Ashby scrapers
├── resumeParser.js    # PDF/DOCX resume parser
├── scorer.js          # Job fit scoring algorithm
├── imageGen.js        # Viral job image generator
├── client/            # React frontend (Vite)
│   └── src/App.jsx    # Single-file React app
├── uploads/           # Uploaded resumes (gitignored)
├── data.json          # Persistent state (applications, jobs, logs)
├── .env               # Your secrets (gitignored)
└── README.md
```

---

## Security

- Dashboard protected by JWT authentication (30-day tokens)
- `.env` is gitignored — never committed
- `uploads/` and `data.json` are gitignored
- Change `JWT_SECRET`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD` before sharing the machine

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Blank page after login | Clear localStorage and hard refresh (Ctrl+Shift+R) |
| Scanner finds 0 jobs | Check `SERPAPI_KEY` is valid at serpapi.com/dashboard |
| LinkedIn apply fails | Verify `LINKEDIN_EMAIL` / `LINKEDIN_PASSWORD` in `.env` |
| Email not sending | Use a Gmail App Password, not your real Gmail password |
| Port 3004 already in use | Run `Get-Process node \| Stop-Process -Force` then restart |
| Resume parse fails | Ensure file is a real PDF/DOCX, not a scanned image |

---

## License

MIT — build on it, ship it, make it yours.
