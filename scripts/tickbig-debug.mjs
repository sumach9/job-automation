import dotenv from "dotenv"; dotenv.config();
import axios from "axios";

const EMAIL    = process.env.TICKBIG_EMAIL;
const PASSWORD = process.env.TICKBIG_PASSWORD;

// 1. Login
const loginRes = await axios.post(
  "https://api.tickbig.com/api/auth/login",
  { email: EMAIL, password: PASSWORD, loggedInWith: "email" },
  { headers: { "Content-Type": "application/json" }, timeout: 15_000 }
);
const token = loginRes.data?.data?.accessToken;
console.log("Login OK, token starts:", token?.slice(0, 30) + "â€¦");

// 2. Fetch jobs raw
const jobsRes = await axios.post(
  "https://api.tickbig.com/api/jobs?pageNo=1&limit=20&sort=false",
  { noticePeriod: [], experience: [], salary: [], designation: [], location: [], rating: [], skills: [], ppostedBy: [], subType: "Professional", adminFor: [] },
  { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, timeout: 20_000 }
);

console.log("Status:", jobsRes.status);
console.log("Response keys:", Object.keys(jobsRes.data));
console.log("data keys:", Object.keys(jobsRes.data?.data || {}));
const jobs = jobsRes.data?.data?.jobs;
console.log("jobs type:", typeof jobs, Array.isArray(jobs) ? `length=${jobs.length}` : "not array");
console.log("First job:", JSON.stringify(jobs?.[0])?.slice(0, 300));

