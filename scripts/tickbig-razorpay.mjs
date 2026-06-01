// â”€â”€â”€ TickBig Razorpay Payment Details Probe â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Logs in, clicks Apply, and extracts the Razorpay checkout details
// (amount, plan name, etc.) to confirm this is a paid apply model.

import { chromium } from "playwright";

import dotenv from "dotenv"; dotenv.config();
const EMAIL    = process.env.TICKBIG_EMAIL;
const PASSWORD = process.env.TICKBIG_PASSWORD;

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });

  // Intercept Razorpay options passed to window.Razorpay(...)
  // by hooking the constructor before page loads
  await context.addInitScript(() => {
    window.__razorpayOrders = [];
    const orig = window.Razorpay;
    Object.defineProperty(window, 'Razorpay', {
      get() { return orig; },
      set(constructor) {
        const wrapped = function(opts) {
          console.log('[RAZORPAY-INIT]', JSON.stringify(opts));
          window.__razorpayOrders.push(opts);
          return new constructor(opts);
        };
        Object.assign(wrapped, constructor);
        window.__razorpayOriginal = constructor;
        return window.__razorpayOriginal;
      },
      configurable: true,
    });
  });

  const page = await context.newPage();

  // Capture console messages
  const consoleLogs = [];
  page.on("console", msg => {
    const t = msg.text();
    consoleLogs.push(t);
    if (t.includes("RAZORPAY") || t.includes("razorpay") || t.includes("amount") || t.includes("order")) {
      console.log("  [PAGE-CONSOLE]", t.slice(0, 300));
    }
  });

  // Intercept network to grab Razorpay order creation call
  const razorpayRequests = [];
  page.on("request", req => {
    if (req.url().includes("razorpay") || req.url().includes("api.tickbig.com")) {
      razorpayRequests.push({ method: req.method(), url: req.url(), body: req.postData() });
    }
  });
  page.on("response", async res => {
    if (res.url().includes("api.tickbig.com") || res.url().includes("razorpay.com/v1/orders")) {
      try {
        const body = await res.json().catch(() => null);
        console.log(`\n  [API-RESPONSE] ${res.status()} ${res.url()}`);
        if (body) console.log("  BODY:", JSON.stringify(body).slice(0, 500));
      } catch {}
    }
  });

  // â”€â”€ Login â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("â†’ Logging inâ€¦");
  await page.goto("https://www.tickbig.com/signin", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(1500);

  await page.locator('input[name="emailOrPhone"], input[type="email"]').first().fill(EMAIL);
  await page.locator('input[name="password"], input[type="password"]').first().fill(PASSWORD);
  await page.locator("button.animeBtn, button[type='submit']").first().click();

  try { await page.waitForURL("**/home**", { timeout: 20_000 }); } catch {}
  console.log("âœ“ Logged in, URL:", page.url());
  await page.waitForTimeout(2000);

  // â”€â”€ Go to Jobs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("â†’ Going to /jobsâ€¦");
  await page.goto("https://www.tickbig.com/jobs", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(3000);

  // Grab full page HTML to find job cards
  const html = await page.content();
  const jobCardMatch = html.match(/jpfiCard[^"]*"[^>]*>([\s\S]{0,500})/);

  // Find all job titles
  const titles = await page.locator("[class*='title'], h2, h3, h4").allInnerTexts().catch(() => []);
  console.log("Page titles:", titles.filter(t => t.trim()).slice(0, 10));

  // Get job card count
  const cards = await page.locator("[class*='jpfiCard'], [class*='jobCard'], .job-card, [class*='card']").all();
  console.log(`Found ${cards.length} potential job cards`);

  // â”€â”€ Click Apply â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("â†’ Clicking Applyâ€¦");
  const applyBtn = await page.locator("button.jpfiCard__six-btn-1, button:has-text('Apply')").first();

  // Get the job context around this button
  const cardText = await applyBtn.evaluate(el => {
    const card = el.closest('[class*="card"], [class*="Card"], li, article, section') || el.parentElement?.parentElement;
    return card?.innerText?.slice(0, 300) || "";
  }).catch(() => "");
  console.log("  Job card context:", cardText.replace(/\n+/g, " | ").slice(0, 200));

  await applyBtn.click();
  await page.waitForTimeout(5000);  // wait for Razorpay to fully initialize

  // â”€â”€ Read results â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Check for Razorpay iframe
  const razorpayFrame = page.frameLocator('iframe[src*="razorpay"]');
  let frameTitle = "";
  let frameAmount = "";
  try {
    frameTitle  = await razorpayFrame.locator(".merchant-name, .header-merchant-name, [class*='merchant']").first().innerText({ timeout: 4000 });
    frameAmount = await razorpayFrame.locator(".amount, [class*='amount'], [class*='price']").first().innerText({ timeout: 4000 });
  } catch {}

  // Check all iframes
  const frames = page.frames();
  console.log(`\nFrames on page: ${frames.length}`);
  for (const f of frames) {
    const url = f.url();
    if (url && url !== "about:blank") {
      console.log("  Frame URL:", url.slice(0, 150));
    }
  }

  // Check for Razorpay backdrop / modal in main page
  const backdropHtml = await page.locator("#razorpay-backdrop, .razorpay-container, [id*='razorpay'], [class*='razorpay']").first().innerHTML({ timeout: 3000 }).catch(() => "");

  // Get Razorpay orders captured via hook
  const capturedOrders = await page.evaluate(() => window.__razorpayOrders || []).catch(() => []);

  // Get all tickbig API requests
  const tickbigCalls = razorpayRequests.filter(r => r.url.includes("api.tickbig.com"));

  // â”€â”€ Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("\nâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
  console.log("  TICKBIG API CALLS:");
  console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
  if (tickbigCalls.length === 0) {
    console.log("  (none)");
  } else {
    tickbigCalls.forEach(r => {
      console.log(`  [${r.method}] ${r.url}`);
      if (r.body) console.log("    BODY:", r.body.slice(0, 300));
    });
  }

  console.log("\nâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
  console.log("  RAZORPAY ORDERS CAPTURED:");
  console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
  if (capturedOrders.length === 0) {
    console.log("  (none â€” hook may have missed initialization)");
  } else {
    capturedOrders.forEach(o => console.log(" ", JSON.stringify(o, null, 2)));
  }

  console.log("\nâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
  console.log("  RAZORPAY IFRAME/MODAL:");
  console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
  console.log("  Frame title:", frameTitle || "(empty)");
  console.log("  Frame amount:", frameAmount || "(empty)");
  console.log("  Backdrop HTML snippet:", backdropHtml.slice(0, 300) || "(empty)");

  // Last resort: grab anything on page that looks like a price
  const pageText = await page.innerText("body").catch(() => "");
  const priceMatch = pageText.match(/â‚¹[\d,]+|Rs\.?\s*[\d,]+|INR\s*[\d,]+|amount[:\s]*[\d,]+/gi);
  console.log("\n  Price patterns found on page:", priceMatch?.slice(0, 10) || "(none)");

  // Any modal text
  const modalText = await page.locator("[class*='modal'], [class*='dialog'], [role='dialog']").first().innerText({ timeout: 2000 }).catch(() => "");
  if (modalText) {
    console.log("\n  MODAL TEXT:", modalText.slice(0, 400));
  }

  console.log("\nâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
  console.log("  CURRENT URL:", page.url());
  console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n");

  await browser.close();
})();

