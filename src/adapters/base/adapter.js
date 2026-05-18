// ─── Base ATS Adapter Interface ───────────────────────────────────────────────
// All platform adapters must extend this class.
// WorkflowEngine only calls methods on this interface.

export class ATSAdapter {
  /** Human-readable name */
  get name() { return "base"; }

  /**
   * Detect if this adapter can handle the given URL / page.
   * @param {import("playwright").Page} page
   * @param {string} url
   * @returns {Promise<boolean>}
   */
  async detect(page, url) {
    throw new Error(`${this.name}.detect() not implemented`);
  }

  /**
   * Scrape the full job description from the page.
   * @param {import("playwright").Page} page
   * @param {object} job — partial job record
   * @returns {Promise<object>} enriched job fields
   */
  async scrape(page, job) {
    throw new Error(`${this.name}.scrape() not implemented`);
  }

  /**
   * Fill and submit the application form.
   * @param {import("playwright").Page} page
   * @param {object} job
   * @param {object} profile — applicant profile
   * @returns {Promise<void>}
   */
  async apply(page, job, profile) {
    throw new Error(`${this.name}.apply() not implemented`);
  }

  /**
   * Validate that the submission was successful.
   * @param {import("playwright").Page} page
   * @returns {Promise<boolean>}
   */
  async validate(page) {
    throw new Error(`${this.name}.validate() not implemented`);
  }

  // ── Shared utilities ────────────────────────────────────────────────────────

  /** Navigate to URL with retry */
  async goto(page, url, opts = {}) {
    await page.goto(url, { timeout: 30_000, waitUntil: "domcontentloaded", ...opts });
  }

  /** Safe locator visibility check */
  async isVisible(locator) {
    try { return await locator.isVisible({ timeout: 2000 }); } catch { return false; }
  }

  /** Try multiple selectors, return first visible */
  async findFirst(page, selectors) {
    for (const sel of selectors) {
      const el = page.locator(sel).first();
      if (await this.isVisible(el)) return el;
    }
    return null;
  }

  /** Fill a field if it exists */
  async fillIfExists(page, selector, value) {
    if (!value) return false;
    try {
      const el = page.locator(selector).first();
      if (await this.isVisible(el)) {
        await el.fill(String(value));
        return true;
      }
    } catch {}
    return false;
  }

  /** Type slowly into a field (avoids detection) */
  async typeSlowly(locator, text, delayMs = 40) {
    await locator.click();
    await locator.fill("");
    await locator.type(text, { delay: delayMs });
  }

  /** Upload a file to a file input */
  async uploadFile(page, selector, filePath) {
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 5000 }),
      page.locator(selector).click(),
    ]);
    await fileChooser.setFiles(filePath);
  }

  /** Wait for navigation or network idle */
  async waitForLoad(page) {
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }
}
