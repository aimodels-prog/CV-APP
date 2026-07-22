import { useState, useEffect, Fragment } from "react";
import {
  Target,
  Search,
  ChevronRight,
  ChevronDown,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  FileCheck,
  Target as TargetIcon,
  Loader2,
  FileText as FileIcon,
  Settings2,
  Copy,
  Layers,
  X,
  Image as ImageIcon,
  ArrowLeft,
  Briefcase,
  History,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  Eye,
  Languages,
  Download,
  FileText as FileTextIcon,
  CheckCircle2,
  Printer,
  Zap,
  RefreshCw,
  FileText,
  Wand2,
  BrainCircuit
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { motion, AnimatePresence } from "motion/react";
import { api } from "../lib/api";
import { useReferenceData } from "../lib/ReferenceDataContext";
import { generateReformatedCV } from "../lib/pdf";
import { BrandingModal } from "../components/BrandingModal";
import { useTasks } from "../lib/TasksContext";
import ConfirmModal from "../components/ConfirmModal";
import { RegenerateCVModal } from "../components/RegenerateCVModal";
import { translateExpertData, adaptExpertData, renderExpertData } from "../lib/gemini";
import { createHtmlDocBlob, downloadHtmlAsPdf, downloadHtmlAsDocx } from "../lib/exportHtml";
import { generateCVHtml } from "../lib/htmlCV";
import CertificationModal from "../components/CertificationModal";
import { resolveCertificationSettings } from "../lib/certificationSettings";
import { Document, Page, pdfjs } from 'react-pdf';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { appConfirm } from '../lib/notifications';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const certificationForOutput = (cv: any, tender: any) =>
  cv?.id?.startsWith("phantom-")
    ? resolveCertificationSettings(cv.certification, tender)
    : cv?.certification;

type CvMode = 'NORMAL' | 'ADAPT' | 'RENDER';

const cvMode = (cv: any): CvMode => {
  const mode = String(cv?.mode || cv?.generationMode || '').toUpperCase();
  if (mode.includes('RENDER') || cv?.isRendered) return 'RENDER';
  if (mode.includes('ADAPT') || cv?.isAdapted) return 'ADAPT';
  return 'NORMAL';
};

const safeFilePart = (value: unknown, fallback: string) =>
  String(value || fallback)
    .trim()
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/\s+/g, '_');

export default function MatchResults() {
  const { values } = useReferenceData();
  const translationLanguages = values('translation_language');
  const [searchParams] = useSearchParams();
  const [matches, setMatches] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const selectedTemplate = "General" as const;
  const [selectedTenderId, setSelectedTenderId] = useState<string>(searchParams.get("tenderId") || "all");
  const [tenders, setTenders] = useState<any[]>([]);
  const [brandingTender, setBrandingTender] = useState<any | null>(null);
  const [expandedTenders, setExpandedTenders] = useState<Set<string>>(
    new Set(),
  );
  
  const [showCertModal, setShowCertModal] = useState(false);
  
  // CV Actions states
  const [allExperts, setAllExperts] = useState<any[]>([]);
  const [cvs, setCvs] = useState<any[]>([]);
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [adaptingId, setAdaptingId] = useState<string | null>(null);
  const [renderingId, setRenderingId] = useState<string | null>(null);
  const [targetLang, setTargetLang] = useState<Record<string, string>>({});
  const [previewCv, setPreviewCv] = useState<any>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cvToRegenerate, setCvToRegenerate] = useState<any>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [isEditingRichText, setIsEditingRichText] = useState(false);
  const [richTextContent, setRichTextContent] = useState('');
  const [expandedPositions, setExpandedPositions] = useState<Set<string>>(
    new Set(),
  );
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [positionSearchQueries, setPositionSearchQueries] = useState<Record<string, string>>({});
  const [candidateSearchQueries, setCandidateSearchQueries] = useState<Record<string, string>>({});
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);
  const [bulkCvMode, setBulkCvMode] = useState<CvMode>('NORMAL');
  const [bulkLanguage, setBulkLanguage] = useState('');
  const [isBulkActionRunning, setIsBulkActionRunning] = useState(false);
  const [bulkPreviewQueue, setBulkPreviewQueue] = useState<any[]>([]);
  const [bulkPreviewIndex, setBulkPreviewIndex] = useState(0);
  const [feedback, setFeedback] = useState<
    Record<string, { type: "up" | "down"; reason?: string }>
  >({});
  const [feedbackModalMatch, setFeedbackModalMatch] = useState<any | null>(
    null,
  );
  const { tasks, addTask, updateTask } = useTasks();

  const generatingMatchIds = tasks
    .filter((t) => t.type === "GENERATE" && t.status === "running")
    .map((t) => t.message?.match(/ID: ([\w-]+)/)?.[1])
    .filter(Boolean);
  const isBulkGenerating = isBulkActionRunning || tasks.some(
    (t) =>
      t.type === "GENERATE" &&
      t.title.startsWith("Bulk ") &&
      t.status === "running",
  );
  const activeBulkTask = tasks.find(
    (t) =>
      t.type === "GENERATE" &&
      t.title.startsWith("Bulk Generate") &&
      t.status === "running",
  );

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetchMatches();
    fetchTenders();
    api.getExperts().then(setAllExperts);
    api.getCVs().then(setCvs);
  }, []);

  const handleDeleteMatch = async (id: string) => {
    await api.deleteMatch(id);
    fetchMatches();
  };

  const toggleTender = (tenderName: string) => {
    const newExpanded = new Set(expandedTenders);
    if (newExpanded.has(tenderName)) {
      newExpanded.delete(tenderName);
    } else {
      newExpanded.add(tenderName);
    }
    setExpandedTenders(newExpanded);
  };

  const togglePosition = (tenderName: string, positionTitle: string) => {
    const key = `${tenderName}-${positionTitle}`;
    const newExpanded = new Set(expandedPositions);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedPositions(newExpanded);
  };

  const fetchTenders = async () => {
    const data = await api.getTenders();
    setTenders(data);
  };

  const fetchMatches = async () => {
    try {
      const data = await api.getMatches("");
      setMatches(data);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredMatches = matches.filter((m) => {
    const matchesSearch =
      m.expertName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.positionId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.tenderName?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTender =
      selectedTenderId === "all" || m.tenderId === selectedTenderId;
    return matchesSearch && matchesTender;
  });

  const groupedMatches = filteredMatches.reduce((acc: any, match) => {
    const tenderName = match.tenderName || "Uncategorized Tender";
    const positionTitle =
      match.positionTitle || match.positionId || "Unknown Position";

    if (!acc[tenderName]) acc[tenderName] = {};
    if (!acc[tenderName][positionTitle]) acc[tenderName][positionTitle] = [];

    acc[tenderName][positionTitle].push(match);
    return acc;
  }, {});

  const matchesCvIdentity = (cv: any, source: any) => {
    if (cv.matchId && source.id && cv.matchId === source.id) return true;
    const sameTender = cv.tenderId === source.tenderId;
    const sameExpert = cv.expertId === source.expertId;
    const cvPosition = cv.positionId || cv.positionTitle;
    const sourcePosition = source.positionId || source.positionTitle;
    return sameTender && sameExpert && cvPosition === sourcePosition;
  };

  const storedCvForMode = (source: any, mode: CvMode) =>
    cvs.find((cv: any) => {
      const language = String(cv.language || 'English').toUpperCase();
      return matchesCvIdentity(cv, source) && cvMode(cv) === mode && language === 'ENGLISH';
    });

  const phantomCvForMode = (match: any, mode: CvMode) => ({
    ...match,
    id: `phantom-${match.id}-${mode.toLowerCase()}`,
    matchId: match.id,
    mode,
    language: 'English',
    template: selectedTemplate,
    isAdapted: mode === 'ADAPT',
    isRendered: mode === 'RENDER',
  });

  const cvForMode = (match: any, mode: CvMode) =>
    storedCvForMode(match, mode) || (mode === 'NORMAL' ? phantomCvForMode(match, mode) : null);

  const expertForCv = (cv: any) =>
    cv?.expertData || allExperts.find((expert) => expert.id === cv?.expertId || expert.name === cv?.expertName);

  const selectedMatches = () =>
    filteredMatches.filter((match) => selectedMatchIds.includes(match.id));

  const selectedVersionCvs = () =>
    selectedMatches()
      .map((match) => cvForMode(match, bulkCvMode))
      .filter(Boolean) as any[];

  const tenderForCv = async (cv: any) =>
    tenders.find((tender) => tender.id === cv.tenderId) || api.getTender(cv.tenderId);

  const buildPdfBlob = async (cv: any, expertOverride?: any): Promise<Blob> => {
    if (cv.customRichText) {
      return await downloadHtmlAsPdf(
        cv.customRichText,
        `CV_${safeFilePart(cv.expertName, 'Expert')}`,
        true,
      ) as Blob;
    }
    const expert = expertOverride || expertForCv(cv);
    if (!expert) throw new Error(`Expert data missing for ${cv.expertName || 'selected CV'}.`);
    const tender = await tenderForCv(cv);
    const doc = await generateReformatedCV({
      template: cv.template || selectedTemplate,
      branding: cv.customBranding || tender?.branding,
      expert,
      position_title: cv.positionTitle || cv.positionId,
      certification: certificationForOutput(cv, tender),
    });
    return doc.output('blob');
  };

  const buildDocxBlob = async (cv: any): Promise<Blob> => {
    if (cv.customRichText) {
      return createHtmlDocBlob(cv.customRichText, `CV_${safeFilePart(cv.expertName, 'Expert')}`);
    }
    const expert = expertForCv(cv);
    if (!expert) throw new Error(`Expert data missing for ${cv.expertName || 'selected CV'}.`);
    const tender = await tenderForCv(cv);
    const { generateDocxCV } = await import('../lib/docx');
    return generateDocxCV({
      template: cv.template || selectedTemplate,
      expert,
      branding: cv.customBranding || tender?.branding,
      position_title: cv.positionTitle || cv.positionId,
      certification: certificationForOutput(cv, tender),
    }, false);
  };

  const toggleMatchSelection = (matchId: string) => {
    setSelectedMatchIds((prev) =>
      prev.includes(matchId)
        ? prev.filter((id) => id !== matchId)
        : [...prev, matchId]
    );
  };

  const togglePositionSelection = (positionMatches: any[]) => {
    const allSelected = positionMatches.every((m) =>
      selectedMatchIds.includes(m.id)
    );
    if (allSelected) {
      setSelectedMatchIds((prev) =>
        prev.filter((id) => !positionMatches.find((m) => m.id === id))
      );
    } else {
      setSelectedMatchIds((prev) => {
        const newIds = [...prev];
        positionMatches.forEach((m) => {
          if (!newIds.includes(m.id)) newIds.push(m.id);
        });
        return newIds;
      });
    }
  };

  const toggleTenderSelection = (tenderMatchesObj: any) => {
    const allMatches = Object.values(tenderMatchesObj).flat() as any[];
    const allSelected = allMatches.every((m) => selectedMatchIds.includes(m.id));
    if (allSelected) {
      setSelectedMatchIds((prev) =>
        prev.filter((id) => !allMatches.find((m) => m.id === id))
      );
    } else {
      setSelectedMatchIds((prev) => {
        const newIds = [...prev];
        allMatches.forEach((m) => {
          if (!newIds.includes(m.id)) newIds.push(m.id);
        });
        return newIds;
      });
    }
  };

  const getBulkTargets = () => {
    const targets = selectedMatchIds.length > 0 
      ? filteredMatches.filter((m) => selectedMatchIds.includes(m.id)) 
      : filteredMatches.filter((m) => m.accepted === true);
    
    if (targets.length === 0) {
      alert("No matches selected or accepted. Please check the boxes to select matches first.");
    }
    return targets;
  };

  const handleBulkGenerate = async () => {
    if (isBulkGenerating) return;
    const targets = getBulkTargets();
    if (targets.length === 0) return;

    if (
      !(await appConfirm(
        `Are you sure you want to generate ${targets.length} Normal CVs in template ${selectedTemplate}?`,
        {
          title: "Generate normal CVs",
          confirmLabel: "Generate CVs",
        },
      ))
    )
      return;

    const taskId = addTask({
      type: "GENERATE",
      title: `Bulk Generate (${targets.length} CVs)`,
      message: `Starting bulk compilation...`,
    });

    try {
      const experts = await api.getExperts();

      for (let i = 0; i < targets.length; i++) {
        const match = targets[i];

        updateTask(taskId, {
          percent: Math.round((i / targets.length) * 100),
          eta: (targets.length - i) * 15,
          message: `Building ${i + 1}/${targets.length}: ${match.expertName}`,
        });

        const expert = experts.find(
          (e) => e.id === match.expertId || e.name === match.expertName,
        );
        const tender = tenders.find((t) => t.id === match.tenderId);

        if (expert && tender) {
          const doc = await generateReformatedCV({
            template: selectedTemplate,
            branding: tender?.branding,
            expert: expert,
            position_title: match.positionTitle || match.positionId,
            certification: resolveCertificationSettings(undefined, tender),
          });

          const normalRecord = {
            matchId: match.id,
            mode: "NORMAL",
            expertId: match.expertId,
            expertName: match.expertName,
            tenderId: match.tenderId,
            tenderName: match.tenderName,
            positionId: match.positionId,
            positionTitle: match.positionTitle || match.positionId,
            language: "English",
            score: match.score,
            match_summary: match.match_summary,
            strong_points: match.strong_points,
            risk_level: match.risk_level,
            template: selectedTemplate,
          };
          const existingNormal = storedCvForMode(match, 'NORMAL');
          if (existingNormal) await api.updateCV({ ...existingNormal, ...normalRecord, id: existingNormal.id });
          else await api.saveCV(normalRecord);

          doc.save(
            `${selectedTemplate}_CV_${(match.expertName || "Unnamed").split(" ").join("_")}.pdf`,
          );
          // Small delay to prevent browser download freezing/throttling
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      updateTask(taskId, {
        status: "completed",
        percent: 100,
        eta: 0,
        message: `Completed ${targets.length} CVs`,
      });
      setCvs(await api.getCVs());
    } catch (err: any) {
      console.error(err);
      updateTask(taskId, { status: "error", message: err.message });
    }
  };

  const handleBulkAdaptCV = async () => {
    if (isBulkGenerating) return;
    const targets = getBulkTargets();
    if (targets.length === 0) return;

    if (
      !(await appConfirm(`Are you sure you want to Adapt ${targets.length} CVs?`, {
        title: "Adapt selected CVs",
        confirmLabel: "Adapt CVs",
      }))
    )
      return;

    const taskId = addTask({
      type: "GENERATE",
      title: `Bulk Adapt (${targets.length} CVs)`,
      message: `Starting bulk adaptation...`,
    });

    try {
      const experts = await api.getExperts();

      for (let i = 0; i < targets.length; i++) {
        const match = targets[i];

        updateTask(taskId, {
          percent: Math.round((i / targets.length) * 100),
          eta: (targets.length - i) * 15,
          message: `Adapting ${i + 1}/${targets.length}: ${match.expertName}`,
        });

        const expert = experts.find((e) => e.id === match.expertId || e.name === match.expertName);
        let t = tenders.find((t) => t.id === match.tenderId);
        
        if (!t) {
            const result = await api.getTenders();
            t = result.find((tx: any) => tx.id === match.tenderId);
        }

        if (expert && t) {
          const adaptedExpert = await adaptExpertData(expert, t, match.positionTitle || match.positionId);
          const doc = await generateReformatedCV({
            template: selectedTemplate,
            branding: t.branding,
            expert: adaptedExpert,
            position_title: match.positionTitle || match.positionId,
            certification: resolveCertificationSettings(undefined, t),
          });

          const currentCv = {
             matchId: match.id,
             mode: "ADAPT",
             expertId: match.expertId,
             expertName: match.expertName,
             tenderId: match.tenderId,
             tenderName: match.tenderName,
             positionId: match.positionId,
             positionTitle: match.positionTitle || match.positionId,
             language: "English",
             score: match.score,
             match_summary: match.match_summary,
             strong_points: match.strong_points,
             risk_level: match.risk_level,
             template: selectedTemplate,
             expertData: adaptedExpert,
             customRichText: undefined,
             isAdapted: true,
             isRendered: false,
          };

          const existingCv = storedCvForMode(match, 'ADAPT');
          if (existingCv) await api.updateCV({ ...existingCv, ...currentCv, id: existingCv.id });
          else await api.saveCV(currentCv);

          doc.save(`${selectedTemplate} - ${adaptedExpert.fullName || adaptedExpert.name || "Expert"} (Adapted).pdf`);
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      updateTask(taskId, {
        status: "completed",
        percent: 100,
        eta: 0,
        message: `Completed ${targets.length} Adapted CVs`,
      });
      setCvs(await api.getCVs());
    } catch (err: any) {
      console.error(err);
      updateTask(taskId, { status: "error", message: err.message });
    }
  };

  const handleBulkRenderCV = async () => {
    if (isBulkGenerating) return;
    const targets = getBulkTargets();
    if (targets.length === 0) return;

    if (
      !(await appConfirm(`Are you sure you want to AI Render ${targets.length} CVs?`, {
        title: "Render selected CVs",
        confirmLabel: "Render CVs",
      }))
    )
      return;

    const taskId = addTask({
      type: "GENERATE",
      title: `Bulk Render (${targets.length} CVs)`,
      message: `Starting bulk render...`,
    });

    try {
      const experts = await api.getExperts();

      for (let i = 0; i < targets.length; i++) {
        const match = targets[i];

        updateTask(taskId, {
          percent: Math.round((i / targets.length) * 100),
          eta: (targets.length - i) * 15,
          message: `Rendering ${i + 1}/${targets.length}: ${match.expertName}`,
        });

        const expert = experts.find((e) => e.id === match.expertId || e.name === match.expertName);
        let t = tenders.find((t) => t.id === match.tenderId);
        
        if (!t) {
            const result = await api.getTenders();
            t = result.find((tx: any) => tx.id === match.tenderId);
        }

        if (expert && t) {
          const renderedExpert = await renderExpertData(expert, t, match.positionTitle || match.positionId);
          const doc = await generateReformatedCV({
            template: selectedTemplate,
            branding: t.branding,
            expert: renderedExpert,
            position_title: match.positionTitle || match.positionId,
            certification: resolveCertificationSettings(undefined, t),
          });

          const currentCv = {
             matchId: match.id,
             mode: "RENDER",
             expertId: match.expertId,
             expertName: match.expertName,
             tenderId: match.tenderId,
             tenderName: match.tenderName,
             positionId: match.positionId,
             positionTitle: match.positionTitle || match.positionId,
             language: "English",
             score: match.score,
             match_summary: match.match_summary,
             strong_points: match.strong_points,
             risk_level: match.risk_level,
             template: selectedTemplate,
             expertData: renderedExpert,
             customRichText: undefined,
             isAdapted: true,
             isRendered: true,
          };

          const existingCv = storedCvForMode(match, 'RENDER');
          if (existingCv) await api.updateCV({ ...existingCv, ...currentCv, id: existingCv.id });
          else await api.saveCV(currentCv);

          doc.save(`${selectedTemplate} - ${renderedExpert.fullName || renderedExpert.name || "Expert"} (Rendered).pdf`);
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      updateTask(taskId, {
        status: "completed",
        percent: 100,
        eta: 0,
        message: `Completed ${targets.length} Rendered CVs`,
      });
      setCvs(await api.getCVs());
    } catch (err: any) {
      console.error(err);
      updateTask(taskId, { status: "error", message: err.message });
    }
  };

  const requireSelectedVersionCvs = () => {
    const selected = selectedMatches();
    if (selected.length === 0) {
      alert('Select one or more matches first.');
      return [];
    }
    const versions = selectedVersionCvs();
    if (versions.length === 0) {
      alert(`None of the selected matches has a ${bulkCvMode.toLowerCase()} CV yet.`);
      return [];
    }
    if (versions.length < selected.length) {
      alert(`${selected.length - versions.length} selected match(es) have no ${bulkCvMode.toLowerCase()} CV and will be skipped.`);
    }
    return versions;
  };

  const handleBulkPackage = async (format: 'word' | 'pdf', regenerate = false) => {
    if (isBulkActionRunning) return;
    const targets = requireSelectedVersionCvs();
    if (targets.length === 0) return;
    const actionName = regenerate ? 'Regenerate' : format === 'word' ? 'Word export' : 'PDF export';
    if (
      !(await appConfirm(
        `${actionName} ${targets.length} ${bulkCvMode.toLowerCase()} CV(s)?`,
        {
          title: `${actionName} selected CVs`,
          confirmLabel: actionName,
        },
      ))
    )
      return;

    setIsBulkActionRunning(true);
    const taskId = addTask({
      type: 'GENERATE',
      title: `Bulk ${actionName} (${targets.length} CVs)`,
      message: `Preparing ${bulkCvMode.toLowerCase()} CV package...`,
    });
    const zip = new JSZip();
    const failures: string[] = [];

    try {
      for (let index = 0; index < targets.length; index++) {
        const cv = targets[index];
        updateTask(taskId, {
          percent: Math.round((index / targets.length) * 100),
          message: `${actionName}: ${index + 1}/${targets.length} — ${cv.expertName || 'Expert'}`,
        });
        try {
          const expertName = safeFilePart(cv.expertName, 'Expert');
          const position = safeFilePart(cv.positionTitle || cv.positionId, 'Position');
          if (format === 'word' && !regenerate) {
            const blob = await buildDocxBlob(cv);
            zip.file(`${expertName}_${position}_${bulkCvMode}.${cv.customRichText ? 'doc' : 'docx'}`, blob);
          } else {
            const blob = await buildPdfBlob(cv);
            zip.file(`${expertName}_${position}_${bulkCvMode}.pdf`, blob);
          }

          if (regenerate && cv.id?.startsWith('phantom-')) {
            const { id: _phantomId, ...record } = cv;
            await api.saveCV({ ...record, mode: bulkCvMode, language: 'English' });
          }
        } catch (error: any) {
          failures.push(`${cv.expertName || 'Expert'}: ${error.message}`);
        }
      }

      if (Object.keys(zip.files).length === 0) throw new Error('No CV files could be generated.');
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `Global_Matches_${bulkCvMode}_${regenerate ? 'Regenerated' : format.toUpperCase()}_${Date.now()}.zip`);
      setCvs(await api.getCVs());
      updateTask(taskId, {
        status: failures.length === targets.length ? 'error' : 'completed',
        percent: 100,
        eta: 0,
        message: failures.length
          ? `Completed ${targets.length - failures.length}/${targets.length}; ${failures.length} failed.`
          : `Completed ${targets.length}/${targets.length} CVs.`,
      });
      if (failures.length) alert(`Some CVs could not be processed:\n${failures.join('\n')}`);
    } catch (error: any) {
      updateTask(taskId, { status: 'error', message: error.message });
      alert(`${actionName} failed: ${error.message}`);
    } finally {
      setIsBulkActionRunning(false);
    }
  };

  const handleBulkTranslate = async () => {
    if (isBulkActionRunning) return;
    const targets = requireSelectedVersionCvs();
    if (targets.length === 0) return;
    if (!bulkLanguage) {
      alert('Select a target language first.');
      return;
    }
    if (
      !(await appConfirm(
        `Translate ${targets.length} ${bulkCvMode.toLowerCase()} CV(s) to ${bulkLanguage}?`,
        {
          title: "Translate selected CVs",
          confirmLabel: "Translate CVs",
        },
      ))
    )
      return;

    setIsBulkActionRunning(true);
    const taskId = addTask({
      type: 'GENERATE',
      title: `Bulk Translate (${targets.length} CVs)`,
      message: `Translating ${bulkCvMode.toLowerCase()} CVs to ${bulkLanguage}...`,
    });
    const zip = new JSZip();
    const failures: string[] = [];

    try {
      for (let index = 0; index < targets.length; index++) {
        const cv = targets[index];
        updateTask(taskId, {
          percent: Math.round((index / targets.length) * 100),
          message: `Translating ${index + 1}/${targets.length} — ${cv.expertName || 'Expert'}`,
        });
        try {
          const sourceExpert = expertForCv(cv);
          if (!sourceExpert) throw new Error('Expert data is missing.');
          const translatedExpert = await translateExpertData(sourceExpert, bulkLanguage);
          const pdf = await buildPdfBlob(cv, translatedExpert);
          const expertName = safeFilePart(cv.expertName, 'Expert');
          const position = safeFilePart(cv.positionTitle || cv.positionId, 'Position');
          zip.file(`${expertName}_${position}_${bulkCvMode}_${safeFilePart(bulkLanguage, 'Translation')}.pdf`, pdf);

          const existing = cvs.find((candidate: any) =>
            matchesCvIdentity(candidate, cv) &&
            cvMode(candidate) === bulkCvMode &&
            String(candidate.language || '').toUpperCase() === bulkLanguage.toUpperCase()
          );
          const { id: _sourceId, ...sourceRecord } = cv;
          const translatedRecord = {
            ...sourceRecord,
            mode: bulkCvMode,
            language: bulkLanguage,
            expertData: translatedExpert,
            translatedFromLanguage: cv.language || 'English',
          };
          if (existing) await api.updateCV({ ...existing, ...translatedRecord, id: existing.id });
          else await api.saveCV(translatedRecord);
        } catch (error: any) {
          failures.push(`${cv.expertName || 'Expert'}: ${error.message}`);
        }
      }

      if (Object.keys(zip.files).length === 0) throw new Error('No translated CVs could be generated.');
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `Global_Matches_${bulkCvMode}_${safeFilePart(bulkLanguage, 'Translated')}_${Date.now()}.zip`);
      setCvs(await api.getCVs());
      updateTask(taskId, {
        status: failures.length === targets.length ? 'error' : 'completed',
        percent: 100,
        eta: 0,
        message: failures.length
          ? `Translated ${targets.length - failures.length}/${targets.length}; ${failures.length} failed.`
          : `Translated ${targets.length}/${targets.length} CVs.`,
      });
      if (failures.length) alert(`Some translations failed:\n${failures.join('\n')}`);
    } catch (error: any) {
      updateTask(taskId, { status: 'error', message: error.message });
      alert(`Bulk translation failed: ${error.message}`);
    } finally {
      setIsBulkActionRunning(false);
    }
  };

  const handleBulkPreview = async () => {
    const targets = requireSelectedVersionCvs();
    if (targets.length === 0) return;
    setBulkPreviewQueue(targets);
    setBulkPreviewIndex(0);
    await handlePreview(targets[0]);
  };

  const handleGenerateCV = async (match: any) => {
    const taskId = addTask({
      type: "GENERATE",
      title: `Build CV: ${match.expertName}`,
      message: `Building CV. ID: ${match.id}`,
    });

    let currentPercent = 5;
    let currentEta = 15;
    const interval = setInterval(() => {
      currentPercent = Math.min(currentPercent + Math.random() * 8, 95);
      currentEta = Math.max(currentEta - 1, 1);
      updateTask(taskId, { percent: currentPercent, eta: currentEta });
    }, 1000);

    try {
      // 1. Fetch full expert and tender data for branding and rich profile
      const experts = await api.getExperts();
      const expert = experts.find(
        (e) => e.id === match.expertId || e.name === match.expertName,
      );

      const tender = await api.getTender(match.tenderId);

      if (!expert) throw new Error("Expert data not found");

      // 2. Generate PDF using specialized engine
      updateTask(taskId, { message: "Rendering branded PDF...", percent: 80 });
      const doc = await generateReformatedCV({
        template: selectedTemplate,
        branding: tender?.branding,
        expert: expert,
        position_title: match.positionTitle || match.positionId,
        certification: resolveCertificationSettings(undefined, tender),
      });

      // 3. Save metadata to Generated CVs list
      const normalRecord = {
        matchId: match.id,
        mode: "NORMAL",
        expertId: match.expertId,
        expertName: match.expertName,
        tenderId: match.tenderId,
        tenderName: match.tenderName,
        positionId: match.positionId,
        positionTitle: match.positionTitle || match.positionId,
        language: "English",
        score: match.score,
        match_summary: match.match_summary,
        strong_points: match.strong_points,
        risk_level: match.risk_level,
        template: selectedTemplate,
      };
      const existingNormal = storedCvForMode(match, 'NORMAL');
      if (existingNormal) await api.updateCV({ ...existingNormal, ...normalRecord, id: existingNormal.id });
      else await api.saveCV(normalRecord);
      setCvs(await api.getCVs());

      doc.save(
        `${selectedTemplate}_CV_${(match.expertName || "Unnamed").split(" ").join("_")}.pdf`,
      );

      clearInterval(interval);
      updateTask(taskId, {
        status: "completed",
        percent: 100,
        eta: 0,
        message: "CV Compiled and Downloaded",
      });
    } catch (err: any) {
      clearInterval(interval);
      console.error(err);
      updateTask(taskId, {
        status: "error",
        message: `CV Generation failed: ${err.message}`,
      });
      alert(`CV Generation failed: ${err.message}`);
    }
  };

  const handleAdaptCV = async (cv: any) => {
    setAdaptingId(cv.id);
    try {
      const currentCv = { ...cv };
      const existingModeCv = storedCvForMode(cv, 'ADAPT');

      const experts = await api.getExperts();
      const expert = experts.find(
        (e) => e.id === currentCv.expertId || e.name === currentCv.expertName,
      );
      if (!expert) {
        alert("Expert data missing. Cannot adapt CV.");
        return;
      }

      let t = tenders.find((t) => t.id === currentCv.tenderId);
      if (!t) {
        const result = await api.getTenders();
        t = result.find((tx: any) => tx.id === currentCv.tenderId);
      }

      const adaptedExpert = await adaptExpertData(
        expert,
        t,
        currentCv.positionTitle || currentCv.positionId,
      );

      const doc = await generateReformatedCV({
        template: currentCv.template || "General",
        branding: currentCv.customBranding || t?.branding,
        expert: adaptedExpert,
        position_title: currentCv.positionTitle || currentCv.positionId,
        certification: currentCv.certification,
      });
      doc.save(
        `${currentCv.template || "General"} - ${adaptedExpert.fullName || adaptedExpert.name || "Expert"} (Adapted).pdf`,
      );

      const { id: _sourceId, ...sourceData } = currentCv;
      const payload = {
        ...sourceData,
        matchId: currentCv.matchId || (currentCv.id?.startsWith('phantom-') ? currentCv.id.split('-').slice(1, -1).join('-') : undefined),
        mode: 'ADAPT',
        expertData: adaptedExpert,
        customRichText: undefined,
        isAdapted: true,
        isRendered: false,
      };
      if (existingModeCv) {
        await api.updateCV({ ...existingModeCv, ...payload, id: existingModeCv.id });
      } else {
        await api.saveCV(payload);
      }
      setCvs(await api.getCVs());
      alert('CV successfully adapted to tender requirements!');
    } catch (e) {
      console.error(e);
      alert('Failed to adapt CV');
    } finally {
      setAdaptingId(null);
    }
  };

  const handleRenderCV = async (cv: any) => {
    setRenderingId(cv.id);
    try {
      const currentCv = { ...cv };
      const existingModeCv = storedCvForMode(cv, 'RENDER');

      const experts = await api.getExperts();
      const expert = experts.find(
        (e) => e.id === currentCv.expertId || e.name === currentCv.expertName,
      );
      if (!expert) {
        alert("Expert data missing. Cannot render CV.");
        return;
      }

      let t = tenders.find((t) => t.id === currentCv.tenderId);
      if (!t) {
        const result = await api.getTenders();
        t = result.find((tx: any) => tx.id === currentCv.tenderId);
      }

      const renderedExpert = await renderExpertData(
        expert,
        t,
        currentCv.positionTitle || currentCv.positionId,
      );
      const doc = await generateReformatedCV({
        template: currentCv.template || "General",
        branding: currentCv.customBranding || t?.branding,
        expert: renderedExpert,
        position_title: currentCv.positionTitle || currentCv.positionId,
        certification: currentCv.certification,
      });
      doc.save(
        `${currentCv.template || "General"} - ${renderedExpert.fullName || renderedExpert.name || "Expert"} (Rendered).pdf`,
      );

      const { id: _sourceId, ...sourceData } = currentCv;
      const payload = {
        ...sourceData,
        matchId: currentCv.matchId || (currentCv.id?.startsWith('phantom-') ? currentCv.id.split('-').slice(1, -1).join('-') : undefined),
        mode: 'RENDER',
        expertData: renderedExpert,
        customRichText: undefined,
        isAdapted: true,
        isRendered: true,
      };
      if (existingModeCv) {
        await api.updateCV({ ...existingModeCv, ...payload, id: existingModeCv.id });
      } else {
        await api.saveCV(payload);
      }
      setCvs(await api.getCVs());
      alert('CV successfully rendered to 100% capacity!');
    } catch (e) {
      console.error(e);
      alert('Failed to render CV');
    } finally {
      setRenderingId(null);
    }
  };

  const handleTranslateCV = async (cv: any) => {
    const lang = targetLang[cv.id];
    if (!lang) {
      alert("Please select a target language first.");
      return;
    }
    setTranslatingId(cv.id);
    try {
      if (cv.id && cv.id.startsWith('phantom-')) {
         await api.saveCV({
           expertId: cv.expertId,
           expertName: cv.expertName,
           tenderId: cv.tenderId,
           tenderName: cv.tenderName,
           positionId: cv.positionId,
           positionTitle: cv.positionTitle,
           matchId: cv.matchId,
           mode: cvMode(cv),
           language: 'English',
           template: cv.template || 'General',
           certification: cv.certification,
         });
         api.getCVs().then(setCvs);
      }
      
      const experts = await api.getExperts();
      const baseExpert = experts.find(e => e.id === cv.expertId || e.name === cv.expertName);
      const expertToTranslate = cv.expertData || baseExpert;
      if (!expertToTranslate) {
        alert("Expert data missing. Cannot translate CV.");
        return;
      }
      const translatedExpert = await translateExpertData(expertToTranslate, lang);
      const tender = tenders.find(t => t.id === cv.tenderId);
      const doc = await generateReformatedCV({
        template: cv.template || 'General',
        branding: cv.customBranding || tender?.branding,
        expert: translatedExpert,
        position_title: cv.positionTitle || cv.positionId,
        certification: certificationForOutput(cv, tender),
      });
      const expertName = translatedExpert.fullName || translatedExpert.name || 'Expert';
      doc.save(`${cv.template || 'General'} - ${expertName} (${lang}).pdf`);
      const translatedExisting = cvs.find((candidate: any) =>
        matchesCvIdentity(candidate, cv) &&
        cvMode(candidate) === cvMode(cv) &&
        String(candidate.language || '').toUpperCase() === lang.toUpperCase()
      );
      const translatedPayload = {
        ...cv,
        id: translatedExisting?.id,
        mode: cvMode(cv),
        language: lang,
        expertData: translatedExpert,
        translatedFromLanguage: cv.language || 'English',
      };
      if (translatedExisting) await api.updateCV(translatedPayload);
      else {
        delete translatedPayload.id;
        await api.saveCV(translatedPayload);
      }
      setCvs(await api.getCVs());
    } catch (err: any) {
      console.error(err);
      alert("Translation failed: " + err.message);
    } finally {
      setTranslatingId(null);
    }
  };

  const confirmRegenerate = async (cvId: string, customBranding?: any) => {
    let cv = cvs.find(c => c.id === cvId);
    if (!cv && cvId.startsWith('phantom-') && cvToRegenerate?.id === cvId) {
        cv = cvToRegenerate;
    }
    if (!cv) return;
    setCvToRegenerate(null);
    const taskId = addTask({ type: 'GENERATE', title: `Regenerating CV`, message: `ID: ${cvId}` });
    let currentPercent = 5;
    const progressInterval = setInterval(() => {
      currentPercent = Math.min(currentPercent + Math.random() * 8, 95);
      updateTask(taskId, { percent: currentPercent, eta: 10 });
    }, 1000);
    try {
      const expert = expertForCv(cv);
      if (!expert) throw new Error("Expert data not found for regeneration");
      
      const tender = tenders.find(t => t.id === cv.tenderId);
      
      const doc = await generateReformatedCV({
        template: cv.template || 'General',
        branding: customBranding || tender?.branding,
        expert: expert,
        position_title: cv.positionTitle || cv.positionId,
        certification: certificationForOutput(cv, tender),
      });
      doc.save(`${cv.template || 'General'} - ${cv.expertName || 'Expert'} (Regenerated).pdf`);
      
      if (customBranding) {
          const dbcv = await api.getCVs().then(c=>c.find((x:any)=>x.id===cvId));
          if(dbcv) {
             dbcv.customBranding = customBranding;
             await api.updateCV(dbcv);
          } else if (cvId.startsWith('phantom-')) {
             await api.saveCV({
               expertId: cv.expertId,
               expertName: cv.expertName,
               tenderId: cv.tenderId,
               tenderName: cv.tenderName,
               positionId: cv.positionId,
               positionTitle: cv.positionTitle,
               matchId: cv.matchId,
               mode: cvMode(cv),
               language: 'English',
               template: cv.template || 'General',
               customBranding: customBranding
             });
             const updatedCvs = await api.getCVs();
             setCvs(updatedCvs);
          }
      } else if (cvId.startsWith('phantom-')) {
         await api.saveCV({
           expertId: cv.expertId,
           expertName: cv.expertName,
           tenderId: cv.tenderId,
           tenderName: cv.tenderName,
           positionId: cv.positionId,
           positionTitle: cv.positionTitle,
           matchId: cv.matchId,
           mode: cvMode(cv),
           language: 'English',
           template: cv.template || 'General'
         });
         const updatedCvs = await api.getCVs();
         setCvs(updatedCvs);
      }
      clearInterval(progressInterval);
      updateTask(taskId, { status: 'completed', percent: 100, eta: 0, message: 'CV Rebuilt and Downloaded' });
    } catch (err: any) {
      clearInterval(progressInterval);
      console.error(err);
      updateTask(taskId, { status: 'error', message: err.message });
      alert("Regeneration failed: " + err.message);
    }
  };

  const handleDownloadDocx = async (cv: any) => {
    try {
      if (cv.customRichText) {
        downloadHtmlAsDocx(cv.customRichText, `CV_${cv.expertName || 'Expert'}`);
        return;
      }
      const expert = expertForCv(cv);
      if (!expert) {
        alert("Expert data missing. Cannot download CV.");
        return;
      }
      
      if (cv.id && cv.id.startsWith('phantom-')) {
         await api.saveCV({
           expertId: cv.expertId,
           expertName: cv.expertName,
           tenderId: cv.tenderId,
           tenderName: cv.tenderName,
           positionId: cv.positionId,
           positionTitle: cv.positionTitle,
           matchId: cv.matchId,
           mode: cvMode(cv),
           language: 'English',
           template: cv.template || 'General'
         });
         api.getCVs().then(setCvs);
      }
      const tender = tenders.find(t => t.id === cv.tenderId);
      const { generateDocxCV } = await import('../lib/docx');
      await generateDocxCV({
        template: cv.template || 'General',
        expert,
        branding: cv.customBranding || tender?.branding,
        position_title: cv.positionTitle || cv.positionId,
        certification: certificationForOutput(cv, tender),
      });
    } catch (err: any) {
      console.error(err);
      alert("Download failed: " + err.message);
    }
  };

  const handleDownloadPdf = async (cv: any) => {
    try {
      if (cv.customRichText) {
        await downloadHtmlAsPdf(cv.customRichText, `CV_${cv.expertName || 'Expert'}`);
        return;
      }
      const expert = expertForCv(cv);
      if (!expert) {
        alert("Expert data missing. Cannot download CV.");
        return;
      }
      if (cv.id && cv.id.startsWith('phantom-')) {
         await api.saveCV({
           expertId: cv.expertId,
           expertName: cv.expertName,
           tenderId: cv.tenderId,
           tenderName: cv.tenderName,
           positionId: cv.positionId,
           positionTitle: cv.positionTitle,
           matchId: cv.matchId,
           mode: cvMode(cv),
           language: 'English',
           template: cv.template || 'General'
         });
         api.getCVs().then(setCvs);
      }
      const tender = tenders.find(t => t.id === cv.tenderId);
      const doc = await generateReformatedCV({
        template: cv.template || 'General',
        branding: cv.customBranding || tender?.branding,
        expert,
        position_title: cv.positionTitle || cv.positionId,
        certification: certificationForOutput(cv, tender),
      });
      doc.save(`${cv.template || 'General'} - ${cv.expertName || 'Expert'}.pdf`);
    } catch (err: any) {
      console.error(err);
      alert("Download failed: " + err.message);
    }
  };

  const handlePreview = async (cv: any) => {
    try {
      const expert = expertForCv(cv) || {};

      let currentCv = { ...cv };
      if (cv.id && cv.id.startsWith('phantom-')) {
         const res = await api.saveCV({
           expertId: cv.expertId,
           expertName: cv.expertName,
           tenderId: cv.tenderId,
           tenderName: cv.tenderName,
           positionId: cv.positionId,
           positionTitle: cv.positionTitle,
           matchId: cv.matchId,
           mode: cvMode(cv),
           language: 'English',
           template: cv.template || 'General',
           certification: cv.certification,
         });
         if (res.success && res.cv) {
           currentCv = res.cv;
         }
         api.getCVs().then(setCvs);
      }
      
      setPreviewCv({ ...currentCv, expertData: expert });
      
      const tender = tenders.find(t => t.id === currentCv.tenderId);
      
      const doc = await generateReformatedCV({
        template: currentCv.template || 'General',
        branding: currentCv.customBranding || tender?.branding,
        expert,
        position_title: currentCv.positionTitle || currentCv.positionId,
        certification: currentCv.certification,
      });
      const pdfBlob = doc.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
    } catch (err: any) {
      console.error(err);
      alert("Preview failed: " + err.message);
    }
  };

  const showBulkPreviewAt = async (index: number) => {
    const cv = bulkPreviewQueue[index];
    if (!cv) return;
    setBulkPreviewIndex(index);
    await handlePreview(cv);
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewCv(null);
    setIsEditingRichText(false);
    setBulkPreviewQueue([]);
    setBulkPreviewIndex(0);
  };

  const saveRichText = async () => {
    try {
      const updatedPreviewCv = { ...previewCv, customRichText: richTextContent };
      setPreviewCv(updatedPreviewCv);
      
      // Save it to DB
      if (updatedPreviewCv.id) {
         updatedPreviewCv.customBranding = updatedPreviewCv.customBranding || undefined;
         await api.updateCV({ id: updatedPreviewCv.id, ...updatedPreviewCv });
         api.getCVs().then(setCvs);
      }
      setIsEditingRichText(false);
    } catch (err: any) {
      console.error(err);
      alert("Failed to save: " + err.message);
    }
  };

  return (
    <div className="space-y-6 max-w-full w-full pb-32 mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            to="/tenders"
            className="w-10 h-10 flex shrink-0 items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-blue-600 hover:border-blue-200 shadow-sm transition-all active:scale-95"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              Global Matches
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Historical Intelligence & Scored Archives
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 lg:gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkGenerate}
              disabled={isBulkGenerating}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-medium shadow-sm transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {isBulkGenerating ? (
                <Loader2 size={16} className="animate-spin shrink-0" />
              ) : (
                <FileText size={16} className="shrink-0" />
              )}
              <span>Normal CV</span>
            </button>
            <button
              onClick={handleBulkAdaptCV}
              disabled={isBulkGenerating}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {isBulkGenerating ? (
                <Loader2 size={16} className="animate-spin shrink-0" />
              ) : (
                <RefreshCw size={16} className="shrink-0" />
              )}
              <span>Adapt CV</span>
            </button>
            <button
              onClick={handleBulkRenderCV}
              disabled={isBulkGenerating}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-[#2563eb] hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {isBulkGenerating ? (
                <Loader2 size={16} className="animate-spin shrink-0" />
              ) : (
                <Wand2 size={16} className="shrink-0" />
              )}
              <span>Render CV</span>
            </button>
          </div>
        </div>
      </div>

      {selectedMatchIds.length > 0 && (
        <div className="sticky top-3 z-30 rounded-xl border border-blue-200 bg-white/95 p-4 shadow-lg backdrop-blur">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">
                {selectedMatchIds.length} selected
              </span>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                CV version
                <select
                  value={bulkCvMode}
                  onChange={(event) => setBulkCvMode(event.target.value as CvMode)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-blue-500"
                >
                  <option value="NORMAL">Normal CV</option>
                  <option value="ADAPT">Adapted CV</option>
                  <option value="RENDER">Rendered CV</option>
                </select>
              </label>
              <button
                onClick={() => void handleBulkPreview()}
                disabled={isBulkGenerating}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Eye size={14} /> View
              </button>
              <button
                onClick={() => void handleBulkPackage('pdf', true)}
                disabled={isBulkGenerating}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw size={14} /> Regenerate
              </button>
              <button
                onClick={() => void handleBulkPackage('word')}
                disabled={isBulkGenerating}
                className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                <FileIcon size={14} /> Word ZIP
              </button>
              <button
                onClick={() => void handleBulkPackage('pdf')}
                disabled={isBulkGenerating}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                <Download size={14} /> PDF ZIP
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={bulkLanguage}
                onChange={(event) => setBulkLanguage(event.target.value)}
                disabled={isBulkGenerating}
                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 outline-none focus:border-blue-500 disabled:opacity-50"
              >
                <option value="">Translation language</option>
                {translationLanguages
                  .filter((option) => option.code !== 'ENGLISH')
                  .map((option) => <option key={option.code} value={option.label}>{option.label}</option>)}
              </select>
              <button
                onClick={() => void handleBulkTranslate()}
                disabled={isBulkGenerating || !bulkLanguage}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isBulkActionRunning ? <Loader2 size={14} className="animate-spin" /> : <Languages size={14} />}
                Translate
              </button>
              <button
                onClick={() => setSelectedMatchIds([])}
                disabled={isBulkGenerating}
                className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-slate-50/50 w-full">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4 flex-1 w-full min-w-0">
            <div className="flex items-center gap-3 group flex-1 bg-white border border-slate-200 rounded-lg px-4 py-2.5 shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all min-w-0">
              <Search
                className="text-slate-400 shrink-0 group-focus-within:text-blue-500"
                size={18}
              />
              <input
                type="text"
                placeholder="Search candidates or tenders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-sm text-slate-900 focus:outline-none w-full placeholder:text-slate-400 min-w-0"
              />
            </div>

            <div className="hidden lg:block h-8 w-px bg-slate-200 shrink-0"></div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full lg:w-auto shrink-0">
              <span className="text-sm font-medium text-slate-500 shrink-0 hidden sm:block">
                Filter:
              </span>
              <select
                value={selectedTenderId}
                onChange={(e) => setSelectedTenderId(e.target.value)}
                className="flex-1 sm:flex-none bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm cursor-pointer w-full sm:w-60 text-ellipsis overflow-hidden"
              >
                <option value="all">All Tenders</option>
                {tenders.map((t) => (
                  <option key={t.id} value={t.id} className="truncate">
                    {t.name}
                  </option>
                ))}
              </select>

              {selectedTenderId !== "all" && (
                <button
                  onClick={() => {
                    const t = tenders.find(
                      (t) => t.id.toString() === selectedTenderId,
                    );
                    setBrandingTender(t);
                  }}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 rounded-lg text-sm font-medium text-[#2563eb] transition-colors border border-[#2563eb]/20 shadow-sm whitespace-nowrap shrink-0"
                >
                  <ImageIcon size={16} className="shrink-0" />
                  Edit Branding
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {Object.entries(groupedMatches).map(
            ([tenderName, positions]: [string, any], tenderIdx) => {
              const isTenderExpanded = expandedTenders.has(tenderName);

              return (
                <div
                  key={tenderName}
                  className="group/tender border-b border-slate-100 last:border-0"
                >
                  {/* Tender Header */}
                  <div
                    className={clsx(
                      "w-full px-4 sm:px-6 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors text-left",
                      isTenderExpanded ? "bg-blue-50/50" : "hover:bg-slate-50",
                    )}
                  >
                    <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={Object.values(positions).flat().length > 0 && (Object.values(positions).flat() as any[]).every((m) => selectedMatchIds.includes(m.id))}
                        onChange={() => toggleTenderSelection(positions)}
                        className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <button onClick={() => toggleTender(tenderName)} className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0 text-left">
                        <div
                          className={clsx(
                            "w-10 h-10 rounded-lg flex items-center justify-center transition-colors shrink-0",
                            isTenderExpanded
                              ? "bg-[#2563eb] text-white"
                              : "bg-slate-100 text-slate-500",
                          )}
                        >
                          <Briefcase size={20} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-base font-semibold text-slate-900 truncate">
                            {tenderName}
                          </h3>
                          <p className="text-sm text-slate-500 mt-0.5">
                            Tender Project
                          </p>
                        </div>
                      </button>
                    </div>

                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-4 shrink-0 w-full sm:w-auto mt-2 sm:mt-0">
                      {(() => {
                        const tId =
                          positions &&
                          Object.values(positions)[0]?.[0]?.tenderId;
                        const tenderObj = tenders.find(
                          (t: any) => t.id === tId,
                        );
                        const reqs =
                          tenderObj?.requirements?.nationality_requirements;
                        if (
                          reqs?.required_percentage > 0 &&
                          reqs?.preferred_nationalities?.length > 0
                        ) {
                          const firstMatches = Object.values(positions as any)
                            .map((arr: any) => arr[0])
                            .filter(Boolean);
                          const total = firstMatches.length;
                          const local = firstMatches.filter((m: any) =>
                            reqs.preferred_nationalities.some((n: string) =>
                              (m.expertCitizenship || m.expertNationality || "")
                                .toLowerCase()
                                .includes(n.toLowerCase()),
                            ),
                          ).length;
                          const pct = total > 0 ? (local / total) * 100 : 0;
                          if (pct < reqs.required_percentage) {
                            return (
                              <div className="flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-700 border border-red-100 rounded-md text-xs font-semibold shrink-0">
                                <AlertCircle size={14} className="shrink-0" />
                                <span className="truncate max-w-[200px] sm:max-w-none">
                                  Warning: Proposed team ({pct.toFixed(0)}%)
                                  does not meet the {reqs.required_percentage}%
                                  localization requirement.
                                </span>
                              </div>
                            );
                          }
                        }
                        return null;
                      })()}
                      <div className="text-right sm:block flex-1 sm:flex-none">
                        <p className="text-sm font-medium text-slate-700 whitespace-nowrap">
                          {Object.keys(positions).length} Roles
                        </p>
                      </div>
                      {positions &&
                        Object.values(positions)[0]?.[0]?.tenderId && !searchParams.get("tenderId") && (
                          <Link
                            to={`/tenders/${Object.values(positions)[0][0].tenderId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex flex-row items-center justify-center gap-2 px-3 py-1.5 bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-600 rounded-lg text-xs font-medium text-slate-600 transition-colors shadow-sm ml-auto sm:ml-2 whitespace-nowrap"
                          >
                            <TargetIcon size={14} />
                            Run Engine
                          </Link>
                        )}
                      <div
                        className={clsx(
                          "shrink-0 flex items-center justify-center transition-transform duration-200",
                          isTenderExpanded
                            ? "rotate-90 text-slate-900"
                            : "text-slate-400",
                        )}
                      >
                        <ChevronRight size={20} />
                      </div>
                    </div>
                  </div>

                  {/* Positions within Tender (Animated Expansion) */}
                  <AnimatePresence>
                    {isTenderExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-white"
                      >
                        <div className="divide-y divide-slate-100">
                          <div className="px-6 py-3 bg-slate-50 border-b border-slate-100">
                            <div className="relative max-w-sm">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                              <input
                                type="text"
                                placeholder={`Search ${Object.keys(positions).length} roles...`}
                                value={positionSearchQueries[tenderName] || ""}
                                onChange={(e) => setPositionSearchQueries(prev => ({ ...prev, [tenderName]: e.target.value }))}
                                className="w-full pl-9 pr-4 py-1.5 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                              />
                            </div>
                          </div>
                          {Object.entries(positions)
                            .filter(([positionTitle]) => {
                              const q = positionSearchQueries[tenderName]?.toLowerCase() || "";
                              return positionTitle.toLowerCase().includes(q);
                            })
                            .map(
                            ([positionTitle, positionMatches]: [
                              string,
                              any,
                            ]) => {
                              const posKey = `${tenderName}-${positionTitle}`;
                              const isPosExpanded =
                                expandedPositions.has(posKey);

                              return (
                                <div
                                  key={positionTitle}
                                  className="group/position"
                                >
                                  <div
                                    className={clsx(
                                      "w-full pl-6 sm:pl-16 pr-4 sm:pr-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 transition-colors text-left",
                                      isPosExpanded
                                        ? "bg-slate-50"
                                        : "hover:bg-slate-50/50",
                                    )}
                                  >
                                    <div className="flex items-center gap-3 flex-1 min-w-0 w-full">
                                      <input
                                        type="checkbox"
                                        checked={positionMatches.length > 0 && positionMatches.every((m: any) => selectedMatchIds.includes(m.id))}
                                        onChange={() => togglePositionSelection(positionMatches)}
                                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                      />
                                      <button onClick={() => togglePosition(tenderName, positionTitle)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                                        <div
                                          className={clsx(
                                            "w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0",
                                            isPosExpanded
                                              ? "bg-blue-100 text-blue-700"
                                              : "bg-slate-100 text-slate-500",
                                          )}
                                        >
                                          <Target size={16} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <span className="text-sm font-medium text-slate-900 line-clamp-2">
                                            {positionTitle}
                                          </span>
                                        </div>
                                      </button>
                                    </div>
                                    <div className="flex items-center gap-4 shrink-0 justify-between sm:justify-end w-full sm:w-auto pl-11 sm:pl-0">
                                      <span className="text-xs font-medium text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-md shadow-sm">
                                        {positionMatches.length} candidates
                                      </span>
                                      <ChevronRight
                                        size={18}
                                        className={clsx(
                                          "text-slate-400 transition-transform",
                                          isPosExpanded && "rotate-90",
                                        )}
                                      />
                                    </div>
                                  </div>

                                  {/* Matches within Position (Recursive Expansion) */}
                                  <AnimatePresence>
                                    {isPosExpanded && (
                                      <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden"
                                      >
                                        
<div className="bg-slate-50/50 pt-0 pb-4 px-0 md:px-8 space-y-0">
  <div className="px-6 py-3 bg-slate-50 border-t border-slate-200">
    <div className="relative max-w-sm">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
      <input
        type="text"
        placeholder={`Search ${positionMatches.length} candidates...`}
        value={candidateSearchQueries[posKey] || ""}
        onChange={(e) => setCandidateSearchQueries(prev => ({ ...prev, [posKey]: e.target.value }))}
        className="w-full pl-9 pr-4 py-1.5 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
      />
    </div>
  </div>
  <div className="w-full overflow-x-auto shadow-sm border-t border-slate-200">
    <table className="w-full text-left border-collapse bg-white">
      <thead className="bg-[#f8fafc] border-b border-slate-200">
        <tr>
          <th className="px-4 py-3 w-10"></th>
          <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Score</th>
          <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Candidate</th>
          <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 hidden md:table-cell">Location</th>
          <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 hidden lg:table-cell">Experience</th>
          <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Risk Level</th>
          <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {positionMatches
          .filter((match: any) => {
            const q = candidateSearchQueries[posKey]?.toLowerCase() || "";
            return match.expertName?.toLowerCase().includes(q) || match.expert_type?.toLowerCase().includes(q);
          })
          .sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
          .map((match: any, matchIdx: number) => {
          const isMatchExpanded = expandedMatchId === match.id;
          const matchExpert = allExperts.find(e => e.id === match.expertId || e.name === match.expertName);
          const location = matchExpert?.location || matchExpert?.contact?.address || match.location || '-';
          const experience = matchExpert?.experienceYears ? `${matchExpert.experienceYears} Years` : (matchExpert?.employment_history?.length || matchExpert?.experiences?.length) ? `${matchExpert.employment_history?.length || matchExpert.experiences?.length} Roles` : match.experience || '-';
          
          return (
            <Fragment key={match.id || matchIdx}>
              <tr 
                className={clsx("hover:bg-blue-50/50 transition-colors cursor-pointer", isMatchExpanded ? "bg-blue-50/30" : "")}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedMatchId(isMatchExpanded ? null : match.id);
                }}
              >
                <td className="px-4 py-4 w-10" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedMatchIds.includes(match.id)}
                    onChange={() => toggleMatchSelection(match.id)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <div className={clsx("font-bold text-lg", match.score >= 85 ? "text-emerald-600" : match.score >= 50 ? "text-blue-600" : "text-amber-600")}>
                      {match.score}%
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="font-semibold text-slate-900">{match.expertName}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{match.expert_type || 'Expert'}</div>
                </td>
                <td className="px-6 py-4 hidden md:table-cell text-sm text-slate-600">{location}</td>
                <td className="px-6 py-4 hidden lg:table-cell text-sm text-slate-600">{experience}</td>
                <td className="px-6 py-4">
                   <div className={clsx("inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider", match.risk_level === "LOW" ? "bg-emerald-50 text-emerald-700" : match.risk_level === "MEDIUM" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700")}>
                      {match.risk_level}
                   </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setExpandedMatchId(isMatchExpanded ? null : match.id);
                    }}
                    className="text-blue-600 hover:bg-blue-100 p-1.5 rounded-lg transition-colors"
                    aria-label={isMatchExpanded ? "Collapse candidate details" : "Expand candidate details"}
                    aria-expanded={isMatchExpanded}
                  >
                     <ChevronDown className={clsx("transition-transform duration-200", isMatchExpanded && "rotate-180")} size={20} />
                  </button>
                </td>
              </tr>
              <AnimatePresence>
                {isMatchExpanded && (
                  <tr>
                    <td colSpan={7} className="p-0 border-0">

                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-slate-50/50"
                      >
                         <div className="p-6">
                            {/* Original block but wrapped inside the expanded row */}
                            <div className="bg-white border border-blue-100 shadow-sm rounded-xl p-5">
                                <div className="flex flex-col md:flex-row md:items-start gap-5">
                                   {/* We remove the original Score Ring and Header because it's now in the table row */}
                                   <div className="flex-1 min-w-0">
                                      {match.met_team_constraints && match.met_team_constraints.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-2 mb-4">
                                          <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Met Constraints:</span>
                                          {match.met_team_constraints.map((c: string, cIdx: number) => (
                                            <span
                                              key={cIdx}
                                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100/80 text-emerald-700 border border-emerald-200"
                                            >
                                              <CheckCircle2 size={12} /> {c}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                      
                                      {/* Extract Strengths, Gaps, Reasoning from original code using naive find-replace or by just keeping the JSX string portion starting from the grids */}
                                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                                        <div className="flex flex-col gap-4">
                                          <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-3 flex-1">
                                            <h5 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-800 mb-2">
                                              <CheckCircle2 size={14} className="text-emerald-500" /> Key Strengths
                                            </h5>
                                            <ul className="space-y-1">
                                              {(match.strong_points || match.fulfilled_requirements || match.strengths || [])?.map((s: string, sIdx: number) => (
                                                <li key={sIdx} className="text-xs text-emerald-900/80 flex items-start gap-1.5">
                                                  <span className="text-emerald-500 mt-0.5">•</span>
                                                  <span className="leading-snug">{s}</span>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                          
                                          {match.recommended_projects_to_highlight && match.recommended_projects_to_highlight.length > 0 && (
                                            <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3">
                                              <h5 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-800 mb-2">
                                                <Zap size={14} className="text-blue-500" /> Suggested Highlights
                                              </h5>
                                              <ul className="space-y-1">
                                                {match.recommended_projects_to_highlight.map((proj: string, i: number) => (
                                                  <li key={i} className="text-xs text-blue-900/80 flex items-start gap-1.5">
                                                    <span className="text-blue-500 mt-0.5">•</span>
                                                    <span className="leading-snug">{proj}</span>
                                                  </li>
                                                ))}
                                              </ul>
                                            </div>
                                          )}
                                        </div>

                                        <div className="bg-amber-50/50 border border-amber-100 rounded-lg p-3">
                                          <h5 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-800 mb-2">
                                            <AlertCircle size={14} className="text-amber-500" /> Missing / Gaps
                                          </h5>
                                          <ul className="space-y-1">
                                            {(match.missing_requirements || match.gaps)?.length > 0 ? (match.missing_requirements || match.gaps).map((g: string, gIdx: number) => (
                                              <li key={gIdx} className="text-xs text-amber-900/80 flex items-start gap-1.5">
                                                <span className="text-amber-500 mt-0.5">•</span>
                                                <span className="leading-snug">{g}</span>
                                              </li>
                                            )) : <li className="text-xs text-amber-900/80">No major gaps identified</li>}
                                          </ul>
                                        </div>
                                      </div>

                                      <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                                          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                                            Match Reasoning
                                          </h5>
                                          <p className="text-xs text-slate-700 leading-relaxed font-semibold mb-2">
                                            {match.match_summary || ""}
                                          </p>
                                          <p className="text-xs text-slate-700 leading-relaxed">
                                            {match.scoring_rationale || match.justification || match.reasoning || "No detailed reasoning provided."}
                                          </p>
                                      </div>
                                   </div>
                                    
                                   {/* CV ACTIONS - Extracted dynamically from original elementCode */}
                                   <div className="flex-shrink-0 w-full md:w-[240px] flex flex-col gap-3">
                                      {(() => {
                                        const visualCv = cvForMode(match, 'NORMAL') || phantomCvForMode(match, 'NORMAL');
                                        const adaptedCv = cvForMode(match, 'ADAPT');
                                        const renderedCv = cvForMode(match, 'RENDER');
                                        const adaptActionCv = adaptedCv || visualCv;
                                        const renderActionCv = renderedCv || visualCv;
                                        return (
                                          <div className="flex flex-col gap-2 w-full sm:w-[220px]">
                                                             <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1 mt-1">
                                                               Normal CV
                                                             </h5>
                                                             <div className="grid grid-cols-2 gap-1.5 w-full mb-1">
                                                               <button onClick={(e) => { e.stopPropagation(); handlePreview(visualCv); }} className="flex items-center gap-1.5 p-1.5 justify-center border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors shadow-sm text-[10px] font-medium" title="View CV">
                                                                 <Eye size={12} /> View
                                                               </button>
                                                               <button onClick={(e) => { e.stopPropagation(); setCvToRegenerate(visualCv); }} className="flex items-center gap-1.5 p-1.5 justify-center border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors shadow-sm text-[10px] font-medium" title="Regenerate CV">
                                                                 <RefreshCw size={12} /> Regenerate
                                                               </button>
                                                               <button onClick={(e) => { e.stopPropagation(); handleDownloadDocx(visualCv); }} className="flex items-center gap-1.5 p-1.5 justify-center border border-blue-200 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors shadow-sm text-[10px] font-medium" title="Download DOCX">
                                                                 <FileIcon size={12} /> Word
                                                               </button>
                                                               <button onClick={(e) => { e.stopPropagation(); handleDownloadPdf(visualCv); }} className="flex items-center gap-1.5 p-1.5 justify-center border border-red-200 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors shadow-sm text-[10px] font-medium" title="Download PDF">
                                                                 <Download size={12} /> PDF
                                                               </button>
                                                             </div>

                                                              <div className="flex items-center gap-1.5 w-full border border-blue-200 rounded-lg p-1 bg-blue-50/50 shadow-sm mt-1.5 mb-2">
                                                                <select
                                                                  value={targetLang[visualCv.id] || ""}
                                                                  onChange={(e) => { e.stopPropagation(); setTargetLang((prev) => ({ ...prev, [visualCv.id]: e.target.value })); }}
                                                                  onClick={(e) => e.stopPropagation()}
                                                                  className="text-[10px] uppercase font-bold bg-transparent outline-none text-blue-700 flex-1 px-1 cursor-pointer w-full min-w-[80px]"
                                                                >
                                                                  <option value="">Language</option>
                                                                  {translationLanguages.map(option => <option key={option.code} value={option.label}>{option.label}</option>)}
                                                                </select>
                                                                <button
                                                                  onClick={(e) => { e.stopPropagation(); handleTranslateCV(visualCv); }}
                                                                  disabled={translatingId === visualCv.id || !targetLang[visualCv.id]}
                                                                  className="flex items-center justify-center gap-1.5 p-1 px-2 text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-white border border-blue-200 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                                                                  title="Translate Current CV Version"
                                                                >
                                                                  {translatingId === visualCv.id ? <Loader2 size={12} className="animate-spin" /> : <Languages size={12} />}
                                                                  Translate
                                                                </button>
                                                              </div>
                                                             <h5 className="text-[11px] font-bold uppercase tracking-wider text-indigo-500 mb-1">
                                                               Adapt CV
                                                             </h5>
                                                             <button
                                                               onClick={(e) => { e.stopPropagation(); handleAdaptCV(adaptActionCv); }}
                                                               disabled={adaptingId === adaptActionCv.id || renderingId === adaptActionCv.id}
                                                               className="flex items-center justify-center gap-2 w-full px-4 py-2 border border-indigo-200 bg-indigo-50 text-indigo-800 rounded-lg hover:bg-indigo-100 transition-all shadow-sm focus:ring-2 focus:ring-indigo-500 font-semibold text-xs disabled:opacity-50 mb-1"
                                                             >
                                                               {adaptingId === adaptActionCv.id ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                                                               {adaptedCv ? "Re-Adapt CV" : "Adapt CV"}
                                                             </button>
                                                             <div className="grid grid-cols-2 gap-1.5 w-full">
                                                               <button
                                                                 onClick={(e) => { e.stopPropagation(); if (adaptedCv) handlePreview(adaptedCv); }}
                                                                 disabled={!adaptedCv}
                                                                 className="flex items-center gap-1.5 p-1.5 justify-center border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors shadow-sm text-[10px] font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50"
                                                                 title="View CV"
                                                               >
                                                                 <Eye size={12} /> View
                                                               </button>
                                                               <button
                                                                 onClick={(e) => { e.stopPropagation(); if (adaptedCv) setCvToRegenerate(adaptedCv); }}
                                                                 disabled={!adaptedCv}
                                                                 className="flex items-center gap-1.5 p-1.5 justify-center border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors shadow-sm text-[10px] font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50"
                                                                 title="Regenerate CV"
                                                               >
                                                                 <RefreshCw size={12} /> Regenerate
                                                               </button>
                                                               <button
                                                                 onClick={(e) => { e.stopPropagation(); if (adaptedCv) handleDownloadDocx(adaptedCv); }}
                                                                 disabled={!adaptedCv}
                                                                 className="flex items-center gap-1.5 p-1.5 justify-center border border-blue-200 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors shadow-sm text-[10px] font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200"
                                                               >
                                                                 <FileIcon size={12} /> Word
                                                               </button>
                                                               <button
                                                                 onClick={(e) => { e.stopPropagation(); if (adaptedCv) handleDownloadPdf(adaptedCv); }}
                                                                 disabled={!adaptedCv}
                                                                 className="flex items-center gap-1.5 p-1.5 justify-center border border-red-200 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors shadow-sm text-[10px] font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200"
                                                               >
                                                                 <Download size={12} /> PDF
                                                               </button>
                                                             </div>

                                                              <div className="flex items-center gap-1.5 w-full border border-blue-200 rounded-lg p-1 bg-blue-50/50 shadow-sm mt-1.5 mb-2">
                                                                <select
                                                                  value={adaptedCv ? targetLang[adaptedCv.id] || "" : ""}
                                                                  onChange={(e) => { e.stopPropagation(); if (adaptedCv) setTargetLang((prev) => ({ ...prev, [adaptedCv.id]: e.target.value })); }}
                                                                  onClick={(e) => e.stopPropagation()}
                                                                  disabled={!adaptedCv}
                                                                  className="text-[10px] uppercase font-bold bg-transparent outline-none text-blue-700 flex-1 px-1 cursor-pointer w-full min-w-[80px] disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                  <option value="">Language</option>
                                                                  {translationLanguages.map(option => <option key={option.code} value={option.label}>{option.label}</option>)}
                                                                </select>
                                                                <button
                                                                  onClick={(e) => { e.stopPropagation(); if (adaptedCv) handleTranslateCV(adaptedCv); }}
                                                                  disabled={!adaptedCv || translatingId === adaptedCv?.id || (adaptedCv ? !targetLang[adaptedCv.id] : true)}
                                                                  className="flex items-center justify-center gap-1.5 p-1 px-2 text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-white border border-blue-200 hover:bg-blue-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                                  title="Translate Current CV Version"
                                                                >
                                                                  {translatingId === adaptedCv?.id ? <Loader2 size={12} className="animate-spin" /> : <Languages size={12} />}
                                                                  Translate
                                                                </button>
                                                              </div>

                                                             <div className="h-px bg-slate-100 my-1"></div>

                                                             <h5 className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 mb-1">
                                                               Render CV
                                                             </h5>
                                                             <button
                                                               onClick={(e) => { e.stopPropagation(); handleRenderCV(renderActionCv); }}
                                                               disabled={renderingId === renderActionCv.id || adaptingId === renderActionCv.id}
                                                               className="flex items-center justify-center gap-2 w-full px-4 py-2 border border-emerald-200 bg-emerald-50 text-emerald-800 rounded-lg hover:bg-emerald-100 transition-all shadow-sm focus:ring-2 focus:ring-emerald-500 font-semibold text-xs disabled:opacity-50 disabled:cursor-not-allowed mb-1"
                                                             >
                                                               {renderingId === renderActionCv.id ? <Loader2 size={16} className="animate-spin" /> : <BrainCircuit size={16} />}
                                                               {renderedCv ? "Re-Render CV" : "Render CV"}
                                                             </button>
                                                             <div className="grid grid-cols-2 gap-1.5 w-full">
                                                               <button
                                                                 onClick={(e) => { e.stopPropagation(); if (renderedCv) handlePreview(renderedCv); }}
                                                                 disabled={!renderedCv}
                                                                 className="flex items-center gap-1.5 p-1.5 justify-center border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors shadow-sm text-[10px] font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50"
                                                               >
                                                                 <Eye size={12} /> View
                                                               </button>
                                                               <button
                                                                 onClick={(e) => { e.stopPropagation(); if (renderedCv) setCvToRegenerate(renderedCv); }}
                                                                 disabled={!renderedCv}
                                                                 className="flex items-center gap-1.5 p-1.5 justify-center border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors shadow-sm text-[10px] font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50"
                                                                 title="Regenerate CV"
                                                               >
                                                                 <RefreshCw size={12} /> Regenerate
                                                               </button>
                                                               <button
                                                                 onClick={(e) => { e.stopPropagation(); if (renderedCv) handleDownloadDocx(renderedCv); }}
                                                                 disabled={!renderedCv}
                                                                 className="flex items-center gap-1.5 p-1.5 justify-center border border-blue-200 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors shadow-sm text-[10px] font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200"
                                                               >
                                                                 <FileIcon size={12} /> Word
                                                               </button>
                                                               <button
                                                                 onClick={(e) => { e.stopPropagation(); if (renderedCv) handleDownloadPdf(renderedCv); }}
                                                                 disabled={!renderedCv}
                                                                 className="flex items-center gap-1.5 p-1.5 justify-center border border-red-200 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors shadow-sm text-[10px] font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200"
                                                               >
                                                                 <Download size={12} /> PDF
                                                                </button>
                                                               </div>

                                                              <div className="flex items-center gap-1.5 w-full border border-blue-200 rounded-lg p-1 bg-blue-50/50 shadow-sm mt-1.5 mb-2">
                                                                <select
                                                                  value={renderedCv ? targetLang[renderedCv.id] || "" : ""}
                                                                  onChange={(e) => { e.stopPropagation(); if (renderedCv) setTargetLang((prev) => ({ ...prev, [renderedCv.id]: e.target.value })); }}
                                                                  onClick={(e) => e.stopPropagation()}
                                                                  disabled={!renderedCv}
                                                                  className="text-[10px] uppercase font-bold bg-transparent outline-none text-blue-700 flex-1 px-1 cursor-pointer w-full min-w-[80px] disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                  <option value="">Language</option>
                                                                  {translationLanguages.map(option => <option key={option.code} value={option.label}>{option.label}</option>)}
                                                                </select>
                                                                <button
                                                                  onClick={(e) => { e.stopPropagation(); if (renderedCv) handleTranslateCV(renderedCv); }}
                                                                  disabled={!renderedCv || translatingId === renderedCv?.id || (renderedCv ? !targetLang[renderedCv.id] : true)}
                                                                  className="flex items-center justify-center gap-1.5 p-1 px-2 text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-white border border-blue-200 hover:bg-blue-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                                  title="Translate Current CV Version"
                                                                >
                                                                  {translatingId === renderedCv?.id ? <Loader2 size={12} className="animate-spin" /> : <Languages size={12} />}
                                                                  Translate
                                                                </button>
                                                              </div>
                                                              
                                                            </div>
                                        );
                                      })()}
                                   </div>
                                </div>
                            </div>
                         </div>
                      </motion.div>

                    </td>
                  </tr>
                )}
              </AnimatePresence>
            </Fragment>
          );
        })}
      </tbody>
    </table>
  </div>
</div>

                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              );
                            },
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            },
          )}

          {matches.length === 0 && (
            <div className="py-24 flex flex-col items-center justify-center space-y-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400">
                <History size={24} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-1">
                  No Matches Found
                </h3>
                <p className="text-sm text-slate-500 max-w-sm mx-auto">
                  Run the Match Engine from a tender to see results here.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      <ConfirmModal
        isOpen={!!confirmDeleteId}
        title="Delete Match"
        message="Are you sure you want to remove this match? This cannot be undone."
        confirmText="Delete"
        isDestructive={true}
        onConfirm={() => {
          if (confirmDeleteId) handleDeleteMatch(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <AnimatePresence>
        {brandingTender && (
          <BrandingModal
            tender={brandingTender}
            onClose={() => setBrandingTender(null)}
            onSave={fetchTenders}
          />
        )}

        {feedbackModalMatch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-900">
                  Provide Feedback
                </h2>
                <button
                  onClick={() => setFeedbackModalMatch(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6">
                <p className="text-sm text-slate-600 mb-4">
                  Why is <strong>{feedbackModalMatch.expertName}</strong> a poor
                  match for <strong>{feedbackModalMatch.positionTitle}</strong>?
                  Your feedback improves the matching engine.
                </p>
                <textarea
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none h-32"
                  placeholder="e.g., Lacks relevant bridge design experience, nationality requirement not met..."
                  onChange={async (e) => {
                    const val = e.target.value;
                    await api.updateMatch(feedbackModalMatch.id, {
                      feedback_reason: val,
                    });
                    setFeedback((prev) => ({
                      ...prev,
                      [feedbackModalMatch.id]: { type: "down", reason: val },
                    }));
                  }}
                ></textarea>
              </div>
              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                <button
                  onClick={() => setFeedbackModalMatch(null)}
                  className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
                >
                  Submit & Hide
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Regenerate CV Modal */}
      {cvToRegenerate && (
        <RegenerateCVModal
          cv={cvToRegenerate}
          onClose={() => setCvToRegenerate(null)}
          onRegenerate={confirmRegenerate}
        />
      )}

      {/* Document Preview Modal */}
      <AnimatePresence>
        {previewCv && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              onClick={closePreview}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl h-[85vh] bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="text-blue-400" size={20} />
                  <span className="text-sm font-bold text-white">
                    CV_{previewCv.expertName?.split(" ").join("_")}
                  </span>
                  {bulkPreviewQueue.length > 1 && (
                    <div className="ml-2 flex items-center gap-1 rounded-lg bg-slate-800 p-1">
                      <button
                        onClick={() => void showBulkPreviewAt(bulkPreviewIndex - 1)}
                        disabled={bulkPreviewIndex === 0}
                        className="rounded p-1 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-30"
                        title="Previous selected CV"
                      >
                        <ArrowLeft size={14} />
                      </button>
                      <span className="min-w-14 text-center text-[11px] font-semibold text-slate-300">
                        {bulkPreviewIndex + 1} / {bulkPreviewQueue.length}
                      </span>
                      <button
                        onClick={() => void showBulkPreviewAt(bulkPreviewIndex + 1)}
                        disabled={bulkPreviewIndex >= bulkPreviewQueue.length - 1}
                        className="rounded p-1 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-30"
                        title="Next selected CV"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (!isEditingRichText) {
                        setRichTextContent(
                          previewCv.customRichText ||
                            generateCVHtml(
                              previewCv.expertData,
                              previewCv.positionTitle || previewCv.positionId,
                            ),
                        );
                      }
                      setIsEditingRichText(!isEditingRichText);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-bold text-white transition-colors"
                  >
                    <span>
                      {isEditingRichText ? "Cancel Edit" : "Edit (Rich Text)"}
                    </span>
                  </button>
                  {isEditingRichText && (
                    <button
                      onClick={saveRichText}
                      className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-xs font-bold text-white transition-colors"
                    >
                      <CheckCircle2 size={14} />
                      <span>Save Changes</span>
                    </button>
                  )}

                  {!isEditingRichText && (
                    <>
                      <button
                        onClick={() => setShowCertModal(true)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded-lg text-xs font-bold text-white transition-colors"
                      >
                        <FileText size={14} />
                        <span>Certification Settings</span>
                      </button>
                      <button
                        onClick={() => handleDownloadDocx(previewCv)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-bold text-white transition-colors"
                      >
                        <FileText size={14} />
                        <span>Export to Google Docs / Word</span>
                      </button>
                      <button
                        onClick={() => handleDownloadPdf(previewCv)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg text-xs font-bold text-white transition-colors"
                      >
                        <Download size={14} />
                        <span>Download PDF</span>
                      </button>
                    </>
                  )}
                  <button
                    onClick={closePreview}
                    className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* A4 Document Content Simulation / PDF Viewer */}
              {isEditingRichText ? (
                <div className="flex-1 w-full bg-slate-50 flex flex-col relative overflow-y-hidden">
                  <div className="p-4 bg-white border-b border-slate-200 text-slate-600 text-sm flex items-center justify-between shadow-sm z-10">
                    <p>
                      Edit the content directly. Formatting will be preserved on
                      download or export.
                    </p>
                  </div>
                  <div className="flex-1 overflow-auto bg-slate-100 p-8 custom-scrollbar">
                    <div className="max-w-[800px] mx-auto bg-white min-h-[1000px] shadow-lg">
                      <ReactQuill
                        theme="snow"
                        value={richTextContent}
                        onChange={setRichTextContent}
                        className="h-full border-none [&_.ql-toolbar]:border-x-0 [&_.ql-toolbar]:border-t-0 [&_.ql-container]:border-none [&_.ql-editor]:min-h-[800px] [&_.ql-editor]:p-12 text-black"
                        modules={{
                          toolbar: [
                            [{ header: [1, 2, 3, false] }],
                            ["bold", "italic", "underline", "strike"],
                            [{ list: "ordered" }, { list: "bullet" }],
                            ["clean"],
                          ],
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto bg-slate-100 flex justify-center custom-scrollbar py-8">
                  {previewCv.customRichText ? (
                    <div className="max-w-[800px] w-full bg-white shadow-lg p-12 min-h-[1000px] text-black">
                      <div
                        className="ql-editor"
                        dangerouslySetInnerHTML={{
                          __html: previewCv.customRichText,
                        }}
                      />
                    </div>
                  ) : previewUrl ? (
                    <Document
                      file={previewUrl}
                      onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                      loading={
                        <div className="flex flex-col items-center justify-center gap-3 mt-20">
                          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                          <p className="text-slate-500 font-medium">
                            Loading PDF...
                          </p>
                        </div>
                      }
                      className="flex flex-col items-center gap-6"
                    >
                      {Array.from(new Array(numPages || 0), (el, index) => (
                        <div
                          key={`page_${index + 1}`}
                          className="shadow-[0_0_50px_-12px_rgba(0,0,0,0.1)] mb-4"
                        >
                          <Page
                            pageNumber={index + 1}
                            width={750}
                            className="bg-white"
                            renderTextLayer={true}
                            renderAnnotationLayer={true}
                          />
                        </div>
                      ))}
                    </Document>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-4 text-slate-400 h-full">
                      <Printer className="w-12 h-12 opacity-20" />
                      <p>Generating preview...</p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {showCertModal && previewCv && (
        <CertificationModal
          isOpen={true}
          settings={previewCv.certification}
          expertName={previewCv.expertData?.fullName || previewCv.expertData?.name || previewCv.expertName || "Expert"}
          onClose={() => setShowCertModal(false)}
          onSave={async (newSettings) => {
            const updatedCv = { ...previewCv, certification: newSettings };
            setPreviewCv(updatedCv);
            
            // Re-render if in html mode
            if (isEditingRichText) {
              setRichTextContent(
                generateCVHtml(
                  updatedCv.expertData,
                  updatedCv.positionTitle || updatedCv.positionId,
                  updatedCv.certification
                ),
              );
            }
            
            setShowCertModal(false);
            
            if (updatedCv.id && !updatedCv.id.startsWith('phantom-')) {
               await api.updateCV(updatedCv);
               api.getCVs().then(setCvs);
            }
          }}
        />
      )}
    </div>
  );
}
