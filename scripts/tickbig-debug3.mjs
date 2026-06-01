import dotenv from "dotenv"; dotenv.config();
import axios from "axios";

const EMAIL    = process.env.TICKBIG_EMAIL;
const PASSWORD = process.env.TICKBIG_PASSWORD;

// Login
const loginRes = await axios.post(
  "https://api.tickbig.com/api/auth/login",
  { email: EMAIL, password: PASSWORD, loggedInWith: "email" },
  { headers: { "Content-Type": "application/json", "Origin": "https://www.tickbig.com", "Referer": "https://www.tickbig.com/" }, timeout: 15_000 }
);
const token = loginRes.data?.data?.accessToken;
console.log("Token OK:", !!token);

// Try jobs with Origin + Referer to mimic browser
try {
  const jobsRes = await axios.post(
    "https://api.tickbig.com/api/jobs?pageNo=1&limit=10&sort=false",
    { noticePeriod: [], experience: [], salary: [], designation: [], location: [], rating: [], skills: [], ppostedBy: [], subType: "Professional", adminFor: [] },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Origin": "https://www.tickbig.com",
        "Referer": "https://www.tickbig.com/jobs",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      timeout: 20_000,
    }
  );
  console.log("Jobs status:", jobsRes.status);
  console.log("Jobs count:", jobsRes.data?.data?.jobs?.length);
} catch (err) {
  console.log("Error status:", err.response?.status);
  // Print error response body
  try {
    const body = err.response?.data;
    console.log("Error body:", JSON.stringify(body, null, 2));
  } catch {}
}

