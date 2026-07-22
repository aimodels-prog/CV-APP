import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Search,
  Filter,
  RefreshCw,
  SlidersHorizontal,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Loader2,
  Upload,
  Check,
  FolderOpen,
  EditIcon,
  Trash2,
  Download,
  FileSpreadsheet,
  FileText
} from 'lucide-react';
import clsx from 'clsx';
import * as XLSX from 'xlsx';
import { api, extractTextFromPDF } from '../lib/api';
import { useReferenceData } from '../lib/ReferenceDataContext';
import { parseCVText } from '../lib/gemini';
import { useTasks } from '../lib/TasksContext';
import AddExpertModal from '../components/AddExpertModal';
import { ImportExpertCsvModal } from "../components/ImportExpertCsvModal";
import { EditExpertRoleModal } from '../components/EditExpertRoleModal';
import ConfirmModal from '../components/ConfirmModal';

const ALL_COLUMNS = [
  { id: 'select', label: 'SELECT' },
  { id: 'fullName', label: 'FULL NAME' },
  { id: 'primary_position', label: 'PRIMARY POSITION' },
  { id: 'role', label: 'FOLDER NAME' },
  { id: 'location', label: 'LOCATION' },
  { id: 'countries', label: 'COUNTRIES' },
  { id: 'education', label: 'EDUCATION' },
  { id: 'experience', label: 'EXPERIENCE' },
  { id: 'type', label: 'TYPE' },
  { id: 'skills', label: 'SKILLS' },
  { id: 'awards', label: 'AWARDS' },
  { id: 'languages', label: 'LANGUAGES' },
  { id: 'certifications', label: 'CERTIFICATIONS' },
  { id: 'software', label: 'SOFTWARE' },
  { id: 'dateOfBirth', label: 'DATE OF BIRTH' },
  { id: 'citizenship', label: 'CITIZENSHIP' },
  { id: 'professionalMembership', label: 'PROFESSIONAL MEMBERSHIP' },
  { id: 'createdAt', label: 'CREATED' },
  { id: 'actions', label: 'ACTIONS' },
];

const formatExpertLanguages = (expert: any): string => {
  const source =
    Array.isArray(expert?.metadata?.languages) && expert.metadata.languages.length > 0
      ? expert.metadata.languages
      : expert?.languages;

  if (Array.isArray(source)) {
    return source
      .map((language: any) => {
        if (typeof language === "string") return language;
        const name = language?.name || language?.language || "";
        const level = language?.level || language?.proficiency || "";
        return level ? `${name} - ${level}` : name;
      })
      .filter(Boolean)
      .join(", ");
  }

  return typeof source === "string" ? source : "";
};

export default function Experts() {
  const { values } = useReferenceData();
  const expertTypes = values('expert_type');
  const pageSizes = values('page_size');
  const [experts, setExperts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All Types");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [isAddExpertOpen, setIsAddExpertOpen] = useState(false);
  const [modalFocusSection, setModalFocusSection] = useState<string | undefined>(undefined);
  const [isImportCsvOpen, setIsImportCsvOpen] = useState(false);
  const [expertToEdit, setExpertToEdit] = useState<any | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(ALL_COLUMNS.map(c => c.id).filter(id => !['dateOfBirth', 'citizenship'].includes(id)));
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const columnMenuRef = useRef<HTMLDivElement>(null);
  
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [activeColumnMenu, setActiveColumnMenu] = useState<string | null>(null);
  const [editingRoleExpert, setEditingRoleExpert] = useState<any | null>(null);
  const activeColumnMenuRef = useRef<HTMLDivElement>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[] | null>(null);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [selectedUploadType, setSelectedUploadType] = useState("External");
  const [fileTypes, setFileTypes] = useState<Record<number, string>>({});
  const [taxonomy, setTaxonomy] = useState<string[]>([]);

  const { tasks, addTask, updateTask, setPendingExpert } = useTasks();

  const isUploading = tasks.some(t => t.type === 'UPLOAD' && t.status === 'running');

  useEffect(() => {
    fetchExperts();
  }, [tasks]);

  const handleDeleteExpert = async (id: string) => {
    try {
      await api.deleteExpert(id);
      fetchExperts();
    } catch (err: any) {
      alert("Delete failed: " + err.message);
    }
  };

  useEffect(() => {
    const handleExpertsUpdate = () => {
      fetchExperts();
    };
    window.addEventListener('expertsUpdated', handleExpertsUpdate);
    return () => window.removeEventListener('expertsUpdated', handleExpertsUpdate);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(event.target as Node)) {
        setShowColumnMenu(false);
      }
      if (activeColumnMenuRef.current && !activeColumnMenuRef.current.contains(event.target as Node)) {
        setActiveColumnMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleColumn = (id: string) => {
    setVisibleColumns(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const fetchExperts = async () => {
    try {
      const tax = await api.getTaxonomy();
      setTaxonomy(tax);

      const data = await api.getExperts();
      setExperts(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const flatData = firstSheetName ? XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName]) : [];

      if (flatData.length === 0) {
        alert("No data found in the file.");
        return;
      }

      const newExperts = flatData.map((row: any) => ({
        fullName: row.fullName || row.name || "",
        primary_position: row.primary_position || row.position || "",
        role: row.role || "",
        email: row.email || "",
        phone: row.phone || "",
        location: row.location || "",
        countries: typeof row.countries === 'string' ? row.countries.split(';').map((s: string) => s.trim()).filter(Boolean) : [],
        dateOfBirth: row.dateOfBirth || "",
        countryOfCitizenship: row.countryOfCitizenship || row.citizenship || "",
        availability: row.availability || "",
        profileSummary: row.profileSummary || row.summary || "",
        type: row.type || "External",
        educationLevel: row.educationLevel || row.education || "",
        experienceYears: parseInt(row.experienceYears) || 0,
        languages: typeof row.languages === 'string' ? row.languages.split(';').map((s: string) => ({ name: s.trim() })).filter((l: any) => l.name) : [],
        skills: typeof row.skills === 'string' ? row.skills.split(';').map((s: string) => s.trim()).filter(Boolean) : [],
        software: typeof row.software === 'string' ? row.software.split(';').map((s: string) => s.trim()).filter(Boolean) : [],
        certifications: typeof row.certifications === 'string' ? row.certifications.split(';').map((s: string) => ({ title: s.trim() })).filter((c: any) => c.title) : [],
        experiences: [],
        projects: [],
        adequacy_experience: [],
        metadata: {
          educations: [],
          languages: typeof row.languages === 'string' ? row.languages.split(';').map((s: string) => ({ name: s.trim() })).filter((l: any) => l.name) : [],
          certifications: typeof row.certifications === 'string' ? row.certifications.split(';').map((s: string) => ({ title: s.trim() })).filter((c: any) => c.title) : [],
          adequacy: [],
          unmapped_data: ""
        }
      }));

      setPendingExpert(newExperts);
      e.target.value = "";
    } catch (err: any) {
      console.error(err);
      alert("Failed to parse file: " + err.message);
    }
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        fullName: "John Doe",
        primary_position: "Resident Engineer",
        role: "Civil Engineer",
        email: "john.doe@example.com",
        phone: "+1234567890",
        location: "New York",
        countries: "United States, Canada",
        dateOfBirth: "1980-01-15",
        countryOfCitizenship: "USA",
        availability: "Available immediately",
        profileSummary: "Experienced Resident Engineer with 15 years in civil construction...",
        type: "External",
        educationLevel: "Master's Degree",
        experienceYears: 15,
        languages: "English, Spanish",
        skills: "Project Management, Site Supervision",
        software: "AutoCAD, MS Project",
        certifications: "PMP, PE",
        educations: "[2000 - 2004] | [USA] | [University of Engineering] | [Bachelor of Civil Engineering]",
        experiences: "[Jan 2010 - Present] | [USA] | [Acme Corp] | [Resident Engineer] | [Managed large-scale construction...]\n[Feb 2005 - Dec 2009] | [USA] | [Beta Build] | [Site Engineer] | [Supervised site operations...]",
        adequacy_experience: "[Jan 2018 - Dec 2020] | [USA] | [City Council] | [Resident Engineer] | [Highway expansion project...]",
        projects: "[2020 - 2021] | [USA] | [Acme Corp] | [Resident Engineer] | [City Highway Bridge]"
      },
      {
        fullName: "Jane Smith",
        primary_position: "Highway Engineer",
        role: "Civil Engineer",
        email: "jane.smith@example.com",
        phone: "+9876543210",
        location: "London",
        countries: "United Kingdom, France",
        dateOfBirth: "1985-06-20",
        countryOfCitizenship: "UK",
        availability: "2 weeks notice",
        profileSummary: "Senior Highway Engineer specializing in road design and alignment...",
        type: "Internal",
        educationLevel: "Bachelor's Degree",
        experienceYears: 10,
        languages: "English, French",
        skills: "Highway Design, Pavement Analysis",
        software: "Civil 3D, MicroStation",
        certifications: "Chartered Engineer",
        educations: "[2003 - 2007] | [UK] | [London University] | [Bachelor of Science in Civil Engineering]",
        experiences: "[Mar 2015 - Present] | [UK] | [Roads UK] | [Highway Engineer] | [Designed multiple highway layouts...]",
        adequacy_experience: "[Mar 2019 - Present] | [UK] | [Transport Dept] | [Highway Engineer] | [M4 Motorway redesign...]",
        projects: "[2021 - 2022] | [UK] | [Roads UK] | [Highway Engineer] | [London Inner Ring Road]"
      }
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(templateData);
    XLSX.utils.book_append_sheet(wb, ws, "Experts");
    XLSX.writeFile(wb, "Experts_Import_Template.csv");
  };

  const handleUploadClick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArr = Array.from(files);
    const initialTypes: Record<number, string> = {};
    fileArr.forEach((_, i) => initialTypes[i] = "External");
    setFileTypes(initialTypes);
    
    setPendingUploadFiles(fileArr);
    setShowTypeModal(true);
    e.target.value = ''; // Clear the input
  };

  const confirmUpload = async () => {
    if (!pendingUploadFiles) return;
    const fileList = pendingUploadFiles;
    const typesMap = fileTypes;
    setShowTypeModal(false);
    setPendingUploadFiles(null);

    const taskId = addTask({
      type: 'UPLOAD',
      title: `Ingesting ${fileList.length} Expert CVs`,
      message: 'Extracting text from documents...'
    });

    let currentEta = fileList.length * 15;
    let currentPercent = 5;
    
    const interval = setInterval(() => {
      currentPercent = Math.min(currentPercent + Math.random() * 8, 95);
      currentEta = Math.max(currentEta - 3, 2);
      updateTask(taskId, {
        percent: currentPercent,
        eta: currentEta
      });
    }, 1500);

    try {
      let allParsedExperts: any[] = [];

      for (let i = 0; i < fileList.length; i++) {
        const typeLabel = typesMap[i] || selectedUploadType;
        updateTask(taskId, { message: `Extracting text from ${fileList[i].name}...` });
        const text = await extractTextFromPDF(fileList[i]);
        
        let formData = new FormData();
        formData.append('file', fileList[i]);
        let uploadedFileUrl = "";
        try {
           const ures = await fetch('/api/upload', { method: 'POST', body: formData });
           if (ures.ok) {
              const udata = await ures.json();
              uploadedFileUrl = `/uploads/${udata.filename}`;
           }
        } catch (e) {
           console.error("Failed to upload document", e);
        }

        updateTask(taskId, { message: `Cognitive Engine is parsing ${fileList[i].name}...` });
        let parsedChunk = await parseCVText(`--- DOC: ${fileList[i].name} ---\n${text}`);
        
        // Enhance with raw text and override type
        parsedChunk = parsedChunk.map((exp: any) => ({
          ...exp,
          type: typeLabel,
          original_cv_text: text, // 100% extracted text attached here
          original_cv_url: uploadedFileUrl,
          original_cv_filename: fileList[i].name
        }));
        
        allParsedExperts.push(...parsedChunk);
      }

      clearInterval(interval);
      updateTask(taskId, { 
        status: 'completed', 
        percent: 100, 
        eta: 0,
        message: `AI Extraction complete. Please verify the extracted experts.` 
      });
      
      const expertsWithTaskId = allParsedExperts.map(exp => ({ ...exp, _taskId: taskId }));
      setPendingExpert(expertsWithTaskId);
      
    } catch (err: any) {
      clearInterval(interval);
      console.error(err);
      updateTask(taskId, { 
        status: 'error', 
        message: err.message 
      });
    }
  };

  const handleUpdateRole = async (expertId: string, role: string) => {
    await api.updateExpertRole(expertId, role);
    setEditingRoleExpert(null);
    fetchExperts();
  };

  const filteredExperts = experts.filter(e => {
    const name = e.name || "";
    const skills = e.skills || [];
    const expertType = e.type || "External";
    
    const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          skills.some((s:string) => s.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesType = typeFilter === "All Types" || expertType.toLowerCase() === typeFilter.toLowerCase();
    const roleMatch = e.role || "";
    
    let matchesFolder = true;
    if (selectedFolder === 'Others') {
       matchesFolder = !taxonomy.map(t=>t.toLowerCase()).includes(roleMatch.toLowerCase());
    } else if (selectedFolder) {
       matchesFolder = roleMatch.toLowerCase() === selectedFolder.toLowerCase();
    }
    
    const matchesColumnFilters = Object.entries(columnFilters).every(([key, value]) => {
      if (!value) return true;
      const lowerValue = (value as string).toLowerCase();
      if (key === 'fullName') return (e.fullName || e.name || "").toLowerCase().includes(lowerValue);
      if (key === 'primary_position') return (e.primary_position || "").toLowerCase().includes(lowerValue);
      if (key === 'role') return (e.role || "").toLowerCase().includes(lowerValue);
      if (key === 'location') return (e.location || "").toLowerCase().includes(lowerValue);
      if (key === 'countries') return (e.countries?.join(', ') || "").toLowerCase().includes(lowerValue);
      if (key === 'education') return (e.educationLevel || e.metadata?.educations?.[0]?.degree || e.education?.[0] || "").toLowerCase().includes(lowerValue);
      if (key === 'experience') return (e.experienceYears?.toString() || e.employment_history?.length?.toString() || e.experiences?.length?.toString() || "").toLowerCase().includes(lowerValue);
      if (key === 'type') return (e.type || "External").toLowerCase().includes(lowerValue);
      if (key === 'skills') return (e.skills?.join(', ') || "").toLowerCase().includes(lowerValue);
      if (key === 'awards') return (e.metadata?.awards?.map((a:any) => a.title).join(', ') || "").toLowerCase().includes(lowerValue);
      if (key === 'languages') return formatExpertLanguages(e).toLowerCase().includes(lowerValue);
      if (key === 'certifications') return (e.metadata?.certifications?.map((c:any) => c.title).join(', ') || "").toLowerCase().includes(lowerValue);
      if (key === 'software') return (e.software?.join(', ') || "").toLowerCase().includes(lowerValue);
      if (key === 'dateOfBirth') return (e.dateOfBirth || "").toLowerCase().includes(lowerValue);
      if (key === 'citizenship') return (e.countryOfCitizenship || e.nationality || "").toLowerCase().includes(lowerValue);
      if (key === 'professionalMembership') return (e.professionalMembership?.join(', ') || "").toLowerCase().includes(lowerValue);
      if (key === 'createdAt') return ((e.createdAt || e.created_at) ? new Date(e.createdAt || e.created_at).toLocaleDateString() : "").toLowerCase().includes(lowerValue);

      return true;
    });

    return matchesSearch && matchesType && matchesFolder && matchesColumnFilters;
  }).sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    const mod = direction === 'asc' ? 1 : -1;
    
    const getValue = (e: any, k: string) => {
      if (k === 'fullName') return (e.fullName || e.name || "").toLowerCase();
      if (k === 'primary_position') return (e.primary_position || "").toLowerCase();
      if (k === 'role') return (e.role || "").toLowerCase();
      if (k === 'location') return (e.location || "").toLowerCase();
      if (k === 'countries') return (e.countries?.join(', ') || "").toLowerCase();
      if (k === 'education') return (e.educationLevel || e.metadata?.educations?.[0]?.degree || e.education?.[0] || "").toLowerCase();
      if (k === 'experience') return parseInt(e.experienceYears || e.employment_history?.length || e.experiences?.length || 0);
      if (k === 'type') return (e.type || "External").toLowerCase();
      if (k === 'skills') return (e.skills?.join(', ') || "").toLowerCase();
      if (k === 'awards') return (e.metadata?.awards?.map((x:any) => x.title).join(', ') || "").toLowerCase();
      if (k === 'languages') return formatExpertLanguages(e).toLowerCase();
      if (k === 'certifications') return (e.metadata?.certifications?.map((c:any) => c.title).join(', ') || "").toLowerCase();
      if (k === 'software') return (e.software?.join(', ') || "").toLowerCase();
      if (k === 'dateOfBirth') return (e.dateOfBirth || "").toLowerCase();
      if (k === 'citizenship') return (e.countryOfCitizenship || e.nationality || "").toLowerCase();
      if (k === 'professionalMembership') return (e.professionalMembership?.join(', ') || "").toLowerCase();
      if (k === 'createdAt') return new Date(e.createdAt || e.created_at || 0).getTime();
      return "";
    };

    const valA = getValue(a, key);
    const valB = getValue(b, key);

    if (valA < valB) return -1 * mod;
    if (valA > valB) return 1 * mod;
    return 0;
  });

  const renderColumnHeader = (id: string, label: string) => (
    <th key={id} className="px-6 py-4 font-semibold text-[11px] uppercase tracking-wider text-slate-500 whitespace-nowrap relative">
      <div 
        className="flex items-center gap-1 cursor-pointer hover:text-slate-700 select-none"
        onClick={(e) => {
          e.stopPropagation();
          setActiveColumnMenu(activeColumnMenu === id ? null : id);
        }}
      >
        {label} 
        {sortConfig?.key === id ? (
          sortConfig.direction === 'asc' ? <ChevronUp size={12} className="text-blue-600" /> : <ChevronDown size={12} className="text-blue-600" />
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
            <div className="px-3 py-2 text-xs font-semibold text-slate-500">Sort</div>
            <button 
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-sm font-medium text-slate-700 rounded-md transition-colors"
              onClick={() => {
                setSortConfig({ key: id, direction: 'asc' });
                setActiveColumnMenu(null);
              }}
            >
              <ChevronUp size={16} className="text-slate-500" /> Sort Ascending
            </button>
            <button 
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-sm font-medium text-slate-700 rounded-md transition-colors"
              onClick={() => {
                setSortConfig({ key: id, direction: 'desc' });
                setActiveColumnMenu(null);
              }}
            >
              <ChevronDown size={16} className="text-slate-500" /> Sort Descending
            </button>
          </div>
          <div className="border-t border-slate-100 p-2">
            <div className="px-2 pb-2 text-xs font-semibold text-slate-500">Filter</div>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder={`Filter ${label.toLowerCase()}...`}
                value={columnFilters[id] || ""}
                onChange={(e) => setColumnFilters(prev => ({ ...prev, [id]: e.target.value }))}
                className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 shadow-sm"
              />
            </div>
          </div>
        </div>
      )}
    </th>
  );

  return (
    <div className="space-y-6 max-w-full w-full mx-auto pb-32">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <div>
          <h2 className="text-[22px] font-semibold text-slate-900 mb-1">Experts</h2>
          <p className="text-slate-500 text-sm">Manage your talent pool and CV profiles</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <button
            onClick={() => setIsImportCsvOpen(true)}
            className="flex justify-center items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors shadow-sm cursor-pointer w-full sm:w-auto"
          >
            <FileText size={16} />
            Import Notebook Expert Text
          </button>
          <button
            onClick={handleDownloadTemplate}
            className="flex justify-center items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors shadow-sm cursor-pointer w-full sm:w-auto"
          >
            <Download size={16} />
            Template
          </button>
          <label className="flex justify-center items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors shadow-sm cursor-pointer w-full sm:w-auto">
            <FileSpreadsheet size={16} />
            Import Excel
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelUpload} />
          </label>
          <label className={clsx(
            "flex justify-center items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors shadow-sm cursor-pointer w-full sm:w-auto",
            isUploading && "opacity-50 cursor-not-allowed"
          )}>
            {isUploading ? <Loader2 size={16} className="animate-spin text-slate-500" /> : <Upload size={16} />}
            {isUploading ? "Uploading..." : "Upload CVs"}
            <input type="file" multiple className="hidden" onChange={handleUploadClick} disabled={isUploading} />
          </label>
          <button 
            onClick={() => setIsAddExpertOpen(true)}
            className="flex justify-center items-center gap-2 bg-[#2563eb] hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition-colors shadow-sm w-full sm:w-auto"
          >
            <Plus size={16} />
            Add Expert
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 py-2 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1 min-w-0 w-full">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 shrink-0" size={16} />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search experts by name, skill, or long queries..."
              className="w-full bg-white border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm min-w-0"
            />
          </div>
          <div className="flex gap-2 items-center shrink-0">
            <Filter size={16} className="text-slate-400 ml-2 hidden sm:block" />
            <div className="relative w-full sm:w-auto">
              <select 
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full sm:w-auto appearance-none bg-white border border-slate-200 rounded-lg py-2.5 pl-3 pr-8 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
              >
                <option value="All Types">All Types</option>
                {expertTypes.map(option => <option key={option.code} value={option.label}>{option.label}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button 
            onClick={fetchExperts}
            className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <RefreshCw size={14} className="shrink-0" />
            Refresh
          </button>
          <div className="relative flex-1 sm:flex-none" ref={columnMenuRef}>
            <button 
              onClick={() => setShowColumnMenu(!showColumnMenu)}
              className="w-full sm:w-auto flex justify-center items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              <SlidersHorizontal size={14} className="shrink-0" />
              Columns
              <span className="bg-[#bfdbfe] text-blue-800 text-xs font-bold px-1.5 py-0.5 rounded ml-1 shrink-0">{ALL_COLUMNS.length}</span>
            </button>
            {showColumnMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-xl border border-slate-200 py-2 z-20">
                <div className="px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Toggle Columns
                </div>
                {ALL_COLUMNS.map(col => (
                  <label key={col.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                    <div className={clsx("w-4 h-4 rounded border flex items-center justify-center transition-colors", visibleColumns.includes(col.id) ? "bg-blue-600 border-blue-600" : "border-slate-300")}>
                      {visibleColumns.includes(col.id) && <Check size={12} className="text-white" />}
                    </div>
                    <input 
                      type="checkbox" 
                      className="hidden" 
                      checked={visibleColumns.includes(col.id)}
                      onChange={() => toggleColumn(col.id)}
                    />
                    <span className="text-sm font-medium text-slate-700">{col.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex gap-6 items-start">
        {/* Folders Sidebar */}
        <div className="w-64 bg-white rounded-xl border border-slate-200 shadow-sm shrink-0 overflow-hidden flex flex-col h-[700px]">
          <div className="font-semibold text-sm text-slate-800 p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen size={16} className="text-blue-500" />
              Taxonomy Folders
            </div>
          </div>
          <div className="overflow-y-auto flex-1 p-2">
            <div 
              onClick={() => setSelectedFolder(null)}
              className={clsx(
                "px-3 py-2 rounded-lg text-sm mb-1 cursor-pointer transition-colors font-medium",
                !selectedFolder ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              All Experts ({experts.length})
            </div>
            <div className="mb-4 mt-2">
              <div className="px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Taxonomy Folders
              </div>
              {(() => {
                const foldersWithCounts = taxonomy.map(role => {
                  const count = experts.filter(e => (e.role || "").toLowerCase() === role.toLowerCase()).length;
                  return { role, count };
                });
                
                foldersWithCounts.sort((a, b) => {
                  if (a.count > 0 && b.count === 0) return -1;
                  if (a.count === 0 && b.count > 0) return 1;
                  return 0;
                });

                return foldersWithCounts.map(({ role, count }) => (
                  <div 
                    key={role}
                    onClick={() => setSelectedFolder(role)}
                    className={clsx(
                      "px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors flex justify-between items-center group/folder relative",
                      selectedFolder === role 
                        ? "bg-blue-100 text-blue-800 font-medium" 
                        : (count > 0 ? "bg-[#e0f2fe] text-sky-900 font-medium hover:bg-[#bae6fd] mb-0.5" : "text-slate-500 hover:bg-slate-50")
                    )}
                  >
                    <span className="break-words whitespace-normal text-left pr-2 leading-tight">{role}</span>
                    {count > 0 && (
                      <span className={clsx("text-xs px-1.5 rounded-md min-w-[20px] text-center", selectedFolder === role ? "bg-blue-200 text-blue-800" : "bg-sky-200 text-sky-900")}>{count}</span>
                    )}
                  </div>
                ));
              })()}
            </div>

            <div className="mb-4 mt-2">
              <div className="px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Other
              </div>
              {(() => {
                const count = experts.filter(e => !taxonomy.map(t=>t.toLowerCase()).includes((e.role || "").toLowerCase())).length;
                return (
                  <div 
                    onClick={() => setSelectedFolder("Others")}
                    className={clsx(
                      "px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors flex justify-between items-center mt-1",
                      selectedFolder === "Others" 
                        ? "bg-blue-100 text-blue-800 font-medium" 
                        : (count > 0 ? "bg-[#e0f2fe] text-sky-900 font-medium hover:bg-[#bae6fd]" : "text-slate-500 hover:bg-slate-50")
                    )}
                  >
                    <span className="truncate">Others</span>
                    {count > 0 && <span className={clsx("text-xs px-1.5 rounded-md min-w-[20px] text-center font-medium", selectedFolder === "Others" ? "bg-blue-200 text-blue-800" : "bg-sky-200 text-sky-900")}>{count}</span>}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>

        {/* Table Container */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              <tr className="border-b border-slate-200 bg-[#fafafa]">
                {visibleColumns.includes('select') && (
                  <th className="px-6 py-4 font-semibold text-[11px] uppercase tracking-wider text-slate-500 whitespace-nowrap w-16">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer" />
                      SELECT
                    </div>
                  </th>
                )}
                {visibleColumns.includes('fullName') && renderColumnHeader('fullName', 'FULL NAME')}
                {visibleColumns.includes('primary_position') && renderColumnHeader('primary_position', 'PRIMARY POSITION')}
                {visibleColumns.includes('role') && renderColumnHeader('role', 'FOLDER NAME')}
                {visibleColumns.includes('location') && renderColumnHeader('location', 'LOCATION')}
                {visibleColumns.includes('countries') && renderColumnHeader('countries', 'COUNTRIES')}
                {visibleColumns.includes('education') && renderColumnHeader('education', 'EDUCATION')}
                {visibleColumns.includes('experience') && renderColumnHeader('experience', 'EXPERIENCE')}
                {visibleColumns.includes('type') && renderColumnHeader('type', 'TYPE')}
                {visibleColumns.includes('skills') && renderColumnHeader('skills', 'SKILLS')}
                {visibleColumns.includes('awards') && renderColumnHeader('awards', 'AWARDS')}
                {visibleColumns.includes('languages') && renderColumnHeader('languages', 'LANGUAGES')}
                {visibleColumns.includes('certifications') && renderColumnHeader('certifications', 'CERTIFICATIONS')}
                {visibleColumns.includes('software') && renderColumnHeader('software', 'SOFTWARE')}
                {visibleColumns.includes('dateOfBirth') && renderColumnHeader('dateOfBirth', 'DATE OF BIRTH')}
                {visibleColumns.includes('citizenship') && renderColumnHeader('citizenship', 'CITIZENSHIP')}
                {visibleColumns.includes('professionalMembership') && renderColumnHeader('professionalMembership', 'MEMBERSHIP')}
                {visibleColumns.includes('createdAt') && renderColumnHeader('createdAt', 'CREATED')}
                {visibleColumns.includes('actions') && (
                  <th className="px-6 py-4 font-semibold text-[11px] uppercase tracking-wider text-slate-500 whitespace-nowrap">ACTIONS</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredExperts.length > 0 ? (
                filteredExperts.map((expert) => (
                  <tr 
                    key={expert.id} 
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors group"
                  >
                    {visibleColumns.includes('select') && (
                      <td className="px-6 py-4">
                        <input type="checkbox" className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer" />
                      </td>
                    )}
                    {visibleColumns.includes('fullName') && (
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="min-w-8 w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-medium text-xs">
                            {(expert.fullName || expert.name || "UN").split(' ').map((n:string) => n[0]).join('').substring(0, 2).toUpperCase()}
                          </div>
                          <div 
                            className="flex flex-col min-w-0 cursor-pointer hover:underline text-blue-600"
                            onClick={() => { setExpertToEdit(expert); setIsAddExpertOpen(true); }}
                          >
                            <span className="font-semibold text-sm break-words max-w-[300px]">{expert.fullName || expert.name || "Unnamed"}</span>
                          </div>
                        </div>
                      </td>
                    )}
                    {visibleColumns.includes('primary_position') && (
                      <td className="px-6 py-4 text-sm text-slate-600 break-words max-w-[200px]">
                        <span>{expert.primary_position || '-'}</span>
                      </td>
                    )}
                    {visibleColumns.includes('role') && (
                      <td className="px-6 py-4 text-sm text-slate-600 break-words max-w-[200px]">
                        <div className="flex items-center justify-between group/role gap-2">
                          <span>{expert.role || '-'}</span>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setEditingRoleExpert(expert); }}
                            className="text-slate-400 hover:text-blue-600 opacity-0 group-hover/role:opacity-100 transition-opacity p-1"
                            title="Edit Folder Name"
                          >
                            <EditIcon size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                    {visibleColumns.includes('location') && (
                      <td className="px-6 py-4 text-sm text-slate-600">{expert.location || '-'}</td>
                    )}
                    {visibleColumns.includes('countries') && (
                      <td className="px-6 py-4 text-sm text-slate-600 break-words max-w-[250px]">
                        {Array.isArray(expert.countries) ? expert.countries.join(', ') : typeof expert.countries === 'string' ? expert.countries : '-'}
                      </td>
                    )}
                    {visibleColumns.includes('education') && (
                      <td className="px-6 py-4 text-sm text-slate-600">{expert.educationLevel || expert.metadata?.educations?.[0]?.degree || (Array.isArray(expert.education) ? expert.education[0] : typeof expert.education === 'string' ? expert.education : '-')}</td>
                    )}
                    {visibleColumns.includes('experience') && (
                      <td className="px-6 py-4 text-sm text-slate-600">{expert.experienceYears ? `${expert.experienceYears} Years` : (expert.employment_history?.length || expert.experiences?.length) ? `${expert.employment_history?.length || expert.experiences?.length} Roles` : '-'}</td>
                    )}
                    {visibleColumns.includes('type') && (
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
                          { (expert.type || 'External').toLowerCase().includes('external') ? 'External' : (expert.type || 'External') }
                        </span>
                      </td>
                    )}
                    {visibleColumns.includes('skills') && (
                      <td className="px-6 py-4">
                        <div className="flex gap-1 flex-wrap max-w-[300px]">
                          {(Array.isArray(expert.skills) ? expert.skills : typeof expert.skills === 'string' ? expert.skills.split(',').map((s: string) => s.trim()) : [])?.slice(0, 2).map((s: string, idx: number) => (
                             <span key={idx} className="break-words max-w-[150px] bg-white border border-slate-200 text-slate-600 text-xs px-1.5 py-0.5 rounded">{s}</span>
                          ))}
                          {(Array.isArray(expert.skills) ? expert.skills : typeof expert.skills === 'string' ? expert.skills.split(',').map((s: string) => s.trim()) : [])?.length > 2 && (
                            <span 
                              className="text-blue-600 font-medium text-xs py-0.5 cursor-pointer hover:underline"
                              onClick={(e) => { e.stopPropagation(); setExpertToEdit(expert); setModalFocusSection('skills'); setIsAddExpertOpen(true); }}
                              title={(Array.isArray(expert.skills) ? expert.skills : typeof expert.skills === 'string' ? expert.skills.split(',').map((s: string) => s.trim()) : []).slice(2).join(', ')}
                            >
                              +{(Array.isArray(expert.skills) ? expert.skills : typeof expert.skills === 'string' ? expert.skills.split(',').map((s: string) => s.trim()) : []).length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                    )}
                    {visibleColumns.includes('awards') && (
                      <td className="px-6 py-4 text-sm text-slate-600 break-words max-w-[200px]">
                        {Array.isArray(expert.metadata?.awards) 
                          ? expert.metadata.awards.map((a:any) => typeof a === 'string' ? a : a.title).join(', ')
                          : typeof expert.metadata?.awards === 'string'
                            ? expert.metadata.awards
                            : '-'}
                      </td>
                    )}
                    {visibleColumns.includes('languages') && (
                      <td className="px-6 py-4 text-sm text-slate-600 break-words max-w-[200px]">
                        {formatExpertLanguages(expert) || '-'}
                      </td>
                    )}
                    {visibleColumns.includes('certifications') && (
                      <td className="px-6 py-4 text-sm text-slate-600 break-words max-w-[250px]">
                        {Array.isArray(expert.metadata?.certifications) 
                          ? expert.metadata.certifications.map((c:any) => typeof c === 'string' ? c : c.title).join(', ') 
                          : typeof expert.metadata?.certifications === 'string' 
                            ? expert.metadata.certifications 
                            : Array.isArray(expert.certifications)
                              ? expert.certifications.map((c:any) => typeof c === 'string' ? c : c.title || c).join(', ')
                              : typeof expert.certifications === 'string'
                                ? expert.certifications
                                : '-'}
                      </td>
                    )}
                    {visibleColumns.includes('software') && (
                      <td className="px-6 py-4 text-sm text-slate-600 break-words max-w-[250px]">
                        {Array.isArray(expert.software) ? expert.software.join(', ') : typeof expert.software === 'string' ? expert.software : '-'}
                      </td>
                    )}
                    {visibleColumns.includes('dateOfBirth') && (
                      <td className="px-6 py-4 text-sm text-slate-600">{expert.dateOfBirth || '-'}</td>
                    )}
                    {visibleColumns.includes('citizenship') && (
                      <td className="px-6 py-4 text-sm text-slate-600">{expert.countryOfCitizenship || expert.nationality || '-'}</td>
                    )}
                    {visibleColumns.includes('professionalMembership') && (
                      <td className="px-6 py-4 text-sm text-slate-600 break-words max-w-[250px]">{expert.professionalMembership?.join(', ') || '-'}</td>
                    )}
                    {visibleColumns.includes('createdAt') && (
                      <td className="px-6 py-4 text-sm text-slate-600">{(expert.created_at || expert.createdAt) ? new Date(expert.created_at || expert.createdAt).toLocaleDateString() : '-'}</td>
                    )}
                    {visibleColumns.includes('actions') && (
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span 
                            onClick={(e) => { e.stopPropagation(); setExpertToEdit(expert); setIsAddExpertOpen(true); }}
                            className="text-sm text-blue-600 font-medium cursor-pointer hover:underline"
                          >
                            View
                          </span>
                          <button 
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteId(expert.id); }}
                            className="text-slate-400 hover:text-red-600 transition-colors relative z-10"
                            title="Delete Expert"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={visibleColumns.length} className="px-6 py-24 text-center text-[15px] text-slate-500 bg-white">
                    No experts found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Horizontal Scrollbar Track Visual (Decorative context from design) */}
        {!filteredExperts.length && (
          <div className="px-4 py-2 border-t border-slate-200/50 flex items-center gap-2">
            <ChevronLeft size={14} className="text-slate-400" />
            <div className="flex-1 h-2.5 bg-slate-200 rounded-full w-full relative">
               <div className="absolute left-0 top-0 bottom-0 bg-slate-400 rounded-full w-1/2"></div>
            </div>
            <ChevronRight size={14} className="text-slate-400" />
          </div>
        )}

          {/* Footer Pagination */}
          <div className="px-6 py-4 border-t border-slate-200 bg-white flex justify-between items-center">
            <div className="text-sm text-slate-600">
              Showing <span className="font-semibold">{filteredExperts.length > 0 ? 1 : 0}</span> to <span className="font-semibold">{filteredExperts.length}</span> of <span className="font-semibold">{filteredExperts.length}</span> results
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600 font-medium">Items per page:</span>
              <div className="relative">
                <select className="appearance-none bg-white border border-slate-200 rounded text-sm py-1 pl-2 pr-6 focus:outline-none focus:border-blue-500 shadow-sm">
                  {pageSizes.map(option => <option key={option.code} value={option.metadata?.value ?? option.label}>{option.label}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!confirmDeleteId}
        title="Delete Expert"
        message="Are you sure you want to delete this Expert? This action cannot be undone."
        confirmText="Delete"
        isDestructive={true}
        onConfirm={() => {
          if (confirmDeleteId) handleDeleteExpert(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <ImportExpertCsvModal
        isOpen={isImportCsvOpen}
        onClose={() => setIsImportCsvOpen(false)}
        onSuccess={fetchExperts}
      />

      <AddExpertModal 
        isOpen={isAddExpertOpen} 
        onClose={() => { setIsAddExpertOpen(false); setExpertToEdit(null); setModalFocusSection(undefined); }} 
        onSuccess={fetchExperts} 
        initialData={expertToEdit}
        focusSection={modalFocusSection}
      />
      
      <AnimatePresence>
        {editingRoleExpert && (
          <EditExpertRoleModal
            expert={editingRoleExpert}
            taxonomy={taxonomy}
            onSave={handleUpdateRole}
            onClose={() => setEditingRoleExpert(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTypeModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={clsx("bg-white rounded-xl shadow-xl w-full overflow-hidden flex flex-col", pendingUploadFiles && pendingUploadFiles.length > 1 ? "max-w-xl max-h-[90vh]" : "max-w-sm")}
            >
              <div className="p-6 border-b border-slate-100 shrink-0">
                <h3 className="text-lg font-bold text-slate-900">Expert Type</h3>
                <p className="text-sm text-slate-500 mt-1">Please select the type of expert for the uploaded CV(s).</p>
              </div>
              
              <div className="p-6 overflow-y-auto space-y-4">
                {pendingUploadFiles && pendingUploadFiles.length === 1 ? (
                  <>
                    <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                      <input 
                        type="radio" 
                        name="expertType" 
                        value="External" 
                        checked={fileTypes[0] === 'External'}
                        onChange={(e) => setFileTypes(prev => ({...prev, 0: e.target.value}))}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-slate-300"
                      />
                      <div>
                        <div className="text-sm font-medium text-slate-900">External Expert</div>
                        <div className="text-[11px] text-slate-500">Independent consultant / contractor</div>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                      <input 
                        type="radio" 
                        name="expertType" 
                        value="Internal" 
                        checked={fileTypes[0] === 'Internal'}
                        onChange={(e) => setFileTypes(prev => ({...prev, 0: e.target.value}))}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-slate-300"
                      />
                      <div>
                        <div className="text-sm font-medium text-slate-900">Internal Expert</div>
                        <div className="text-[11px] text-slate-500">Permanent staff member</div>
                      </div>
                    </label>
                  </>
                ) : pendingUploadFiles && pendingUploadFiles.length > 1 ? (
                  <div className="space-y-4">
                     <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200 sticky top-0 z-10">
                        <span className="text-sm font-medium text-slate-700">Set all to:</span>
                        <div className="flex gap-2">
                           <button onClick={() => {
                             const newTypes: Record<number, string> = {};
                             pendingUploadFiles.forEach((_, i) => newTypes[i] = 'External');
                             setFileTypes(newTypes);
                           }} className="px-3 py-1.5 bg-white border border-slate-200 rounded text-sm hover:bg-slate-50 transition-colors font-medium text-slate-700 shadow-sm">External</button>
                           <button onClick={() => {
                             const newTypes: Record<number, string> = {};
                             pendingUploadFiles.forEach((_, i) => newTypes[i] = 'Internal');
                             setFileTypes(newTypes);
                           }} className="px-3 py-1.5 bg-white border border-slate-200 rounded text-sm hover:bg-slate-50 transition-colors font-medium text-slate-700 shadow-sm">Internal</button>
                        </div>
                     </div>
                     <div className="space-y-2">
                       {pendingUploadFiles.map((f, i) => (
                          <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white">
                            <span className="text-sm font-medium text-slate-700 truncate mr-4" title={f.name}>{f.name}</span>
                            <select 
                              value={fileTypes[i] || 'External'}
                              onChange={e => setFileTypes(prev => ({...prev, [i]: e.target.value}))}
                              className="text-sm border border-slate-300 rounded px-2.5 py-1.5 min-w-[120px] bg-slate-50 hover:bg-white transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            >
                               {expertTypes.map(option => <option key={option.code} value={option.label}>{option.label}</option>)}
                            </select>
                          </div>
                       ))}
                     </div>
                  </div>
                ) : null}
              </div>
              
              <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                <button 
                  onClick={() => { setShowTypeModal(false); setPendingUploadFiles(null); }}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmUpload}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Confirm & Upload
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
