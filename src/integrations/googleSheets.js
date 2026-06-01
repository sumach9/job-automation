// ─── Google Sheets Integration ────────────────────────────────────────────────
// Syncs found jobs + applications to a user-owned Google Sheet.
//
// Setup (one-time):
//  1. Go to https://console.cloud.google.com → New project → Enable "Google Sheets API"
//  2. IAM & Admin → Service Accounts → Create → download JSON key
//  3. Open your Google Sheet → Share it with the service account email (Editor)
//  4. Copy the Sheet ID from the URL: .../spreadsheets/d/<SHEET_ID>/edit
//  5. Add to .env:
//       GOOGLE_SHEET_ID=your_sheet_id
//       GOOGLE_SERVICE_ACCOUNT_EMAIL=your-sa@project.iam.gserviceaccount.com
//       GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

import { google } from "googleapis";

// ── Auth ────────────────────────────────────────────────────────────────────
function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let   key   = process.env.GOOGLE_PRIVATE_KEY || "";

  if (!email || !key) return null;

  // .env files escape newlines as \n literal — restore them
  key = key.replace(/\\n/g, "\n");

  return new google.auth.JWT(
    email,
    null,
    key,
    ["https://www.googleapis.com/auth/spreadsheets"]
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function sheetId() {
  return process.env.GOOGLE_SHEET_ID || "";
}

export function isSheetsConfigured() {
  return !!(process.env.GOOGLE_SHEET_ID &&
            process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
            process.env.GOOGLE_PRIVATE_KEY);
}

// Ensure a named sheet tab exists; returns its sheetId (numeric)
async function ensureTab(sheets, spreadsheetId, tabName) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets.find(s => s.properties.title === tabName);
  if (existing) return existing.properties.sheetId;

  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: tabName } } }],
    },
  });
  return res.data.replies[0].addSheet.properties.sheetId;
}

// Write header row + data rows (clears the sheet first)
async function writeSheet(sheets, spreadsheetId, tabName, headers, rows) {
  const range = `${tabName}!A1`;
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${tabName}!A:Z` });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [headers, ...rows],
    },
  });
}

// ── Main sync function ───────────────────────────────────────────────────────
/**
 * Syncs jobs + applications to two tabs in the configured Google Sheet.
 *
 * @param {Array} foundJobs      - array of job objects (from server.js)
 * @param {Array} applications   - array of application objects
 * @returns {{ ok: boolean, jobsWritten: number, appsWritten: number, error?: string }}
 */
export async function syncToGoogleSheets(foundJobs = [], applications = []) {
  if (!isSheetsConfigured()) {
    return { ok: false, error: "Google Sheets not configured — add GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY to .env" };
  }

  const auth = getAuth();
  if (!auth) return { ok: false, error: "Failed to build Google auth client" };

  const sheets       = google.sheets({ version: "v4", auth });
  const spreadsheetId = sheetId();

  try {
    // ── Tab 1: All Found Jobs ──────────────────────────────────────────────
    await ensureTab(sheets, spreadsheetId, "Jobs Found");

    const jobHeaders = ["Title", "Company", "Location", "Platform", "Score", "Score Label", "Salary", "Easy Apply", "URL", "Found At"];
    const jobRows = [...foundJobs]
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .map(j => [
        j.title    || "",
        j.company  || "",
        j.location || "",
        j.platform || "",
        j.score    ?? "",
        j.scoreLabel || "",
        j.salary   || "",
        j.easyApply ? "Yes" : "No",
        j.applyUrl || j.url || "",
        j.savedAt  ? new Date(j.savedAt).toLocaleString() : "",
      ]);

    await writeSheet(sheets, spreadsheetId, "Jobs Found", jobHeaders, jobRows);

    // ── Tab 2: Applications ────────────────────────────────────────────────
    await ensureTab(sheets, spreadsheetId, "Applications");

    const appHeaders = ["Title", "Company", "Platform", "Status", "Score", "Applied At", "URL"];
    const appRows = [...applications]
      .sort((a, b) => new Date(b.appliedAt || 0) - new Date(a.appliedAt || 0))
      .map(a => [
        a.title    || "",
        a.company  || "",
        a.platform || "",
        a.status   || "",
        a.score    ?? "",
        a.appliedAt ? new Date(a.appliedAt).toLocaleString() : "",
        a.url      || a.applyUrl || "",
      ]);

    await writeSheet(sheets, spreadsheetId, "Applications", appHeaders, appRows);

    return { ok: true, jobsWritten: jobRows.length, appsWritten: appRows.length };

  } catch (err) {
    const msg = err?.response?.data?.error?.message || err.message;
    return { ok: false, error: msg };
  }
}
