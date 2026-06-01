// Simulate the exact Writer.com application form Suma would fill
import dotenv from "dotenv"; dotenv.config();
import { aiMapFields } from "../src/ai/formMapper.js";

// Exact fields from the Writer.com application form (as Playwright would extract them)
const writerFormFields = [
  { id:"full_name",     name:"full_name",      type:"text",     placeholder:"",       label:"Full Name",                                                   ariaLabel:"", key:"full_name" },
  { id:"email",         name:"email",           type:"email",    placeholder:"",       label:"Email",                                                       ariaLabel:"", key:"email" },
  { id:"phone",         name:"phone",           type:"tel",      placeholder:"",       label:"Phone Number",                                                ariaLabel:"", key:"phone" },
  { id:"resume",        name:"resume",          type:"file",     placeholder:"",       label:"Resume",                                                      ariaLabel:"Upload File", key:"resume" },
  { id:"linkedin",      name:"linkedin",        type:"url",      placeholder:"",       label:"LinkedIn Profile",                                            ariaLabel:"", key:"linkedin" },
  { id:"portfolio",     name:"portfolio",       type:"url",      placeholder:"",       label:"Portfolio / Github URL",                                      ariaLabel:"", key:"portfolio" },
  // Radio groups — all radios in a group share the same "name"
  { id:"loc_sf",        name:"office_location", type:"radio",    placeholder:"",       label:"San Francisco (Union Square)",                                ariaLabel:"", key:"office_location", options:[{value:"sf",text:"San Francisco (Union Square)"},{value:"ny",text:"New York (1 Penn)"},{value:"seattle",text:"Seattle, Washington"},{value:"london",text:"London, UK"},{value:"relocate_yes",text:"No, but willing to relocate"},{value:"relocate_no",text:"No, and not willing to relocate"}] },
  { id:"inperson_yes",  name:"in_person",       type:"radio",    placeholder:"",       label:"Are you able and excited to join for in-person sessions 2-3 days/week?", ariaLabel:"", key:"in_person", options:[{value:"yes",text:"Yes"},{value:"no",text:"No"}] },
  { id:"over18_yes",    name:"over_18",         type:"radio",    placeholder:"",       label:"Are you at least 18 years of age?",                           ariaLabel:"", key:"over_18", options:[{value:"yes",text:"Yes"},{value:"no",text:"No"}] },
  { id:"work_auth_yes", name:"work_authorized", type:"radio",    placeholder:"",       label:"Are you legally authorized to work in the country?",          ariaLabel:"", key:"work_authorized", options:[{value:"yes",text:"Yes"},{value:"no",text:"No"}] },
  { id:"sponsor_yes",   name:"visa_sponsorship",type:"radio",    placeholder:"",       label:"Will you now or in the future require employment visa sponsorship?", ariaLabel:"", key:"visa_sponsorship", options:[{value:"yes",text:"Yes"},{value:"no",text:"No"}] },
  { id:"python_years",  name:"python_years",    type:"radio",    placeholder:"",       label:"How many years of Python experience do you have?",            ariaLabel:"", key:"python_years", options:[{value:"0-3",text:"0 - 3 years"},{value:"3-5",text:"3 - 5 years"},{value:"5-7",text:"5 - 7 years"},{value:"7+",text:"7+ years"}] },
  { id:"coding_pct",    name:"coding_pct",      type:"radio",    placeholder:"",       label:"What percentage of your day do you spend hands-on coding?",   ariaLabel:"", key:"coding_pct", options:[{value:"0",text:"0%"},{value:"25",text:"25%"},{value:"50",text:"50%"},{value:"75",text:"75%"},{value:"100",text:"100%"}] },
  { id:"why_writer",    name:"why_writer",      type:"textarea", placeholder:"Type here...", label:"Why are you interested in joining WRITER?",            ariaLabel:"", key:"why_writer" },
  { id:"cultural_val",  name:"cultural_val",    type:"textarea", placeholder:"Type here...", label:"Please give an example from your professional experience that aligns with one or more of our cultural values (Connect, Challenge, Own):", ariaLabel:"", key:"cultural_val" },
  { id:"gender",        name:"gender",          type:"radio",    placeholder:"",       label:"Gender",                                                      ariaLabel:"", key:"gender", options:[{value:"male",text:"Male"},{value:"female",text:"Female"},{value:"decline",text:"Decline to self-identify"}] },
  { id:"race",          name:"race",            type:"radio",    placeholder:"",       label:"Race / Ethnicity",                                            ariaLabel:"", key:"race", options:[{value:"asian",text:"Asian (Not Hispanic or Latino)"},{value:"white",text:"White (Not Hispanic or Latino)"},{value:"black",text:"Black or African American (Not Hispanic or Latino)"},{value:"hispanic",text:"Hispanic or Latino"},{value:"decline",text:"Decline to self-identify"}] },
  { id:"vet_status",    name:"vet_status",      type:"radio",    placeholder:"",       label:"Veteran Status",                                              ariaLabel:"", key:"vet_status", options:[{value:"protected",text:"I identify as one or more of the classifications of protected veteran listed above"},{value:"not_protected",text:"I am not a protected veteran"},{value:"decline",text:"I decline to self-identify for protected veteran status"}] },
];

// Profile values read from .env — no personal data hardcoded in source
const _name = process.env.APPLICANT_NAME || "Jane Doe";
const profile = {
  name: _name,
  firstName: _name.split(" ")[0],
  lastName:  _name.split(" ").slice(1).join(" "),
  email:     process.env.EMAIL_USER             || "you@example.com",
  phone:     process.env.APPLICANT_PHONE        || "",
  location:  process.env.APPLICANT_LOCATION     || "",
  linkedinUrl: process.env.APPLICANT_LINKEDIN_URL || "",
  website:   process.env.APPLICANT_WEBSITE      || "",
  yearsExperience: parseInt(process.env.APPLICANT_YEARS_EXPERIENCE || "5", 10),
  skills: (process.env.APPLICANT_SKILLS || "Python,SQL,Machine Learning,Data Science,Tableau,AWS,R,Spark").split(",").map(s => s.trim()),
  summary: process.env.APPLICANT_SUMMARY || "Experienced data scientist with 5+ years building ML models and analytics pipelines.",
  experiences: [],
  resumePath: process.env.RESUME_PATH || "",
  // Work auth & office
  isOver18: true, workAuthorized: true, requiresSponsorship: false,
  willingToRelocate: true, preferredOfficeHub: process.env.APPLICANT_LOCATION || "Seattle, Washington", inPersonOk: true,
  // EEO
  gender: "Decline to self-identify",
  race: "Decline to self-identify",
  veteranStatus: "I am not a protected veteran",
  // Skill questions
  pythonYears: "5 - 7 years", codingPercentage: "75%",
  whyJoinAnswer: "",
  culturalValuesAnswer: "",
};

const job = { title: "Senior Data Scientist", company: "WRITER" };

console.log("Mapping Writer.com application form with Groq…\n");
const mapping = await aiMapFields(writerFormFields, profile, job);

const labels = {
  full_name:"Full Name", email:"Email", phone:"Phone", resume:"Resume",
  linkedin:"LinkedIn", portfolio:"Portfolio/GitHub",
  office_location:"Office Location", in_person:"In-Person OK?",
  over_18:"Over 18?", work_authorized:"Work Authorized?", visa_sponsorship:"Needs Sponsorship?",
  python_years:"Python Years", coding_pct:"Coding %",
  why_writer:"Why WRITER?", cultural_val:"Cultural Values",
  gender:"Gender", race:"Race", vet_status:"Veteran Status",
};

console.log("─".repeat(65));
for (const [key, val] of Object.entries(mapping)) {
  const label = labels[key] || key;
  const display = String(val).length > 70 ? String(val).slice(0, 67) + "…" : String(val);
  console.log(`  ${label.padEnd(22)} → ${display}`);
}
console.log("─".repeat(65));
console.log(`  ${Object.keys(mapping).length} / ${writerFormFields.length} fields mapped\n`);
