import dotenv from "dotenv"; dotenv.config();
import { chromium } from "playwright";

const EMAIL    = process.env.TICKBIG_EMAIL;
const PASSWORD = process.env.TICKBIG_PASSWORD;

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
});
const page = await context.newPage();

// Login
await page.goto("https://www.tickbig.com/signin", { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.waitForTimeout(1500);
await page.locator('input[name="emailOrPhone"], input[type="email"]').first().fill(EMAIL);
await page.locator('input[name="password"], input[type="password"]').first().fill(PASSWORD);
await page.locator("button.animeBtn, button[type='submit']").first().click();
try { await page.waitForURL("**/home**", { timeout: 20_000 }); } catch {}
await page.waitForTimeout(2000);
console.log("Logged in, URL:", page.url());

// Now call the API from within the page context (so cookies are included)
const result = await page.evaluate(async () => {
  try {
    const res = await fetch("https://api.tickbig.com/api/jobs?pageNo=1&limit=10&sort=false", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        noticePeriod: [], experience: [], salary: [], designation: [], location: [],
        rating: [], skills: [], ppostedBy: [], subType: "Professional", adminFor: []
      })
    });
    const text = await res.text();
    return { status: res.status, body: text.slice(0, 1000) };
  } catch(e) {
    return { error: e.message };
  }
});

console.log("Fetch result:", JSON.stringify(result, null, 2));

await browser.close();

