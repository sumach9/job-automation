import dotenv from "dotenv"; dotenv.config();
import { scrapeTickBig } from "../tickbigScraper.js";

const EMAIL    = process.env.TICKBIG_EMAIL;
const PASSWORD = process.env.TICKBIG_PASSWORD;

console.log("Logging into TickBig and fetching Data Scientist jobsâ€¦\n");

try {
  const jobs = await scrapeTickBig(EMAIL, PASSWORD, "Data Scientist", "", 1);
  console.log(`Found ${jobs.length} jobs`);
  jobs.slice(0, 5).forEach((j, i) => {
    console.log(`\n[${i+1}] ${j.title} @ ${j.company}`);
    console.log(`     Location: ${j.location}`);
    console.log(`     Salary:   ${j.salary || "not listed"}`);
    console.log(`     Exp:      ${j.experience}`);
    console.log(`     Type:     ${j.jobType}`);
    console.log(`     Skills:   ${j.skills.slice(0,5).join(", ")}`);
  });

  if (jobs.length === 0) {
    // Try without title filter
    console.log("\nNo results with filter â€” fetching all jobs (first page)â€¦");
    const all = await scrapeTickBig(EMAIL, PASSWORD, "", "", 1);
    console.log(`All jobs: ${all.length}`);
    all.slice(0, 3).forEach((j, i) => console.log(`[${i+1}] ${j.title} @ ${j.company} â€” ${j.location}`));
  }
} catch (err) {
  console.error("Error:", err.message);
}

