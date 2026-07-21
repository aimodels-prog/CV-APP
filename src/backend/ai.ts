import { GoogleGenAI, Type, Schema } from '@google/genai';
import { ALL_PRIMARY_POSITIONS } from '../lib/constants.ts';

function getAI() {
  const rawKey = process.env.GEMINI_API_KEY || "";
  const apiKey = rawKey.trim();
  console.log("getAI called. apiKey length:", apiKey.length, "Starts with:", apiKey.substring(0, 5));
  if (!apiKey) {
    console.warn("Valid API KEY is not set.");
  }
  return new GoogleGenAI(apiKey ? { apiKey } : {});
}

function parseGenAIJSON(responseText: string): any {
  let cleanedText = responseText.trim();
  cleanedText = cleanedText.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '');
  cleanedText = cleanedText.replace(/,\s*([\]}])/g, '$1'); // Fix numeric/trailing commas
  try {
    return JSON.parse(cleanedText);
  } catch (err) {
    // Attempt missing bracket/quote recovery for truncated JSON
    const recoverEndings = [
      '"}',
      '"]}',
      '"}]}',
      '"]}]}',
      '}',
      ']}',
      '}]}',
      ']}]}'
    ];
    for (let ending of recoverEndings) {
      try {
        return JSON.parse(cleanedText + ending);
      } catch (e) {}
    }
    throw err;
  }
}

function parseStrictGenAIJSON(responseText: string, label: string): any {
  const cleanedText = responseText
    .trim()
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/\n?```$/, "");
  if (!cleanedText) {
    throw new Error(`${label} returned an empty response.`);
  }
  try {
    return JSON.parse(cleanedText);
  } catch {
    throw new Error(
      `${label} returned incomplete or invalid JSON. The result was rejected to prevent partial tender extraction.`,
    );
  }
}

function assertCompleteGenAIResponse(response: any, label: string) {
  const finishReason = String(
    response?.candidates?.[0]?.finishReason ||
      response?.candidates?.[0]?.finish_reason ||
      "",
  ).toUpperCase();
  if (
    finishReason &&
    finishReason !== "STOP" &&
    finishReason !== "FINISH_REASON_UNSPECIFIED"
  ) {
    throw new Error(
      `${label} did not finish normally (${finishReason}). The partial result was rejected.`,
    );
  }
  if (!String(response?.text || "").trim()) {
    throw new Error(`${label} returned no extractable response text.`);
  }
}

const matchSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    matches: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          expertId: { type: Type.STRING },
          expertName: { type: Type.STRING },
          primaryPosition: { type: Type.STRING },
          score: { type: Type.NUMBER },
          match_summary: { type: Type.STRING },
          strong_points: { type: Type.ARRAY, items: { type: Type.STRING } },
          missing_requirements: { type: Type.ARRAY, items: { type: Type.STRING } },
          scoring_rationale: { type: Type.STRING, description: "Explanation of relative scoring compared to other evaluated candidates (e.g., why a candidate is 95% instead of 100% when both meet all criteria but one has 15 yrs vs 11 yrs of experience)." },
          met_team_constraints: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of global team-level constraints from the tender that this specific candidate satisfies (if any)." },
          recommended_projects_to_highlight: { type: Type.ARRAY, items: { type: Type.STRING } },
          risk_level: { type: Type.STRING, enum: ["LOW", "MEDIUM", "HIGH"] }
        }
      }
    }
  }
};

const cvSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    experts: {
      type: Type.ARRAY,
      description: "List of experts found in the text",
      items: {
        type: Type.OBJECT,
        required: [
          "fullName", "primary_position", "role", "location", "countries", 
          "educationLevel", "experienceYears", "skills", "software", 
          "dateOfBirth", "countryOfCitizenship", "profileSummary", "experiences", "adequacy_experience"
        ],
        properties: {
          fullName: { type: Type.STRING, description: "CRITICAL: The full legal name of the expert. You must find this in the CV. Do NOT output 'null' or 'unknown' if a name exists." },
          role: { type: Type.STRING, description: "The category from the official taxonomy that best describes the expert's career (e.g., Civil Engineer). Keep it short." },
          primary_position: { type: Type.STRING, description: "The specific, most recent job title held by the expert as stated in the CV (e.g., Senior Infrastructure Manager)." },
          location: { type: Type.STRING, description: "The current residential or professional location/country. If not listed explicitly, infer from the most recent work experience location." },
          countries: { type: Type.ARRAY, items: { type: Type.STRING }, description: "All countries where the expert has proven professional reach or residency." },
          educationLevel: { type: Type.STRING, description: "CRITICAL: The highest completed academic qualification LEVEL only. Use a concise category such as 'PhD', 'Doctorate', 'Master Degree', 'Bachelor Degree', 'Postgraduate Diploma', 'Higher National Diploma', 'Diploma', or 'Certificate'. NEVER include the course, major, field of study, institution, or year here; those belong in metadata.educations." },
          experienceYears: { type: Type.INTEGER, description: "The total number of years of professional experience calculated from employment history." },
          type: { type: Type.STRING, enum: ["Internal", "External"], description: "Whether the expert is a permanent staff member (Internal) or an independent consultant/external candidate (External). If not mentioned, leave null." },
          skills: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Specific technical or soft skills (e.g., AutoCAD, Project Management)." },
          software: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Proficiency in specific software or digital tools." },
          training_courses: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Certifications, non-degree training, or short courses." },
          dateOfBirth: { type: Type.STRING, description: "Format: YYYY-MM-DD or as found." },
          countryOfCitizenship: { type: Type.STRING, description: "The nationality or citizenship of the expert." },
          email: { type: Type.STRING, description: "The expert's email address if present." },
          phone: { type: Type.STRING, description: "The expert's phone number if present." },
          profileSummary: { type: Type.STRING, description: "CRITICAL: The ENTIRE professional bio or summary found in the CV (at least 7-10 lines, no bullet points)." },
          availability: { type: Type.STRING, description: "Availability status or notice period if stated." },
          professionalMembership: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Professional bodies or associations the expert is a member of." },
          adequacy_experience: {
            type: Type.ARRAY,
            description: "CRITICAL: 'Adequacy for the Assignment'. Extract specific projects/assignments done during jobs. Every Assignment Description MUST be a subset of the work experience, filtered to highlight specific assignments. Not all general work experience should be included here. Include the period, country, position, client, and a deep description of the assignment. MUST BE HIGHLY DETAILED. Format description as bullet points.",
            items: {
              type: Type.OBJECT,
              required: ["period", "country", "position", "client", "assignment", "category"],
              properties: {
                period: { type: Type.STRING, description: "CRITICAL: Start Date and End date/Duration (e.g. 'Jan 2018 - Present' or '3 years'). Make sure you capture this if present." },
                country: { type: Type.STRING, description: "CRITICAL: Country where the assignment took place." },
                position: { type: Type.STRING },
                client: { type: Type.STRING },
                assignment: { type: Type.STRING, description: "CRITICAL: DO NOT SUMMARIZE. Extract the entire verbatim text from the CV. Preserve all rich details, project scopes, metrics, budgets, and bullet points. This must be a rich, multi-paragraph extraction if present. Format as a highly rich, well-arranged bulleted list (using \n- )." },
                category: { type: Type.STRING }
              }
            }
          },
          experiences: {
            type: Type.ARRAY,
            description: "ALL work experiences and employment history. Do not skip any jobs or roles. This is their comprehensive general work history. The Work Experience description MUST contain the FULL, exhaustive job description exactly as it is in the CV, including all general duties, day-to-day tasks, and responsibilities in bullet points.",
            items: {
              type: Type.OBJECT,
              required: ["organization", "country", "role", "start_date", "end_date", "duration", "description"],
              properties: {
                project_name: { type: Type.STRING, description: "Name of the project or initiative if applicable." },
                organization: { type: Type.STRING, description: "Employer or organization name." },
                country: { type: Type.STRING, description: "CRITICAL: Location/Country of employment. You MUST extract this!" },
                client: { type: Type.STRING, description: "Client name if the work was consulting or contracting." },
                role: { type: Type.STRING, description: "Exact job title or role held." },
                duration: { type: Type.STRING, description: "CRITICAL: The full duration of the employment (e.g. 'Jan 2018 - Present'). You MUST extract this!" },
                start_date: { type: Type.STRING, description: "CRITICAL: Start date (e.g., 'Jan 2018' or '2018'). MUST BE SHORT, maximum 20 chars. DO NOT write paragraphs here. But YOU MUST EXTRACT THIS DATE." },
                end_date: { type: Type.STRING, description: "CRITICAL: End date (e.g., 'Present' or 'Dec 2021'). MUST BE SHORT, maximum 20 chars. YOU MUST EXTRACT THIS DATE." },
                description: { type: Type.STRING, description: "CRITICAL: The ENTIRE exhaustive description of responsibilities, tasks, achievements, and technologies used. Format this beautifully in a well-arranged bulleted list (using \n- ). DO NOT SUMMARIZE OR TRUNCATE. BE EXTREMELY DETAILED AND RICH." }
              }
            }
          },
          projects: {
            type: Type.ARRAY,
            description: "ALL specific projects worked on. Extract in maximum detail.",
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: "Name of the project." },
                role: { type: Type.STRING, description: "Role the expert played on the project." },
                location: { type: Type.STRING, description: "Location of the project." },
                description: { type: Type.STRING, description: "CRITICAL: Exhaustive description of the project, including scope, metrics, exact responsibilities, budgets, and technologies used." }
              }
            }
          },
          metadata: {
            type: Type.OBJECT,
            properties: {
              educations: { type: Type.ARRAY, description: "CRITICAL: Extract every formal academic qualification as a separate entry. This is where detailed course information belongs. Keep degree and field separate: degree is the exact award (e.g., Bachelor of Science, Master of Engineering, Diploma); field is the exact course, major, or discipline (e.g., Civil Engineering, Quantity Surveying). Also extract institution, year/period, location/country, grade, and relevant academic notes such as specialization or thesis. Do not place professional certifications or short training courses here. Do not invent missing values or write placeholders such as 'Not stated'.", items: { type: Type.OBJECT, properties: { degree: { type: Type.STRING, description: "Exact academic award only, without the course/major when it can be separated (e.g., Bachelor of Science, Master of Engineering, Diploma)." }, field: { type: Type.STRING, description: "Exact course, major, specialization, or field of study (e.g., Civil Engineering, Computer Science). Keep separate from degree." }, institution: { type: Type.STRING }, year: { type: Type.STRING }, location: { type: Type.STRING, description: "Country or location of the institution." }, grade: { type: Type.STRING }, notes: { type: Type.STRING, description: "Other academic details explicitly stated, such as thesis, specialization, honours, or relevant coursework." } } } },
              certifications: { type: Type.ARRAY, description: "Extract all professional certifications or licenses.", items: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, issuer: { type: Type.STRING }, country: { type: Type.STRING }, year: { type: Type.STRING }, description: { type: Type.STRING, description: "Any extra details provided." } } } },
              languages: { type: Type.ARRAY, description: "Extract every human language explicitly stated in the CV as a separate entry. Put only the language name in name. Preserve the stated proficiency in level (e.g., Native, Mother Tongue, Fluent, Excellent, Good, Basic; or separate Speaking/Reading/Writing ratings). Do not treat nationality, citizenship, countries, software, or programming languages as spoken languages. Do not infer proficiency when it is absent.", items: { type: Type.OBJECT, properties: { name: { type: Type.STRING, description: "Spoken/written human language name only." }, level: { type: Type.STRING, description: "Exact proficiency stated in the CV; leave blank when absent." }, notes: { type: Type.STRING, description: "Any additional language details, such as separate speaking, reading, and writing ratings." } } } },
              awards: { type: Type.ARRAY, description: "Extract all awards and honors.", items: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, issuer: { type: Type.STRING }, country: { type: Type.STRING }, year: { type: Type.STRING }, description: { type: Type.STRING } } } },
              publications: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, journal: { type: Type.STRING }, year: { type: Type.STRING }, description: { type: Type.STRING } } } },
              unmapped_data: {
                type: Type.ARRAY,
                description: "Absolutely ANY other professional, technical, or academic information found in the CV that does not fit perfectly into the schema fields. EXCLUDE hobbies, personal references, and irrelevant personal trivia.",
                items: { type: Type.OBJECT, properties: { key: { type: Type.STRING }, value: { type: Type.STRING } } }
              }
            }
          }
        }
      }
    }
  }
};

const tenderSchema: Schema = {
  type: Type.OBJECT,
  required: [
    "internal_code",
    "name",
    "client",
    "deadline",
    "status",
    "country",
    "tender_format",
    "tender_number",
    "submission_type",
    "project_sector",
    "scope_summary",
    "duration",
    "special_requirements",
    "global_team_constraints",
    "objective",
    "background",
    "scope_of_work",
    "deliverables",
    "methodology",
    "reporting",
    "languages",
    "budget_details",
    "positions",
  ],
  properties: {
    internal_code: { type: Type.STRING, description: "Tender internal/reference code only when explicitly present. Otherwise empty." },
    name: { type: Type.STRING, description: "Complete official tender, project, or assignment title." },
    client: { type: Type.STRING, description: "Contracting authority, employer, ministry, agency, or client issuing the tender." },
    deadline: { type: Type.STRING, description: "Submission deadline exactly as stated, including time and time zone when present." },
    status: { type: Type.STRING, description: "Use OPEN unless the document explicitly establishes another status." },
    country: { type: Type.STRING, description: "Primary country where the assignment will be delivered." },
    tender_format: { type: Type.STRING, description: "Source document format, normally PDF or DOCX, based on the supplied document marker/filename." },
    tender_number: { type: Type.STRING, description: "Official tender, RFP, EOI, contract, or procurement reference number." },
    submission_type: { type: Type.STRING, description: "Submission method/type exactly stated, such as online portal, email, hard copy, one-stage, two-envelope, technical and financial proposals." },
    project_sector: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Small deduplicated list of the principal sectors explicitly supported by the scope, such as Roads, Water, Buildings, Environment. Do not list every incidental noun." },
    scope_summary: { type: Type.STRING, description: "Concise but complete overview of the assignment, its location, principal services, and major outputs. Do not repeat the full scope_of_work." },
    duration: { type: Type.STRING, description: "Overall assignment or contract duration exactly as stated." },
    special_requirements: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Tender-wide mandatory conditions that are not specific to one expert and are not team-composition constraints." },
    global_team_constraints: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Only constraints applying to the team as a whole, such as required team composition, total staffing, local/international mix, team-level nationality quota, or collective certification. Never duplicate individual position requirements here." },
    objective: { type: Type.STRING, description: "Detailed objectives and intended outcomes of the assignment, preserving all substantive points." },
    background: { type: Type.STRING, description: "Detailed project and procurement background, context, rationale, location, and existing conditions." },
    scope_of_work: { type: Type.STRING, description: "Comprehensive detailed scope of services and activities. Preserve all material tasks without adding requirements." },
    deliverables: { type: Type.STRING, description: "Complete deliverables, outputs, milestones, schedules, and review/acceptance requirements." },
    methodology: { type: Type.STRING, description: "Required methodology, approach, work plan, mobilization, quality, or implementation instructions." },
    reporting: { type: Type.STRING, description: "Reporting lines, reports, meetings, approvals, communication, and submission obligations." },
    languages: { type: Type.STRING, description: "Tender-wide language requirements for the proposal, reporting, or team. Preserve proficiency wording when stated." },
    budget_details: { type: Type.STRING, description: "Budget, ceiling, remuneration, reimbursables, currency, payment, tax, and financial information explicitly stated." },
    positions: {
      type: Type.ARRAY,
      description: "Every actual Key Expert and Non-Key Expert position required by the tender. Each role appears once after consolidating its staffing-table and qualification-section references.",
      items: {
        type: Type.OBJECT,
        required: [
          "position_title",
          "quantity",
          "minimum_education",
          "minimum_years_experience",
          "general_experience",
          "specific_experience",
          "role_description",
          "required_sector_experience",
          "mandatory_skills",
          "required_keywords",
          "nationality_preference",
        ],
        properties: {
          position_title: { type: Type.STRING, description: "Exact position/role title from the staffing schedule or qualification section." },
          quantity: { type: Type.INTEGER, description: "Number of experts required for this role. Use the explicit number; use 1 only when the role is clearly required and no quantity is stated." },
          minimum_education: { type: Type.STRING, description: "Complete minimum academic qualification and field requirement for this position, preserving equivalent/related-discipline wording." },
          minimum_years_experience: { type: Type.INTEGER, description: "Minimum total years explicitly required. Return only the integer; use 0 when no minimum is stated." },
          general_experience: { type: Type.STRING, description: "Exact complete general/professional experience requirement for this position. Do not move project-specific experience here." },
          specific_experience: { type: Type.STRING, description: "Exact complete relevant/specific/project experience requirement, including numbers and types of assignments." },
          role_description: { type: Type.STRING, description: "Detailed duties, responsibilities, tasks, authority, reporting, and expected contribution of this expert." },
          required_sector_experience: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Explicit sectors, asset types, or project environments required for this position." },
          mandatory_skills: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Only explicitly mandatory technical skills, software, licenses, certifications, and position-specific language requirements." },
          required_keywords: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Compact deduplicated matching terms taken from explicit position requirements; do not invent synonyms or generic filler." },
          nationality_preference: { type: Type.STRING, description: "Exact nationality, residency, local/international, or eligibility restriction for this position. Empty when none is stated." }
        }
      }
    }
  }
};

const tenderPositionsSchema: Schema = {
  type: Type.OBJECT,
  required: ["positions"],
  properties: {
    positions: (tenderSchema as any).properties.positions,
  },
};

const tenderGeneralSchema: Schema = {
  type: Type.OBJECT,
  required: ((tenderSchema as any).required || []).filter(
    (field: string) => field !== "positions",
  ),
  properties: Object.fromEntries(
    Object.entries((tenderSchema as any).properties).filter(
      ([field]) => field !== "positions",
    ),
  ),
};

const tenderPositionInventorySchema: Schema = {
  type: Type.OBJECT,
  required: ["positions"],
  properties: {
    positions: {
      type: Type.ARRAY,
      description:
        "Complete inventory of every required expert position, using only the existing position title and quantity fields.",
      items: {
        type: Type.OBJECT,
        required: ["position_title", "quantity"],
        properties: {
          position_title: {
            type: Type.STRING,
            description:
              "Exact required position title as written in the authoritative staffing or qualification section.",
          },
          quantity: {
            type: Type.INTEGER,
            description:
              "Explicit number of experts required for this position; use 1 only when the position is clearly required and no quantity is stated.",
          },
        },
      },
    },
  },
};

async function callGenAIWithRetry(
  callFn: (modelName: string) => Promise<any>, 
  models = ["gemini-3.1-flash-lite", "gemini-3.1-pro-preview"],
  maxRetriesPerModel = 2, 
  baseDelayMs = 2000
): Promise<any> {
  let lastError: any;

  for (let mIndex = 0; mIndex < models.length; mIndex++) {
    const model = models[mIndex];
    let attempt = 0;
    
    while (attempt < maxRetriesPerModel) {
      try {
        return await callFn(model);
      } catch (error: any) {
        lastError = error;
        attempt++;
        const is503 = error?.status === 503 || error?.message?.includes('503') || error?.message?.includes('high demand') || (error as any)?.response?.status === 503;
        const isQuotaExceeded = error?.message?.includes('exceeded your current quota') || error?.message?.includes('Quota exceeded');
        const isTransient429 = (error?.status === 429 || error?.message?.includes('429') || (error as any)?.response?.status === 429) && !isQuotaExceeded;
        
        if (!(is503 || isTransient429) || attempt >= maxRetriesPerModel || isQuotaExceeded) {
          if (mIndex < models.length - 1) {
            console.warn(`[GenAI] Model ${model} failed, failing over to next model: ${models[mIndex + 1]}. Error was: ${error?.message}`);
          } else {
             console.error(`[GenAI] Error with model ${model} (Final Attempt):`, error?.message);
          }
          break; // move to next model
        }
        
        console.warn(`[GenAI] Transient error with model ${model} (Attempt ${attempt}/${maxRetriesPerModel}):`, error?.message);
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.log(`[GenAI] Retrying model ${model} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

function normalizeEducationLevel(value: unknown, educations: any[] = []): string {
  const suppliedLevel = typeof value === "string" ? value.trim() : "";
  const educationText = [
    suppliedLevel,
    ...educations.flatMap((education) => [
      education?.degree,
      education?.field,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/(?:\bph\.?\s*d\.?(?=\s|$)|\bdoctor of philosophy\b)/i.test(educationText)) return "PhD";
  if (/\b(doctorate|doctoral|doctor of (engineering|science|education|business))\b/i.test(educationText)) return "Doctorate";
  if (/(?:\bmaster\b|\bm\.?\s*sc\.?(?=\s|$)|\bm\.?\s*eng\.?(?=\s|$)|\bm\.?\s*tech\.?(?=\s|$)|\bmba\b|\bm\.?\s*a\.?(?=\s|$))/i.test(educationText)) return "Master Degree";
  if (/\b(postgraduate|post-graduate|pg)\s*diploma\b/i.test(educationText)) return "Postgraduate Diploma";
  if (/\b(higher national diploma|hnd)\b/i.test(educationText)) return "Higher National Diploma";
  if (/(?:\bbachelor\b|\bb\.?\s*sc\.?(?=\s|$)|\bb\.?\s*eng\.?(?=\s|$)|\bb\.?\s*tech\.?(?=\s|$)|\bbba\b|\bb\.?\s*a\.?(?=\s|$)|\bb\.?\s*com\.?(?=\s|$)|\bmbbs\b)/i.test(educationText)) return "Bachelor Degree";
  if (/\b(associate degree|associate of)\b/i.test(educationText)) return "Associate Degree";
  if (/\bdiploma\b/i.test(educationText)) return "Diploma";
  if (/\bcertificate\b/i.test(educationText)) return "Certificate";
  if (/\b(high school|secondary school|secondary education)\b/i.test(educationText)) return "Secondary Education";

  return suppliedLevel;
}

function normalizeExtractedLanguages(expert: any): any[] {
  const metadataLanguages = expert?.metadata?.languages;
  const source =
    Array.isArray(metadataLanguages) && metadataLanguages.length > 0
      ? metadataLanguages
      : Array.isArray(expert?.languages)
        ? expert.languages
        : typeof expert?.languages === "string"
          ? expert.languages.split(/[,;]/)
          : [];

  const normalized = source
    .map((language: any) => {
      if (typeof language === "string") {
        const [name, ...levelParts] = language.split(/\s+[-–—:]\s+/);
        return {
          name: name?.trim() || "",
          level: levelParts.join(" - ").trim(),
          notes: "",
        };
      }
      return {
        name: String(language?.name || language?.language || "").trim(),
        level: String(language?.level || language?.proficiency || "").trim(),
        notes: String(language?.notes || "").trim(),
      };
    })
    .filter((language: any) => language.name);

  return normalized.filter(
    (language: any, index: number) =>
      normalized.findIndex(
        (candidate: any) =>
          candidate.name.toLowerCase() === language.name.toLowerCase(),
      ) === index,
  );
}

export async function runParseCVText(text: string, tax: string[]): Promise<any[]> {
  const taxonomy = (tax && tax.length > 0) ? tax : ALL_PRIMARY_POSITIONS;
  const prompt = `You are the world's most aggressive and meticulous expert profile extraction AI.
  Your absolute directive is to parse the provided CV text line-by-line and extract EVERY SINGLE scrap of useful information into the structured format. NO DETAILS IGNORED.
  
  CRITICAL INTELLIGENCE & INFERENCE RULES:
  1. ZERO TRUNCATION & VERBATIM EXTRACTION: Do not summarize or cut short any bullet points or paragraphs. For job descriptions and the profile summary, extract the text 100% EXACTLY as it is written in the CV. If a job has 3 paragraphs of description, you must copy all 3 paragraphs verbatim.
  2. DO NOT COMBINE JOBS: If the CV lists multiple distinct roles at different times or with different companies (e.g., Senior Land Surveyor at company A, then Chief Land Surveyor at company B), you MUST extract them as completely separate, distinct entries in the 'experiences' array. Never merge them together.
  3. SMART INFERENCE FOR MISSING FIELDS: If 'Location' is not explicitly stated in a header, intensely analyze the most recent 'Experience' or 'Education' entry to determine it. 
  4. DATA COMPLETENESS FOR PERFECT CV GENERATION: We rely on you for 100% accurate branded CV outputs. Cross-reference all sections. If a project is mentioned under a role, ensure it's captured in full detail.
  5. TAXONOMY STRICTNESS: Assign each expert a strict 'role' from EXACTLY this list: [${taxonomy.join(", ")}].
  6. SPECIFICITY: 'primary_position' must be the actual exact role TITLE from the CV (e.g., 'Chief Land Surveyor').
  7. CHRONOLOGY & GRANULAR DETAILS: Ensure experiences and projects are captured with specific dates, precise durations, organizations, locations, and extremely detailed descriptions. Extract exact budgets, engineering standards (e.g., FIDIC), and team sizes.
  8. DIFFERENTIATION BETWEEN EMPLOYMENT RECORD AND ADEQUACY: 
  - 'experiences' (Employment Record): This is the chronological list of jobs/roles the expert held. You MUST extract exact dates, countries, and provide extremely detailed descriptions of their tasks and activities. Do not miss any details!
  - 'adequacy_experience' (Adequacy for the Assignment - Key Experience): This MUST be a separate list of specific key *PROJECTS* or specific assignments. You MUST pick up ALL assignments related to the particular jobs they held. You cannot miss out on any assignment. Provide comprehensive descriptions pulling the rich text.
  9. MASTERFUL FORMAT ROBUSTNESS: CVs from OCR or PDF are messy. Utilize supreme intelligence to reconstruct broken tables, misaligned dates, and disjointed paragraphs to extract the true chronological timeline.
  10. NAME EXTRACTION: Extract the exact 'fullName' correctly. Look at the top of the CV, headers, signatures, etc. NEVER output "null" or "unknown" if a name exists.
  11. NO MISSING FIELDS: Every field in the schema MUST be aggressively populated. Search deeply and make reasonable inferences based on context.
  12. CRITICAL FIELDS FINDER: You MUST carefully read through the CV to find and extract EVERYTHING: FULL NAME, PRIMARY POSITION, ROLE, LOCATION, COUNTRIES, EDUCATION, EXPERIENCE, TYPE, SKILLS, AWARDS, LANGUAGES, CERTIFICATIONS, SOFTWARE, DATE OF BIRTH, CITIZENSHIP, PROFESSIONAL MEMBERSHIP.
  13. EXCLUDE IRRELEVANT DATA: Strictly EXCLUDE non-professional personal trivia (e.g., "married with kids", hobbies). You must completely capture every drop of professional, academic, technical, and project-related data.
  14. PRECISE EDUCATION MAPPING: 'educationLevel' is ONLY the highest completed qualification category, such as PhD, Doctorate, Master Degree, Bachelor Degree, Postgraduate Diploma, Higher National Diploma, Diploma, or Certificate. Do not include the course, field, institution, or year in educationLevel. Put every detailed academic record in 'metadata.educations': exact award in 'degree', exact course/major in 'field', plus institution, year/period, location/country, grade, and academic notes. Professional certifications and short courses belong in certifications or training_courses, not education.
  15. UNIVERSAL TRANSLATOR: If the input CV is in a language other than English, natively output JSON translated into professional English.
  16. REVERSE CHRONOLOGICAL ORDER & EXACT JOB INTEGRITY: You MUST arrange the 'experiences' and 'adequacy' arrays in STANDARD REVERSE CHRONOLOGICAL ORDER (most recent first, from e.g. Present down to oldest past). DO NOT aggressively break or "split" table entries or jobs (e.g. if a CV lists one job from 2006 to 2008, keep it as ONE job experience. Do NOT split it into multiple).
  17. PROFILE REQUIREMENTS: You MUST extract or synthesize a 'profileSummary' (7-10 lines minimum) capturing the expert's full narrative in paragraph form. Integrate ANY notable achievements, research, or highlights directly into this paragraph. DO NOT output bullet points for a profile.
  18. SINGLE OBJECT PER EXPERT: You MUST return EXACTLY ONE object inside the 'experts' array for each person found in the CV. Put ALL of their details (location, countries, education, experiences) into that SINGLE object. DO NOT split one person's data across multiple objects in the array.
  19. STRICT FORMAT & TOKENS CONSERVATION: DO NOT hallucinate repeating strings or get caught in infinite loops. Your dates (Start and End) must be incredibly short and concise (e.g., 'Jan 2018'). DO NOT write long explanations in date fields. Ensure you output completely valid JSON without literal newlines or unescaped quotes inside strings.
  20. EXTREME EXTRACTION AGGRESSIVENESS: Make sure you are 100% aggressive in extracting the CV. Everything that is on the CV MUST be extracted to the corresponding schema fields unless it really doesn't exist. Do not skip any skills, experiences, adequacy table, certifications, etc. Extract them in extreme detail.
  21. ZERO MISSED ASSIGNMENTS: For Adequacy, if the CV contains a section like 'Key Experience', 'Relevant Assignments', or 'Projects', you MUST pick up EVERY SINGLE ASSIGNMENT related to a particular job. You cannot miss out on any assignment.
  22. DURATION CAPTURE: Always capture exact dates, durations, and periods for both experiences and adequacy assignments. Do not leave dates blank if they are present in the CV text.
  23. BE THE EYE OF THE GODS: Look at every single word in the CV. Leave no job description, no date, no country, no assignment behind.\n  24. INTELLIGENT BULLET POINTS FORMATTING: For the 'description' in experiences and 'assignment' in adequacy_experience, heavily structure the output into clean, rich bullet points using newline characters and dashes (e.g. \\n- First point\\n- Second point). The OCR might cluster separate activities into one paragraph. You MUST intelligently identify distinct tasks, activities, or concepts within paragraphs and split them into separate bullet points. DO NOT group multiple distinct activities into a single bullet point. DO NOT return giant walls of unstructured text.\n  25. LITERAL TRANSCRIBER FOR ADEQUACY: Act as a literal transcriber for the Adequacy section. It is explicitly forbidden to summarize or condense project details. You MUST preserve all rich technical details, project scopes, and metrics.
  
  26. PRECISE LANGUAGE MAPPING: Extract only human languages explicitly stated in the CV into 'metadata.languages'. Keep each language name separate from its proficiency. Preserve exact proficiency or speaking/reading/writing ratings when present. Never infer a proficiency level that is not stated, and never map nationality, countries, software, or programming languages as spoken languages.

  Analyze this document relentlessly like an elite HR headhunter who misses absolutely nothing. DO NOT SUMMARIZE EXPERIENCES. Give me 100% exact text.
  
  CV Text:
  ${text}`;

  const response = await callGenAIWithRetry((modelName) => getAI().models.generateContent({
    model: modelName,
    contents: [{ role: 'user', parts: [{ text: prompt }]}],
    config: {
      responseMimeType: "application/json",
      responseSchema: cvSchema,
      temperature: 0.2,
    }
  }), ["gemini-3.1-flash-lite", "gemini-3.1-pro-preview"]);

  const responseText = response.text || '{}';
  console.log("Raw CV Response:", responseText);
  let result = { experts: [] };
  try {
    result = parseGenAIJSON(responseText);
  } catch (e: any) {
    console.error("Failed to parse AI JSON:", e.message);
    // Don't truncate too aggressively so we can debug later if needed
    throw new Error("Failed to parse AI response as JSON: " + e.message + ". First 200 chars: " + responseText.substring(0, 200));
  }
  return (result.experts || []).map((e: any) => {
    const educations = Array.isArray(e.metadata?.educations)
      ? e.metadata.educations
      : [];
    const languages = normalizeExtractedLanguages(e);

    return {
      ...e,
      name: e.fullName || e.name || "",
      email: e.email || "",
      phone: e.phone || "",
      primary_position: e.primary_position || e.role || "Unknown",
      role: e.role || taxonomy[0],
      educationLevel: normalizeEducationLevel(e.educationLevel, educations),
      profile_summary: e.profileSummary || e.profile_summary || e.summary || "",
      adequacy_experience: e.metadata?.adequacy || e.adequacy_experience || [],
      education:
        educations.length > 0
          ? educations.map(
              (education: any) =>
                `${education.degree || ""}${education.field ? ` in ${education.field}` : ""}${education.institution ? `, ${education.institution}` : ""}${education.year ? `, ${education.year}` : ""}`,
            )
          : e.education || [],
      languages: languages.map((language: any) =>
        language.level
          ? `${language.name} - ${language.level}`
          : language.name,
      ),
      metadata: {
        ...(e.metadata || {}),
        educations,
        languages,
      },
      highlights: e.highlights_of_activities || [],
      training: e.training_courses || [],
      employment_history: e.experiences || [],
      experiences: e.experiences || [],
    };
  });
}

export async function translateExpertProfile(expertData: any, targetLanguage: string): Promise<any> {
  const prompt = `You are an elite bilingual technical translator and recruitment expert specializing in international development, engineering, and enterprise consulting. 
Your goal is to translate the following parsed CV/Expert Profile into ${targetLanguage} with extreme professional fluency.

CRITICAL INSTRUCTIONS:
1. EXTREME PROFESSIONAL FLUENCY: Do not just translate literally. Localize the tone to sound like a native, highly polished professional in the target language. Use industry-standard terminology for engineering, procurement, management, and technical fields.
2. PRESERVE STRUCTURE: Retain the EXACT JSON structure, keys, and array types, but translate all textual content (skills, summary, education degrees, job titles, awards, project descriptions).
3. SMART HANDLING OF TERMINOLOGY: If a specific technical standard (e.g., FIDIC, ISO) or software is globally known by its English name, keep it in English. 
4. Do NOT translate the "role" taxonomy field unless it's descriptive.

Profile Data:
${JSON.stringify(expertData)}
`;

  const response = await callGenAIWithRetry((modelName) => getAI().models.generateContent({
    model: modelName,
    contents: [{ role: 'user', parts: [{ text: prompt }]}],
    config: {
      responseMimeType: "application/json",
      responseSchema: (cvSchema.properties as any).experts.items,
      temperature: 0.2,
    }
  }), ["gemini-3.1-flash-lite"]);

  const responseText = response.text || '{}';
  console.log("Raw Translation Response:", responseText);
  let parsed = {};
  try {
    parsed = parseGenAIJSON(responseText);
    return parsed;
  } catch (err) {
    console.error("Translation JSON Parse Error", err);
    return expertData;
  }
}
function tenderText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(tenderText).filter(Boolean).join("\n");
  const cleaned = String(value).trim();
  return [
    "none",
    "n/a",
    "not stated",
    "not specified",
    "not provided",
    "not available",
    "unknown",
    "null",
  ].includes(cleaned.toLowerCase())
    ? ""
    : cleaned;
}

function tenderList(value: unknown): string[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/(?:\r?\n|;|•|\s+-\s+)/)
      : [];

  const cleaned = source
    .flatMap((entry: any) => (Array.isArray(entry) ? entry : [entry]))
    .map((entry: any) => tenderText(entry).replace(/^[\s\-–—•]+/, "").trim())
    .filter(
      (entry: string) =>
        entry &&
        !["none", "n/a", "not stated", "not specified", "unknown"].includes(
          entry.toLowerCase(),
        ),
    );

  return cleaned.filter(
    (entry: string, index: number) =>
      cleaned.findIndex(
        (candidate: string) =>
          candidate.toLowerCase() === entry.toLowerCase(),
      ) === index,
  );
}

function tenderInteger(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  const match = tenderText(value).match(/\d+/);
  return match ? Math.max(0, Number.parseInt(match[0], 10)) : fallback;
}

function moreDetailedTenderText(first: unknown, second: unknown): string {
  const a = tenderText(first);
  const b = tenderText(second);
  return b.length > a.length ? b : a;
}

function mergeTenderLists(first: unknown, second: unknown): string[] {
  return tenderList([...tenderList(first), ...tenderList(second)]);
}

export function normalizeTenderExtraction(parsed: any): any {
  const rawPositions = Array.isArray(parsed?.positions) ? parsed.positions : [];
  const normalizedPositions = rawPositions.flatMap((rawPosition: any) => {
    const positionTitle = tenderText(
      rawPosition?.position_title || rawPosition?.title,
    );
    if (!positionTitle) return [];

    const normalizedPosition = {
      ...rawPosition,
      position_title: positionTitle,
      title: positionTitle,
      quantity: Math.max(1, tenderInteger(rawPosition?.quantity, 1)),
      minimum_education: tenderText(rawPosition?.minimum_education),
      minimum_years_experience: tenderInteger(
        rawPosition?.minimum_years_experience,
        0,
      ),
      general_experience: tenderText(rawPosition?.general_experience),
      specific_experience: tenderText(rawPosition?.specific_experience),
      role_description: tenderText(rawPosition?.role_description),
      required_sector_experience: tenderList(
        rawPosition?.required_sector_experience,
      ),
      mandatory_skills: tenderList(rawPosition?.mandatory_skills),
      required_keywords: tenderList(rawPosition?.required_keywords),
      nationality_preference: tenderText(
        rawPosition?.nationality_preference,
      ),
    };
    return [normalizedPosition];
  });

  const name = tenderText(parsed?.name || parsed?.tender_title);
  const format = tenderText(parsed?.tender_format).toUpperCase();
  const languages = Array.isArray(parsed?.languages)
    ? tenderList(parsed.languages).join("; ")
    : tenderText(parsed?.languages);

  return {
    ...parsed,
    internal_code: tenderText(parsed?.internal_code),
    name,
    tender_title: name,
    client: tenderText(parsed?.client),
    deadline: tenderText(parsed?.deadline),
    status: tenderText(parsed?.status).toUpperCase() || "OPEN",
    country: tenderText(parsed?.country),
    tender_format:
      format.includes("DOCX") || format.includes("WORD")
        ? "DOCX"
        : format.includes("PDF")
          ? "PDF"
          : format,
    tender_number: tenderText(parsed?.tender_number),
    submission_type: tenderText(parsed?.submission_type),
    project_sector: tenderList(parsed?.project_sector),
    scope_summary: tenderText(parsed?.scope_summary),
    duration: tenderText(parsed?.duration),
    special_requirements: tenderList(parsed?.special_requirements),
    global_team_constraints: tenderList(parsed?.global_team_constraints),
    objective: tenderText(parsed?.objective),
    background: tenderText(parsed?.background),
    scope_of_work: tenderText(parsed?.scope_of_work),
    deliverables: tenderText(parsed?.deliverables),
    methodology: tenderText(parsed?.methodology),
    reporting: tenderText(parsed?.reporting),
    languages,
    budget_details: tenderText(parsed?.budget_details),
    positions: normalizedPositions,
  };
}

const POSITION_SCAN_MAX_CHARS = 60000;
const POSITION_SCAN_OVERLAP_CHARS = 2500;

/**
 * Splits every uploaded tender into bounded, overlapping scan units while
 * retaining page/document markers. This makes the position pass inspect the
 * complete source rather than asking one model call to notice every table in a
 * potentially very long bundle.
 */
function splitTenderForPositionScan(text: string): string[] {
  const markedSections = text
    .split(/(?=--- (?:TENDER DOC:|PAGE \d+ ---))/g)
    .map((section) => section.trim())
    .filter(Boolean);
  const sections = markedSections.length > 0 ? markedSections : [text.trim()];
  const chunks: string[] = [];
  let current = "";

  const pushLongSection = (section: string) => {
    let start = 0;
    while (start < section.length) {
      const end = Math.min(start + POSITION_SCAN_MAX_CHARS, section.length);
      chunks.push(section.slice(start, end));
      if (end === section.length) break;
      start = Math.max(end - POSITION_SCAN_OVERLAP_CHARS, start + 1);
    }
  };

  for (const section of sections) {
    if (section.length > POSITION_SCAN_MAX_CHARS) {
      if (current) chunks.push(current);
      current = "";
      pushLongSection(section);
      continue;
    }
    const joined = current ? `${current}\n\n${section}` : section;
    if (joined.length > POSITION_SCAN_MAX_CHARS) {
      if (current) chunks.push(current);
      current = section;
    } else {
      current = joined;
    }
  }
  if (current) chunks.push(current);
  return chunks.filter(Boolean);
}

export async function runParseTenderText(text: string): Promise<any> {
  const prompt = `Extract the supplied Tender, RFP, EOI, Scope of Work, and/or Terms of Reference documents into ONE strictly structured tender object.

The input may contain multiple files belonging to the same tender. Consolidate them. Use the procurement document for administrative information and the ToR/staffing sections for scope and expert requirements. Never create one tender object or repeat general tender data for each position.

MULTI-DOCUMENT CLASSIFICATION AND SOURCE AUTHORITY
The marker "--- TENDER DOC: filename ---" starts each uploaded file. Treat each marker as a hard document boundary. Before extracting, classify every file internally and use it for the appropriate fields:
- Invitation, Request for Proposal, EOI, procurement notice, instructions to consultants/bidders: official title, client, reference number, deadline, submission procedure, eligibility, and tender-wide administrative conditions.
- Data Sheet, Particular Conditions, or Special Conditions: tender-specific administrative values that override generic instructions.
- Addendum, corrigendum, clarification, amendment, or revised schedule: authoritative changes to any affected field. When documents conflict, use the latest explicit amendment and do not retain the superseded value.
- Terms of Reference, Scope of Work, technical specifications, employer's requirements: background, objectives, detailed scope, duration, methodology, reporting, deliverables, language, technical conditions, team structure, duties, and expert requirements.
- Staffing schedule, personnel schedule, manning table, key/non-key expert table: authoritative position inventory, titles, categories, and quantities.
- Qualification criteria, evaluation criteria, personnel requirements, detailed expert profiles: authoritative education, general experience, specific experience, sector experience, skills, licenses, language, nationality, and role requirements for each position.
- Financial proposal, bill of quantities, remuneration/payment schedule, budget form: budget, currency, payment, reimbursable, tax, and financial details only.
- Proposal forms and sample CV templates: use only explicit tender requirements. Do not mistake placeholder/example names, sample job titles, signature labels, or form instructions for required positions.

Combine complementary information across these document types. Do not copy administrative boilerplate into technical fields, and do not let a generic template override tender-specific data.

ACCURACY RULES
1. Use only information supported by the supplied text. Do not invent missing requirements, dates, budgets, qualifications, experience, nationality rules, or skills.
2. Leave an unavailable string empty, an unavailable list empty, and an unavailable minimum-years value as 0. Status defaults to OPEN.
3. Resolve repeated information across files into the most complete version. Do not repeat the same statement within a field.
4. Preserve exact numbers, dates, currencies, units, standards, locations, names, minimum qualifications, and mandatory wording.
5. Distinguish tender-wide requirements from position requirements. Do not copy individual expert requirements into special_requirements or global_team_constraints.

EXACT EXISTING GENERAL-FIELD DICTIONARY
- internal_code: an explicit internal tracking/project code printed by the issuer. Do not generate a TND code and do not copy the procurement reference here unless the document itself identifies it as the internal/project code.
- name: the complete official name of the procurement, assignment, consultancy, or project. Prefer the tender-specific title over a generic form heading such as Request for Proposals.
- client: the authority that issues the procurement or employs the consultant, including ministry/department when stated. Do not use the consultant, bidder, donor, or contractor unless it is explicitly the client.
- deadline: the final proposal/submission deadline exactly stated, including date, time, time zone, and amended value. Do not confuse clarification, pre-bid, validity, commencement, or project-completion dates with the deadline.
- status: OPEN unless the supplied documents explicitly establish another current status.
- country: the principal country of assignment performance. Do not infer it only from a bidder address.
- tender_format: PDF, DOCX, or the supported source format shown in the uploaded filename marker; this describes the source document, not the submission envelope.
- tender_number: the exact tender/RFP/EOI/procurement/contract reference assigned by the issuer. Keep punctuation and leading zeroes.
- submission_type: how the proposal must be submitted and packaged, for example portal, email, hard copy, one-stage/two-stage, or separate technical and financial envelopes. Do not put the document file type here.
- project_sector: a short deduplicated list of the assignment's principal technical sectors/asset classes proven by its scope, not procurement categories, skills, or every incidental noun.
- scope_summary: a concise overview of where the assignment occurs, the main services, assets/sectors, and intended result. It summarizes rather than reproduces scope_of_work.
- duration: the overall assignment/contract duration exactly stated, including phases/extensions when material. Do not use an individual expert's person-months as the overall duration.
- special_requirements: only tender-wide mandatory eligibility, submission, legal, technical, logistical, security, registration, site, or compliance conditions not represented by another field. Exclude individual-position qualifications.
- global_team_constraints: only requirements applying collectively to the proposed team: total staffing, team composition, staffing inputs, local/international mix, team-level gender/nationality rules, or collective capability. Individual expert requirements belong only to that position.
- objective: all explicit assignment objectives and intended outcomes, preserving separate objectives and measurable aims.
- background: the project context, rationale, existing situation, prior phases, location, stakeholders, financing, and problem being addressed. Do not move future consultant tasks here.
- scope_of_work: the comprehensive services, activities, tasks, geographic coverage, technical standards, coordination, supervision/design/study obligations, and exclusions required from the consultant.
- deliverables: every required output, report, design, document, milestone, submission timing/frequency, format, review, approval, and acceptance obligation.
- methodology: any required approach, work plan, sequencing, mobilization, quality assurance, stakeholder method, tools, standards, or implementation procedure. Leave empty when the tender asks bidders to propose a methodology but supplies no required method.
- reporting: reporting lines and every reporting, meeting, review, communication, approval, presentation, and document-control obligation. Do not place an individual role's duties here unless they are also tender-wide.
- languages: only tender-wide proposal, working, report, or team-language requirements, with exact proficiency wording. Position-only language requirements belong in mandatory_skills for that position.
- budget_details: only explicitly stated budget ceiling/value, currency, remuneration, payment schedule, reimbursables, taxes, financial forms, or cost rules. Do not estimate a budget.

POSITION FIELD FOR THIS GENERAL PASS
Do not return positions in this pass. Position inventory and detailed position extraction are performed by separate completeness-controlled passes. Do not spend output tokens describing positions.

FINAL CHECK
Before returning, verify that every general tender field is mapped correctly and repeated information is consolidated.

Tender document text:
${text}`;
  
  const response = await callGenAIWithRetry(async (modelName) => {
    const result = await getAI().models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }]}],
      config: {
        responseMimeType: "application/json",
        responseSchema: tenderGeneralSchema,
        temperature: 0.1,
        maxOutputTokens: 32768,
      }
    });
    assertCompleteGenAIResponse(result, "General tender extraction");
    return result;
  }, ["gemini-3.1-flash-lite", "gemini-3.1-pro-preview"]);

  const responseText = response.text || '{}';
  console.log("Raw Tender Response:", responseText);
  const parsed = parseStrictGenAIJSON(responseText, "General tender extraction");

  const positionScanChunks = splitTenderForPositionScan(text);
  console.log(
    `Scanning ${positionScanChunks.length} complete tender text chunk(s) for staffing positions.`,
  );
  const discoveredCandidates: any[] = [];
  for (let chunkIndex = 0; chunkIndex < positionScanChunks.length; chunkIndex++) {
    const inventoryPrompt = `Find every ACTUAL REQUIRED CONSULTANT/ASSIGNMENT POSITION in this tender text segment.

Return only the existing fields position_title and quantity. This is a candidate-discovery pass: do not return qualifications, duties, category labels, source references, or general tender information.

READ TABLES AS TABLES
- Inspect every row and column, including merged/repeated headers, continuation rows, footnotes, and text immediately above or below a table.
- Position lists may be headed Key Experts, Non-Key Experts, Professional Staff, Other Experts, Support Staff, Personnel, Staffing Schedule, Manning Schedule, Team Composition, Experts, Staff Requirements, or Qualifications.
- A role may be numbered/coded (for example K-1, KE-2, NKE-3) or use titles such as Team Leader, Engineer, Specialist, Manager, Coordinator, Surveyor, Inspector, Technician, Expert, Consultant, Officer, Architect, Planner, Economist, or Analyst. These examples help recognize title grammar; NEVER invent a role merely because such a word occurs.
- Quantity may be in another column, a staffing-total note, or expressed as number of experts/persons. Preserve each distinct required row.

USE THE TABLE OF CONTENTS AS A NAVIGATION MAP
- Inspect the Table of Contents, index, list of tables, and list of annexes for entries that point to staffing information. Relevant entries can include Experts, Key Experts, Non-Key Experts, Consultant's Personnel, Professional Staff, Support Staff, Team Composition, Staffing/Manning Schedule, Personnel Requirements, Organization and Staffing, Qualification Criteria, Evaluation Criteria, Job Descriptions, Expert Profiles, CV Forms, or Terms of Reference.
- Follow every relevant contents entry to its referenced section/table/page and inspect that actual content, including nearby and continuation pages. Printed page numbers may differ from extracted PDF page numbers, so locate sections by both title and page context.
- A contents/index entry is a navigation clue only. NEVER return a contents heading, section title, table title, or listed example as a position unless the referenced substantive section proves it is an actual required consultant-team role.

STRICT POSITION TEST
A title qualifies only when the tender requires the consultant, bidder, service provider, or assignment team to propose, provide, mobilize, assign, or staff that role for contract delivery. A job-title-looking phrase by itself is insufficient.

REJECT ALL FALSE POSITIONS
- Client/employer/donor officials; procurement or evaluation committee members; tender contacts; signatories; the consultant's authorized representative.
- Contractor/subcontractor personnel mentioned as people the consultant will supervise, unless the tender separately requires that role in the consultant's own team.
- Roles mentioned only in background, existing organizations, stakeholder lists, reporting recipients, historical projects, examples, definitions, or narrative comparisons.
- Company eligibility staff, bidder office staff, and personnel named only in administrative procedures.
- Blank CV/template/example/sample titles, signature labels, organization-chart labels, categories such as Key Expert, and academic/professional disciplines that are not required posts.

COMPLETENESS
Scan this entire segment before answering. Include both key and non-key roles. Use the exact title and explicit quantity; use 1 only where the role is clearly required but no quantity is stated. Return an empty positions array when this segment contains no authoritative staffing requirement.

Tender segment ${chunkIndex + 1} of ${positionScanChunks.length}:
${positionScanChunks[chunkIndex]}`;

    const inventoryResponse = await callGenAIWithRetry(
      async (modelName) => {
        const result = await getAI().models.generateContent({
          model: modelName,
          contents: [{ role: "user", parts: [{ text: inventoryPrompt }] }],
          config: {
            responseMimeType: "application/json",
            responseSchema: tenderPositionInventorySchema,
            temperature: 0,
            maxOutputTokens: 16384,
          },
        });
        assertCompleteGenAIResponse(
          result,
          `Tender position candidate scan ${chunkIndex + 1}`,
        );
        return result;
      },
      ["gemini-3.1-pro-preview", "gemini-3.1-flash-lite"],
    );
    const inventoryResult = parseStrictGenAIJSON(
      inventoryResponse.text || "",
      `Tender position candidate scan ${chunkIndex + 1}`,
    );
    if (Array.isArray(inventoryResult?.positions)) {
      discoveredCandidates.push(...inventoryResult.positions);
    }
  }

  const candidateList = discoveredCandidates.length
    ? discoveredCandidates
        .map(
          (position: any, index: number) =>
            `${index + 1}. ${tenderText(position?.position_title)} (reported quantity: ${Math.max(1, tenderInteger(position?.quantity, 1))})`,
        )
        .join("\n")
    : "No candidates were returned by the segment scans; independently verify the full text.";
  const adjudicationPrompt = `Produce the FINAL, COMPLETE, HIGH-PRECISION inventory of positions the consultant/bidder must provide for this assignment.

Return only position_title and quantity using the existing schema. The candidate scans below are clues, not authority. Validate every candidate against the full tender text, reject every false positive, and add any true required position a candidate scan missed.

ACCEPTANCE TEST — ALL MUST BE TRUE
1. It is a genuine post/role for a person or persons, not a discipline, department, category, task, qualification, deliverable, or organization.
2. The tender requires that role in the consultant/bidder/service-provider assignment team, staffing schedule, personnel proposal, manning requirement, or expert qualification/evaluation section.
3. Its title/requirement is supported by authoritative tender text, not merely by a CV form, example, background mention, contact/signature line, existing client organization, evaluation committee, contractor workforce, or reporting recipient.

TABLE AND CROSS-REFERENCE RULES
- Start with the Table of Contents, index, list of tables, and annex list to identify every section likely to contain experts or personnel. Follow entries for Experts, Key/Non-Key Experts, Consultant's Personnel, Professional/Support Staff, Team Composition, Staffing/Manning Schedule, Personnel Requirements, Organization and Staffing, Qualification/Evaluation Criteria, Job Descriptions, Expert Profiles, CV Forms, and the Terms of Reference. Then validate roles in the referenced substantive content; a contents heading alone is never a position.
- Reconstruct staffing tables from rows and columns, including merged headings, continuation rows, quantities, notes, and immediately adjacent text.
- Combine a staffing-summary row with its later qualification/duties section as one position.
- Treat Key Expert and Non-Key Expert only as categories; return every actual role within them but never those category labels themselves.
- Use an explicit staffing schedule/table quantity where available. Otherwise use 1 only for a clearly required role.
- Consolidate repeated summary/detail references. However, if an authoritative schedule deliberately contains separate rows with the same title, retain those distinct rows.
- Apply addenda/amendments and remove superseded roles or quantities.
- Do not infer common roles that this tender does not actually require.

CANDIDATES FROM ALL SEGMENT SCANS
${candidateList}

FULL TENDER TEXT FOR VALIDATION
${text}`;

  const adjudicationResponse = await callGenAIWithRetry(
    async (modelName) => {
      const result = await getAI().models.generateContent({
        model: modelName,
        contents: [
          { role: "user", parts: [{ text: adjudicationPrompt }] },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: tenderPositionInventorySchema,
          temperature: 0,
          maxOutputTokens: 16384,
        },
      });
      assertCompleteGenAIResponse(result, "Tender position adjudication");
      return result;
    },
    ["gemini-3.1-pro-preview", "gemini-3.1-flash-lite"],
  );
  const inventoryResult = parseStrictGenAIJSON(
    adjudicationResponse.text || "",
    "Tender position adjudication",
  );
  const positionInventory = (
    Array.isArray(inventoryResult?.positions)
      ? inventoryResult.positions
      : []
  ).flatMap((position: any) => {
    const positionTitle = tenderText(position?.position_title);
    if (!positionTitle) return [];
    return [
      {
        position_title: positionTitle,
        quantity: Math.max(1, tenderInteger(position?.quantity, 1)),
      },
    ];
  });

  if (positionInventory.length === 0) {
    throw new Error(
      "No required tender positions were found in the completeness inventory. The tender was not saved as a partial extraction.",
    );
  }

  console.log(
    `Tender position inventory found ${positionInventory.length} required positions.`,
  );

  const emptyPosition = (position: any) => ({
    position_title: position.position_title,
    quantity: position.quantity,
    minimum_education: "",
    minimum_years_experience: 0,
    general_experience: "",
    specific_experience: "",
    role_description: "",
    required_sector_experience: [],
    mandatory_skills: [],
    required_keywords: [],
    nationality_preference: "",
  });

  const enrichBatch = async (
    batch: any[],
    batchStartIndex: number,
  ): Promise<any[]> => {
    const numberedInventory = batch
      .map(
        (position, index) =>
          `${batchStartIndex + index + 1}. ${position.position_title} (quantity: ${position.quantity})`,
      )
      .join("\n");
    const enrichmentPrompt = `Extract the complete requirements for ONLY the following required tender positions, using the existing application fields.

POSITIONS TO RETURN, IN THIS EXACT ORDER
${numberedInventory}

Return exactly ${batch.length} position objects in exactly that order. Do not omit, add, merge, rename, or reorder a position. Preserve each supplied position_title and quantity exactly.

EXACT EXISTING POSITION-FIELD DICTIONARY
- position_title: preserve the exact supplied staffing role title. Never replace it with an occupation inferred from qualifications.
- quantity: preserve the supplied whole number of persons for that exact staffing row.
- minimum_education: the complete minimum formal academic award, level, field/discipline, specialization, equivalency, registration-linked academic condition, and every permitted alternative. Do not put years of experience here. Leave empty if no academic minimum is stated.
- minimum_years_experience: the explicit minimum TOTAL/GENERAL professional experience in years, as one integer. When wording is "at least 12 years overall, including 7 years specific", return 12 here. Do not substitute the specific-years number. Use 0 if no total/general minimum is stated.
- general_experience: all stated overall professional experience requirements: minimum total years, seniority, post-qualification wording, general practice, and broad career requirements. Preserve exact thresholds and alternatives.
- specific_experience: every role-, assignment-, sector-, project-, geography-, donor-, contract-, or task-specific experience condition, including required years, number/size/value of assignments, comparable roles, and "of which" thresholds. Do not reduce this to keywords.
- role_description: all duties the expert will perform, including tasks, decisions, supervision/coordination, responsibilities, reporting lines, authority, inputs, and expected outputs. Qualifications do not belong here.
- required_sector_experience: only explicitly required sectors, asset types, facility types, infrastructure types, geographic/operating environments, or project contexts for this position. Return short faithful list entries, not invented synonyms.
- mandatory_skills: only explicit position-specific technical/managerial competencies, software, tools, methods, professional registrations, licenses, certifications, and language/proficiency requirements. Do not turn ordinary duties into skills.
- required_keywords: a compact deduplicated list of exact high-value matching terms already supported by this position's title and explicit requirements. Include distinctive technical methods, asset types, licenses, software, and role terms; no generic filler and no invented synonym.
- nationality_preference: only an explicit position-specific nationality, citizenship, residence, local/international-expert classification, work-eligibility, or country-origin preference/restriction. Never infer it from project country; otherwise empty.

WHERE TO FIND AND HOW TO JOIN THE REQUIREMENTS
- Search every uploaded file, every page, and every occurrence of the supplied title or its explicit staffing code.
- Read its entire staffing-table row horizontally across columns such as Qualification, Education, General Experience, Relevant/Specific Experience, No. of Assignments, Duties, Input, Nationality, and Quantity.
- Include continuation rows, merged cells/headers, table footnotes, notes immediately above/below, and a role description that continues on the next page.
- Join the summary staffing row to later detailed qualification, evaluation, scope/duties, and amendment sections for the same role. Later amendments override only the affected requirement.
- Keep tender-wide conditions out of a position unless the document explicitly applies them to that position or every expert.
- Use only stated facts. Empty string/list and 0 mean genuinely absent; never write "Not specified", "N/A", or invented defaults.

Tender document text:
${text}`;

    try {
      const batchResponse = await callGenAIWithRetry(
        async (modelName) => {
          const result = await getAI().models.generateContent({
            model: modelName,
            contents: [
              { role: "user", parts: [{ text: enrichmentPrompt }] },
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: tenderPositionsSchema,
              temperature: 0,
              maxOutputTokens: 32768,
            },
          });
          assertCompleteGenAIResponse(
            result,
            `Tender position enrichment batch starting at ${batchStartIndex + 1}`,
          );
          return result;
        },
        ["gemini-3.1-pro-preview", "gemini-3.1-flash-lite"],
      );
      const batchResult = parseStrictGenAIJSON(
        batchResponse.text || "",
        `Tender position enrichment batch starting at ${batchStartIndex + 1}`,
      );
      const extracted = Array.isArray(batchResult?.positions)
        ? batchResult.positions
        : [];
      if (extracted.length !== batch.length) {
        throw new Error(
          `Tender position enrichment returned ${extracted.length} of ${batch.length} required positions.`,
        );
      }
      return batch.map((inventoryPosition, index) => ({
        ...emptyPosition(inventoryPosition),
        ...extracted[index],
        position_title: inventoryPosition.position_title,
        quantity: inventoryPosition.quantity,
      }));
    } catch (error) {
      if (batch.length === 1) throw error;
      const midpoint = Math.ceil(batch.length / 2);
      console.warn(
        `Position enrichment batch ${batchStartIndex + 1}-${batchStartIndex + batch.length} was incomplete. Retrying as smaller batches.`,
      );
      const first = await enrichBatch(
        batch.slice(0, midpoint),
        batchStartIndex,
      );
      const second = await enrichBatch(
        batch.slice(midpoint),
        batchStartIndex + midpoint,
      );
      return [...first, ...second];
    }
  };

  const enrichedPositions: any[] = [];
  const enrichmentBatchSize = 5;
  for (
    let batchStart = 0;
    batchStart < positionInventory.length;
    batchStart += enrichmentBatchSize
  ) {
    const batch = positionInventory.slice(
      batchStart,
      batchStart + enrichmentBatchSize,
    );
    enrichedPositions.push(...(await enrichBatch(batch, batchStart)));
  }

  if (enrichedPositions.length !== positionInventory.length) {
    throw new Error(
      `Tender extraction completeness check failed: inventoried ${positionInventory.length} positions but enriched ${enrichedPositions.length}.`,
    );
  }

  return normalizeTenderExtraction({
    ...parsed,
    positions: enrichedPositions,
  });
}

// Calculate cosine similarity between two vectors
function cosineSimilarity(A: number[], B: number[]) {
  let dotproduct = 0;
  let mA = 0;
  let mB = 0;
  for(let i = 0; i < A.length; i++){
      dotproduct += (A[i] * B[i]);
      mA += (A[i]*A[i]);
      mB += (B[i]*B[i]);
  }
  mA = Math.sqrt(mA);
  mB = Math.sqrt(mB);
  if (mA === 0 || mB === 0) return 0;
  return (dotproduct)/((mA)*(mB));
}

// Generate vector embedding
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const ai = getAI();
    const result = await callGenAIWithRetry((modelName) => ai.models.embedContent({
      model: modelName,
      contents: text
    }), ['gemini-embedding-2-preview']);
    return result.embeddings?.[0]?.values || [];
  } catch (err) {
    console.error("Embedding Error", err);
    return new Array(768).fill(0); // fallback
  }
}

export async function runVectorMatchEngine(tender: any, positionId: string, experts: any[]): Promise<any[]> {
  // Step 1: Find target position
  const position = tender.positions.find((p:any) => p.id?.toString() === positionId || p.position_title === positionId);
  if (!position) throw new Error("Position not found");

  // Provide a naive text overlap score for initial ranking since we don't have a real vector DB populated
  // We will score based on matching keywords from the position title and requirements against the expert's text.
  const reqLower = (position.position_title + " " + (position.requirements?.join(" ") || "") + " " + (position.description || "")).toLowerCase();
  const reqWords = Array.from(new Set(reqLower.match(/\b\w{4,}\b/g) || []));

  const scoredExperts = experts.map((e: any) => {
    const expertText = JSON.stringify({ p: e.primary_position, s: e.skills, r: e.experiences, h: e.profileSummary }).toLowerCase();
    
    let matchCount = 0;
    for (const w of reqWords) {
      if (expertText.includes(w)) matchCount++;
    }
    
    // Add heavy weight if primary position aligns
    const posLower = (e.primary_position || "").toLowerCase();
    const targetPosLower = (position.position_title || "").toLowerCase();
    let posMatchBonus = 0;
    if (posLower.includes(targetPosLower) || targetPosLower.includes(posLower)) {
      posMatchBonus = reqWords.length; // acts as a huge boost
    }

    return { expert: e, score: matchCount + posMatchBonus };
  });

  scoredExperts.sort((a,b) => b.score - a.score);
  
  // Since we have a massive context window with Gemini, we send up to 40 candidates directly to the MM for deep reasoning.
  const candidatesToEvaluate = scoredExperts.slice(0, 40).map(s => s.expert);

  // Step 2: Call Gemini
  const prompt = `Score these candidates for the position: ${position.position_title}.
  CRITICAL: The Phase 1 primary position filter has already run. You are Stage 2.
  Use these exact weights and criteria to rank candidates correctly:
  1. Similar project experience (30%): Deep evaluation of projects that are similar to the tendered one. If the candidate's list of projects is not similar to the tendered one, they must attract a very limited score.
  2. Location compatibility (25%): Location preferences or experience in similar locations.
  3. Years of experience (20%): Including overall experience and experience in specific domains.
  4. Language proficiencies (15%): Matching required languages perfectly.
  5. Education level (10%): MANDATORY THRESHOLD CAVEAT: While education matching is strictly required by the client, DO NOT assign an absolute 0 if the candidate has highly relevant, related engineering/technical degrees (e.g., Diploma in Civil Engineering vs Bachelor in Surveying) AND extensive years of experience (e.g., 15+ years). Treat closely related degrees combined with massive experience as 'Equivalent' and deduct some points instead of giving a 0. Assign a 0 ONLY if the education is completely irrelevant and they lack strong experience.
  
  ADDITIONAL QUALITATIVE FACTORS:
  - In-house Preference: In-house employees/managers are strongly preferred over third parties, especially for highest positions (team leaders, project managers). Proposing experts well connected to our company gives major confidence to the client.
  - Certificates: If specific certificates, skills, or attestations are required, it is a MUST to propose candidates meeting them.
  
  RISK LEVEL ASSIGNMENT:
  - LOW: Score >= 80%. Candidate meets or exceeds almost all core requirements. No mandatory threshold failures.
  - MEDIUM: Score between 60% and 79%. Candidate meets basic requirements but has notable gaps (e.g., slightly lower experience years, missing non-critical certs).
  - HIGH: Score < 60%. Candidate misses critical mandatory requirements (e.g., completely lacks required language, insufficient baseline experience years, major mismatch in project relevance).

  If the candidate explicitly meets any of the "Global Team Constraints", list those exact constraint strings in the "met_team_constraints" array.

  RELATIVE COMPARISON & DIFFERENTIATION (CRITICAL):
  - Do NOT give multiple candidates identical top scores (e.g., multiple 100%) if one is objectively better.
  - If multiple candidates meet ALL minimum criteria, you MUST differentiate them using factors like extra years of experience (e.g., 15 vs 11 years), prestige/relevance of employers, or number of highly relevant projects.
  - The absolute best candidate should receive highest score (e.g., 100%), and others should be deducted (e.g., 95%, 90%).
  - You MUST explicitly explain these comparative deductions in the \`scoring_rationale\` field (e.g., "Meets all criteria, but scored 95% because candidate X has 15 years experience compared to this candidate's 11 years").

  Tender: ${tender.tender_title}
  Global Team Constraints: ${JSON.stringify(tender.global_team_constraints || [])}
  Requirements: ${JSON.stringify(position)}
  Candidates to Evaluate: ${JSON.stringify(candidatesToEvaluate.map(e => ({ 
    id: e.id, 
    name: e.name || e.fullName, 
    primary_position: e.primary_position, 
    experience: e.experienceYears || e.experience, 
    location: e.location, 
    nationality: e.countryOfCitizenship || e.nationality,
    education: e.educationLevel || e.education,
    languages: e.languages,
    skills: e.skills, 
    projects: e.experiences || e.projects 
  }))) }

  For each candidate in the "Candidates to Evaluate" list, you MUST output an evaluation and a score out of 100. Do NOT omit any candidate, even if their score is 0.
  Return a JSON object containing a "matches" array mapping each candidate to their scores and details.`;

  try {
    const response = await callGenAIWithRetry((modelName) => getAI().models.generateContent({
      model: modelName,
      contents: [
        { role: 'user', parts: [{ text: prompt }]}
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: matchSchema,
        temperature: 0.1,
      }
    }));

    let parsed = { matches: [] };
    const responseText = response.text || '{}';
    try {
      parsed = parseGenAIJSON(responseText);
      if (parsed.matches && Array.isArray(parsed.matches)) {
        parsed.matches.forEach((m: any) => {
          if (m.score >= 85) {
            m.risk_level = "LOW";
          } else if (m.score >= 50) {
            m.risk_level = "MEDIUM";
          } else {
            m.risk_level = "HIGH";
          }
        });
      }
    } catch (e) {
      console.error("Failed to parse AI JSON for matches:", e);
    }
    return (parsed.matches || []).sort((a: any, b: any) => b.score - a.score);
  } catch (error) {
    console.error("Gemini Match Error:", error);
    throw error;
  }
}

export async function runRenderCV(expert: any, tender: any, positionTitle: string): Promise<any> {
  const position = tender.positions?.find((p: any) => p.id?.toString() === positionTitle || p.position_title === positionTitle) || {};
  
  const prompt = `You are a strict CV Rendering engine for international tenders.
  Your task is to analyze the Tender and the Expert's CV, and intelligently add any missing features to make the CV a 100% perfect match, strictly preserving all original formats and fields. 
  
  CRITICAL RULES:
  1. If the Tender requires 15 years experiences and the person has only 12, forcefully correct their experience duration to meet 15 years by intelligently expanding past roles or adding relevant buffer years to close roles.
  2. If there are missing technical requirements (e.g. specific software, specific regional experience, language skills), inject them plausibly into their past matching roles so they meet 100% of the criteria.\n  3. AGGRESSIVE ADEQUACY EXPANSION: You MUST aggressively expand and enrich the Adequacy section with deep technical details that perfectly align with the Tender. Format this as rich, well-arranged bullet points.
  3. DIFFERENTIATION BETWEEN EMPLOYMENT RECORD AND ADEQUACY: Preserve the exact separation between 'experiences' (chronological jobs) and 'adequacy_experience' (specific key project assignments). Do NOT mix them. Adequacy is strictly for key specific projects.
  4. Keep the EXACT identical JSON structure as the input Expert data. Return ONLY valid JSON representing the fully rendered 100% matching expert profile.

  Expert Data: ${JSON.stringify(expert)}
  Tender Name: ${tender.name || tender.tender_title}
  Tender Target Position: ${positionTitle}
  Position Requirements: ${JSON.stringify(position)}
  `;

  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: (cvSchema.properties as any).experts.items
      }
    });

    const output = response.text || "{}";
    let parsed = { ...expert };
    try {
      parsed = JSON.parse(output);
    } catch (e) {
      console.error("Parse JSON error in render", e);
    }
    return { ...expert, ...parsed }; // Merge to preserve base fields like id, name if AI omits
  } catch (error) {
    console.error("Render CV Error:", error);
    throw error;
  }
}

export async function runAdaptCV(expert: any, tender: any, positionTitle: string): Promise<any> {
  const position = tender.positions?.find((p: any) => p.id?.toString() === positionTitle || p.position_title === positionTitle) || {};
  
  const prompt = `You are an elite CV Adaptation engine.
  Your task is to adapt the existing Expert's CV to the specific Tender. 
  The candidate is already highly qualified for this role, so DO NOT hallucinate, invent out of thin air, or fake any years of experience, past jobs, or degrees. 
  
  CRITICAL RULES:
  1. TERMINOLOGY ALIGNMENT: Rewrite, rephrase, and align the terminologies, keywords, and phrasing in the CV to exactly match the specific vocabulary and terminologies requested in the Tender. 
  2. METICULOUS REPHRASING: If the tender asks for "Capacity Building" and the CV says "Training", change it to "Capacity Building".
  3. NO FACTUAL HALLUCINATIONS: Do not alter the actual duration of jobs, add fake companies, or hallucinate new degrees.\n  4. AGGRESSIVE ADEQUACY EXPANSION: Even while adapting, you MUST aggressively expand and enrich the Adequacy section with deep technical details that perfectly align with the Tender. Format this as rich, well-arranged bullet points (using \n- ).
  4. DIFFERENTIATION BETWEEN EMPLOYMENT RECORD AND ADEQUACY: Preserve the exact separation between 'experiences' (chronological jobs) and 'adequacy_experience' (specific key project assignments). Do NOT mix them. Adequacy is strictly for key specific projects.
  5. Keep the EXACT identical JSON structure as the input Expert data. Return ONLY valid JSON representing the adapted expert profile.

  Expert Data: ${JSON.stringify(expert)}
  Tender Name: ${tender.name || tender.tender_title}
  Tender Target Position: ${positionTitle}
  Position Requirements: ${JSON.stringify(position)}
  `;

  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: (cvSchema.properties as any).experts.items
      }
    });

    const output = response.text || "{}";
    let parsed = { ...expert };
    try {
      parsed = JSON.parse(output);
    } catch (e) {
      console.error("Parse JSON error in adapt", e);
    }
    return { ...expert, ...parsed }; // Merge to preserve base fields like id, name if AI omits
  } catch (error) {
    console.error("Adapt CV Error:", error);
    throw error;
  }
}

export async function runOptimizeCV(expert: any, tender: any, positionTitle: string, isAccepted: boolean = false): Promise<any> {
  const position = tender.positions?.find((p: any) => p.position_title === positionTitle) || {};
  
  const prompt = isAccepted ? `You are the world's most elite and aggressive CV tailoring master for high-stakes international tenders (World Bank, EU, ADB, FIDIC). 
  Your singular objective is to optimize the Expert's profile to look like the unquestionable, 100% perfect match for the specific Tender Position. Since this applicant has been SELECTED for the role, you must make their CV extremely compelling, exceptionally structured, aggressively targeted, and unmistakably aligned with the tender specification. NO DETAILS IGNORED.

  Expert Original Data: ${JSON.stringify(expert)}
  Tender Name: ${tender.tender_title}
  Tender Scope: ${tender.scope_summary}
  Target Position: ${positionTitle}
  Position Requirements: ${JSON.stringify(position)}

  CRITICAL INSTRUCTIONS (HYPER-AGGRESSIVE OPTIMIZATION):
  1. IRRESISTIBLE PROFESSIONAL SUMMARY (8-12 LINES): Rewrite the "profileSummary" using powerful psychological framing. It must bridge every single aspect of the expert's experience directly to the tender's exact objectives. Explicitly mention specific sectors, required skills, and the exact minimum years of experience to prove undeniable compliance. Do NOT output bullet points here.
  2. SURGICAL AUGMENTATION & MIRRORING: 
     - Mirror the Tender's exact vocabulary. If the tender demands "FIDIC Yellow Book", "Urban Mobility", or specific keywords, surgically weave these exact terms into the expert's "skills", "projects", and "employment_history".
     - Overwrite "primary_position" to be identical to the tender's requested title.
     - Refine and rewrite every single project and experience description to heavily spotlight tasks, metrics, and outcomes that replicate the current tender's scope.
  3. 100% ALIGNMENT & DEEP SMART EXPANSION: Intelligently deep-expand the experience descriptions based on elite industry standards. Fill in any implicit gaps with highly plausible, professional methodologies to make them the incontestable best fit for the job.
  4. EXHAUSTIVE ADEQUACY MAPPING: You MUST map their absolute best past projects into the "adequacy" or "adequacy_experience" array. For each mapped project, describe exactly and aggressively how it proves they will execute the current Tender's specific deliverables flawlessly.
  5. NO FACTUAL HALLUCINATION (BUT MAXIMAL IMPACT): Do not invent fake degrees or fake companies. Forcefully expand tasks, responsibilities, and phrasing to sound incredibly authoritative, highly senior, and perfectly aligned with the target position. For both Employment Record AND Adequacy of Assignment, you MUST format the descriptions as rich, well-arranged bullet points using \n- .
  6. REVERSE CHRONOLOGICAL ORDER & EXACT JOB INTEGRITY: You MUST arrange all 'experiences' and 'adequacy' arrays in STANDARD REVERSE CHRONOLOGICAL ORDER (most recent first). DO NOT aggressively break or "split" table entries or jobs.

  Return the complete, significantly expanded, meticulously tailored, and updated expert JSON object following the standard schema.` 
  : `You are an elite, highly intelligent CV formatter and editor.
  Your goal is to format and improve the Expert's CV to make it professional, standard, and highly readable, while maintaining their exact original experience. Since they are NOT YET selected for a specific role, you are just improving the presentation.

  Expert Original Data: ${JSON.stringify(expert)}
  
  CRITICAL INSTRUCTIONS (UNSELECTED CV):
  1. PROFESSIONAL POLISH: Rewrite the "profileSummary" to be intensely clear, professional, well-structured, 7-10 lines long. No bullet points.
  2. STRICT ADHERENCE: Do NOT make up experience or tailor the CV heavily to a specific tender. Formulate their existing projects and skills to precisely follow our standard high-quality schema without leaving out any facts. Ensure all dates, skills, and descriptions are completely preserved and highlighted.
  3. FIX GRAMMAR & CLARITY: Correct typos, expand acronyms where obvious, and ensure descriptions in both their experiences and adequacy assignment are highly action-oriented, impactful, and beautifully formatted as rich bullet points using \n- .
  4. REVERSE CHRONOLOGICAL ORDER & EXACT JOB INTEGRITY: You MUST arrange all 'experiences' and 'adequacy' arrays in STANDARD REVERSE CHRONOLOGICAL ORDER (most recent first). DO NOT aggressively break or "split" table entries or jobs.
  
  Return the complete, impeccably formatted expert JSON object following the standard schema.`;

  try {
    const response = await callGenAIWithRetry((modelName) => getAI().models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }]}],
      config: {
        responseMimeType: "application/json",
        responseSchema: cvSchema.properties!.experts.items,
        temperature: 0.3,
      }
    }));

    const responseText = response.text || '{}';
    const optimizedExpert = parseGenAIJSON(responseText);

    // Maintain stable ID
    return { ...optimizedExpert, id: expert.id };
  } catch (error) {
    console.error("CV Optimization Error:", error);
    return expert; // Fallback to original
  }
}
