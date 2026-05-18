// ─── Ashby ATS Adapter ────────────────────────────────────────────────────────

import { ATSAdapter } from "../base/adapter.js";

export class AshbyAdapter extends ATSAdapter {
  get name() { return "ashby"; }

  async detect(page, url) {
    return !!(url?.includes("ashbyhq.com") || url?.includes("jobs.ashbyhq.com"));
  }

  async scrape(page, job) {
    await this.goto(page, job.applyUrl || job.url);
    await this.waitForLoad(page);
    const description = await page.locator("[data-testid='job-description']").innerText()
      .catch(() => page.locator(".job-description").innerText().catch(() => ""));
    return { description: description.trim() };
  }

  async apply(page, job, profile) {
    const url = job.applyUrl || job.url;
    await this.goto(page, url);
    await this.waitForLoad(page);

    // Click Apply button if present
    const applyBtn = await this.findFirst(page, [
      "button:has-text('Apply')",
      "a:has-text('Apply')",
    ]);
    if (applyBtn) {
      await applyBtn.click();
      await this.waitForLoad(page);
    }

    // Ashby form — field names vary; use label-based approach
    const textInputs = page.locator("input[type='text'], input[type='email'], input[type='tel']");
    for (const input of await textInputs.all()) {
      const id    = await input.getAttribute("id").catch(() => "");
      const name  = await input.getAttribute("name").catch(() => "");
      const label = (id + " " + name).toLowerCase();

      if (label.includes("first") || label.includes("fname"))
        await input.fill(profile.firstName || profile.name?.split(" ")[0] || "").catch(() => {});
      else if (label.includes("last") || label.includes("lname"))
        await input.fill(profile.lastName || profile.name?.split(" ").slice(1).join(" ") || "").catch(() => {});
      else if (label.includes("email"))
        await input.fill(profile.email || "").catch(() => {});
      else if (label.includes("phone"))
        await input.fill(profile.phone || "").catch(() => {});
      else if (label.includes("linkedin"))
        await input.fill(profile.linkedinUrl || "").catch(() => {});
      else if (label.includes("location") || label.includes("city"))
        await input.fill(profile.location || "").catch(() => {});
    }

    // Resume upload
    const resumeInput = page.locator("input[type='file']").first();
    if (await this.isVisible(resumeInput) && profile.resumePath) {
      await resumeInput.setInputFiles(profile.resumePath).catch(() => {});
    }

    const submitBtn = await this.findFirst(page, [
      "button[type='submit']",
      "button:has-text('Submit')",
      "button:has-text('Apply')",
    ]);
    if (!submitBtn) throw new Error("Ashby: submit button not found");
    await submitBtn.click();
    await this.waitForLoad(page);
  }

  async validate(page) {
    await page.waitForTimeout(2000);
    const success = [
      "h1:has-text('Application submitted')",
      "p:has-text('successfully submitted')",
      "[data-testid='confirmation']",
    ];
    for (const sel of success) {
      if (await this.isVisible(page.locator(sel).first())) return true;
    }
    return page.url().includes("confirmation") || page.url().includes("success");
  }
}
