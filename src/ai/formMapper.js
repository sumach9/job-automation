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

// ── System prompt sent to Groq/Claude ────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert job application assistant. Fill a web application form using the applicant's profile data.

INPUT:
1. Form fields JSON array — each field has: id, name, type, placeholder, label, ariaLabel, options (for selects/radios)
2. Applicant profile
3. Job title + company

OUTPUT RULES — return a SINGLE raw JSON object, no markdown:
- Keys = field "id" (prefer) or "name" attribute
- Values = exact string/value to fill

FIELD TYPE RULES:
• text / email / tel / url / textarea  → fill with the matching profile value
• type="file" → use key "_resume_upload" with value "USE_RESUME_PATH"
• select (dropdown) → use the matching option VALUE (not display text)
• radio button group → all radios share the same "name"; return { "name_attr": "value_to_select" }
• checkbox → "true" to check, "false" to leave unchecked

QUESTION PATTERN MATCHING:
• Full name / your name → profile.name
• First name → profile.firstName
• Last name → profile.lastName
• Email → profile.email
• Phone → profile.phone
• LinkedIn URL → profile.linkedinUrl
• Portfolio / GitHub → profile.website or profile.github
• Resume upload → "_resume_upload": "USE_RESUME_PATH"
• Years of Python / SQL / language experience → pick the matching range from profile.yearsExperience and skills
• What % of day coding → profile.codingPercentage (e.g. "75%")
• "Why are you interested in joining [company]?" → generate 2-3 genuine sentences using profile.summary, skills, and the company name
• "Example aligning with our values / cultural fit" → generate 2-3 sentences from profile.recentExperience showing ownership, collaboration, or innovation
• "Tell us about yourself" / "additional info" → profile.summary

LOCATION / OFFICE QUESTIONS:
• "Are you located within 50 miles of [city hubs]?" → pick the option matching profile.preferredOfficeHub; if not listed pick "No, but willing to relocate" if profile.willingToRelocate else "No, and not willing to relocate"
• "Can you work in-person 2-3 days/week?" → profile.inPersonOk → "Yes" or "No"

WORK AUTHORIZATION (always answer based on profile):
• "Are you at least 18?" → profile.isOver18 → "Yes" or "No"
• "Legally authorized to work?" / "work authorization" → profile.workAuthorized → "Yes" or "No"
• "Require visa sponsorship now or future?" → profile.requiresSponsorship → "Yes" or "No"

EEO / SELF-IDENTIFICATION (voluntary — use profile values, default to Decline):
• Gender → profile.gender (e.g. "Female", "Male", "Decline to self-identify")
• Race / ethnicity → profile.race (e.g. "Asian (Not Hispanic or Latino)", "Decline to self-identify")
• Veteran status → profile.veteranStatus (e.g. "I am not a protected veteran", "I decline to self-identify for protected veteran status")
• Disability status → profile.disability (e.g. "I don't wish to answer")

IMPORTANT:
- Never fill password, CAPTCHA, payment, or SSN fields
- For radio groups, return ONE entry per group: { "group_name": "selected_value" }
- Omit fields you cannot confidently map
- Output ONLY the raw JSON object — no explanation, no markdown fences`;

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
    // ── Work Authorization ──────────────────────────────────────────────────
    isOver18:              profile.isOver18            ?? true,
    workAuthorized:        profile.workAuthorized       ?? true,
    requiresSponsorship:   profile.requiresSponsorship  ?? false,
    // ── Location / Office ───────────────────────────────────────────────────
    preferredOfficeHub:    profile.preferredOfficeHub   || "Seattle, Washington",
    willingToRelocate:     profile.willingToRelocate    ?? true,
    inPersonOk:            profile.inPersonOk           ?? true,
    // ── EEO ─────────────────────────────────────────────────────────────────
    gender:                profile.gender               || "Decline to self-identify",
    race:                  profile.race                 || "Decline to self-identify",
    veteranStatus:         profile.veteranStatus        || "I am not a protected veteran",
    disability:            profile.disability           || "I don't wish to answer",
    // ── Skill detail questions ───────────────────────────────────────────────
    pythonYears:           profile.pythonYears          || "5 - 7 years",
    codingPercentage:      profile.codingPercentage     || "75%",
    // ── Pre-written open-text answers ────────────────────────────────────────
    whyJoinAnswer:         (profile.whyJoinAnswer        || "").slice(0, 600),
    culturalValuesAnswer:  (profile.culturalValuesAnswer || "").slice(0, 600),
    additionalInfo:        (profile.additionalInfo       || "").slice(0, 400),
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
