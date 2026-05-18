# CLAUDE.md — JobPilot Architecture Evolution Guide

## Project

JobPilot is a local-first AI-powered job automation platform that:
- searches jobs across multiple platforms
- scores job fit
- auto-applies using Playwright
- tracks applications
- sends email digests
- manages the user pipeline

Current architecture is MVP-ready but must evolve into a resilient workflow platform.

---

# Current Stack

## Backend
- Node.js 20
- Express

## Frontend
- React 18
- Vite

## Automation
- Playwright

## Resume Parsing
- pdf-parse
- mammoth

## Notifications
- Nodemailer

## Auth
- JWT

## Scheduler
- node-schedule

## Persistence
- data.json

---

# Core Architectural Goal

Transform JobPilot from:


```txt
single-process automation app
```



into:


```txt
fault-tolerant workflow orchestration platform
```



The system must:
- survive crashes
- recover workflows
- retry safely
- isolate failures
- support scaling
- support future ATS adapters
- support future AI providers

Reliability is more important than speed.

---

# Critical Architectural Problems To Solve

## 1. Eliminate Monolithic server.js

Current issue:
- routing
- scheduling
- orchestration
- state management
- automation coordination

are likely tightly coupled.

Required architecture:


```txt
API Layer
    ↓
Workflow Layer
    ↓
Queue Layer
    ↓
Worker Layer
    ↓
Automation Layer
```



Never place orchestration logic directly inside routes.

---

# 2. Replace data.json

Current issue:
- data.json acts as:
  - database
  - queue
  - workflow state
  - logs
  - persistence

This is unsafe for:
- concurrent writes
- browser crashes
- retries
- scaling

Required migration:

Preferred:

```txt
Postgres + Prisma
```



Acceptable MVP:

```txt
SQLite + Prisma
```



Store:
- jobs
- applications
- workflows
- browser sessions
- logs
- retries
- screenshots
- resume metadata

Never rely on in-memory state.

---

# 3. Add Queue System

Current issue:
- browser automation likely runs synchronously.

Required architecture:


```txt
Scheduler
    ↓
BullMQ Queue
    ↓
Workers
    ↓
Playwright
```



Required stack:
- BullMQ
- Redis

Benefits:
- retries
- concurrency control
- crash recovery
- delayed jobs
- dead-letter queues
- horizontal scaling

---

# 4. Add Workflow State Machine

Every application workflow must have explicit states.

Required states:


```yaml
states:
  - queued
  - analyzing
  - scraping
  - parsing_resume
  - filling_form
  - uploading_resume
  - validating
  - submitted
  - retrying
  - manual_review
  - completed
  - failed
```



Each step must persist state.

Never allow hidden transitions.

---

# 5. Introduce Browser Manager

Current issue:
- long-lived Playwright sessions eventually fail.

Required:


```txt
Browser Manager
```



Responsibilities:
- browser pooling
- context isolation
- browser recycling
- crash recovery
- cookie persistence
- worker TTL
- max jobs per browser

Never share browser state between workflows.

---

# 6. Convert ATS Logic Into Adapter Architecture

Current issue:
- atsScrapers.js will become unmaintainable.

Required structure:


```txt
adapters/
 ├── base/
 ├── linkedin/
 ├── greenhouse/
 ├── lever/
 ├── ashby/
 └── generic/
```



Each adapter must implement:


```ts
interface ATSAdapter {
  detect()
  scrape()
  apply()
  validate()
}
```



Workflow engine must interact only with adapter interfaces.

Never hardcode ATS logic inside orchestration.

---

# 7. Add Generic Form Fallback Engine

Dedicated ATS adapters are insufficient.

Required fallback chain:


```txt
Dedicated Adapter
    ↓
Generic Semantic Form Mapper
    ↓
AI DOM Classifier
    ↓
Manual Review
```



Generic engine responsibilities:
- detect form fields
- classify inputs semantically
- infer labels
- detect uploads
- identify required fields
- support dynamic forms

Use:
- aria-labels
- placeholders
- nearby text
- semantic HTML
- AI classification

---

# 8. Add Retry + Fallback Manager

Required centralized retry manager.

Features:
- exponential backoff
- retry budgets
- browser restart
- ATS fallback
- queue retry
- dead-letter queues

Never retry infinitely.

Required fallback philosophy:


```txt
Primary Strategy
    ↓
Retry
    ↓
Alternative Strategy
    ↓
Fallback Engine
    ↓
Manual Review
```



---

# 9. Add Structured Logging

Console logging is insufficient.

Every event must include:


```json
{
  "workflowId": "",
  "jobId": "",
  "platform": "",
  "step": "",
  "status": "",
  "retryCount": "",
  "browserId": "",
  "error": "",
  "fallbackUsed": "",
  "screenshot": ""
}
```



Logs must support:
- debugging
- replay
- observability
- metrics
- recovery

---

# 10. Add Checkpoint Recovery

Persist workflow progress after every critical step.

Example:


```txt
Step completed
→ persist checkpoint
```



Persist:
- browser session
- cookies
- DOM snapshot
- screenshots
- uploaded files
- workflow state
- retries

Recovery flow:


```txt
restart
→ restore workflow
→ continue from checkpoint
```



---

# 11. Add AI Provider Abstraction

Never tightly couple to one provider.

Required architecture:


```txt
AI Router
 ├── Anthropic
 ├── OpenAI
 ├── Gemini
 ├── DeepSeek
 └── Ollama
```



Required fallback rules:
- retry twice
- switch provider
- downgrade model if needed
- queue manual review if all fail

Persist AI conversation state across retries.

---

# 12. Improve Frontend Architecture

Current issue:

```txt
client/src/App.jsx
```



single-file frontend.

Required structure:


```txt
client/src/
 ├── pages/
 ├── components/
 ├── hooks/
 ├── stores/
 ├── services/
 ├── layouts/
 └── utils/
```



State management:
- Zustand preferred

---

# Recommended Final Architecture


```txt
Frontend
    ↓
API Gateway
    ↓
Workflow Engine
    ↓
Queue System
    ↓
Worker Pool
    ↓
ATS Adapter Layer
    ↓
Browser Manager
    ↓
Playwright
```



Supporting systems:
- AI Router
- Retry Manager
- Recovery Manager
- Auth Manager
- Metrics System
- Logging System

---

# Recommended Folder Structure


```txt
src/
 ├── api/
 ├── workflows/
 ├── queues/
 ├── workers/
 ├── browser/
 ├── adapters/
 │    ├── base/
 │    ├── linkedin/
 │    ├── greenhouse/
 │    ├── lever/
 │    ├── ashby/
 │    └── generic/
 │
 ├── ai/
 │    ├── router/
 │    ├── providers/
 │    └── prompts/
 │
 ├── parsing/
 ├── retry/
 ├── recovery/
 ├── auth/
 ├── logging/
 ├── metrics/
 ├── validation/
 ├── storage/
 └── notifications/
```



---

# Required Reliability Rules

## NEVER
- silently fail
- lose workflow state
- retry infinitely
- expose secrets in logs
- tightly couple AI to browser logic
- rely on one ATS strategy

## ALWAYS
- checkpoint workflows
- isolate browser contexts
- validate submissions
- support retries
- support fallback strategies
- support human intervention
- persist critical state

---

# Product Direction

JobPilot should evolve into:


```txt
local-first autonomous job workflow infrastructure
```



not:

```txt
simple AI apply bot
```


The platform should eventually support:
- semantic job understanding
- adaptive ATS learning
- intelligent resume variants
- recruiter outreach automation
- interview preparation
- AI confidence scoring
- autonomous workflow repair

---

# Priority Roadmap

## Phase 1 — Stability
- Replace data.json
- Add BullMQ + Redis
- Split server.js
- Add workflow states

## Phase 2 — Reliability
- Retry manager
- Browser manager
- Structured logs
- Checkpoint recovery

## Phase 3 — Scalability
- ATS adapter system
- Generic form engine
- AI router
- Worker pools

## Phase 4 — Product Moat
- Semantic memory
- Resume optimization
- AI outreach
- Adaptive automation
- Intelligent workflows

---

# Final Objective

Build a resilient AI automation platform that behaves like a distributed workflow system instead of a fragile browser bot.

The system must:
- recover automatically
- degrade gracefully
- isolate failures
- preserve user progress
- support human intervention
- scale horizontally
- support future ATS systems
- support future AI providers

Reliability > speed.
