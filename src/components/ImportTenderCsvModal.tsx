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
      await navigator.clipboard.writeText(`Extract selected Tender/ToR files into STRICT CSV. Treat all files as ONE tender. Use ONLY stated facts. Return ONLY CSV; no markdown/commentary.

EXACT HEADERS:
internal_code,name,client,deadline,status,country,tender_format,tender_number,submission_type,project_sector,scope_summary,duration,special_requirements,global_team_constraints,objective,background,scope_of_work,deliverables,methodology,reporting,languages,budget_details,position_title,position_quantity,position_minimum_education,position_minimum_years_experience,position_general_experience,position_specific_experience,position_role_description,position_required_sector_experience,position_mandatory_skills,position_required_keywords,position_nationality_preference

CSV RULES:
Every row MUST have exactly 33 fields in header order. Quote fields containing commas, newlines or quotes; escape " as "". Use commas, NEVER pipes. Join project_sector, special_requirements and global_team_constraints with semi-colons (;). Join position_mandatory_skills and position_required_keywords with commas inside quotes. Leave unstated facts empty; never invent.

FIND ALL POSITIONS FIRST:
Read each Table of Contents and EVERY page/table. Check Personnel, Staffing, Team Composition, Key/Non-Key Experts, Evaluation, Schedules, CV Forms, JOB TITLE and Annexes. List roles/quantities internally. Accept only explicitly required personnel. Never turn duties, disciplines or deliverables into positions. Keep roles separate; merge same-role facts and deduplicate.

ROWS:
Create ONE ROW per role; use position_quantity for several people sharing it. Duplicate ALL tender fields; repeat identical internal_code and name. Change only position_* fields. Never omit required personnel.

TENDER FIELDS:
internal_code=official/stable code; name=full title; client=authority; deadline=submission date (YYYY-MM-DD if complete); status=OPEN unless stated; country=assignment country; tender_format=PDF/DOCX; tender_number=reference; submission_type=method; project_sector=all sectors; scope_summary=rich overview; duration=service period; special_requirements=ONLY firm eligibility/experience, JV/association, submission, certification, insurance, guarantee, legal, financial or other tender-wide mandates; global_team_constraints=ONLY team-wide composition, deployment, dedication, availability, location, staffing limits or nationality/local-participation; objective=full outcomes; background=full context; scope_of_work=all services/tasks; deliverables=all outputs/stages/deadlines; methodology=approach/work plan; reporting=reports/frequency/recipients; languages=required languages; budget_details=budget/currency/taxes/limits/payment terms.

POSITION FIELDS:
position_title=clean exact role, removing Position, K-1/K1, N-1/N1 and row numbers; position_quantity=integer, 1 only if implied; position_minimum_education=exact level/degree/discipline/qualification; position_minimum_years_experience=minimum total/general years integer, 0 if unstated; position_general_experience=full overall criteria; position_specific_experience=full role/sector/project/regional/local criteria/alternatives; position_role_description=all duties, authority, coordination/reporting; position_required_sector_experience=explicit sectors/projects; position_mandatory_skills=explicit technical/software/licence/language/standard requirements; position_required_keywords=precise supported terms; position_nationality_preference=ONLY role-specific nationality/local preference. Never infer from title.

DETAIL/CHECK:
Preserve rich detail and every material condition. DO NOT summarize, shorten or use vague phrases. Cross-check tables, job titles, evaluations, schedules, CV forms and annexes. Add omissions; remove duplicates/inventions. Retain every position and all details.`);
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
