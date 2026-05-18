// ─── Greenhouse ATS Adapter ───────────────────────────────────────────────────

import { ATSAdapter } from "../base/adapter.js";
import { log } from "../../logging/logger.js";

export class GreenhouseAdapter extends ATSAdapter {
  get name() { return "greenhouse"; }

  async detect(page, url) {
    return !!(url?.includes("greenhouse.io") || url?.includes("boards.greenhouse.io") ||
              url?.includes("grnh.se"));
  }

  async scrape(page, job) {
    await this.goto(page, job.applyUrl || job.url);
    await this.waitForLoad(page);
    const description = await page.locator("#content").innerText().catch(
      () => page.locator(".job-post").innerText().catch(() => "")
    );
    return { description: description.trim() };
  }

  async apply(page, job, profile) {
    // Navigate to the apply URL (usually already on it)
    const url = job.applyUrl || job.url;
    if (!page.url().includes("greenhouse.io")) {
      await this.goto(page, url);
      await this.waitForLoad(page);
    }

    // Greenhouse form fields
    const fields = {
      "#first_name": profile.firstName || profile.name?.split(" ")[0] || "",
      "#last_name":  profile.lastName  || profile.name?.split(" ").slice(1).join(" ") || "",
      "#email":      profile.email || "",
      "#phone":      profile.phone || "",
      "#job_application_location": profile.location || "",
      "input[id*='linkedin']": profile.linkedinUrl || "",
      "input[id*='website']":  profile.website || "",
    };

    for (const [sel, val] of Object.entries(fields)) {
      await this.fillIfExists(page, sel, val);
    }

    // Resume upload
    const resumeInput = page.locator("input[name='resume']").first();
    if (await this.isVisible(resumeInput) && profile.resumePath) {
      await resumeInput.setInputFiles(profile.resumePath).catch(() => {});
    }

    // Cover letter (optional textarea)
    if (profile.coverLetter) {
      await this.fillIfExists(page, "textarea[name='cover_letter']", profile.coverLetter);
    }

    // Demographic dropdowns — skip gracefully
    // Submit
    const submitBtn = await this.findFirst(page, [
      "input[type='submit'][value='Submit Application']",
      "button[type='submit']",
      "input[type='submit']",
    ]);
    if (!submitBtn) throw new Error("Greenhouse: submit button not found");
    await submitBtn.click();
    await this.waitForLoad(page);
  }

  async validate(page) {
    await page.waitForTimeout(2000);
    const success = [
      "h1:has-text('Application submitted')",
      "p:has-text('Thank you for your application')",
      ".confirmation-message",
    ];
    for (const sel of success) {
      if (await this.isVisible(page.locator(sel).first())) return true;
    }
    return page.url().includes("confirmation") || page.url().includes("thank");
  }
}
