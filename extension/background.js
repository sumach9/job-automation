/**
 * OneTouch Apply — Service Worker (Background)
 * Handles extension lifecycle, badge updates, and cross-tab communication.
 */

const API_BASE = "http://localhost:3004/api";

// ── Badge counter (total applications today) ──────────────────────────────────
let todayCount = 0;

function updateBadge() {
  chrome.action.setBadgeText({ text: todayCount > 0 ? String(todayCount) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#6366f1" });
}

// ── Listen for messages from content script or popup ─────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "JOB_APPLIED") {
    todayCount++;
    updateBadge();
    sendResponse({ ok: true });
  }

  if (msg.type === "GET_STATS") {
    fetch(`${API_BASE}/status`)
      .then((r) => r.json())
      .then((d) => sendResponse({ ok: true, stats: d.stats, settings: d.settings }))
      .catch(() => sendResponse({ ok: false }));
    return true; // async
  }

  if (msg.type === "GET_PROFILE") {
    chrome.storage.sync.get("profile", (d) => sendResponse({ profile: d.profile || null }));
    return true;
  }

  if (msg.type === "SAVE_PROFILE") {
    chrome.storage.sync.set({ profile: msg.profile }, () => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "OPEN_DASHBOARD") {
    chrome.tabs.create({ url: "http://localhost:3004" });
    sendResponse({ ok: true });
  }

  if (msg.type === "TRIGGER_SCAN") {
    fetch(`${API_BASE}/start`, { method: "POST" })
      .then((r) => r.json())
      .then((d) => sendResponse(d))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});

// ── Reset badge daily ─────────────────────────────────────────────────────────
function resetDailyCount() {
  const now = new Date();
  const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
  setTimeout(() => {
    todayCount = 0;
    updateBadge();
    setInterval(() => { todayCount = 0; updateBadge(); }, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}
resetDailyCount();

// ── On install: open onboarding ───────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
  }
});
