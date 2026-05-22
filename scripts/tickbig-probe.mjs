// ─── TickBig Apply Flow Probe ────────────────────────────────────────────────
// Logs in, navigates to /jobs, clicks Apply on the first job card, and
// captures ALL network + WebSocket traffic to understand the apply mechanism.

import { chromium } from "playwright";

const EMAIL    = "chidarasuma0209@gmail.com";
const PASSWORD = "&tSbbYP+XFF3_U9";

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });

  // ── Capture all network requests ──────────────────────────────────────────
  const networkLog = [];
  context.on("request", req => {
    networkLog.push({ type: "request", method: req.method(), url: req.url(), time: Date.now() });
  });
  context.on("response", res => {
    networkLog.push({ type: "response", status: res.status(), url: res.url(), time: Date.now() });
  });

  const page = await context.newPage();

  // ── Intercept WebSocket frames via CDP ────────────────────────────────────
  const wsMessages = [];
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");

  cdp.on("Network.webSocketFrameSent", ({ requestId, timestamp, response }) => {
    wsMessages.push({ dir: "SENT", ts: timestamp, payload: response.payloadData });
  });
  cdp.on("Network.webSocketFrameReceived", ({ requestId, timestamp, response }) => {
    wsMessages.push({ dir: "RECV", ts: timestamp, payload: response.payloadData });
  });
  cdp.on("Network.webSocketCreated", ({ requestId, url }) => {
    console.log(`\n🔌 WebSocket opened: ${url}`);
  });

  // ── Step 1: Login ──────────────────────────────────────────────────────────
  console.log("→ Navigating to TickBig login…");
  await page.goto("https://www.tickbig.com/signin", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(2000);

  // Take screenshot of login page
  await page.screenshot({ path: "scripts/tb-01-login.png" });

  const emailInput = await page.locator('input[name="emailOrPhone"], input[type="email"], input[placeholder*="email" i]').first();
  await emailInput.fill(EMAIL);
  await page.waitForTimeout(500);

  const passInput = await page.locator('input[name="password"], input[type="password"]').first();
  await passInput.fill(PASSWORD);
  await page.waitForTimeout(500);

  await page.screenshot({ path: "scripts/tb-02-filled.png" });

  const loginBtn = await page.locator("button.animeBtn, button[type='submit'], button:has-text('Sign'), button:has-text('Login')").first();
  await loginBtn.click();

  console.log("→ Waiting for redirect after login…");
  try {
    await page.waitForURL("**/home**", { timeout: 20_000 });
    console.log("✓ Logged in — on /home");
  } catch {
    console.log("⚠ No /home redirect, current URL:", page.url());
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "scripts/tb-03-after-login.png" });

  // ── Step 2: Go to Jobs ────────────────────────────────────────────────────
  console.log("→ Navigating to /jobs…");
  await page.goto("https://www.tickbig.com/jobs", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "scripts/tb-04-jobs.png" });

  // Grab job card titles for reference
  const jobTitles = await page.locator(".jpfiCard__title, h3, h2, .job-title, [class*='title']")
    .allInnerTexts().catch(() => []);
  console.log("Job titles found:", jobTitles.slice(0, 5));

  // ── Step 3: Clear network log, then click Apply ───────────────────────────
  networkLog.length = 0;
  wsMessages.length = 0;
  const snapBefore = Date.now();

  console.log("→ Looking for Apply button…");
  const applyBtn = await page.locator("button.jpfiCard__six-btn-1, button:has-text('Apply'), a:has-text('Apply')").first();
  const btnText = await applyBtn.innerText().catch(() => "?");
  console.log(`  Found button: "${btnText.trim()}"`);

  await page.screenshot({ path: "scripts/tb-05-before-apply.png" });

  // Inject Socket.IO message interceptor BEFORE clicking
  await page.evaluate(() => {
    window.__wsCapture = [];
    const origWS = window.WebSocket;
    window.WebSocket = function(url, proto) {
      const ws = new origWS(url, proto);
      console.log("[WS-INTERCEPT] created:", url);
      ws.addEventListener("message", e => {
        console.log("[WS-MSG-RECV]", e.data);
        window.__wsCapture.push({ dir: "recv", data: e.data, t: Date.now() });
      });
      const origSend = ws.send.bind(ws);
      ws.send = function(data) {
        console.log("[WS-MSG-SENT]", data);
        window.__wsCapture.push({ dir: "sent", data: String(data), t: Date.now() });
        return origSend(data);
      };
      return ws;
    };
    Object.assign(window.WebSocket, origWS);
  });

  console.log("→ Clicking Apply…");
  await applyBtn.click();
  await page.waitForTimeout(4000);   // wait for any modal / redirect / WS message

  await page.screenshot({ path: "scripts/tb-06-after-apply.png" });

  // ── Step 4: Capture console logs ──────────────────────────────────────────
  const consoleLogs = [];
  page.on("console", msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

  // Wait a bit more for any delayed messages
  await page.waitForTimeout(2000);

  // Read WS messages injected via page script
  const pageWS = await page.evaluate(() => window.__wsCapture || []).catch(() => []);

  // ── Step 5: Report ────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  NETWORK REQUESTS after Apply click:");
  console.log("════════════════════════════════════════════════════════════");
  const relevant = networkLog.filter(r => r.time > snapBefore);
  if (relevant.length === 0) {
    console.log("  (none — no HTTP requests fired)");
  } else {
    relevant.forEach(r => console.log(` ${r.type.toUpperCase()} [${r.status||r.method}] ${r.url}`));
  }

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  WEBSOCKET FRAMES (CDP) after Apply click:");
  console.log("════════════════════════════════════════════════════════════");
  if (wsMessages.length === 0) {
    console.log("  (none captured via CDP)");
  } else {
    wsMessages.forEach(m => console.log(` [${m.dir}] ${m.payload}`));
  }

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  WEBSOCKET FRAMES (page intercept) after Apply click:");
  console.log("════════════════════════════════════════════════════════════");
  if (pageWS.length === 0) {
    console.log("  (none — WS either not yet open or messages pre-date inject)");
  } else {
    pageWS.forEach(m => console.log(` [${m.dir}] ${m.data}`));
  }

  // Check for Razorpay / payment modal
  const razorpayVisible = await page.locator("#razorpay-backdrop, iframe[src*='razorpay'], .razorpay-container").isVisible({ timeout: 2000 }).catch(() => false);
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  RAZORPAY MODAL VISIBLE:", razorpayVisible);

  // Check current URL
  console.log("  CURRENT URL:", page.url());

  // Check for any modal / dialog that appeared
  const modalText = await page.locator(".modal, [class*='modal'], [class*='dialog'], [role='dialog']").first().innerText({ timeout: 2000 }).catch(() => "");
  if (modalText) {
    console.log("\n  MODAL TEXT:\n", modalText.slice(0, 500));
  }

  console.log("════════════════════════════════════════════════════════════\n");
  console.log("Screenshots saved to scripts/tb-0*.png");
  console.log("Keeping browser open for 15s for manual inspection…");

  await page.waitForTimeout(15_000);
  await browser.close();
})();
