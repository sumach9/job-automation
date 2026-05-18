// ─── Generic Semantic Form Mapper ─────────────────────────────────────────────
// Fallback adapter for any ATS not specifically supported.
// Uses aria-labels, placeholders, nearby text, and name attributes to infer
// what each field is asking for, then fills with profile data.

import { ATSAdapter } from "../base/adapter.js";
import { log } from "../../logging/logger.js";

// Keyword → profile field mapping
const FIELD_MAP = [
  { keys: ["first name", "firstname", "given name", "fname"], field: "firstName" },
  { keys: ["last name", "lastname", "surname", "lname", "family name"], field: "lastName" },
  { keys: ["full name", "your name", "name"], field: "name" },
  { keys: ["email", "e-mail", "email address"], field: "email" },
  { keys: ["phone", "mobile", "telephone", "cell"], field: "phone" },
  { keys: ["linkedin", "linkedin url", "linkedin profile"], field: "linkedinUrl" },
  { keys: ["website", "portfolio", "personal site", "github"], field: "website" },
  { keys: ["location", "city", "address", "current location"], field: "location" },
  { keys: ["years of experience", "years experience", "experience"], field: "yearsExperience" },
  { keys: ["current company", "current employer", "company"], field: "currentCompany" },
  { keys: ["salary", "expected salary", "desired salary", "compensation"], field: "expectedSalary" },
  { keys: ["cover letter", "additional information", "message", "why do you"], field: "coverLetter" },
];

export class GenericAdapter extends ATSAdapter {
  get name() { return "generic"; }

  async detect(page, url) {
    // Generic adapter handles anything — always true as last-resort
    return true;
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

    // Click Apply button if present
    const applyBtn = await this.findFirst(page, [
      "a:has-text('Apply for this job')",
      "a:has-text('Apply Now'):visible",
      "a:has-text('Apply now'):visible",
      "button:has-text('Apply for this job')",
      "button:has-text('Apply Now'):visible",
    ]);
    if (applyBtn) {
      await applyBtn.click();
      await this.waitForLoad(page);
    }

    // Gather all input fields
    const inputs = page.locator("input[type='text'], input[type='email'], input[type='tel'], input[type='url'], textarea");

    for (const input of await inputs.all()) {
      const label = await this._inferLabel(input, page);
      if (!label) continue;

      const profileValue = this._matchField(label, profile);
      if (profileValue) {
        await input.fill(String(profileValue)).catch(() => {});
      }
    }

    // Resume file input
    const resumeInput = page.locator("input[type='file']").first();
    if (await this.isVisible(resumeInput) && profile.resumePath) {
      await resumeInput.setInputFiles(profile.resumePath).catch(() => {});
    }

    // Check radio buttons for common "Yes" answers
    for (const radio of await page.locator("input[type='radio'][value='Yes'], input[type='radio'][value='yes']").all()) {
      await radio.check().catch(() => {});
    }

    // Submit
    const submitBtn = await this.findFirst(page, [
      "button[type='submit']:visible",
      "input[type='submit']:visible",
      "button:has-text('Submit'):visible",
      "button:has-text('Apply'):visible",
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
    ];
    return successPhrases.some(p => text.includes(p));
  }

  // ── Infer the semantic label for an input ──────────────────────────────────
  async _inferLabel(input, page) {
    const parts = [];

    // 1. aria-label
    const aria = await input.getAttribute("aria-label").catch(() => "");
    if (aria) parts.push(aria);

    // 2. placeholder
    const ph = await input.getAttribute("placeholder").catch(() => "");
    if (ph) parts.push(ph);

    // 3. name / id
    const name = await input.getAttribute("name").catch(() => "");
    const id   = await input.getAttribute("id").catch(() => "");
    if (name) parts.push(name.replace(/[_-]/g, " "));
    if (id)   parts.push(id.replace(/[_-]/g, " "));

    // 4. associated <label>
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
        // Derived fields
        if (field === "firstName") return profile.name?.split(" ")[0] || "";
        if (field === "lastName")  return profile.name?.split(" ").slice(1).join(" ") || "";
      }
    }
    return null;
  }
}
