# ⚡ OneTouch Apply

> Apply to any job in one click. Auto-fills every field, generates a tailored cover letter per role, tracks every application through a Kanban pipeline — all from a Chrome extension backed by a local dashboard.

---

## What it does

OneTouch Apply is a **Chrome extension + local dashboard** that eliminates the manual grind of job applications:

- **One click fills the entire form** — name, email, phone, LinkedIn, resume PDF upload, cover letter, EEO dropdowns, checkboxes, all of it
- **Tailored cover letter per job** — backend reads the job description, matches your skills against it, and writes a custom cover letter before the form is filled. No external AI API needed
- **Pipeline Kanban** — drag applications through Queued → OneTouch → Applied → Interviewing → Offered → Rejected
- **Talking points report card** — click any pipeline card to see your matched skills, interview prep checklist, and the generated cover letter for that role
- **Find Recruiter** — one button opens a LinkedIn search for recruiters at the company you just applied to
- **Job scanner bot** — background bot auto-scrapes LinkedIn, Indeed, Glassdoor, Greenhouse, Lever, Ashby, Workday and 30+ ATS platforms, scores every job 0–5, and surfaces the best matches
- **Dashboard** — live stats, job cards, application table, log terminal, settings panel

---

## Project structure

```
onetouch-apply/
├── extension/                  # Chrome extension (Manifest V3)
│   ├── manifest.json           # Permissions, host patterns, content script config
│   ├── content.js              # Injected into job pages — fills forms, injects ⚡ button
│   ├── content.css             # Floating button, toast, score badge styles
│   ├── background.js           # Service worker — badge counter, message routing
│   ├── popup.html / popup.js   # 320px popup — profile editor, resume upload, actions
│   ├── onboarding.html         # Welcome page on first install
│   └── icons/                  # icon16/48/128.png
│
├── client/src/App.jsx          # React 18 + Vite dashboard
│   ├── Dashboard view          # Stat cards, platform pills, activity feed
│   ├── Pipeline view           # 6-column Kanban + talking points report card
│   ├── Jobs view               # Scraped jobs with search / score filter / sort
│   ├── Applications view       # Applied jobs table with stage badges
│   ├── Logs view               # Terminal-style live log viewer
│   └── Settings view           # Titles, locations, platforms, intervals
│
├── server.js                   # Express API (port 3004)
├── atsScrapers.js              # Direct Greenhouse / Lever / Ashby API scrapers
├── autoApply.js                # Playwright auto-apply for LinkedIn / Indeed
├── scorer.js                   # Job match scoring engine (0–5)
├── imageGen.js                 # SVG + Sharp stats image generator (no browser)
├── data.json                   # Persistent jobs + applications store
├── scan-history.tsv            # Audit trail — every job seen, timestamped
└── railway.toml                # Railway deployment config
```

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/sumach9/job-automation.git
cd job-automation
npm install
cd client && npm install && npm run build && cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
```

Key variables in `.env`:

```env
# Job scraping (optional — ATS Direct works without Apify)
APIFY_TOKEN=your_token
SERPAPI_KEY=your_key

# LinkedIn auto-apply (optional)
LINKEDIN_EMAIL=you@email.com
LINKEDIN_PASSWORD=yourpass

# What to search for
JOB_TITLES=Data Scientist,ML Engineer,Data Engineer
JOB_LOCATIONS=Seattle,WA,Remote

# Email alerts (optional)
EMAIL_USER=you@gmail.com
EMAIL_PASS=gmail_app_password
```

### 3. Start the server

```bash
npm start
# Dashboard → http://localhost:3004
```

### 4. Load the Chrome extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `extension/` folder
4. The ⚡ OneTouch icon appears in the toolbar
5. The onboarding page opens automatically

### 5. Set up your profile

Click ⚡ → **Profile tab**, fill in:

| Field | Used for |
|---|---|
| Full Name, Email, Phone | All form fields |
| LinkedIn URL, GitHub URL | Profile / social fields |
| Location | City / state fields |
| Expected Salary | Compensation fields |
| Years of Experience | Experience fields |
| **Skills** (comma-separated) | Skill matching + cover letter |
| **Work Summary** (2–3 sentences) | Cover letter body |
| School, Degree/Major | Education fields |
| Work Preference (Remote/Hybrid/On-site) | Tailored cover letter tone |
| Cover Letter | Optional — auto-generated per job if left blank |
| Resume PDF | Uploaded to `input[type=file]` fields |

Click **Save Profile**.

### 6. Apply to a job

Navigate to any supported job page → the **⚡ OneTouch Apply** button appears in the bottom-right corner → click it → every field fills automatically → click the highlighted Submit button.

---

## Supported sites

| Site | Fill | Resume upload | Multi-step |
|---|---|---|---|
| LinkedIn Easy Apply | ✅ | ✅ | ✅ All steps auto-advance |
| Greenhouse (`job-boards.greenhouse.io`) | ✅ | ✅ | ✅ |
| Lever (`jobs.lever.co`) | ✅ | ✅ | ✅ |
| Ashby (`jobs.ashbyhq.com`) | ✅ | ✅ | ✅ |
| Workday (`*.myworkdayjobs.com`) | ✅ | ✅ | ✅ Auto-advance steps |
| Indeed | ✅ | ✅ | ✅ |
| Glassdoor | ✅ | ✅ | — |
| ZipRecruiter | ✅ | ✅ | — |
| SmartRecruiters | ✅ | ✅ | — |
| iCIMS, Taleo, SuccessFactors | ✅ | ✅ | — |

---

## How tailored answers work

When ⚡ is clicked, the extension:

1. Scrapes the job title, company, and description from the page
2. Sends `{ job, profile }` to `POST /api/generate-answers`
3. Backend matches your **skills list** against the job description text
4. Returns a **custom cover letter** mentioning matched skills + company name
5. Returns a **"why this role"** answer for those specific textarea questions
6. Returns **interview talking points** + a recruiter LinkedIn search URL
7. All form fields — including cover letter / "why this company" textareas — fill with the tailored content
8. Matched skills are shown in the success toast
9. If score ≥ 3.5, a **💼 Find Recruiter** button appears (auto-dismisses after 30s)

No GPT / Claude API needed. Pure template engine built into the backend.

---

## Pipeline Kanban

The **Pipeline tab** in the dashboard tracks every application:

```
📋 Queued → ⚡ OneTouch → ✓ Applied → 💬 Interviewing → 🏆 Offered 🎉 → ✕ Rejected
```

- Click any card → opens job detail + generates a **talking points card** (matched skills, prep checklist, cover letter preview)
- Stage buttons on each card let you advance it with one click
- Changes sync instantly to the server

---

## Job scanner bot

The background bot scrapes jobs on a configurable interval (default: every 5 min).

**ATS Direct** — no API key needed, scrapes 34 verified companies:

| Provider | Companies |
|---|---|
| **Greenhouse** | Anthropic, Databricks, Datadog, Elastic, MongoDB, Cloudflare, Twilio, Okta, Dropbox, Block, Stripe, Airbnb, Reddit, Pinterest, Duolingo, Twitch, Smartsheet, Lyft, Qualtrics, Figma, Asana, Coinbase, Instacart, TripAdvisor |
| **Lever** | Palantir, Rover, Plaid |
| **Ashby** | OpenAI, Perplexity, Cohere, Mistral, Confluent, Anyscale, Modal |

**With API keys:**
- LinkedIn (Apify)
- Indeed (Apify)
- Glassdoor (Apify)
- ZipRecruiter (Apify)
- Google Jobs (SerpAPI)

Start/stop the bot from the dashboard header or:

```bash
curl -X POST http://localhost:3004/api/start
curl -X POST http://localhost:3004/api/stop
```

---

## API reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/status` | Bot status, stats, settings |
| `POST` | `/api/start` | Start the job scanner |
| `POST` | `/api/stop` | Stop the job scanner |
| `GET` | `/api/jobs` | All scraped jobs (`?q=search&limit=200`) |
| `GET` | `/api/applications` | Tracked applications |
| `GET` | `/api/pipeline` | Applications grouped by stage |
| `PATCH` | `/api/applications/:id/stage` | Move a card to a new stage |
| `POST` | `/api/generate-answers` | Generate tailored cover letter + talking points |
| `POST` | `/api/onetouch-apply` | Extension callback when a form is filled |
| `POST` | `/api/score-job` | Score any job object (0–5) |
| `GET` | `/api/ats-companies` | List all ATS companies being scraped |
| `GET` | `/api/scan-history` | TSV audit trail of every job seen |
| `GET` | `/api/viral-image` | 1200×630 PNG stats image (Sharp / SVG) |
| `DELETE` | `/api/applications/:id` | Remove an application |

---

## Score system

Every job is scored 0–5 across three dimensions:

| Dimension | What it checks |
|---|---|
| **Title match** (0–2) | Keywords in job title vs. your target roles |
| **Skills match** (0–2) | Your skills list vs. job description text |
| **Location match** (0–1) | Preferred location vs. job location / remote flag |

Score ≥ 4 → highlighted green, appears at top of job list, triggers recruiter button in extension.

---

## Deploy to Railway

```bash
# 1. Push repo to GitHub
# 2. Connect at railway.app → New Project → Deploy from GitHub repo
# 3. Set environment variables in Railway dashboard
# railway.toml is already configured — auto-builds client, installs Playwright
```

---

## Tech stack

| Layer | Tech |
|---|---|
| Chrome extension | Manifest V3, vanilla JS, DataTransfer API, chrome.storage.local |
| Dashboard | React 18, Vite, inline CSS variables |
| Backend | Node.js ESM, Express 4 |
| Browser automation | Playwright (system Chrome channel) |
| Job scraping | Apify actors, SerpAPI, direct ATS REST APIs |
| Image generation | Sharp + pure SVG (no browser, no external API) |
| Persistence | JSON flat file + TSV audit log |
| Deployment | Railway via nixpacks |

---

## Author

Built by **Suma Chidara** · [github.com/sumach9](https://github.com/sumach9)
