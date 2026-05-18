// ─── LinkedIn Easy Apply Adapter ──────────────────────────────────────────────

import { ATSAdapter } from "../base/adapter.js";
import { log } from "../../logging/logger.js";
import path from "path";

const COOKIES_PATH = path.resolve("cookies/linkedin.json");

export class LinkedInAdapter extends ATSAdapter {
  get name() { return "linkedin"; }

  async detect(page, url) {
    return url?.includes("linkedin.com");
  }

  async scrape(page, job) {
    await this.goto(page, job.applyUrl || job.url);
    await this.waitForLoad(page);

    const description = await page.locator(".jobs-description__content").innerText().catch(() => "");
    return { description: description.trim() };
  }

  async apply(page, job, profile) {
    const url = job.applyUrl || job.url;
    await this.goto(page, url);
    await this.waitForLoad(page);

    // Click Easy Apply button
    const easyApplyBtn = await this.findFirst(page, [
      "button.jobs-apply-button",
      "button:has-text('Easy Apply')",
      "button:has-text('Apply')",
    ]);

    if (!easyApplyBtn) throw new Error("Easy Apply button not found");
    await easyApplyBtn.click();
    await page.waitForSelector(".jobs-easy-apply-modal", { timeout: 10_000 }).catch(() => {});

    // Multi-step form loop
    let step = 0;
    while (step < 20) {
      step++;
      await page.waitForTimeout(800);

      // Fill phone if present
      await this.fillIfExists(page, "input[id*='phoneNumber']", profile.phone);
      await this.fillIfExists(page, "input[id*='phone']", profile.phone);

      // Fill location if present
      await this.fillIfExists(page, "input[id*='location']", profile.location);
      await this.fillIfExists(page, "input[id*='city']", profile.location);

      // Upload resume if file input present
      const resumeInput = page.locator("input[type='file']").first();
      if (await this.isVisible(resumeInput) && profile.resumePath) {
        try { await resumeInput.setInputFiles(profile.resumePath); } catch {}
      }

      // Answer yes/no questions (default to "Yes" for authorisation questions)
      const radioYes = page.locator("input[type='radio'][value='Yes']");
      for (const r of await radioYes.all()) {
        await r.check().catch(() => {});
      }

      // Handle dropdowns — pick first non-empty option
      const selects = page.locator("select");
      for (const sel of await selects.all()) {
        const opts = await sel.locator("option").all();
        if (opts.length > 1) await sel.selectOption({ index: 1 }).catch(() => {});
      }

      // Try "Next" or "Review" button first, then "Submit"
      const nextBtn = await this.findFirst(page, [
        "button:has-text('Next')",
        "button:has-text('Review')",
        "button:has-text('Continue')",
      ]);

      if (nextBtn) {
        await nextBtn.click();
        continue;
      }

      const submitBtn = await this.findFirst(page, [
        "button:has-text('Submit application')",
        "button:has-text('Submit')",
      ]);

      if (submitBtn) {
        await submitBtn.click();
        await page.waitForTimeout(2000);
        return; // done
      }

      // No button found — assume done
      break;
    }
  }

  async validate(page) {
    await page.waitForTimeout(2000);
    const successSel = [
      "h3:has-text('application was sent')",
      "div:has-text('Your application was sent')",
      ".artdeco-inline-feedback--success",
    ];
    for (const sel of successSel) {
      if (await this.isVisible(page.locator(sel).first())) return true;
    }
    return false;
  }
}
