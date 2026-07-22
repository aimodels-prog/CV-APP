import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, FileSpreadsheet, Loader2, AlertCircle, Copy, CheckCircle } from "lucide-react";
import Papa from "papaparse";
import { api } from "../lib/api";
import { useTasks } from "../lib/TasksContext";
import {
  normalizeEducationLevel,
  normalizeDateForInput,
  normalizeExpertType,
  splitCommaSeparated,
} from "../lib/expertNormalization";

interface ImportExpertCsvModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}


const parseEducationList = (text: any) => {
  if (typeof text !== 'string' || !text.trim()) return [];
  const lines = text.split('\n');
  const blocks: string[] = [];
  let currentEntry = "";
  for (const line of lines) {
    if (line.includes('|')) {
      if (currentEntry.trim()) blocks.push(currentEntry.trim());
      currentEntry = line + '\n';
    } else {
      currentEntry += line + '\n';
    }
  }
  if (currentEntry.trim()) blocks.push(currentEntry.trim());

  return blocks.map(block => {
    const parts = block.split('|').map(p => {
      return p.trim().replace(/^[*\s\"\[]+/, '').replace(/[\*\s\"\]]+$/, '');
    });
    
    if (parts.length >= 4) {
      return {
        year: parts[0],
        country: parts[1],
        location: parts[1],
        institution: parts[2],
        degree: parts[3],
        field: parts.slice(4).join(' ').trim()
      };
    } else if (parts.length === 3) {
      return { year: parts[0], institution: parts[1], degree: parts[2] };
    }
    return { degree: block.trim().replace(/^[*\s\"\[]+/, '').replace(/[\*\s\"\]]+$/, '') };
  });
};

const parseCustomList = (text: any) => {
  if (typeof text !== 'string' || !text.trim()) return [];
  
  const lines = text.split('\n');
  const blocks: string[] = [];
  let currentEntry = "";
  
  for (const line of lines) {
    if (line.includes('|')) {
      if (currentEntry.trim()) blocks.push(currentEntry.trim());
      currentEntry = line + '\n';
    } else {
      currentEntry += line + '\n';
    }
  }
  if (currentEntry.trim()) blocks.push(currentEntry.trim());

  return blocks.map(block => {
    const parts = block.split('|').map(p => {
      return p.trim().replace(/^[*\s\"\[]+/, '').replace(/[\*\s\"\]]+$/, '');
    });
    
    if (parts.length >= 5) {
      return {
        period: parts[0],
        duration: parts[0],
        country: parts[1],
        client: parts[2],
        company: parts[2],
        organization: parts[2],
        position: parts[3],
        role: parts[3],
        description: parts.slice(4).join(' | ').trim(),
        assignmentDescription: parts.slice(4).join(' | ').trim()
      };
    } else if (parts.length === 4) {
      return {
        period: parts[0],
        duration: parts[0],
        country: parts[1],
        client: parts[2],
        company: parts[2],
        organization: parts[2],
        description: parts[3],
        assignmentDescription: parts[3]
      };
    } else if (parts.length > 1) {
      return {
        period: parts[0],
        duration: parts[0],
        description: parts.slice(1).join(' | ').trim(),
        assignmentDescription: parts.slice(1).join(' | ').trim()
      };
    }
    return { 
      description: block.trim().replace(/^[*\s\"\[]+/, '').replace(/[\*\s\"\]]+$/, ''), 
      assignmentDescription: block.trim().replace(/^[*\s\"\[]+/, '').replace(/[\*\s\"\]]+$/, '') 
    };
  });
};


const parseAdditionalInformation = (text: any) => {
  if (typeof text !== 'string' || !text.trim()) return [];
  
  const lines = text.split('\n');
  const blocks: string[] = [];
  let currentEntry = "";
  
  for (const line of lines) {
    if (line.includes('|')) {
      if (currentEntry.trim()) blocks.push(currentEntry.trim());
      currentEntry = line + '\n';
    } else {
      currentEntry += line + '\n';
    }
  }
  if (currentEntry.trim()) blocks.push(currentEntry.trim());

  return blocks.map(block => {
    const parts = block.split('|').map(p => {
      return p.trim().replace(/^[*\s\"\[]+/, '').replace(/[\*\s\"\]]+$/, '');
    });
    
    if (parts.length >= 2) {
      return {
        key: parts[0],
        value: parts.slice(1).join(' | ').trim()
      };
    }
    
    return { 
       key: 'Additional Info',
       value: block.trim().replace(/^[*\s\"\[]+/, '').replace(/[\*\s\"\]]+$/, '')
    };
  });
};

const parseYears = (str: any) => {
  if (!str) return 0;
  if (typeof str === 'number') return str;
  const match = str.toString().match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
};

export function ImportExpertCsvModal({
  isOpen,
  onClose,
  onSuccess,
}: ImportExpertCsvModalProps) {
  const [csvText, setCsvText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const { setPendingExpert } = useTasks();

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(`Transcribe and enrich an Expert's CV into our strict CSV format.\nReturn ONLY raw CSV text starting with header row. No markdown blocks.\nHeaders (EXACT ORDER):\nfullName, primary_position, role, email, phone, location, countries, dateOfBirth, countryOfCitizenship, availability, profileSummary, type, educationLevel, experienceYears, languages, skills, software, certifications, educations, experiences, adequacy_experience, projects, additional_information\n\nCSV ESCAPING:\n1. Enclose EVERY field containing commas, newlines, or quotes in double quotes (\").\n2. Escape double quotes by doubling them (\"\"). DO NOT use pipe (|) for CSV columns. Use commas (,).\n\nNESTED LISTS (educations, experiences, adequacy_experience, projects, additional_information):\n1. MULTIPLE entries are joined by newlines in a SINGLE CSV cell enclosed in double quotes (\").\n2. Each entry is a single block using pipe-separated bracketed values.\n3. DO NOT summarize job descriptions, projects, or assignments. Keep detailed bullet points EXACTLY as they appear, intact inside the last bracket. DO NOT miss any job description or any Adequacy Experience that is in the CV.\n4. \"experiences\": comprehensive work history. MUST contain FULL, exhaustive job description exactly as in CV (use • for bullets).\n5. \"adequacy_experience\": specific assignments done during those jobs. Assignment Description MUST be extracted as bullet points (use •).\n6. \"projects\": standalone projects. \"additional_information\": other qualifications.\n\n--- NESTED FORMATS ---\n\nADDITIONAL INFORMATION FORMAT:\n[Category] | [Details]\nExample:\n\"[Key Qualifications] | [Expert in XYZ.]\n[Memberships] | [Member of ABC.]\"\n\nEXPERIENCES & ADEQUACY EXPERIENCE FORMAT:\n[Period] | [Country] | [Company/Client] | [Position] | [Work Experience / Assignment Description (MUST use • for bullets)]\nExample (Note: whole cell is quoted, newlines separate entries):\n\"[Jan 2010 - Present] | [USA] | [Acme Corp] | [Resident Engineer] | [Managed large-scale construction.\n• Budgeting and scheduling.]\n[Feb 2005 - Dec 2009] | [USA] | [Beta Build] | [Site Engineer] | [• Supervised site operations.]\"\n\nEDUCATIONS FORMAT:\n[Year] | [Country] | [Institution] | [Degree] | [Field of Study]\nCRITICAL: Never just write 'Diploma' or 'Degree'. MUST extract exact field of study.\nExample: \"[2000 - 2004] | [USA] | [MIT] | [Bachelor's Degree] | [Civil Engineering]\"\n\nPROJECTS FORMAT:\n[Year] | [Country] | [Client] | [Position] | [Project Description (use •)]\n\n--- COMMA-SEPARATED FIELDS ---\nFor 'languages', 'skills', 'software', 'certifications', 'countries': Separate values with comma. Example: \"Project Management, AutoCAD\"\n\n--- PROFILE SUMMARY ---\nExtract or synthesize a 'profileSummary' capturing the expert's full narrative. If missing or <5 lines, rewrite a majestic, rich, professional profile statement (1 full paragraph, 7-10 lines). Highlight major accomplishments, total years experience, key sectors, and technical mastery. Ensure multiline cells are properly quoted! Leave no detail behind.\n`);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  const handleImport = async () => {
    if (!csvText.trim()) {
      setError("Please paste the CSV or JSON data.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let rows: any[] = [];

      // Try parsing as JSON first
      const trimmedText = csvText.trim();
      if (trimmedText.startsWith("[") && trimmedText.endsWith("]")) {
        try {
          rows = JSON.parse(trimmedText);
        } catch (jsonErr: any) {
          throw new Error("Invalid JSON format: " + jsonErr.message);
        }
      } else {
        // Fallback to CSV parsing
        const result = Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
        });

        if (result.errors.length > 0) {
          throw new Error(result.errors[0].message);
        }
        rows = result.data as any[];
      }

      if (rows.length === 0) {
        throw new Error("No data found in the pasted text.");
      }

      const newExperts = rows.map((row: any) => ({
        fullName: row.fullName || row.name || "",
        primary_position: row.primary_position || row.position || "",
        role: row.role || "",
        email: row.email || "",
        phone: row.phone || "",
        location: row.location || "",
        countries: splitCommaSeparated(row.countries),
        dateOfBirth: normalizeDateForInput(row.dateOfBirth),
        countryOfCitizenship: row.countryOfCitizenship || row.citizenship || "",
        availability: row.availability || "",
        profileSummary: row.profileSummary || row.summary || "",
        type: normalizeExpertType(row.type),
        educationLevel: normalizeEducationLevel(row.educationLevel || row.education),
        experienceYears: parseYears(row.experienceYears),
        languages: typeof row.languages === 'string' ? row.languages.split(',').map((s: string) => ({ name: s.trim() })).filter((l: any) => l.name) : (row.languages || []),
        skills: splitCommaSeparated(row.skills),
        software: splitCommaSeparated(row.software),
        certifications: typeof row.certifications === 'string' ? row.certifications.split(',').map((s: string) => ({ title: s.trim() })).filter((c: any) => c.title) : (row.certifications || []),
        experiences: Array.isArray(row.experiences) ? row.experiences : (typeof row.experiences === 'string' ? parseCustomList(row.experiences) : []),
        projects: Array.isArray(row.projects) ? row.projects : (typeof row.projects === 'string' ? parseCustomList(row.projects) : []),
        adequacy_experience: Array.isArray(row.adequacy_experience) ? row.adequacy_experience : (typeof row.adequacy_experience === 'string' ? parseCustomList(row.adequacy_experience) : (typeof row.adequacy === 'string' ? parseCustomList(row.adequacy) : [])),
        metadata: {
          educations: Array.isArray(row.educations) ? row.educations : (typeof row.educations === 'string' ? parseEducationList(row.educations) : []),
          languages: typeof row.languages === 'string' ? row.languages.split(',').map((s: string) => ({ name: s.trim() })).filter((l: any) => l.name) : (row.languages || []),
          certifications: typeof row.certifications === 'string' ? row.certifications.split(',').map((s: string) => ({ title: s.trim() })).filter((c: any) => c.title) : (row.certifications || []),
          adequacy: Array.isArray(row.adequacy_experience) ? row.adequacy_experience : (typeof row.adequacy_experience === 'string' ? parseCustomList(row.adequacy_experience) : (typeof row.adequacy === 'string' ? parseCustomList(row.adequacy) : [])),
          unmapped_data: Array.isArray(row.additional_information) ? row.additional_information : (typeof row.additional_information === 'string' ? parseAdditionalInformation(row.additional_information) : [])
        }
      }));

      const missingNames = newExperts
        .map((expert, index) => (!String(expert.fullName).trim() ? index + 1 : null))
        .filter((index): index is number => index !== null);
      if (missingNames.length > 0) {
        throw new Error(`Missing fullName in CSV row${missingNames.length > 1 ? "s" : ""}: ${missingNames.join(", ")}.`);
      }

      setPendingExpert(newExperts);
      setCsvText("");
      onClose();
    } catch (err: any) {
      console.error("Import error:", err);
      setError(err.message || "Failed to parse and import data.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]"
        >
          <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <FileSpreadsheet size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800">
                  Import Notebook Expert Text
                </h2>
                <p className="text-sm text-slate-500">
                  Paste the expert CSV or JSON text below to auto-populate the database. JSON supports nested experiences.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-6 overflow-y-auto">
            {error && (
              <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-lg flex items-start gap-3 border border-red-100 text-sm">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-slate-600">
                Paste your CSV data below. You can use an AI like NotebookLM to convert resumes into our required CSV format.
              </p>
              <button
                onClick={handleCopyPrompt}
                className="flex items-center gap-2 shrink-0 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-medium transition-colors"
                title="Copy prompt for NotebookLM"
              >
                {isCopied ? <CheckCircle size={14} /> : <Copy size={14} />}
                {isCopied ? "Prompt Copied!" : "Copy AI Prompt"}
              </button>
            </div>
            <textarea
              className="w-full h-64 p-4 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none whitespace-pre"
              placeholder="Paste raw CSV text here...&#10;&#10;Required Headers:&#10;fullName, primary_position, role, email, phone, location, countries, dateOfBirth, countryOfCitizenship, availability, profileSummary, type, educationLevel, experienceYears, languages, skills, software, certifications, educations, experiences, adequacy_experience, projects&#10;&#10;(For lists like skills or countries, separate values with a comma)"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-100 bg-slate-50 shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={isLoading || !csvText.trim()}
              className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Importing...
                </>
              ) : (
                "Import Experts"
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
