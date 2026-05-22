// ─── AI Form Mapper ────────────────────────────────────────────────────────────
// Layer 2 of the 3-layer apply pipeline:
//   [Playwright extracts fields] → [Claude maps fields → profile] → [Playwright fills]
//
// Claude receives:
//   - Full form field metadata (id, name, type, placeholder, label, ariaLabel)
//   - Applicant resume/profile
//   - Job title + company (for cover letter context)
// Claude returns: JSON { field_key → value_to_fill }

import { aiRouter } from "./router/index.js";
import { log } from "../logging/logger.js";

// ── System prompt sent to Claude ─────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert job application assistant. Your task is to map an applicant's resume data to a web form's input fields.

You will receive:
1. A JSON array of form fields, each with: id, name, type, placeholder, label, ariaLabel
2. The applicant's profile/resume data
3. The job title and company name

Return a SINGLE valid JSON object where:
- Keys are the field "id" or "name" attribute (prefer "id" if present, else "name")
- Values are the exact strings to type into each field
- Omit fields you cannot confidently fill (passwords, CAPTCHA, unknown fields)
- For file upload fields (type="file"), use the key "_resume_upload" with value "USE_RESUME_PATH"
- For cover letter / message fields, write a brief 2-3 sentence cover letter
- For select/dropdown fields, use the most appropriate option value
- For checkboxes that mean "yes I agree" or "I am authorized to work", use "true"
- For years of experience fields, use a number string like "5"

Output ONLY the raw JSON object, no markdown, no explanation.`;

// ── Extract form field metadata from a Playwright page ───────────────────────
/**
 * Scans the page for all form inputs and returns structured metadata.
 * Handles regular DOM, shadow DOM (one level), and iframes.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<Array>} array of field descriptors
 */
export async function extractFormFields(page) {
  const fields = await page.evaluate(() => {
    function getFields(root) {
      const results = [];
      const elements = root.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select'
      );

      for (const el of elements) {
        // Skip invisible/disabled elements
        if (el.disabled) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;

        // Find associated label text
        let labelText = "";
        if (el.id) {
          const label = document.querySelector(`label[for="${el.id}"]`);
          if (label) labelText = label.innerText?.trim() || "";
        }
        if (!labelText && el.closest("label")) {
          labelText = el.closest("label").innerText?.replace(el.value || "", "").trim() || "";
        }

        // Look for adjacent text (previous sibling, parent label-like element)
        if (!labelText) {
          const parent = el.parentElement;
          if (parent) {
            // Check for common label patterns
            const prevSibling = el.previousElementSibling;
            if (prevSibling && ["LABEL", "SPAN", "DIV", "P"].includes(prevSibling.tagName)) {
              labelText = prevSibling.innerText?.trim().slice(0, 80) || "";
            }
          }
        }

        // Select options
        let options = [];
        if (el.tagName === "SELECT") {
          options = Array.from(el.options).map(o => ({ value: o.value, text: o.text })).slice(0, 20);
        }

        results.push({
          id:          el.id || "",
          name:        el.name || "",
          type:        el.type || el.tagName.toLowerCase(),
          placeholder: el.placeholder || "",
          ariaLabel:   el.getAttribute("aria-label") || "",
          label:       labelText,
          required:    el.required || false,
          options,
          // Key to use when filling
          key:         el.id || el.name || "",
        });
      }

      return results;
    }

    const mainFields = getFields(document);

    // Also scan one level of shadow DOM
    const shadowFields = [];
    document.querySelectorAll("*").forEach(el => {
      if (el.shadowRoot) {
        shadowFields.push(...getFields(el.shadowRoot));
      }
    });

    return [...mainFields, ...shadowFields].filter(f => f.key);
  });

  return fields;
}

// ── Ask Claude to map fields → profile values ─────────────────────────────────
/**
 * Sends form fields + profile to Claude and gets back a fill-mapping.
 *
 * @param {Array}  formFields  - output of extractFormFields()
 * @param {object} profile     - user profile from settings
 * @param {object} job         - job object (title, company, description)
 * @returns {Promise<object>}  mapping of { fieldKey: valueToFill }
 */
export async function aiMapFields(formFields, profile, job = {}) {
  if (formFields.length === 0) return {};

  // Build a compact profile summary for the prompt (avoid sending raw passwords etc.)
  const profileSummary = {
    name:             profile.name || `${profile.firstName || ""} ${profile.lastName || ""}`.trim(),
    firstName:        profile.firstName || profile.name?.split(" ")[0] || "",
    lastName:         profile.lastName  || profile.name?.split(" ").slice(1).join(" ") || "",
    email:            profile.email || "",
    phone:            profile.phone || "",
    location:         profile.location || "",
    linkedinUrl:      profile.linkedinUrl || "",
    website:          profile.website || profile.github || "",
    yearsExperience:  String(profile.yearsExperience || ""),
    currentCompany:   profile.currentCompany || profile.experiences?.[0]?.company || "",
    expectedSalary:   profile.expectedSalary || "",
    skills:           (profile.skills || []).slice(0, 15).join(", "),
    school:           profile.school || profile.education?.[0]?.school || "",
    degree:           profile.degree || profile.education?.[0]?.degree || "",
    summary:          (profile.summary || "").slice(0, 400),
    recentExperience: (profile.experiences || []).slice(0, 2).map(e =>
      `${e.title || ""} at ${e.company || ""} (${e.duration || ""})`).join("; "),
  };

  const prompt = `Job Title: ${job.title || "Software Engineer"}
Company: ${job.company || "the company"}

Applicant Profile:
${JSON.stringify(profileSummary, null, 2)}

Form Fields to Fill:
${JSON.stringify(formFields, null, 2)}

Map the profile data to these form fields and return the fill instructions as JSON.`;

  try {
    const raw = await aiRouter.complete(prompt, {
      system: SYSTEM_PROMPT,
      maxTokens: 1200,
    });

    // Strip markdown fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    const mapping = JSON.parse(cleaned);
    log.info(`AI form mapper: mapped ${Object.keys(mapping).length} fields for "${job.title}" @ ${job.company}`);
    return mapping;
  } catch (err) {
    log.warn(`AI form mapper failed: ${err.message} — falling back to keyword matching`);
    return {};
  }
}

// ── Apply the mapping to the page ─────────────────────────────────────────────
/**
 * Takes Claude's JSON mapping and fills the actual browser form fields.
 *
 * @param {import('playwright').Page} page
 * @param {object} mapping      - { fieldKey: value }
 * @param {object} profile      - needed for resume path
 * @param {Array}  formFields   - field descriptors (for type info)
 * @returns {Promise<{filled: number, skipped: number}>}
 */
export async function applyFieldMapping(page, mapping, profile, formFields = []) {
  let filled = 0;
  let skipped = 0;

  // Build a lookup of field descriptors by key
  const fieldMeta = {};
  for (const f of formFields) {
    if (f.key) fieldMeta[f.key] = f;
  }

  for (const [key, value] of Object.entries(mapping)) {
    if (!value || value === "null" || value === "undefined") { skipped++; continue; }

    // Resume upload handled separately
    if (key === "_resume_upload" || value === "USE_RESUME_PATH") {
      if (profile.resumePath) {
        const fileInput = page.locator(`input[type="file"]`).first();
        const visible = await fileInput.isVisible({ timeout: 1000 }).catch(() => false);
        if (visible) {
          await fileInput.setInputFiles(profile.resumePath).catch(() => {});
          log.debug(`AI mapper: uploaded resume for key "${key}"`);
          filled++;
        }
      }
      continue;
    }

    try {
      const meta = fieldMeta[key];
      const selector = key.match(/^[a-z_$][a-z0-9_$-]*$/i)
        ? `[id="${key}"], [name="${key}"]`
        : `[id='${key}'], [name='${key}']`;

      const el = page.locator(selector).first();
      const elVisible = await el.isVisible({ timeout: 1500 }).catch(() => false);
      if (!elVisible) { skipped++; continue; }

      const type = meta?.type || await el.getAttribute("type").catch(() => "text") || "text";

      if (type === "checkbox") {
        if (value === "true" || value === true) await el.check().catch(() => {});
      } else if (type === "radio") {
        // Find the radio with this value in the group
        const radio = page.locator(`input[type="radio"][name="${key}"][value="${value}"]`).first();
        if (await radio.isVisible({ timeout: 1000 }).catch(() => false)) {
          await radio.check().catch(() => {});
        }
      } else if (meta?.type === "select") {
        await el.selectOption({ label: value }).catch(async () => {
          await el.selectOption({ value }).catch(() => {});
        });
      } else {
        // Text / email / tel / textarea
        await el.fill(String(value)).catch(() => {});
      }

      log.debug(`AI mapper: filled "${key}" = "${String(value).slice(0, 50)}"`);
      filled++;
    } catch (err) {
      log.debug(`AI mapper: could not fill "${key}": ${err.message}`);
      skipped++;
    }
  }

  return { filled, skipped };
}
