import dotenv from "dotenv"; dotenv.config();
import axios from "axios";

const EMAIL    = process.env.TICKBIG_EMAIL;
const PASSWORD = process.env.TICKBIG_PASSWORD;

// 1. Login â€” capture Set-Cookie headers
const loginRes = await axios.post(
  "https://api.tickbig.com/api/auth/login",
  { email: EMAIL, password: PASSWORD, loggedInWith: "email" },
  {
    headers: { "Content-Type": "application/json" },
    withCredentials: true,
    timeout: 15_000,
  }
);

const token   = loginRes.data?.data?.accessToken;
const cookies = loginRes.headers["set-cookie"] || [];
console.log("Token:", token?.slice(0, 30) + "â€¦");
console.log("Set-Cookie:", cookies);

// 2. Try jobs with cookie jar
const cookieStr = cookies.map(c => c.split(";")[0]).join("; ");
console.log("Cookie header:", cookieStr || "(none)");

const jobsRes = await axios.post(
  "https://api.tickbig.com/api/jobs?pageNo=1&limit=10&sort=false",
  { noticePeriod: [], experience: [], salary: [], designation: [], location: [], rating: [], skills: [], ppostedBy: [], subType: "Professional", adminFor: [] },
  {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(cookieStr ? { Cookie: cookieStr } : {}),
    },
    timeout: 20_000,
  }
);

console.log("Jobs status:", jobsRes.status);
console.log("Jobs count:", jobsRes.data?.data?.jobs?.length);

