import { chromium } from "playwright";
import fs from "fs";

const OUT = "C:/Users/polak/JobAutomation/screenshots";
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page    = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 860 });

await page.goto("http://localhost:3004", { waitUntil: "load" });
await page.waitForSelector("button.nav-link", { timeout: 12000 });
await page.waitForTimeout(600);

async function snap(label, filename) {
  const btns = await page.$$("button.nav-link");
  for (const btn of btns) {
    const txt = await btn.innerText();
    if (txt.toLowerCase().includes(label.toLowerCase())) { await btn.click(); break; }
  }
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${filename}.png` });
  console.log("✓", filename);
}

await snap("Dashboard",    "1-dashboard");
await snap("Pipeline",     "2-pipeline");
await snap("Jobs",         "3-jobs");
await snap("Applications", "4-applications");
await snap("Logs",         "5-logs");
await snap("Settings",     "6-settings");

// Popup
const p2 = await browser.newPage();
await p2.setViewportSize({ width: 360, height: 620 });
await p2.goto("file:///C:/Users/polak/JobAutomation/extension/popup.html");
await p2.waitForTimeout(700);
await p2.screenshot({ path: `${OUT}/7-popup.png` });
console.log("✓ popup");

await browser.close();
console.log("All done →", OUT);
