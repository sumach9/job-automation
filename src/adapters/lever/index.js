// ─── Lever ATS Adapter ────────────────────────────────────────────────────────

import { ATSAdapter } from "../base/adapter.js";

export class LeverAdapter extends ATSAdapter {
  get name() { return "lever"; }

  async detect(page, url) {
    return !!(url?.includes("lever.co") || url?.includes("jobs.lever.co"));
  }

  async scrape(page, job) {
    await this.goto(page, job.applyUrl || job.url);
    await this.waitForLoad(page);
    const description = await page.locator(".section-wrapper").innerText().catch(() => "");
    return { description: description.trim() };
  }

  async apply(page, job, profile) {
    const url = job.applyUrl || job.url;
    // Lever job pages have an "Apply" button leading to /apply
    if (!page.url().includes("/apply")) {
      await this.goto(page, url);
      await this.waitForLoad(page);
      const applyBtn = await this.findFirst(page, [
        "a:has-text('Apply for this job')",
        "a:has-text('Apply Now')",
        "a.postings-btn",
      ]);
      if (applyBtn) {
        await applyBtn.click();
        await this.waitForLoad(page);
      }
    }

    // Fill Lever form
    const fields = {
      "input[name='name']":     profile.name || "",
      "input[name='email']":    profile.email || "",
      "input[name='phone']":    profile.phone || "",
      "input[name='org']":      profile.currentCompany || "",
      "input[name='urls[LinkedIn]']": profile.linkedinUrl || "",
      "input[name='urls[portfolio]']": profile.website || "",
    };

    for (const [sel, val] of Object.entries(fields)) {
      await this.fillIfExists(page, sel, val);
    }

    // Resume upload
    const resumeInput = page.locator("input[type='file']").first();
    if (await this.isVisible(resumeInput) && profile.resumePath) {
      await resumeInput.setInputFiles(profile.resumePath).catch(() => {});
    }

    // Cover letter textarea
    if (profile.coverLetter) {
      await this.fillIfExists(page, "textarea[name='comments']", profile.coverLetter);
    }

    const submitBtn = await this.findFirst(page, [
      "button[type='submit']:has-text('Submit application')",
      "button[type='submit']",
    ]);
    if (!submitBtn) throw new Error("Lever: submit button not found");
    await submitBtn.click();
    await this.waitForLoad(page);
  }

  async validate(page) {
    await page.waitForTimeout(2000);
    const success = [
      "h2:has-text('Your application has been submitted')",
      ".success-message",
    ];
    for (const sel of success) {
      if (await this.isVisible(page.locator(sel).first())) return true;
    }
    return page.url().includes("thanks") || page.url().includes("confirmation");
  }
}
