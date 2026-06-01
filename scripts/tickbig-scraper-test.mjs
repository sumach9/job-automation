import { scrapeTickBig } from "../tickbigScraper.js";

console.log("Scraping TickBig jobs via Playwright…\n");
try {
  const jobs = await scrapeTickBig(process.env.TICKBIG_EMAIL, process.env.TICKBIG_PASSWORD, "", "", 1);
  console.log(`Found ${jobs.length} total jobs\n`);
  jobs.slice(0, 8).forEach((j, i) => {
    console.log(`[${i+1}] ${j.title}`);
    console.log(`     Company:  ${j.company}`);
    console.log(`     Location: ${j.location}`);
    console.log(`     Salary:   ${j.salary || "not listed"}`);
    console.log(`     Exp:      ${j.experience}`);
    console.log(`     Type:     ${j.jobType}`);
    console.log(`     Skills:   ${j.skills.slice(0,5).join(", ")}`);
    console.log();
  });
} catch(err) {
  console.error("Error:", err.message);
}
process.exit(0);
