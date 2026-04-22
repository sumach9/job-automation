# Job Automation Bot

AI-powered job search and auto-apply tool for Data Science roles in Seattle.

## Features

- **Multi-platform scraping** — LinkedIn, Indeed, Glassdoor, ZipRecruiter, Google Jobs
- **ATS Direct** — Scrapes 46 top tech companies directly (Greenhouse, Lever, Ashby): OpenAI, Anthropic, Databricks, Expedia, Stripe, Palantir, Scale AI, Cohere, and more
- **Auto-Apply** — LinkedIn Easy Apply + Indeed auto-submit via Playwright
- **Job Scoring** — Each job scored 0–5 against your profile (skills, title, location)
- **Score Filter** — Slider to show only high-match jobs
- **Scan History** — TSV audit trail of every job seen (added/skipped_dup)
- **Email Alerts** — Gmail notifications when new jobs are found
- **React Dashboard** — Real-time stats, job browser, application tracker, logs

## Stack

- **Backend**: Node.js + Express
- **Frontend**: React + Vite
- **Automation**: Playwright (Chromium)
- **Scraping**: Apify, SerpAPI, direct ATS APIs
- **Notifications**: Nodemailer (Gmail)

## Setup

```bash
# 1. Install dependencies
npm install
cd client && npm install && cd ..

# 2. Configure .env (copy from .env.example)
cp .env.example .env
# Fill in your API keys and credentials

# 3. Start backend
node server.js

# 4. Start frontend (separate terminal)
cd client && npm run dev
```

## Environment Variables

```env
PORT=3004
APIFY_TOKEN=your_apify_token
SERPAPI_KEY=your_serpapi_key
JOB_TITLES=Data Scientist,Data Engineer,ML Engineer
JOB_LOCATIONS=Seattle,Washington
AUTO_APPLY_ENABLED=true
LINKEDIN_EMAIL=your@email.com
LINKEDIN_PASSWORD=your_password
APPLICANT_PHONE=your_phone
APPLICANT_LOCATION=Seattle, WA
RESUME_PATH=/path/to/resume.pdf
EMAIL_USER=your@gmail.com
EMAIL_PASS=your_app_password
NOTIFY_EMAIL=notify@email.com
```

## Dashboard

Open `http://localhost:5173` after starting both server and frontend.

## ATS Companies Tracked

**Greenhouse**: OpenAI, Anthropic, Databricks, Expedia, Stripe, Airbnb, DoorDash, Lyft, Redfin, Remitly, Smartsheet, Pinterest, Figma, Zillow, Reddit, Snap, Duolingo, Tableau, F5, Convoy + more

**Lever**: Palantir, Notion, Coinbase, Datadog, HashiCorp, MongoDB, Cloudflare, Twilio + more

**Ashby**: Scale AI, Cohere, Hugging Face, Perplexity AI, Mistral AI, Together AI + more
