// Intercept the actual Authorization header the React app uses when fetching jobs
import { chromium } from "playwright";

const EMAIL    = "chidarasuma0209@gmail.com";
const PASSWORD = "&tSbbYP+XFF3_U9";

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
});

let capturedAuth = null;
let capturedCookies = "";

// Intercept all requests to api.tickbig.com
context.on("request", req => {
  if (req.url().includes("api.tickbig.com/api/jobs")) {
    const headers = req.headers();
    capturedAuth    = headers["authorization"] || null;
    capturedCookies = headers["cookie"] || "";
    console.log("\n=== JOBS REQUEST CAPTURED ===");
    console.log("URL:", req.url());
    console.log("Authorization:", headers["authorization"]?.slice(0, 60) + "…");
    console.log("Cookie:", (headers["cookie"] || "(none)").slice(0, 100));
    console.log("Origin:", headers["origin"] || "(none)");
    console.log("All headers:", JSON.stringify(headers, null, 2).slice(0, 800));
  }
});

const page = await context.newPage();
await page.goto("https://www.tickbig.com/signin", { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.waitForTimeout(1500);
await page.locator('input[name="emailOrPhone"], input[type="email"]').first().fill(EMAIL);
await page.locator('input[name="password"], input[type="password"]').first().fill(PASSWORD);
await page.locator("button.animeBtn, button[type='submit']").first().click();
try { await page.waitForURL("**/home**", { timeout: 20_000 }); } catch {}
await page.waitForTimeout(2000);

// Navigate to /jobs — this will trigger the React app to fetch jobs (we intercept it)
console.log("Navigating to /jobs to trigger jobs API call…");
await page.goto("https://www.tickbig.com/jobs", { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.waitForTimeout(3000);

// Also check localStorage
const ls = await page.evaluate(() => {
  const result = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    result[k] = localStorage.getItem(k)?.slice(0, 100);
  }
  return result;
});
console.log("\n=== localStorage ===");
console.log(JSON.stringify(ls, null, 2).slice(0, 1000));

// Check sessionStorage too
const ss = await page.evaluate(() => {
  const result = {};
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    result[k] = sessionStorage.getItem(k)?.slice(0, 100);
  }
  return result;
});
console.log("\n=== sessionStorage ===");
console.log(JSON.stringify(ss, null, 2).slice(0, 500));

// Now try making the request with the captured auth token
if (capturedAuth) {
  console.log("\n=== REPLAYING WITH CAPTURED TOKEN ===");
  const testResult = await page.evaluate(async ({ auth }) => {
    const res = await fetch("https://api.tickbig.com/api/jobs?pageNo=1&limit=10&sort=false", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": auth },
      body: JSON.stringify({ noticePeriod:[], experience:[], salary:[], designation:[], location:[], rating:[], skills:[], ppostedBy:[], subType:"Professional", adminFor:[] })
    });
    const text = await res.text();
    return { status: res.status, preview: text.slice(0, 500) };
  }, { auth: capturedAuth });
  console.log("Replay result:", JSON.stringify(testResult, null, 2));
}

await browser.close();
