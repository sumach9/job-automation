// ─── AI Form Mapper Integration Test ─────────────────────────────────────────
// Uses aiMapFields() directly (without browser) to test Claude's field mapping.
// Simulates what Playwright would extract from a typical job application form.

import { aiMapFields } from "../src/ai/formMapper.js";
import dotenv from "dotenv";
dotenv.config();

const mockFormFields = [
  { id: "first_name",    name: "first_name",    type: "text",     placeholder: "First Name",     ariaLabel: "",              label: "First Name",      key: "first_name"    },
  { id: "last_name",     name: "last_name",      type: "text",     placeholder: "Last Name",      ariaLabel: "",              label: "Last Name",       key: "last_name"     },
  { id: "email",         name: "email",          type: "email",    placeholder: "Email",          ariaLabel: "Email Address", label: "Email",           key: "email"         },
  { id: "phone",         name: "phone",          type: "tel",      placeholder: "+1 (555) 000-0000", ariaLabel: "",           label: "Phone",           key: "phone"         },
  { id: "resume",        name: "resume",         type: "file",     placeholder: "",               ariaLabel: "Upload Resume", label: "Resume / CV",     key: "resume"        },
  { id: "cover_letter",  name: "cover_letter",   type: "textarea", placeholder: "Tell us why you're excited about this role…", ariaLabel: "", label: "Cover Letter", key: "cover_letter"  },
  { id: "linkedin_url",  name: "linkedin_url",   type: "url",      placeholder: "https://linkedin.com/in/...", ariaLabel: "", label: "LinkedIn Profile URL", key: "linkedin_url" },
  { id: "github_url",    name: "github_url",     type: "url",      placeholder: "https://github.com/...", ariaLabel: "",     label: "GitHub",          key: "github_url"    },
  { id: "years_exp",     name: "years_exp",      type: "text",     placeholder: "e.g. 5",         ariaLabel: "",              label: "Years of Experience", key: "years_exp" },
  { id: "salary_exp",    name: "salary_exp",     type: "text",     placeholder: "e.g. $120,000",  ariaLabel: "",              label: "Expected Salary", key: "salary_exp"   },
  { id: "work_auth",     name: "work_auth",       type: "select",  placeholder: "",               ariaLabel: "",              label: "Work Authorization", key: "work_auth", options: [{ value: "", text: "Select…" }, { value: "citizen", text: "US Citizen" }, { value: "gc", text: "Green Card" }, { value: "visa", text: "Work Visa" }] },
];

const mockProfile = {
  name:            "Suma Chidara",
  firstName:       "Suma",
  lastName:        "Chidara",
  email:           "chidarasuma0209@gmail.com",
  phone:           "8017840516",
  location:        "Seattle, WA",
  linkedinUrl:     "https://linkedin.com/in/sumachidara",
  website:         "https://github.com/sumachidara",
  yearsExperience: 5,
  expectedSalary:  "$110,000",
  skills:          ["Python", "SQL", "Machine Learning", "Data Science", "Tableau", "AWS"],
  summary:         "Data scientist with 5 years experience in ML, NLP and data engineering.",
  resumePath:      "C:\\Users\\polak\\software\\Suma\\suma chidara_Data scientist.docx.pdf",
};

const mockJob = {
  title:   "Senior Data Scientist",
  company: "Acme Analytics",
};

console.log("🧠 Running AI form mapper test…");
console.log("   API key present:", !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY));
console.log();

const mapping = await aiMapFields(mockFormFields, mockProfile, mockJob);

console.log("📋 Claude's field mapping:");
console.log("─".repeat(60));
for (const [key, val] of Object.entries(mapping)) {
  const display = String(val).length > 80 ? String(val).slice(0, 77) + "…" : String(val);
  console.log(`  ${key.padEnd(20)} → ${display}`);
}
console.log("─".repeat(60));
console.log(`  Total: ${Object.keys(mapping).length} fields mapped`);
