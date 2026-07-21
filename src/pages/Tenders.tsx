import React, { useState, useEffect } from "react";
import {
  Upload,
  Search,
  FileText,
  Plus,
  Loader2,
  Calendar,
  Building2,
  ChevronDown,
  ChevronUp,
  UserCog,
  Trash2,
  ArrowUpAZ,
  ArrowDownZA,
  CheckCircle,
  AlertCircle,
  Pencil,
  FileSpreadsheet,
  Download,
  Palette,
  Signature,
  MoreHorizontal,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import clsx from "clsx";
import * as XLSX from "xlsx";
import { api, extractTextFromPDF } from "../lib/api";
import { useReferenceData } from "../lib/ReferenceDataContext";
import { parseTenderText } from "../lib/gemini";
import { BrandingModal } from "../components/BrandingModal";
import { ConfirmTenderModal } from "../components/ConfirmTenderModal";
import { ConfigRequirementsModal } from "../components/ConfigRequirementsModal";
import { EditTenderModal } from "../components/EditTenderModal";
import { ImportTenderCsvModal } from "../components/ImportTenderCsvModal";
import { TenderRepresentativeModal } from "../components/TenderRepresentativeModal";
import { useTasks } from "../lib/TasksContext";
import ConfirmModal from "../components/ConfirmModal";

const isCloseToDeadline = (deadlineStr: string) => {
  if (!deadlineStr) return false;
  const deadline = new Date(deadlineStr);
  const now = new Date();
  const diffDays = Math.ceil(
    (deadline.getTime() - now.getTime()) / (1000 * 3600 * 24),
  );
  return diffDays >= 0 && diffDays <= 7;
};

export default function Tenders() {
  const { values } = useReferenceData();
  const tenderStatuses = values('tender_status');
  const navigate = useNavigate();
  const [tenders, setTenders] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [selectedTenderForBranding, setSelectedTenderForBranding] = useState<
    any | null
  >(null);
  const [selectedTenderForConfig, setSelectedTenderForConfig] = useState<
    any | null
  >(null);
  const [selectedTenderForEditing, setSelectedTenderForEditing] = useState<
    any | null
  >(null);
  const [
    selectedTenderForRepresentative,
    setSelectedTenderForRepresentative,
  ] = useState<any | null>(null);

  const { tasks, addTask, updateTask, pendingTender, setPendingTender } =
    useTasks();

  const [matchRates, setMatchRates] = useState<Record<string, string>>({});

  const isUploading = tasks.some(
    (t) => t.type === "UPLOAD" && t.status === "running",
  );

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: "asc" | "desc";
  } | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>(
    {},
  );
  const [activeColumnMenu, setActiveColumnMenu] = useState<string | null>(null);
  const [activeActionsMenu, setActiveActionsMenu] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const activeColumnMenuRef = React.useRef<HTMLDivElement>(null);
  const activeActionsMenuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTenders();
    const handleUpdate = () => fetchTenders();
    window.addEventListener("tenders-updated", handleUpdate);
    return () => window.removeEventListener("tenders-updated", handleUpdate);
  }, [tasks]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        activeColumnMenuRef.current &&
        !activeColumnMenuRef.current.contains(event.target as Node)
      ) {
        setActiveColumnMenu(null);
      }
      if (
        activeActionsMenuRef.current &&
        !activeActionsMenuRef.current.contains(event.target as Node)
      ) {
        setActiveActionsMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleDeleteTender = async (tenderId: string) => {
    await api.deleteTender(tenderId);
    fetchTenders();
  };

  const fetchTenders = async () => {
    try {
      const data = await api.getTenders();
      const allMatches = await api.getMatches();

      const rates: Record<string, string> = {};

      data.forEach((tender: any) => {
        const tenderMatches = allMatches.filter(
          (m: any) => m.tenderId === tender.id,
        );
        const positions = tender.positions || [];

        let matchedCount = 0;

        if (positions.length === 0) {
          rates[tender.id] = tenderMatches.length > 0 ? `${tenderMatches.length} Matches` : "-";
          if (tenderMatches.length > 0) {
            matchedCount = new Set(tenderMatches.map((m: any) => m.positionId))
              .size;
          }
        } else {
          // Count positions that have at least one match
          const matchedPositions = new Set(
            tenderMatches.map((m: any) => m.positionId),
          );
          matchedCount = matchedPositions.size;
          rates[tender.id] = tenderMatches.length > 0 ? `${tenderMatches.length} Matches` : "-";
        }

        // Compute Status
        if (tenderMatches.length === 0) {
          tender.status = "Tender Extraction Completed";
        } else if (positions.length > 0 && matchedCount === positions.length) {
          tender.status = "Matching Completed";
        } else {
          tender.status = "Matching Partial";
        }
      });

      setTenders(data);
      setMatchRates(rates);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredTenders = tenders
    .filter((t) => {
      const matchesSearch =
        t.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.client?.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      if (statusFilter !== "All Status" && t.status !== statusFilter) {
        return false;
      }

      // Column filters
      for (const [key, value] of Object.entries(columnFilters)) {
        if (!value) continue;

        const v = String(value).toLowerCase();
        let tenderVal = "";

        if (key === "internal_code")
          tenderVal = (
            t.internal_code ||
            t.id?.toString().substring(0, 8) ||
            "UNKNOWN"
          ).toUpperCase();
        else if (key === "name")
          tenderVal = (t.name || "Untitled Tender").toLowerCase();
        else if (key === "client")
          tenderVal = (t.client || "Confidential Authority").toLowerCase();
        else if (key === "type")
          tenderVal = (
            t.project_sector 
              ? (Array.isArray(t.project_sector) ? t.project_sector.join(", ") : t.project_sector)
              : t.tender_format || "GEN-X1"
          ).toLowerCase();
        else if (key === "status")
          tenderVal = (t.status || "OPEN").toLowerCase();
        else if (key === "matchRate")
          tenderVal = (matchRates[t.id] || "-").toLowerCase();

        if (!tenderVal.includes(v)) return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (!sortConfig) return 0;
      const { key, direction } = sortConfig;
      const mod = direction === "asc" ? 1 : -1;

      let aVal: any = "";
      let bVal: any = "";

      if (key === "internal_code") {
        aVal = a.internal_code || a.id?.toString().substring(0, 8) || "";
        bVal = b.internal_code || b.id?.toString().substring(0, 8) || "";
      } else if (key === "name") {
        aVal = a.name || "";
        bVal = b.name || "";
      } else if (key === "client") {
        aVal = a.client || "";
        bVal = b.client || "";
      } else if (key === "type") {
        aVal = a.tender_format || "";
        bVal = b.tender_format || "";
      } else if (key === "status") {
        aVal = a.status || "";
        bVal = b.status || "";
      } else if (key === "matchRate") {
        aVal = matchRates[a.id] || "";
        bVal = matchRates[b.id] || "";
      } else if (key === "lastMatched") {
        aVal = new Date(a.last_matched_at || 0).getTime();
        bVal = new Date(b.last_matched_at || 0).getTime();
      } else if (key === "deadline") {
        aVal = new Date(a.deadline || 0).getTime();
        bVal = new Date(b.deadline || 0).getTime();
      } else if (key === "created") {
        aVal = new Date(a.created_at || 0).getTime();
        bVal = new Date(b.created_at || 0).getTime();
      }

      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();

      if (aVal < bVal) return -1 * mod;
      if (aVal > bVal) return 1 * mod;
      return 0;
    });

  const renderColumnHeader = (id: string, label: string) => (
    <th
      key={id}
      className="px-6 py-4 font-semibold text-[11px] uppercase tracking-wider text-slate-500 whitespace-nowrap relative"
    >
      <div
        className="flex items-center gap-1 cursor-pointer hover:text-slate-700 select-none"
        onClick={(e) => {
          e.stopPropagation();
          setActiveColumnMenu(activeColumnMenu === id ? null : id);
        }}
      >
        {label}
        {sortConfig?.key === id ? (
          sortConfig.direction === "asc" ? (
            <ChevronUp size={12} className="text-blue-600" />
          ) : (
            <ChevronDown size={12} className="text-blue-600" />
          )
        ) : (
          <ChevronDown size={12} className="opacity-50" />
        )}
      </div>

      {activeColumnMenu === id && (
        <div
          ref={activeColumnMenuRef}
          className="absolute left-6 top-10 mt-1 w-64 bg-white rounded-lg shadow-xl border border-slate-200 z-30 font-normal normal-case tracking-normal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-1">
            <div className="px-3 py-2 text-xs font-semibold text-slate-500">
              Sort
            </div>
            <button
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-sm font-medium text-slate-700 rounded-md transition-colors"
              onClick={() => {
                setSortConfig({ key: id, direction: "asc" });
                setActiveColumnMenu(null);
              }}
            >
              <ArrowUpAZ size={14} className="text-slate-400" />
              <span>Sort Ascending</span>
            </button>
            <button
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-sm font-medium text-slate-700 rounded-md transition-colors"
              onClick={() => {
                setSortConfig({ key: id, direction: "desc" });
                setActiveColumnMenu(null);
              }}
            >
              <ArrowDownZA size={14} className="text-slate-400" />
              <span>Sort Descending</span>
            </button>
          </div>
          <div className="h-px bg-slate-100 my-1"></div>
          <div className="p-1 border-t border-slate-100">
            <div className="px-3 py-2 text-xs font-semibold text-slate-500">
              Filter
            </div>
            <div className="px-2 pb-2">
              <input
                type="text"
                placeholder={`Filter ${label}...`}
                value={columnFilters[id] || ""}
                onChange={(e) =>
                  setColumnFilters((prev) => ({
                    ...prev,
                    [id]: e.target.value,
                  }))
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
            </div>
            {columnFilters[id] && (
              <div className="px-2 pb-2">
                <button
                  className="w-full text-xs text-blue-600 hover:text-blue-700 font-medium py-1"
                  onClick={() =>
                    setColumnFilters((prev) => {
                      const n = { ...prev };
                      delete n[id];
                      return n;
                    })
                  }
                >
                  Clear Filter
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </th>
  );

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files) as File[];
    e.target.value = ""; // Clear value to allow same file reselection

    const taskId = addTask({
      type: "UPLOAD",
      title: "Tender Parsing Integration",
      message:
        fileList.length > 1
          ? `Extracting text from ${fileList.length} tender documents...`
          : "Extracting text from tender document...",
    });

    let currentEta = 45;
    let currentPercent = 5;
    const interval = setInterval(() => {
      currentPercent = Math.min(currentPercent + Math.random() * 10, 95);
      currentEta = Math.max(currentEta - 3, 2);
      updateTask(taskId, {
        percent: currentPercent,
        eta: currentEta,
      });
    }, 1500);

    try {
      let combinedText = "";
      for (let i = 0; i < fileList.length; i++) {
        const text = await extractTextFromPDF(fileList[i], {
          preserveLayout: true,
        });
        combinedText += `--- TENDER DOC: ${fileList[i].name} ---\n${text}\n\n`;
      }

      updateTask(taskId, {
        message:
          fileList.length > 1
            ? `AI classification (Stage 0): Consolidating and analyzing ${fileList.length} documents...`
            : "AI classification (Stage 0): Identifying document format...",
      });
      const parsedTender = await parseTenderText(combinedText);

      updateTask(taskId, {
        status: "completed",
        percent: 100,
        eta: 0,
        message: "AI Extraction complete. Please verify in the popup.",
      });

      clearInterval(interval);
      setPendingTender({
        ...parsedTender,
        _taskId: taskId, // Store task ID to finish it later
      });
    } catch (err: any) {
      clearInterval(interval);
      console.error(err);
      updateTask(taskId, {
        status: "error",
        message: err.message,
      });
    } finally {
      e.target.value = "";
    }
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });

      const firstSheetName = workbook.SheetNames[0];
      const flatData: any[] = firstSheetName
        ? XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName])
        : [];

      if (flatData.length === 0) {
        alert("No data found in the Excel file.");
        return;
      }

      // Group by internal_code or name
      const groupedTenders: Record<string, any> = {};

      flatData.forEach((row, i) => {
        const matchKey = row.internal_code || row.name || row.tender_title || row.title || `TEND-UNKNOWN-${i}`;
        
        if (!groupedTenders[matchKey]) {
          groupedTenders[matchKey] = {
            internal_code: row.internal_code || `TEND-${Date.now()}-${i}`,
            name: row.name || row.tender_title || row.title || "Untitled Tender",
            status: row.status || "OPEN",
            country: row.country || "",
            client: row.client || "",
            deadline: row.deadline || row.tender_deadline || null,
            data: {
              tender_format: row.tender_format || "PDF",
              tender_title: row.tender_title || row.name || row.title || "",
              client: row.client || "",
              country: row.country || "",
              tender_number: row.tender_number || "",
              submission_type: row.submission_type || "",
              project_sector: typeof row.project_sector === 'string' ? row.project_sector.split(';').map((s: string) => s.trim()).filter(Boolean) : (row.project_sector || row.sectors || []),
              scope_summary: row.scope_summary || row.scope_of_work || "",
              duration: row.duration || row.project_duration || "",
              special_requirements: typeof row.special_requirements === 'string' ? row.special_requirements.split(';').map((s: string) => s.trim()).filter(Boolean) : (row.special_requirements || []),
              global_team_constraints: typeof row.global_team_constraints === 'string' ? row.global_team_constraints.split(';').map((s: string) => s.trim()).filter(Boolean) : (row.global_team_constraints || []),
              
              // Keeping original fields just in case they were used elsewhere
              objective: row.objective || "",
              background: row.background || "",
              deliverables: row.deliverables || "",
              methodology: row.methodology || "",
              reporting: row.reporting || "",
              languages: row.languages || "",
              budget_details: row.budget_details || "",
            },
            positions: []
          };
        }

        const pTitle = row.position_title || row.position || row.title_of_position;
        if (pTitle) {
          groupedTenders[matchKey].positions.push({
            title: pTitle,
            quantity: row.position_quantity || row.quantity || 1,
            minimum_education: row.position_minimum_education || row.minimum_education || row.position_education || row.education || row.degree || "",
            minimum_years_experience: row.position_minimum_years_experience || row.minimum_years_experience || row.position_experience || row.experience || row.years || 0,
            general_experience: row.position_general_experience || row.general_experience || "",
            specific_experience: row.position_specific_experience || row.specific_experience || "",
            role_description: row.position_role_description || row.role_description || row.position_description || row.tasks || row.description || "",
            required_sector_experience: typeof row.position_required_sector_experience === 'string' ? row.position_required_sector_experience.split(';').map((s: string) => s.trim()).filter(Boolean) : (row.position_required_sector_experience || row.required_sector_experience || []),
            mandatory_skills: typeof row.position_mandatory_skills === 'string' ? row.position_mandatory_skills.split(';').map((s: string) => s.trim()).filter(Boolean) : (row.position_mandatory_skills || row.mandatory_skills || row.position_skills || row.skills || []),
            required_keywords: typeof row.position_required_keywords === 'string' ? row.position_required_keywords.split(';').map((s: string) => s.trim()).filter(Boolean) : (row.position_required_keywords || row.required_keywords || []),
            nationality_preference: row.position_nationality_preference || row.nationality_preference || "",
            
            // Keeping old fields mapped
            months: row.position_months || row.months || 0,
            category: row.position_category || row.category || "Key Expert",
          });
        }
      });

      const tendersToSave = Object.values(groupedTenders);
      
      for (const tender of tendersToSave) {
        tender.requirements = tender.data;
      }

      setPendingTender(tendersToSave);
      e.target.value = ""; // Clear file input
    } catch (err: any) {
      console.error(err);
      alert("Failed to parse Excel file: " + err.message);
    } finally {
      e.target.value = "";
    }
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        internal_code: "TEND-002",
        name: "Consultancy Services for Supervision of Roads in AL Khoudh Village",
        client: "Ministry of Works",
        deadline: "2024-12-31",
        status: "OPEN",
        country: "Oman",
        tender_format: "PDF",
        tender_number: "RFP-2024-002",
        submission_type: "Electronic",
        project_sector: "Infrastructure; Roads",
        scope_summary: "Consultancy services for the construction supervision of roads in AL Khoudh Village. The project involves upgrading an existing single carriageway to a dual carriageway from ROP Special Task Force roundabout to Oman Botanical Garden roundabout, providing access roads, utility relocation and protection, LED street lighting, pavement construction to international standards, highway signing, road marking, concrete safety barriers, slope protection with shotcrete, storm water drainage, and scour protection.",
        duration: "24 Months",
        special_requirements: "ISO Certification preferred; Head Office support required for hydrology, geotechnical engineering, scheduling, and contract administration; Fingerprint scanner required for site attendance recording; Professional Indemnity Insurance of RO 1,000,000 required; 1.2% deduction from payments for employment and training initiatives; At least one staff member must be an Omani national; Compliance with Oman Highway Design Standards 2017; Adherence to Oman Standard Contract for Building and Civil Engineer Works May-2019 Rev-1; 5% VAT must be included in quoted rates; Tender Bond of 1% or Bid Commitment Declaration required",
        global_team_constraints: "Requires at least 1 Omani national on the team",
        objective: "To improve road infrastructure by modernizing existing highways.",
        background: "The region has faced poor connectivity affecting trade.",
        scope_of_work: "Consultancy services for the construction supervision of roads in AL Khoudh Village. The project involves upgrading an existing single carriageway to a dual carriageway from ROP Special Task Force roundabout to Oman Botanical Garden roundabout, providing access roads, utility relocation and protection, LED street lighting, pavement construction to international standards, highway signing, road marking, concrete safety barriers, slope protection with shotcrete, storm water drainage, and scour protection.",
        deliverables: "Inception report; Design specifications; Monthly progress reports; Final completion report.",
        methodology: "Standard engineering practices complying with international standards.",
        reporting: "Report directly to the Chief Engineer of the Ministry.",
        languages: "English; Arabic",
        budget_details: "Lump-sum contract with milestone-based payments.",

        position_title: "Team Leader",
        position_quantity: 1,
        position_minimum_education: "Master's degree in Civil Engineering or related field.",
        position_minimum_years_experience: 15,
        position_general_experience: "15 years of general experience in civil engineering projects.",
        position_specific_experience: "Minimum 10 years specifically managing large scale highway projects.",
        position_role_description: "Overall project management and coordination.",
        position_required_sector_experience: "Infrastructure; Roads",
        position_mandatory_skills: "Project management; FIDIC contracts; Leadership",
        position_required_keywords: "FIDIC; PMP; Team Leadership",
        position_nationality_preference: "None",
      },
      {
        internal_code: "TEND-002",
        name: "Consultancy Services for Supervision of Roads in AL Khoudh Village",
        client: "Ministry of Works",
        deadline: "2024-12-31",
        status: "OPEN",
        country: "Oman",
        tender_format: "PDF",
        tender_number: "RFP-2024-002",
        submission_type: "Electronic",
        project_sector: "Infrastructure; Roads",
        scope_summary: "Consultancy services for the construction supervision of roads in AL Khoudh Village. The project involves upgrading an existing single carriageway to a dual carriageway from ROP Special Task Force roundabout to Oman Botanical Garden roundabout, providing access roads, utility relocation and protection, LED street lighting, pavement construction to international standards, highway signing, road marking, concrete safety barriers, slope protection with shotcrete, storm water drainage, and scour protection.",
        duration: "24 Months",
        special_requirements: "ISO Certification preferred; Head Office support required for hydrology, geotechnical engineering, scheduling, and contract administration; Fingerprint scanner required for site attendance recording; Professional Indemnity Insurance of RO 1,000,000 required; 1.2% deduction from payments for employment and training initiatives; At least one staff member must be an Omani national; Compliance with Oman Highway Design Standards 2017; Adherence to Oman Standard Contract for Building and Civil Engineer Works May-2019 Rev-1; 5% VAT must be included in quoted rates; Tender Bond of 1% or Bid Commitment Declaration required",
        global_team_constraints: "Requires at least 1 Omani national on the team",
        objective: "To improve road infrastructure by modernizing existing highways.",
        background: "The region has faced poor connectivity affecting trade.",
        scope_of_work: "Consultancy services for the construction supervision of roads in AL Khoudh Village. The project involves upgrading an existing single carriageway to a dual carriageway from ROP Special Task Force roundabout to Oman Botanical Garden roundabout, providing access roads, utility relocation and protection, LED street lighting, pavement construction to international standards, highway signing, road marking, concrete safety barriers, slope protection with shotcrete, storm water drainage, and scour protection.",
        deliverables: "Inception report; Design specifications; Monthly progress reports; Final completion report.",
        methodology: "Standard engineering practices complying with international standards.",
        reporting: "Report directly to the Chief Engineer of the Ministry.",
        languages: "English; Arabic",
        budget_details: "Lump-sum contract with milestone-based payments.",

        position_title: "Resident Engineer",
        position_quantity: 2,
        position_minimum_education: "Bachelor's degree in Civil Engineering.",
        position_minimum_years_experience: 10,
        position_general_experience: "10 years of general experience in civil engineering.",
        position_specific_experience: "Minimum 5 years in highway design and construction supervision.",
        position_role_description: "Site supervision and quality control for road construction.",
        position_required_sector_experience: "Infrastructure; Roads",
        position_mandatory_skills: "AutoCAD; Civil 3D; Highway Design",
        position_required_keywords: "AutoCAD; Civil 3D",
        position_nationality_preference: "Omani National Preferred",
      }
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(templateData);
    XLSX.utils.book_append_sheet(wb, ws, "Tenders and Positions");

    XLSX.writeFile(wb, "Tender_Import_Template.csv");
  };

  const handleSaveConfig = async (updatedTender: any) => {
    await api.updateTenderRequirements(
      updatedTender.id,
      updatedTender.requirements,
    );
    fetchTenders();
  };

  return (
    <div className="space-y-6 max-w-full w-full mx-auto pb-32">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Tenders</h2>
          <p className="text-sm text-slate-500 mt-1">
            Manage project tenders and requirements
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex justify-center items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors cursor-pointer shadow-sm w-full sm:w-auto"
          >
            <FileSpreadsheet size={16} />
            Import CSV Text
          </button>
          <button
            onClick={handleDownloadTemplate}
            className="flex justify-center items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors cursor-pointer shadow-sm w-full sm:w-auto"
          >
            <Download size={16} />
            Template
          </button>
          <label
            className="flex justify-center items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors cursor-pointer shadow-sm w-full sm:w-auto"
          >
            <FileSpreadsheet size={16} />
            Import Excel
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleExcelUpload}
            />
          </label>
          <label
            className={clsx(
              "flex justify-center items-center gap-2 px-4 py-2.5 bg-[#2563eb] hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors cursor-pointer shadow-sm w-full sm:w-auto",
              isUploading && "opacity-50 cursor-not-allowed",
            )}
          >
            {isUploading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Plus size={16} />
            )}
            {isUploading ? "Uploading..." : "Upload Tender Documents"}
            <input
              type="file"
              multiple
              className="hidden"
              onChange={handleUpload}
              disabled={isUploading}
            />
          </label>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200">
        <div className="relative flex-1 min-w-0">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 shrink-0"
            size={16}
          />
          <input
            type="text"
            placeholder="Search tenders by name, client, or long queries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 min-w-0 transition-all shadow-sm placeholder:text-slate-400"
          />
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto shrink-0">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-auto border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm cursor-pointer min-w-0 sm:min-w-[160px] text-ellipsis overflow-hidden"
          >
            <option>All Status</option>
            {tenderStatuses.map(option => <option key={option.code} value={option.label}>{option.label}</option>)}
          </select>
          <select className="w-full sm:w-auto border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm cursor-pointer min-w-0 sm:min-w-[140px] text-ellipsis overflow-hidden">
            <option>All Types</option>
          </select>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              <tr className="border-b border-slate-200 bg-[#fafafa]">
                <th className="px-6 py-4 font-semibold text-[11px] uppercase tracking-wider text-slate-500 whitespace-nowrap w-16">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                    />
                  </div>
                </th>
                {renderColumnHeader("internal_code", "INTERNAL CODE")}
                {renderColumnHeader("name", "TENDER DETAILS")}
                {renderColumnHeader("client", "CLIENT")}
                {renderColumnHeader("type", "TYPE")}
                {renderColumnHeader("status", "STATUS")}
                {renderColumnHeader("matchRate", "MATCHES FOUND")}
                {renderColumnHeader("lastMatched", "LAST MATCHED")}
                {renderColumnHeader("deadline", "DEADLINE")}
                {renderColumnHeader("created", "CREATED")}
                <th className="px-6 py-4 font-semibold text-[11px] uppercase tracking-wider text-slate-500 whitespace-nowrap">
                  ACTIONS
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredTenders.length > 0 ? (
                filteredTenders.map((tender) => (
                  <tr
                    key={tender.id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors group"
                  >
                    <td
                      className="px-6 py-4"
                    >
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <span 
                        className="text-sm font-medium text-blue-600 cursor-pointer hover:underline"
                        onClick={() => navigate(`/tenders/${tender.id}/details`)}
                      >
                        {tender.internal_code
                          ? tender.internal_code
                          : `#${tender.id?.toString().substring(0, 8).toUpperCase() || "UNKNOWN"}`}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 max-w-[400px] whitespace-normal break-words">
                      <div>
                        {tender.name ||
                          tender.tender_title ||
                          "Untitled Tender"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 truncate max-w-[300px]">
                      {tender.client || "Confidential Authority"}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {tender.project_sector 
                        ? (Array.isArray(tender.project_sector) ? tender.project_sector.join(", ") : tender.project_sector)
                        : tender.tender_format || "GEN-X1"}
                    </td>
                    <td className="px-6 py-4">
                      {tender.status === "Matching Completed" ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100/50">
                          <CheckCircle size={12} className="text-emerald-500" />
                          {tender.status}
                        </span>
                      ) : tender.status?.includes("Partial") ||
                        tender.status === "Tender Extraction Completed" ||
                        tender.status?.includes("Processing") ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100/50">
                          <div
                            className={clsx(
                              "w-1.5 h-1.5 rounded-full bg-amber-500",
                              tender.status?.includes("Processing") &&
                                "animate-pulse",
                            )}
                          ></div>
                          {tender.status}
                        </span>
                      ) : tender.status?.includes("Failed") ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-100/50">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                          {tender.status}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                          {tender.status || "Tender Extraction Completed"}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {matchRates[tender.id] || "-"}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {tender.last_matched_at
                        ? (() => {
                            const d = new Date(tender.last_matched_at);
                            const pad = (num: number) =>
                              num.toString().padStart(2, "0");
                            return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                          })()
                        : "-"}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {tender.deadline ? (
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              isCloseToDeadline(tender.deadline)
                                ? "text-red-600 font-medium"
                                : ""
                            }
                          >
                            {new Date(tender.deadline).toLocaleDateString()}
                          </span>
                          {isCloseToDeadline(tender.deadline) && (
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-600 px-1.5 py-0.5 rounded flex items-center gap-1">
                              <AlertCircle size={10} /> Soon
                            </span>
                          )}
                        </div>
                      ) : (
                        "TBA"
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {tender.created_at
                        ? new Date(tender.created_at).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Link
                          to={`/tenders/${tender.id}`}
                          className="text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700 hover:underline"
                          title="Match Tender"
                        >
                          Match
                        </Link>
                        <div className="h-9 border-l border-slate-200" aria-hidden="true"></div>
                        <div
                          className="relative"
                          ref={
                            activeActionsMenu === tender.id
                              ? activeActionsMenuRef
                              : undefined
                          }
                        >
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setActiveActionsMenu(
                                activeActionsMenu === tender.id
                                  ? null
                                  : tender.id,
                              );
                            }}
                            className="flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                            aria-haspopup="menu"
                            aria-expanded={activeActionsMenu === tender.id}
                          >
                            <MoreHorizontal size={16} />
                            Actions
                            <ChevronDown
                              size={14}
                              className={clsx(
                                "transition-transform",
                                activeActionsMenu === tender.id &&
                                  "rotate-180",
                              )}
                            />
                          </button>
                          {activeActionsMenu === tender.id && (
                            <div
                              role="menu"
                              className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white py-1.5 shadow-xl"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                role="menuitem"
                                onClick={() => {
                                  setSelectedTenderForEditing(tender);
                                  setActiveActionsMenu(null);
                                }}
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-blue-50 hover:text-blue-700"
                              >
                                <Pencil size={16} className="text-slate-400" />
                                Edit Tender
                              </button>
                              <button
                                role="menuitem"
                                onClick={() => {
                                  setSelectedTenderForConfig(tender);
                                  setActiveActionsMenu(null);
                                }}
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-blue-50 hover:text-blue-700"
                              >
                                <UserCog size={16} className="text-slate-400" />
                                Requirements &amp; Quota
                              </button>
                              <button
                                role="menuitem"
                                onClick={() => {
                                  setSelectedTenderForBranding(tender);
                                  setActiveActionsMenu(null);
                                }}
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-blue-50 hover:text-blue-700"
                              >
                                <Palette size={16} className="text-slate-400" />
                                Branding
                              </button>
                              <button
                                role="menuitem"
                                onClick={() => {
                                  setSelectedTenderForRepresentative(tender);
                                  setActiveActionsMenu(null);
                                }}
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-blue-50 hover:text-blue-700"
                              >
                                <Signature size={16} className="text-slate-400" />
                                Representative Signature
                              </button>
                              <div className="my-1 border-t border-slate-100"></div>
                              <button
                                role="menuitem"
                                onClick={() => {
                                  setConfirmDeleteId(tender.id);
                                  setActiveActionsMenu(null);
                                }}
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                              >
                                <Trash2 size={16} />
                                Delete Tender
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="px-6 py-24 text-center bg-white">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center mb-4">
                        <Upload className="text-slate-400" size={24} />
                      </div>
                      <h3 className="text-base font-semibold text-slate-900 mb-1">
                        No tenders uploaded
                      </h3>
                      <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
                        Upload one or multiple documents simultaneously (e.g.,
                        Primary + Scope/TOR) for a single tender. The AI will
                        consolidate roles and requirements from all uploaded
                        documents before the matching process.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          onClick={() => setIsImportModalOpen(true)}
                          className="flex justify-center items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors cursor-pointer w-auto"
                        >
                          <FileSpreadsheet size={16} />
                          Import CSV Text
                        </button>
                        <button
                          onClick={handleDownloadTemplate}
                          className="flex justify-center items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors cursor-pointer w-auto"
                        >
                          <Download size={16} />
                          Template
                        </button>
                        <label
                          className="flex justify-center items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors cursor-pointer w-auto"
                        >
                          <FileSpreadsheet size={16} />
                          Import Excel
                          <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            className="hidden"
                            onChange={handleExcelUpload}
                          />
                        </label>
                        <label
                          className={clsx(
                            "flex justify-center items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-sm font-medium transition-colors cursor-pointer w-auto",
                            isUploading && "opacity-50 cursor-not-allowed",
                          )}
                        >
                          {isUploading ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Plus size={16} />
                          )}
                          {isUploading ? "Uploading..." : "Browse Files"}
                          <input
                            type="file"
                            multiple
                            className="hidden"
                            onChange={handleUpload}
                            disabled={isUploading}
                          />
                        </label>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <>
        <ImportTenderCsvModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onSuccess={fetchTenders}
        />
        <ConfirmModal
          isOpen={!!confirmDeleteId}
          title="Delete Tender"
          message="Are you sure you want to delete this Tender? Matches will also be deleted. This action cannot be undone."
          confirmText="Delete"
          isDestructive={true}
          onConfirm={() => {
            if (confirmDeleteId) handleDeleteTender(confirmDeleteId);
            setConfirmDeleteId(null);
          }}
          onCancel={() => setConfirmDeleteId(null)}
        />
        {selectedTenderForBranding && (
          <BrandingModal
            tender={selectedTenderForBranding}
            onClose={() => setSelectedTenderForBranding(null)}
            onSave={fetchTenders}
          />
        )}

        {selectedTenderForConfig && (
          <ConfigRequirementsModal
            tender={selectedTenderForConfig}
            onClose={() => setSelectedTenderForConfig(null)}
            onSave={handleSaveConfig}
          />
        )}

        {selectedTenderForRepresentative && (
          <TenderRepresentativeModal
            tender={selectedTenderForRepresentative}
            onClose={() => setSelectedTenderForRepresentative(null)}
            onSave={fetchTenders}
          />
        )}

        {selectedTenderForEditing && (
          <EditTenderModal
            isOpen={true}
            tender={selectedTenderForEditing}
            onClose={() => setSelectedTenderForEditing(null)}
            onSave={fetchTenders}
          />
        )}
      </>
    </div>
  );
}

const shimmer = `
  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(200%); }
  }
`;
