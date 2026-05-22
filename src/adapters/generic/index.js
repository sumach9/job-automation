// ─── Generic AI-Powered Form Mapper ───────────────────────────────────────────
// Fallback adapter for any ATS not specifically supported.
//
// Strategy (in order):
//   1. AI mapping  — extract page fields → send to Claude → get JSON fill map → apply
//   2. Keyword matching fallback — if AI fails or no key configured
//
// This is the direct implementation of the architecture:
//   [Playwright extracts fields] → [Claude brain] → [Playwright fills]

import { ATSAdapter } from "../base/adapter.js";
import { log } from "../../logging/logger.js";
import { extractFormFields, aiMapFields, applyFieldMapping } from "../../ai/formMapper.js";

// ── Keyword → profile field fallback table ────────────────────────────────────
const FIELD_MAP = [
  { keys: ["first name", "firstname", "given name", "fname", "first_name"], field: "firstName" },
  { keys: ["last name", "lastname", "surname", "lname", "family name", "last_name"], field: "lastName" },
  { keys: ["full name", "your name", "applicant name"], field: "name" },
  { keys: ["email", "e-mail", "email address", "email_address"], field: "email" },
  { keys: ["phone", "mobile", "telephone", "cell", "phone number"], field: "phone" },
  { keys: ["linkedin", "linkedin url", "linkedin profile", "linkedin_url"], field: "linkedinUrl" },
  { keys: ["website", "portfolio", "personal site", "github", "portfolio url"], field: "website" },
  { keys: ["location", "city", "address", "current location", "where are you"], field: "location" },
  { keys: ["years of experience", "years experience", "how many years", "years_of_exp"], field: "yearsExperience" },
  { keys: ["current company", "current employer", "employer", "company", "organization"], field: "currentCompany" },
  { keys: ["salary", "expected salary", "desired salary", "compensation", "pay"], field: "expectedSalary" },
  { keys: ["cover letter", "additional information", "message", "why do you", "tell us", "about yourself"], field: "coverLetter" },
  { keys: ["school", "university", "college", "institution", "alma mater"], field: "school" },
  { keys: ["degree", "qualification", "education level"], field: "degree" },
  { keys: ["zip", "postal", "postcode", "zip code"], field: "zipCode" },
];

export class GenericAdapter extends ATSAdapter {
  get name() { return "generic"; }

  async detect(page, url) {
    return true;  // always handles anything as last resort
  }

  async scrape(page, job) {
    await this.goto(page, job.applyUrl || job.url);
    await this.waitForLoad(page);
    const body = await page.locator("body").innerText().catch(() => "");
    return { description: body.slice(0, 3000) };
  }

  async apply(page, job, profile) {
    const url = job.applyUrl || job.url;
    await this.goto(page, url);
    await this.waitForLoad(page);

    // Click Apply / Get Started / Continue button if landing page
    const applyBtn = await this.findFirst(page, [
      "a:has-text('Apply for this job')",
      "a:has-text('Apply Now'):visible",
      "a:has-text('Apply now'):visible",
      "a:has-text('Apply online'):visible",
      "button:has-text('Apply for this job')",
      "button:has-text('Apply Now'):visible",
      "button:has-text('Get Started'):visible",
      "button:has-text('Start Application'):visible",
    ]);
    if (applyBtn) {
      await applyBtn.click();
      await this.waitForLoad(page);
    }

    // ── Strategy 1: AI-powered mapping ────────────────────────────────────────
    let aiSuccess = false;
    if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) {
      try {
        log.info(`Generic adapter: running AI field mapper for ${job.title} @ ${job.company}`);
        const formFields = await extractFormFields(page);
        log.debug(`Generic adapter: extracted ${formFields.length} form fields`);

        if (formFields.length > 0) {
          const mapping = await aiMapFields(formFields, profile, job);
          if (Object.keys(mapping).length > 0) {
            const { filled, skipped } = await applyFieldMapping(page, mapping, profile, formFields);
            log.info(`Generic adapter AI: filled=${filled}, skipped=${skipped}`);
            aiSuccess = filled > 0;
          }
        }
      } catch (err) {
        log.warn(`Generic adapter: AI mapping error — ${err.message}`);
      }
    }

    // ── Strategy 2: Keyword fallback ──────────────────────────────────────────
    if (!aiSuccess) {
      log.info("Generic adapter: falling back to keyword matching");
      const inputs = page.locator(
        "input[type='text'], input[type='email'], input[type='tel'], input[type='url'], textarea"
      );

      for (const input of await inputs.all()) {
        const label = await this._inferLabel(input, page);
        if (!label) continue;
        const profileValue = this._matchField(label, profile);
        if (profileValue) {
          await input.fill(String(profileValue)).catch(() => {});
        }
      }
    }

    // ── Resume upload (both strategies need this) ─────────────────────────────
    if (profile.resumePath) {
      const fileInput = page.locator("input[type='file']").first();
      if (await this.isVisible(fileInput)) {
        await fileInput.setInputFiles(profile.resumePath).catch(() => {});
        log.debug("Generic adapter: uploaded resume");
      }
    }

    // ── Radio buttons — check "yes" for authorisation/EEO questions ───────────
    for (const radio of await page.locator(
      "input[type='radio'][value='Yes'], input[type='radio'][value='yes'], input[type='radio'][value='true']"
    ).all()) {
      await radio.check().catch(() => {});
    }

    // ── Multi-step form — handle Next/Continue buttons ────────────────────────
    let maxSteps = 5;
    while (maxSteps-- > 0) {
      const nextBtn = await this.findFirst(page, [
        "button:has-text('Next'):visible",
        "button:has-text('Continue'):visible",
        "button:has-text('Next Step'):visible",
        "button[aria-label*='Next']:visible",
      ]);
      if (!nextBtn) break;

      // Check if submit is also visible (don't click Next past it)
      const submitVisible = await page.locator(
        "button[type='submit']:visible, button:has-text('Submit'):visible"
      ).first().isVisible({ timeout: 500 }).catch(() => false);
      if (submitVisible) break;

      await nextBtn.click();
      await this.waitForLoad(page);

      // Re-run AI mapper on new step fields
      if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) {
        try {
          const stepFields = await extractFormFields(page);
          if (stepFields.length > 0) {
            const stepMapping = await aiMapFields(stepFields, profile, job);
            if (Object.keys(stepMapping).length > 0) {
              await applyFieldMapping(page, stepMapping, profile, stepFields);
            }
          }
        } catch {}
      }
    }

    // ── Submit ────────────────────────────────────────────────────────────────
    const submitBtn = await this.findFirst(page, [
      "button[type='submit']:visible",
      "input[type='submit']:visible",
      "button:has-text('Submit Application'):visible",
      "button:has-text('Submit'):visible",
      "button:has-text('Apply'):visible",
      "button:has-text('Send Application'):visible",
    ]);

    if (!submitBtn) {
      log.warn("Generic adapter: no submit button found");
      return;
    }
    await submitBtn.click();
    await this.waitForLoad(page);
  }

  async validate(page) {
    await page.waitForTimeout(2000);
    const text = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
    const successPhrases = [
      "application submitted",
      "application received",
      "thank you for applying",
      "thank you for your application",
      "successfully submitted",
      "we've received your application",
      "you've successfully applied",
      "application complete",
      "we will be in touch",
    ];
    return successPhrases.some(p => text.includes(p));
  }

  // ── Keyword fallback helpers ───────────────────────────────────────────────
  async _inferLabel(input, page) {
    const parts = [];
    const aria = await input.getAttribute("aria-label").catch(() => "");
    if (aria) parts.push(aria);
    const ph = await input.getAttribute("placeholder").catch(() => "");
    if (ph) parts.push(ph);
    const name = await input.getAttribute("name").catch(() => "");
    const id   = await input.getAttribute("id").catch(() => "");
    if (name) parts.push(name.replace(/[_-]/g, " "));
    if (id)   parts.push(id.replace(/[_-]/g, " "));
    if (id) {
      const labelText = await page.locator(`label[for="${id}"]`).innerText().catch(() => "");
      if (labelText) parts.push(labelText);
    }
    return parts.join(" ").toLowerCase().trim();
  }

  _matchField(label, profile) {
    for (const { keys, field } of FIELD_MAP) {
      if (keys.some(k => label.includes(k))) {
        const val = profile[field];
        if (val !== undefined && val !== null && val !== "") return val;
        if (field === "firstName") return profile.name?.split(" ")[0] || "";
        if (field === "lastName")  return profile.name?.split(" ").slice(1).join(" ") || "";
      }
    }
    return null;
  }
}
