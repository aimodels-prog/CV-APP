import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, FileSpreadsheet, Loader2, AlertCircle } from "lucide-react";
import Papa from "papaparse";
import { api } from "../lib/api";
import { useTasks } from "../lib/TasksContext";

interface ImportTenderCsvModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ImportTenderCsvModal({
  isOpen,
  onClose,
  onSuccess,
}: ImportTenderCsvModalProps) {
  const [csvText, setCsvText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setPendingTender } = useTasks();
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(`Extract information from selected Tender/ToR documents into STRICT CSV. Treat all volumes of the same tender as ONE package. Use ONLY facts in those documents; never use memory, previous answers or another tender.
Return ONLY raw CSV starting with the header row. No markdown/commentary.

Use EXACTLY these headers in this order:
internal_code,name,client,deadline,status,country,tender_format,tender_number,submission_type,project_sector,scope_summary,duration,special_requirements,global_team_constraints,objective,background,scope_of_work,deliverables,methodology,reporting,languages,budget_details,position_title,position_quantity,position_minimum_education,position_minimum_years_experience,position_general_experience,position_specific_experience,position_role_description,position_required_sector_experience,position_mandatory_skills,position_required_keywords,position_nationality_preference

CSV RULES:
1. Every row MUST have exactly 33 fields in header order.
2. Quote fields containing commas, newlines or quotes. Escape " as "".
3. Use commas for columns; NEVER pipes (|).
4. Join project_sector, special_requirements and global_team_constraints with semi-colons (;).
5. Join position_mandatory_skills and position_required_keywords with commas inside a quoted field.
6. Never add, rename or rearrange headers. Leave unknown fields empty; never invent.

FIND EVERY POSITION FIRST:
1. Read every Table of Contents. Find Personnel, Staffing, Consultant Resources, Team Composition, Key/Non-Key Experts, Evaluation, Staff-Month Schedules, CV Forms, Job Descriptions and Annexes.
2. Scan EVERY page/table in all volumes. Build an internal checklist of each required position's exact title/code and quantity.
3. A valid position appears in a personnel table, requests a CV, has a quantity/staff-month/JOB TITLE, or explicitly requires the consultant to provide that person.
4. Do not turn disciplines, duties, departments, deliverables, equipment or evaluation subjects into positions. Do not merge distinct positions because duties overlap.
5. Revisit each position across all files and combine its quantity, education, general/specific experience, duties, sectors, skills and nationality conditions.

POSITION ROWS:
Extract EVERY explicitly required personnel position. Create ONE NEW ROW per distinct position. Use position_quantity when multiple people share a role.
Duplicate ALL general tender information in every row. Change only position_* fields. Repeat exactly the same internal_code and name so the app groups all rows as one tender.

FIELD INSTRUCTIONS:
'status'='OPEN' by default. 'tender_format'=PDF or DOCX.
Extract or generate 'internal_code' once and repeat it. Use YYYY-MM-DD for a complete 'deadline'.
'position_title'=exact role. 'position_quantity'=integer, default 1 only if implied.
'position_minimum_education'=exact qualification and discipline.
'position_minimum_years_experience'=minimum total/general years integer; 0 only if unstated.
'position_general_experience' and 'position_specific_experience'=exact requirements, including local/Omani alternatives.
'position_role_description'=all stated duties, responsibilities, authority and reporting.
Other position_* fields contain only supported sector experience, mandatory skills, matching keywords and nationality conditions.

DETAIL AND FINAL CHECK:
Preserve comprehensive detail in every tender and position field. Retain every material fact, responsibility, qualification, experience requirement, condition and deliverable. Do not summarize away important information.
Compare rows/quantities with every personnel table, JOB TITLE, evaluation table, schedule, form and annex. Add every omission; remove duplicates/inventions. NEVER omit a required position.`);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };


  const handleImport = async () => {
    if (!csvText.trim()) {
      setError("Please paste the CSV data.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
      });

      if (result.errors.length > 0) {
        throw new Error(result.errors[0].message);
      }

      const rows = result.data as any[];

      if (rows.length === 0) {
        throw new Error("No data found in the pasted CSV.");
      }

      // Group rows by tender (using internal_code or name)
      const tendersMap = new Map<string, any>();

      for (const row of rows) {
        const tenderKey = row.internal_code || row.name || "Unknown_Tender";
        
        if (!tendersMap.has(tenderKey)) {
          tendersMap.set(tenderKey, {
            internal_code: row.internal_code || "",
            name: row.name || "",
            client: row.client || "",
            deadline: row.deadline || "",
            status: row.status || "OPEN",
            country: row.country || "",
            tender_format: row.tender_format || "PDF",
            tender_number: row.tender_number || "",
            submission_type: row.submission_type || "",
            project_sector: typeof row.project_sector === 'string' ? row.project_sector.split(';').map((s: string) => s.trim()).filter(Boolean) : (row.project_sector || []),
            scope_summary: row.scope_summary || "",
            duration: row.duration || "",
            special_requirements: typeof row.special_requirements === 'string' ? row.special_requirements.split(';').map((s: string) => s.trim()).filter(Boolean) : (row.special_requirements || []),
            global_team_constraints: typeof row.global_team_constraints === 'string' ? row.global_team_constraints.split(';').map((s: string) => s.trim()).filter(Boolean) : (row.global_team_constraints || []),
            objective: row.objective || "",
            background: row.background || "",
            scope_of_work: row.scope_of_work || "",
            deliverables: row.deliverables || "",
            methodology: row.methodology || "",
            reporting: row.reporting || "",
            languages: row.languages || "",
            budget_details: row.budget_details || "",
            positions: []
          });
        }

        const tender = tendersMap.get(tenderKey);
        
        // Add position if there's position data
        if (row.position_title) {
          tender.positions.push({
            position_title: row.position_title || "",
            quantity: row.position_quantity ? parseInt(row.position_quantity, 10) : 1,
            
              minimum_education: row.position_minimum_education || "",
              minimum_years_experience: row.position_minimum_years_experience ? parseInt(row.position_minimum_years_experience, 10) : 0,
              general_experience: row.position_general_experience || "",
              specific_experience: row.position_specific_experience || "",
              role_description: row.position_role_description || "",
              required_sector_experience: row.position_required_sector_experience || "",
              mandatory_skills: row.position_mandatory_skills ? row.position_mandatory_skills.split(',').map((s: string) => s.trim()) : [],
              required_keywords: row.position_required_keywords ? row.position_required_keywords.split(',').map((s: string) => s.trim()) : [],
              nationality_preference: row.position_nationality_preference || "",
          });
        }
      }

      const tendersToSave = Array.from(tendersMap.values());
      setPendingTender(tendersToSave);

      setCsvText("");
      onClose();
    } catch (err: any) {
      console.error("Import error:", err);
      setError(err.message || "Failed to parse and import CSV data.");
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
          
          <div className="p-6 border-b border-slate-100 shrink-0">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">
                    Import Tender CSV
                  </h2>
                  <p className="text-sm text-slate-500">
                    Paste the tender CSV data below to auto-populate the database.
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
            
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg flex items-start justify-between gap-4">
              <div className="text-sm text-blue-800">
                <p className="font-semibold mb-1">Need to extract data from a Tender PDF?</p>
                <p>Copy our optimized extraction prompt, paste it into NotebookLM along with the Tender ToR, and paste the resulting CSV here.</p>
              </div>
              <button
                onClick={handleCopyPrompt}
                className="shrink-0 px-4 py-2 bg-white text-blue-600 font-medium text-sm rounded-md border border-blue-200 shadow-sm hover:bg-blue-50 transition-colors"
              >
                {isCopied ? "Copied!" : "Copy Prompt"}
              </button>
            </div>
          </div>
          <div className="p-6 overflow-y-auto">

            {error && (
              <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-lg flex items-start gap-3 border border-red-100 text-sm">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}
            <textarea
              className="w-full h-64 p-4 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none whitespace-pre"
              placeholder="internal_code,name,client,deadline,status..."
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
                "Import Tender"
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
