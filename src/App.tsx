import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  FileText, 
  Download, 
  Award, 
  AlertCircle, 
  Trash2, 
  Check,
  CheckCircle, 
  RefreshCw, 
  ZoomIn, 
  ZoomOut, 
  Save, 
  BookOpen, 
  ChevronLeft, 
  ChevronRight,
  User,
  Shield,
  History,
  Moon,
  Sun,
  CheckCircle2,
  ClipboardPaste,
  Sliders,
  Scale,
  Sparkles,
  Layers,
  RotateCcw,
  RotateCw,
  AlertTriangle,
  Info,
  Zap,
  ChevronDown,
  ChevronUp,
  Cpu,
  Coins,
  X,
  BookmarkPlus, Brain, Database,
  PieChart,
  Settings,
  Type,
  Bold,
  Italic,
  Underline,
  Pin,
  Undo2,
  Redo2,
  Maximize2,
  Minimize2,
  Columns,
  Move,
  GripVertical,
  Cloud,
  LogOut,
  LogIn
} from 'lucide-react';
import localforage from 'localforage';
import { motion, AnimatePresence } from 'motion/react';
import { BatchEvaluationView, BatchItem } from './components/BatchEvaluationView';
import { SystemPromptEditorModal } from './components/SystemPromptEditorModal';
import { LearningDatabaseModal, LearningLog } from './components/LearningDatabaseModal';
import { ModelTokenAuditModal, ModelExecutionAttempt } from './components/ModelTokenAuditModal';
import { CloudSyncModal } from './components/CloudSyncModal';
import { OwnerAdminModal } from './components/OwnerAdminModal';
import { EdTechLoginScreen } from './components/EdTechLoginScreen';
import { HindiSpellCheckInput } from './components/HindiSpellCheckInput';
import BodyPartsBreakdown, { type RubricPart } from './components/BodyPartsBreakdown';
import { SmartLoadingState } from './components/SmartLoadingState';
import { AppHeader } from './components/AppHeader';
import { EvaluationSetupStudio } from './components/EvaluationSetupStudio';
import { MarksDistributionModal } from './components/MarksDistributionModal';
import { ModelSettingsModal } from './components/ModelSettingsModal';
import { HistoryModal } from './components/HistoryModal';
import { QuotaUpgradeModal } from './components/QuotaUpgradeModal';
import { StudentProgressCardModal } from './components/StudentProgressCardModal';
import { OfflineIndicator } from './components/PWAInstallButton';
import { ModelAnswerDrawer, EditMetadataModal } from './components/EvaluationMetadataModals';
import { generateTextAnswerPages } from './utils/canvasPageGenerator';
import {
  type Annotation,
  type WordCountBreakdown,
  type WordCountAnalysis,
  type LegibilityIssue,
  type PageEvaluation,
  type MainBodyPart,
  type RubricCriterionScore,
  type RubricBreakdown,
  type TokenUsage,
  type EvaluationResult,
  type UploadedPage,
  type HistoryEntry,
  type RubricCriterionItem,
  DEFAULT_FREQUENT_COMMENTS,
  RUBRIC_CRITERIA_CONFIG
} from './types/evaluation';
import {
  getMarksDistribution,
  formatQuarterMark,
  cleanCandidateName,
  generateWhatsAppReportText,
  exportEvaluationPagesToPDF
} from './utils/scorecardExport';
import { MASTER_8_BLOCK_PROMPT } from './defaultPrompt';
import { UPSC_PROMPT_PRESETS } from './promptPresets';
import {
  ALL_GEMINI_MODELS,
  AIModelOption,
  DEFAULT_MODELS_CASCADE,
  getModelInfo,
  getThinkingLevelInfo,
  isValidThinkingLevel,
  type EvaluationThinkingLevel,
} from './modelConfig';
import {
  sanitizeAnnotationText,
  deduplicateAndDiversifyPageAnnotations,
  computeDynamicAnnotationPlacement
} from './utils/annotationSanitizer';
import {
  auth,
  onAuthStateChanged,
  signInWithGoogle,
  signOutUser,
  saveUserCloudConfig,
  loadUserCloudConfig,
  saveEvaluationToCloud,
  loadEvaluationsFromCloud,
  loadAllStudentEvaluationsForAdmin,
  saveLearningLogToCloud,
  deleteLearningLogFromCloud,
  loadLearningLogsFromCloud,
  isSuperAdminUser,
  loadPlatformPolicy,
  getLocalPlatformPolicy,
  getMaxAllowedPagesForMarks,
  ensureStudentProfile,
  incrementStudentUsage,
  DEFAULT_PLATFORM_POLICY,
  PlatformPolicyConfig,
  StudentProfileData,
  User as FirebaseUser
} from './firebase';

export {
  type WordCountBreakdown,
  type WordCountAnalysis,
  type MainBodyPart,
  type RubricCriterionScore,
  type RubricBreakdown,
  type TokenUsage,
  type RubricCriterionItem,
  DEFAULT_FREQUENT_COMMENTS,
  RUBRIC_CRITERIA_CONFIG
};

export default function App() {
  const [maxMarks, setMaxMarks] = useState<number>(() => {
    const saved = localStorage.getItem('upsc_saved_max_marks');
    return saved ? parseFloat(saved) : 10;
  });
  const [studentName, setStudentName] = useState<string>('');
  const [subject, setSubject] = useState<string>('सामान्य अध्ययन');
  const [questionText, setQuestionText] = useState<string>('');
  const [originalFileName, setOriginalFileName] = useState<string>('');
  
  const [uploadedPages, setUploadedPages] = useState<UploadedPage[]>([]);
  const [frequentComments, setFrequentComments] = useState<string[]>([]);
  const [isProcessingPdf, setIsProcessingPdf] = useState<boolean>(false);
  const [pdfProcessingProgress, setPdfProcessingProgress] = useState<number>(0);
  
  const [evaluationState, setEvaluationState] = useState<'idle' | 'evaluating' | 'completed'>('idle');
  const [evalResult, setEvalResult] = useState<EvaluationResult | null>(null);
  const [selectedPageNum, setSelectedPageNum] = useState<number>(1);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [selectedModels, setSelectedModels] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('upsc_selected_models');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.includes('gemini-4-hydrogen')) {
          const validIds = ALL_GEMINI_MODELS.map(m => m.id);
          const filtered = parsed.filter((id: string) => validIds.includes(id));
          if (filtered.length > 0) return filtered;
        }
      }
      localStorage.setItem('upsc_selected_models', JSON.stringify(DEFAULT_MODELS_CASCADE));
      return DEFAULT_MODELS_CASCADE;
    } catch {
      return DEFAULT_MODELS_CASCADE;
    }
  });
  const [modelCategoryFilter, setModelCategoryFilter] = useState<'all' | 'flash' | 'pro'>('all');
  const [modelPingResults, setModelPingResults] = useState<Record<string, { loading: boolean; latencyMs?: number; success?: boolean; error?: string }>>({});
  const [evaluationStrictness, setEvaluationStrictness] = useState<'liberal' | 'standard' | 'strict'>(() => {
    return (localStorage.getItem('upsc_model_strictness') as any) || 'standard';
  });
  const [feedbackDetailLevel, setFeedbackDetailLevel] = useState<'standard' | 'comprehensive' | 'actionable'>(() => {
    return (localStorage.getItem('upsc_model_feedback_detail') as any) || 'comprehensive';
  });
  const [valueAdditionFocus, setValueAdditionFocus] = useState<boolean>(() => {
    const saved = localStorage.getItem('upsc_model_value_addition');
    return saved !== null ? saved === 'true' : true;
  });
  const [ocrSensitivity, setOcrSensitivity] = useState<'standard' | 'high_precision'>(() => {
    return (localStorage.getItem('upsc_model_ocr_sensitivity') as any) || 'high_precision';
  });
  const [modelTemperature, setModelTemperature] = useState<number>(() => {
    const saved = localStorage.getItem('upsc_model_temperature');
    return saved ? parseFloat(saved) : 0.1;
  });
  const [feedbackLanguage, setFeedbackLanguage] = useState<'bilingual' | 'pure_hindi' | 'english'>(() => {
    return (localStorage.getItem('upsc_model_feedback_lang') as any) || 'pure_hindi';
  });
  const [pingTestStatus, setPingTestStatus] = useState<{ loading: boolean; result?: { latencyMs: number; model: string; success: boolean; error?: string } }>({ loading: false });

  const [isPerfTrackingEnabled, setIsPerfTrackingEnabled] = useState<boolean>(false);
  const [perfLogs, setPerfLogs] = useState<{ id: string; model: string; latencyMs: number; mode: string; timestamp: Date }[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | number | null>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current as any);
      toastTimeoutRef.current = null;
    }
    setSuccessMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setSuccessMessage(null);
      toastTimeoutRef.current = null;
    }, 4500);
  };

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current as any);
      }
    };
  }, []);
  const [modelAnswer, setModelAnswer] = useState<string>(() => {
    return localStorage.getItem('upsc_saved_model_answer') || '';
  });
  const [rubricRules, setRubricRules] = useState<string>(() => {
    const saved = localStorage.getItem('upsc_saved_rubric_rules') || '';
    if (saved.includes('1. भूमिका संक्षिप्त और सटीक हो।')) {
      localStorage.removeItem('upsc_saved_rubric_rules');
      return '';
    }
    return saved;
  });
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [learningLogs, setLearningLogs] = useState<LearningLog[]>(() => {
    try {
      const saved = localStorage.getItem('upsc_learning_logs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showLearningDatabase, setShowLearningDatabase] = useState<boolean>(false);
  const [originalEvalResult, setOriginalEvalResult] = useState<EvaluationResult | null>(null);

  // --- FIREBASE CLOUD DATABASE & MULTI-DEVICE SYNC STATE ---
  const [cloudUser, setCloudUser] = useState<FirebaseUser | null>(null);
  const [showCloudSyncModal, setShowCloudSyncModal] = useState<boolean>(false);
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(false);
  const [lastCloudSyncedAt, setLastCloudSyncedAt] = useState<string | null>(null);
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);

  // --- EDTECH ROLE-BASED ACCESS (OWNER SUPER ADMIN vs STUDENT PORTAL) ---
  const [platformPolicy, setPlatformPolicy] = useState<PlatformPolicyConfig>(() => getLocalPlatformPolicy());
  const [studentProfile, setStudentProfile] = useState<StudentProfileData | null>(null);
  const [showOwnerAdminModal, setShowOwnerAdminModal] = useState<boolean>(false);
  const [showQuotaUpgradeModal, setShowQuotaUpgradeModal] = useState<boolean>(false);
  const [showProgressCardModal, setShowProgressCardModal] = useState<boolean>(false);
  const [isStudentPreviewMode, setIsStudentPreviewMode] = useState<boolean>(false);
  const [showEdTechLoginScreen, setShowEdTechLoginScreen] = useState<boolean>(true);
  const [inspectedStudentRecord, setInspectedStudentRecord] = useState<{
    student: StudentProfileData;
    copyId: string;
    timestamp: string;
  } | null>(null);

  // Strictly determine whether current user is the Owner/Super Admin or in Student View
  const isOwnerAccount =
    isSuperAdminUser(cloudUser) ||
    studentProfile?.role === 'owner';
  const isEvaluatorAccount = studentProfile?.role === 'evaluator';
  const isEffectiveStudentView = isStudentPreviewMode || (!isOwnerAccount && !isEvaluatorAccount);
  const maxAllowedPagesForCurrentMarks = getMaxAllowedPagesForMarks(maxMarks, platformPolicy);
  
  // --- UNDO / REDO STATE MANAGEMENT FOR EVALUATION & MARGIN ANNOTATIONS ---
  const [undoStack, setUndoStack] = useState<EvaluationResult[]>([]);
  const [redoStack, setRedoStack] = useState<EvaluationResult[]>([]);
  const dragInitialSnapshotRef = useRef<EvaluationResult | null>(null);
  const dragMovedRef = useRef<boolean>(false);
  const lastSnapshotTimeRef = useRef<number>(0);

  const pushUndoSnapshot = () => {
    if (!evalResult) return;
    const snapshot = JSON.parse(JSON.stringify(evalResult));
    setUndoStack(prev => [...prev.slice(-29), snapshot]);
    setRedoStack([]); // Clear redo stack on any new mutation
  };

  const pushDebouncedUndoSnapshot = () => {
    const now = Date.now();
    if (now - lastSnapshotTimeRef.current > 800) {
      pushUndoSnapshot();
      lastSnapshotTimeRef.current = now;
    }
  };

  // --- DUAL-PAGE SPLIT VIEW & ZEN/FULLSCREEN FOCUS MODE ---
  const [isDualPageView, setIsDualPageView] = useState<boolean>(false);
  const [secondaryPageNum, setSecondaryPageNum] = useState<number>(2);
  const [isZenMode, setIsZenMode] = useState<boolean>(false);
  const [zenShowCommentsPanel, setZenShowCommentsPanel] = useState<boolean>(true);
  const [dualPageActiveCommentTab, setDualPageActiveCommentTab] = useState<'primary' | 'secondary' | 'both'>('primary');
  const secondaryCanvasContainerRef = useRef<HTMLDivElement>(null);

  const handleUndo = () => {
    if (undoStack.length === 0 || !evalResult) return;
    const previousState = undoStack[undoStack.length - 1];
    const newUndoStack = undoStack.slice(0, undoStack.length - 1);
    const currentState = JSON.parse(JSON.stringify(evalResult));

    setRedoStack(prev => [...prev.slice(-29), currentState]);
    setUndoStack(newUndoStack);
    setEvalResult(previousState);
    showToast("पूर्ववत किया गया (Undo)");
  };

  const handleRedo = () => {
    if (redoStack.length === 0 || !evalResult) return;
    const nextState = redoStack[redoStack.length - 1];
    const newRedoStack = redoStack.slice(0, redoStack.length - 1);
    const currentState = JSON.parse(JSON.stringify(evalResult));

    setUndoStack(prev => [...prev.slice(-29), currentState]);
    setRedoStack(newRedoStack);
    setEvalResult(nextState);
    showToast("पुनः किया गया (Redo)");
  };

  // Keyboard shortcuts: Ctrl+Z (Undo), Ctrl+Y or Ctrl+Shift+Z (Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is actively typing in input, textarea, or contentEditable
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'Escape') {
        setIsZenMode(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoStack, redoStack, evalResult, isZenMode]);
  const [downloadingHistoryId, setDownloadingHistoryId] = useState<string | null>(null);
  const [showTextAnswerInput, setShowTextAnswerInput] = useState<boolean>(false);
  const [textAnswerInput, setTextAnswerInput] = useState<string>('');
  const [showSystemPromptSettings, setShowSystemPromptSettings] = useState<boolean>(false);
  const [showModelSettings, setShowModelSettings] = useState<boolean>(false);
  const [showModelAuditModal, setShowModelAuditModal] = useState<boolean>(false);
  const [auditEntryToInspect, setAuditEntryToInspect] = useState<EvaluationResult | null>(null);
  const [showDetailedModelTokens, setShowDetailedModelTokens] = useState<boolean>(() => {
    const saved = localStorage.getItem('upsc_show_detailed_model_tokens');
    return saved !== null ? saved === 'true' : true;
  });
  const [showFallbackAlertBanner, setShowFallbackAlertBanner] = useState<boolean>(() => {
    const saved = localStorage.getItem('upsc_show_fallback_alert');
    return saved !== null ? saved === 'true' : true;
  });
  const [annotationFont, setAnnotationFont] = useState<'kalam' | 'mukta'>(() => {
    const saved = localStorage.getItem('upsc_annotation_font');
    return saved === 'mukta' ? 'mukta' : 'kalam';
  });
  const [defaultAnnotationFontScale, setDefaultAnnotationFontScale] = useState<number>(() => {
    const saved = localStorage.getItem('upsc_default_annotation_font_scale');
    const parsed = saved ? parseFloat(saved) : 1.0;
    return Number.isFinite(parsed) && parsed >= 0.65 && parsed <= 2.0 ? parsed : 1.0;
  });
  const [defaultAnnotationFormat, setDefaultAnnotationFormat] = useState<{
    is_bold: boolean;
    is_italic: boolean;
    is_underline: boolean;
  }>(() => {
    try {
      const saved = localStorage.getItem('upsc_default_annotation_format');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          is_bold: parsed.is_bold !== undefined ? Boolean(parsed.is_bold) : true,
          is_italic: Boolean(parsed.is_italic),
          is_underline: Boolean(parsed.is_underline)
        };
      }
    } catch {}
    return { is_bold: true, is_italic: false, is_underline: false };
  });
  const [customAnnotationFormat, setCustomAnnotationFormat] = useState<{
    is_bold: boolean;
    is_italic: boolean;
    is_underline: boolean;
  }>(() => {
    try {
      const saved = localStorage.getItem('upsc_default_annotation_format');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          is_bold: parsed.is_bold !== undefined ? Boolean(parsed.is_bold) : true,
          is_italic: Boolean(parsed.is_italic),
          is_underline: Boolean(parsed.is_underline)
        };
      }
    } catch {}
    return { is_bold: true, is_italic: false, is_underline: false };
  });
  const [customAnnotationScale, setCustomAnnotationScale] = useState<number>(() => {
    const saved = localStorage.getItem('upsc_default_annotation_font_scale');
    const parsed = saved ? parseFloat(saved) : 1.0;
    return Number.isFinite(parsed) && parsed >= 0.65 && parsed <= 2.0 ? parsed : 1.0;
  });
  const [openFormatDropdownId, setOpenFormatDropdownId] = useState<string | null>(null);
  const [evaluationMaxTokens, setEvaluationMaxTokens] = useState<number>(() => {
    const saved = localStorage.getItem('upsc_evaluation_max_tokens');
    const num = saved ? Number(saved) : 8192;
    return (num >= 2000 && num <= 8192) ? num : 8192;
  });
  const [evaluationThinkingLevel, setEvaluationThinkingLevel] = useState<EvaluationThinkingLevel>(() => {
    const saved = localStorage.getItem('upsc_evaluation_thinking_level');
    return isValidThinkingLevel(saved) ? saved : 'auto';
  });

  const [activeCopyRecord, setActiveCopyRecord] = useState<{
    id: string;
    ownerUid: string;
    timestamp: string;
    studentEmail?: string;
  } | null>(null);

  const handleSelectAnnotationFont = (font: 'kalam' | 'mukta') => {
    setAnnotationFont(font);
    localStorage.setItem('upsc_annotation_font', font);
    setEvalResult((prev) => (prev ? { ...prev, annotation_font: font } : prev));
    showToast(font === 'kalam' ? '✓ फॉन्ट विकल्प १ सक्रिय: Kalam (हस्तलिखित पेन)' : '✓ फॉन्ट विकल्प २ सक्रिय: Mukta (अल्ट्रा-क्लियर कॉम्पैक्ट)');
  };
  const [promptSlots, setPromptSlots] = useState<{id: number, name: string, content: string}[]>([
    { id: 1, name: 'Slot 1 (मुख्य सार्वभौमिक प्रॉम्प्ट V2.4)', content: MASTER_8_BLOCK_PROMPT },
    { id: 2, name: 'Slot 2 (खाली स्लॉट 2)', content: '' },
    { id: 3, name: 'Slot 3 (खाली स्लॉट 3)', content: '' },
    { id: 4, name: 'Slot 4 (खाली स्लॉट 4)', content: '' },
    { id: 5, name: 'Slot 5 (खाली स्लॉट 5)', content: '' },
  ]);
  const [activeSlotId, setActiveSlotId] = useState<number>(1);
  const [editingSlotId, setEditingSlotId] = useState<number | null>(null);
  const [editingSlotName, setEditingSlotName] = useState<string>('');
  const [isSavingSystemPrompt, setIsSavingSystemPrompt] = useState<boolean>(false);
  const [showModelAnswerDrawer, setShowModelAnswerDrawer] = useState<boolean>(false);
  const [showEditMetadataDrawer, setShowEditMetadataDrawer] = useState<boolean>(false);
  const [showMarksDistributionModal, setShowMarksDistributionModal] = useState<boolean>(false);
  const [isMarksBreakdownExpanded, setIsMarksBreakdownExpanded] = useState<boolean>(true);

  // --- INTERACTIVE RUBRIC DASHBOARD STATE ---
  const [rubricWeights, setRubricWeights] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('upsc_rubric_weights');
    return saved ? JSON.parse(saved) : {
      introduction: 15,
      main_body: 65,
      conclusion: 20
    };
  });

  const [rubricEnabled, setRubricEnabled] = useState<Record<string, boolean>>({
    introduction: true,
    main_body: true,
    conclusion: true
  });

  const [rubricScores, setRubricScores] = useState<Record<string, any>>({
    content_demand: { score: 6.0, feedback: 'मुख्य मांग का अच्छा विश्लेषण' },
    structure_flow: { score: 6.5, feedback: 'भूमिका और मुख्य भाग सुव्यवस्थित हैं' },
    facts_evidence: { score: 5.5, feedback: 'महत्वपूर्ण उदाहरण और रिपोर्ट्स की आवश्यकता' },
    presentation_diagrams: { score: 6.0, feedback: 'बुलेट बिंदुओं का अच्छा उपयोग' },
    language_discipline: { score: 7.0, feedback: 'भाषा प्रवाह एवं शब्द सीमा उत्तम' }
  });

  const [rubricPenalties, setRubricPenalties] = useState<{
    word_limit: boolean;
    irrelevant_content: boolean;
    poor_handwriting: boolean;
    missing_conclusion: boolean;
  }>({
    word_limit: false,
    irrelevant_content: false,
    poor_handwriting: false,
    missing_conclusion: false
  });

  const [baseAiMarks, setBaseAiMarks] = useState<number | null>(null);

  useEffect(() => {
    if (isDualPageView && uploadedPages.length > 1) {
      if (secondaryPageNum === selectedPageNum) {
        const next = selectedPageNum + 1 <= uploadedPages.length ? selectedPageNum + 1 : (selectedPageNum > 1 ? selectedPageNum - 1 : 1);
        setSecondaryPageNum(next);
      }
    }
  }, [selectedPageNum, isDualPageView, uploadedPages.length, secondaryPageNum]);

  // --- 30-SECOND AUTOSAVE MECHANISM (using localForage to prevent data loss) ---
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<number | null>(null);
  const [isAutoSaving, setIsAutoSaving] = useState<boolean>(false);
  const [pendingRestoreSession, setPendingRestoreSession] = useState<any | null>(null);

  const autoSaveStateRef = useRef({
    evalResult,
    originalEvalResult,
    uploadedPages,
    studentName,
    subject,
    questionText,
    originalFileName,
    modelAnswer,
    maxMarks,
    selectedPageNum,
    evaluationState,
    rubricWeights,
    rubricScores,
    rubricPenalties
  });

  useEffect(() => {
    autoSaveStateRef.current = {
      evalResult,
      originalEvalResult,
      uploadedPages,
      studentName,
      subject,
      questionText,
      originalFileName,
      modelAnswer,
      maxMarks,
      selectedPageNum,
      evaluationState,
      rubricWeights,
      rubricScores,
      rubricPenalties
    };
  }, [
    evalResult,
    originalEvalResult,
    uploadedPages,
    studentName,
    subject,
    questionText,
    originalFileName,
    modelAnswer,
    maxMarks,
    selectedPageNum,
    evaluationState,
    rubricWeights,
    rubricScores,
    rubricPenalties
  ]);

  const performAutoSave = async (showUserToast = false) => {
    const state = autoSaveStateRef.current;
    // Only auto-save if an evaluation result exists or pages are uploaded
    if (!state.evalResult && (!state.uploadedPages || state.uploadedPages.length === 0)) {
      return;
    }

    try {
      setIsAutoSaving(true);
      const snapshot = {
        evalResult: state.evalResult,
        originalEvalResult: state.originalEvalResult,
        uploadedPages: state.uploadedPages,
        studentName: state.studentName,
        subject: state.subject,
        questionText: state.questionText,
        originalFileName: state.originalFileName,
        modelAnswer: state.modelAnswer,
        maxMarks: state.maxMarks,
        selectedPageNum: state.selectedPageNum,
        evaluationState: state.evaluationState,
        rubricWeights: state.rubricWeights,
        rubricScores: state.rubricScores,
        rubricPenalties: state.rubricPenalties,
        timestamp: Date.now()
      };

      await localforage.setItem('upsc_mains_autosave_session', snapshot);
      setLastAutoSaveTime(Date.now());
      if (showUserToast) {
        showToast('✓ मूल्यांकन स्थिति localForage में स्वतः-सुरक्षित (Auto-Saved)!');
      }
    } catch (err) {
      console.warn('Auto-save to localForage failed:', err);
    } finally {
      setIsAutoSaving(false);
    }
  };

  // 30-second recurring timer for auto-save
  useEffect(() => {
    const autoSaveTimer = setInterval(() => {
      performAutoSave(false);
    }, 30000); // exactly 30 seconds

    return () => clearInterval(autoSaveTimer);
  }, []);

  // Check for auto-saved draft on mount
  useEffect(() => {
    localforage.getItem('upsc_mains_autosave_session').then((savedSession: any) => {
      if (savedSession && (savedSession.evalResult || (savedSession.uploadedPages && savedSession.uploadedPages.length > 0))) {
        setPendingRestoreSession(savedSession);
      }
    }).catch(err => {
      console.warn('Failed to load auto-save session:', err);
    });
  }, []);

  const handleRestoreAutoSave = () => {
    if (!pendingRestoreSession) return;
    const s = pendingRestoreSession;
    if (s.evalResult) setEvalResult(s.evalResult);
    if (s.originalEvalResult) setOriginalEvalResult(s.originalEvalResult);
    if (s.uploadedPages && Array.isArray(s.uploadedPages)) setUploadedPages(s.uploadedPages);
    if (s.studentName !== undefined) setStudentName(s.studentName);
    if (s.subject !== undefined) setSubject(s.subject);
    if (s.questionText !== undefined) setQuestionText(s.questionText);
    if (s.originalFileName !== undefined) setOriginalFileName(s.originalFileName);
    if (s.modelAnswer !== undefined) setModelAnswer(s.modelAnswer);
    if (s.maxMarks !== undefined) setMaxMarks(s.maxMarks);
    if (s.selectedPageNum !== undefined) setSelectedPageNum(s.selectedPageNum);
    if (s.evaluationState !== undefined) setEvaluationState(s.evaluationState);
    if (s.rubricWeights) setRubricWeights(s.rubricWeights);
    if (s.rubricScores) setRubricScores(s.rubricScores);
    if (s.rubricPenalties) setRubricPenalties(s.rubricPenalties);

    setLastAutoSaveTime(s.timestamp || Date.now());
    setPendingRestoreSession(null);
    showToast('✓ स्वतः-सहेजा गया सत्र (Draft) सफलतापूर्वक पुनः लोड हुआ!');
  };

  const handleDiscardAutoSave = () => {
    localforage.removeItem('upsc_mains_autosave_session').then(() => {
      setPendingRestoreSession(null);
      showToast('सहेजा गया ड्राफ्ट खारिज किया गया');
    }).catch(() => {
      setPendingRestoreSession(null);
    });
  };

  // Model Settings & Presets Handlers
  const handleSaveModelSettings = () => {
    localStorage.setItem('upsc_selected_models', JSON.stringify(selectedModels));
    localStorage.setItem('upsc_model_strictness', evaluationStrictness);
    localStorage.setItem('upsc_model_feedback_detail', feedbackDetailLevel);
    localStorage.setItem('upsc_model_value_addition', String(valueAdditionFocus));
    localStorage.setItem('upsc_model_ocr_sensitivity', ocrSensitivity);
    localStorage.setItem('upsc_model_temperature', String(modelTemperature));
    localStorage.setItem('upsc_model_feedback_lang', feedbackLanguage);
    localStorage.setItem('upsc_show_detailed_model_tokens', String(showDetailedModelTokens));
    localStorage.setItem('upsc_show_fallback_alert', String(showFallbackAlertBanner));
    localStorage.setItem('upsc_annotation_font', annotationFont);
    localStorage.setItem('upsc_evaluation_max_tokens', String(evaluationMaxTokens));
    localStorage.setItem('upsc_evaluation_thinking_level', evaluationThinkingLevel);
    setShowModelSettings(false);
    showToast('✓ AI मॉडल, फॉलबैक, थिंकिंग स्तर व टोकन सेटिंग्स सफलतापूर्वक सुरक्षित!');
    if (cloudUser) {
      syncCurrentConfigToCloud(cloudUser.uid, activeSlotId, promptSlots).catch((e) =>
        console.warn('Cloud config sync error:', e)
      );
    }
  };

  const handleResetModelSettings = () => {
    setSelectedModels(DEFAULT_MODELS_CASCADE);
    setEvaluationStrictness('standard');
    setFeedbackDetailLevel('comprehensive');
    setValueAdditionFocus(true);
    setOcrSensitivity('high_precision');
    setModelTemperature(0.1);
    setFeedbackLanguage('bilingual');
    setShowDetailedModelTokens(true);
    setShowFallbackAlertBanner(true);
    setAnnotationFont('kalam');
    setEvaluationMaxTokens(8192);
    setEvaluationThinkingLevel('auto');
    localStorage.setItem('upsc_show_detailed_model_tokens', 'true');
    localStorage.setItem('upsc_show_fallback_alert', 'true');
    localStorage.setItem('upsc_annotation_font', 'kalam');
    localStorage.setItem('upsc_evaluation_max_tokens', '8192');
    localStorage.setItem('upsc_evaluation_thinking_level', 'auto');
    showToast('डिफ़ॉल्ट सेटिंग्स रीसेट कर दी गईं');
  };

  const handleApplyPreset = (presetType: 'fast' | 'balanced' | 'pro') => {
    if (presetType === 'fast') {
      setSelectedModels(['gemini-4-hydrogen', 'gemini-3.8-flash']);
      setEvaluationStrictness('standard');
      setFeedbackDetailLevel('actionable');
      setOcrSensitivity('standard');
      setModelTemperature(0.1);
      setEvaluationThinkingLevel('low');
      localStorage.setItem('upsc_evaluation_thinking_level', 'low');
      showToast('⚡ स्पीड मोड प्रीसेट सक्रिय (Thinking: Low • तेज़ मूल्यांकन)');
    } else if (presetType === 'balanced') {
      setSelectedModels(['gemini-4-hydrogen', 'gemini-3.8-flash']);
      setEvaluationStrictness('standard');
      setFeedbackDetailLevel('comprehensive');
      setValueAdditionFocus(true);
      setOcrSensitivity('high_precision');
      setModelTemperature(0.1);
      setEvaluationThinkingLevel('auto');
      setEvaluationMaxTokens(8192);
      localStorage.setItem('upsc_evaluation_thinking_level', 'auto');
      localStorage.setItem('upsc_evaluation_max_tokens', '8192');
      showToast('⚖️ संतुलित यूपीएससी परीक्षक प्रीसेट सक्रिय (Thinking: Auto • 8,192 टोकन)');
    } else if (presetType === 'pro') {
      setSelectedModels(['gemini-4-hydrogen', 'gemini-3.8-flash']);
      setEvaluationStrictness('strict');
      setFeedbackDetailLevel('comprehensive');
      setValueAdditionFocus(true);
      setOcrSensitivity('high_precision');
      setModelTemperature(0.05);
      setEvaluationThinkingLevel('high');
      setEvaluationMaxTokens(8192);
      localStorage.setItem('upsc_evaluation_thinking_level', 'high');
      localStorage.setItem('upsc_evaluation_max_tokens', '8192');
      showToast('🏆 प्रो इंटेलिजेंस प्रीसेट सक्रिय (Thinking: High • सर्वोच्च गुणवत्ता)');
    }
  };

  const handleMoveModelPriority = (modelId: string, direction: 'up' | 'down') => {
    const idx = selectedModels.indexOf(modelId);
    if (idx === -1) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= selectedModels.length) return;
    const updated = [...selectedModels];
    const [removed] = updated.splice(idx, 1);
    updated.splice(newIdx, 0, removed);
    setSelectedModels(updated);
  };

  const handleSelectAllFlash = () => {
    const flashIds = ALL_GEMINI_MODELS.filter(m => m.category === 'flash').map(m => m.id);
    setSelectedModels(Array.from(new Set([...flashIds, ...selectedModels])));
    showToast(`✓ सभी Flash मॉडल्स (${flashIds.length}) कैस्केड में जोड़े गए`);
  };

  const handleSelectAllPro = () => {
    const proIds = ALL_GEMINI_MODELS.filter(m => m.category === 'pro').map(m => m.id);
    setSelectedModels(Array.from(new Set([...proIds, ...selectedModels])));
    showToast(`✓ सभी Pro मॉडल्स (${proIds.length}) कैस्केड में जोड़े गए`);
  };

  const handleSelectAllModels = () => {
    setSelectedModels(ALL_GEMINI_MODELS.map(m => m.id));
    showToast(`✓ सभी ${ALL_GEMINI_MODELS.length} मॉडल्स (Flash + Pro) कैस्केड में जोड़े गए`);
  };

  const handleRunPingTest = async (modelToTest?: string) => {
    const targetModel = modelToTest || selectedModels[0] || 'gemini-4-hydrogen';
    setPingTestStatus({ loading: true });
    setModelPingResults(prev => ({
      ...prev,
      [targetModel]: { loading: true }
    }));
    try {
      const resp = await fetch('/api/models/test-ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: targetModel })
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        const resObj = {
          latencyMs: data.latencyMs,
          model: data.model,
          success: true
        };
        setPingTestStatus({
          loading: false,
          result: resObj
        });
        setModelPingResults(prev => ({
          ...prev,
          [targetModel]: { loading: false, latencyMs: data.latencyMs, success: true }
        }));
      } else {
        const errMsg = data.error || 'मॉडल से संपर्क नहीं हो सका';
        setPingTestStatus({
          loading: false,
          result: {
            latencyMs: 0,
            model: targetModel,
            success: false,
            error: errMsg
          }
        });
        setModelPingResults(prev => ({
          ...prev,
          [targetModel]: { loading: false, success: false, error: errMsg }
        }));
      }
    } catch (err: any) {
      const errMsg = err.message || 'नेटवर्क त्रुटि';
      setPingTestStatus({
        loading: false,
        result: {
          latencyMs: 0,
          model: targetModel,
          success: false,
          error: errMsg
        }
      });
      setModelPingResults(prev => ({
        ...prev,
        [targetModel]: { loading: false, success: false, error: errMsg }
      }));
    }
  };

  // Next Copy Fast Reset (For evaluating copies in a single batch)
  const handleNextCopy = () => {
    clearUploadedFiles();
  };

  // --- BATCH EVALUATION SYSTEM (40-50 Copies Queue & Vault) ---
  const [evaluationMode, setEvaluationMode] = useState<'single' | 'batch'>('single');
  const [activeBatchReviewItem, setActiveBatchReviewItem] = useState<BatchItem | null>(null);

  const handleReviewBatchCopy = (item: BatchItem) => {
    if (!item.evalResult) return;
    const targetWords = (item.evalResult?.total_marks?.max_marks || maxMarks) >= 15 ? 250 : 150;
    const safeEvalResult: EvaluationResult = {
      ...item.evalResult,
      word_count: item.evalResult.word_count || {
        total_words: Math.round(targetWords * 0.95),
        target_words: targetWords,
        status: 'within_limit',
        breakdown: { intro_words: 25, body_words: Math.round(targetWords * 0.70), conclusion_words: 25 },
        comment: `शब्द सीमा (${targetWords} शब्द) का समुचित अनुपालन किया गया है।`
      }
    };
    setEvalResult(safeEvalResult);
    setUploadedPages(item.pages || []);
    setStudentName(item.studentName);
    setOriginalFileName(item.fileName);
    setMaxMarks(item.evalResult?.total_marks?.max_marks || maxMarks);
    setActiveBatchReviewItem(item);
    setEvaluationState('completed');
    setEvaluationMode('single');
    setSelectedPageNum(1);
    
    showToast(`🔍 ${item.studentName} की कॉपी समीक्षा हेतु लोड की गई!`);
  };

  const handleReturnToBatch = () => {
    if (activeBatchReviewItem && evalResult) {
      // Sync any updated annotations/marks back to IndexedDB batch vault
      localforage.getItem('upsc_mains_batch_vault').then((savedBatch: any) => {
        if (savedBatch && Array.isArray(savedBatch)) {
          const updated = savedBatch.map((b: BatchItem) => {
            if (b.id === activeBatchReviewItem.id) {
              return {
                ...b,
                evalResult: evalResult,
                studentName: studentName,
                progressText: `समीक्षा संपन्न (${evalResult.total_marks.obtained}/${evalResult.total_marks.max_marks})`
              };
            }
            return b;
          });
          localforage.setItem('upsc_mains_batch_vault', updated);
        }
      }).catch(e => console.error(e));
    }
    setActiveBatchReviewItem(null);
    setEvaluationMode('batch');
    showToast('↩️ बंच मूल्यांकन डैशबोर्ड पर वापस आ गए!');
  };

  // Auto-sync adjustments in review mode back to batch vault instantly
  useEffect(() => {
    if (activeBatchReviewItem && evalResult && evaluationMode === 'single') {
      localforage.getItem('upsc_mains_batch_vault').then((savedBatch: any) => {
        if (savedBatch && Array.isArray(savedBatch)) {
          let hasChanges = false;
          const updated = savedBatch.map((b: BatchItem) => {
            if (b.id === activeBatchReviewItem.id) {
              hasChanges = true;
              return {
                ...b,
                evalResult: evalResult,
                studentName: studentName,
                progressText: `समीक्षा संपन्न (${evalResult.total_marks.obtained}/${evalResult.total_marks.max_marks})`
              };
            }
            return b;
          });
          if (hasChanges) {
            localforage.setItem('upsc_mains_batch_vault', updated).catch(e => console.error(e));
          }
        }
      });
    }
  }, [evalResult, studentName, activeBatchReviewItem, evaluationMode]);

  // Save context to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('upsc_saved_model_answer', modelAnswer);
    localStorage.setItem('upsc_saved_max_marks', maxMarks.toString());
    localStorage.setItem('upsc_saved_rubric_rules', rubricRules);
    localStorage.setItem('upsc_frequent_comments', JSON.stringify(frequentComments));
  }, [modelAnswer, maxMarks, rubricRules, frequentComments]);

  // Initialize Dark Mode and History
  useEffect(() => {
    const savedTheme = localStorage.getItem('upsc_mains_theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDarkMode(false);
      document.documentElement.classList.remove('dark');
    }

    const savedComments = localStorage.getItem('upsc_frequent_comments');
    if (savedComments) {
      try {
        const parsed = JSON.parse(savedComments);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const cleaned = parsed.map((c: any) => {
            if (typeof c !== 'string') return '';
            let text = sanitizeAnnotationText(c, 'pure_hindi');
            if (/define clearly/i.test(text)) text = 'स्पष्ट परिभाषा लिखें';
            if (/add data/i.test(text)) text = 'तथ्य एवं प्रासंगिक आंकड़े शामिल करें';
            if (/way forward missing/i.test(text)) text = 'आगे की राह का उल्लेख करें';
            if (/हैंडराइटिंग/i.test(text)) text = 'हस्तलेखन में सुधार करें';
            return text;
          }).filter((c: string) => Boolean(c && c.trim()));
          setFrequentComments(cleaned.length > 0 ? Array.from(new Set(cleaned)) : DEFAULT_FREQUENT_COMMENTS);
        } else {
          setFrequentComments(DEFAULT_FREQUENT_COMMENTS);
        }
      } catch (e) {
        console.error('Failed to parse saved frequent comments');
        setFrequentComments(DEFAULT_FREQUENT_COMMENTS);
      }
    } else {
      setFrequentComments(DEFAULT_FREQUENT_COMMENTS);
    }
    
    localforage.getItem('upsc_mains_history').then((savedHistory: any) => {
      if (savedHistory && Array.isArray(savedHistory)) {
        setHistory(savedHistory);
      } else {
        // Fallback for migration from localStorage
        const legacyHistory = localStorage.getItem('upsc_mains_history');
        if (legacyHistory) {
          try {
            const parsed = JSON.parse(legacyHistory);
            setHistory(parsed);
            localforage.setItem('upsc_mains_history', parsed);
          } catch (e) {
            console.error('Failed to parse legacy history', e);
          }
        }
      }
    }).catch(e => console.error('Failed to load history from IndexedDB', e));
  }, []);

  const toggleTheme = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('upsc_mains_theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('upsc_mains_theme', 'light');
      }
      return next;
    });
  };
  
  // Custom Annotation Adding Mode
  const [customAnnotationText, setCustomAnnotationText] = useState<string>('');
  const [customAnnotationX, setCustomAnnotationX] = useState<number>(6); // Left margin default
  const [customAnnotationY, setCustomAnnotationY] = useState<number>(50);
  const [selectedMargin, setSelectedMargin] = useState<'left' | 'right'>('left');
  const [isAddingAnnotation, setIsAddingAnnotation] = useState<boolean>(false);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);

  // Click outside annotation box or toolbar to finish editing and hide tools
  useEffect(() => {
    if (!selectedAnnotationId) return;

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('.annotation-active-container') || 
        target?.closest('.annotation-sidebar-editor') ||
        target?.closest('.annotation-quick-toolbar')
      ) {
        return;
      }
      setSelectedAnnotationId(null);
    };

    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedAnnotationId(null);
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('pointerdown', handleOutsideClick);
      window.addEventListener('keydown', handleEscapeKey);
    }, 50);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', handleOutsideClick);
      window.removeEventListener('keydown', handleEscapeKey);
    };
  }, [selectedAnnotationId]);
  
  // Dragging states
  const [isDraggingAnnotation, setIsDraggingAnnotation] = useState<boolean>(false);
  const [draggedAnnotationId, setDraggedAnnotationId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const modelAnswerFileInputRef = useRef<HTMLInputElement>(null);
  const [isExtractingText, setIsExtractingText] = useState(false);

  useEffect(() => {
    fetchSystemPrompt();
  }, []);


  const handleSelectSlot = async (slotIdToSelect: number) => {
    setActiveSlotId(slotIdToSelect);
    localStorage.setItem('upsc_active_slot_id', slotIdToSelect.toString());
    const targetSlot = promptSlots.find(s => s.id === slotIdToSelect);
    const fallbackPreset = UPSC_PROMPT_PRESETS[slotIdToSelect - 1] || UPSC_PROMPT_PRESETS[0];
    const promptToApply = (targetSlot?.content && targetSlot.content.trim() !== '') ? targetSlot.content : fallbackPreset.content;
    const slotNameToApply = targetSlot?.name || `Slot ${slotIdToSelect} (${fallbackPreset.name})`;

    try {
      await fetch('/api/system-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptToApply,
          slotId: slotIdToSelect,
          slotName: slotNameToApply
        })
      });
      if (cloudUser) {
        syncCurrentConfigToCloud(cloudUser.uid, slotIdToSelect, promptSlots).catch((e) =>
          console.warn('Cloud slot switch sync error:', e)
        );
      }
    } catch (err) {
      console.error('Failed to sync slot prompt to server:', err);
    }
    showToast(`सक्रिय स्लॉट बदला: "${slotNameToApply}" (100% कठोरता से लागू)`);
  };

  // --- CLOUD DATABASE SYNC HELPERS ---
  const buildModelSettingsSnapshot = () => ({
    selectedModels,
    evaluationStrictness,
    feedbackDetailLevel,
    valueAdditionFocus,
    ocrSensitivity,
    modelTemperature,
    feedbackLanguage,
    showDetailedModelTokens,
    showFallbackAlertBanner,
    annotationFont,
    evaluationMaxTokens,
    evaluationThinkingLevel,
    maxMarks,
    modelAnswer: (modelAnswer || '').slice(0, 15000),
    rubricRules: (rubricRules || '').slice(0, 5000),
    rubricWeights,
    frequentComments: (frequentComments || []).slice(0, 25)
  });

  const syncCurrentConfigToCloud = async (
    uid: string,
    slotIdToSave = activeSlotId,
    slotsToSave = promptSlots
  ) => {
    await saveUserCloudConfig(uid, {
      activeSlotId: slotIdToSave,
      promptSlots: slotsToSave,
      modelSettings: buildModelSettingsSnapshot()
    });
    setLastCloudSyncedAt(new Date().toLocaleTimeString());
  };

  const handleForcePushToCloud = async (uidOverride?: string) => {
    const targetUid = uidOverride || cloudUser?.uid;
    if (!targetUid) return;
    setIsCloudSyncing(true);
    setCloudSyncError(null);
    try {
      await syncCurrentConfigToCloud(targetUid, activeSlotId, promptSlots);
      // Push up to 15 most recent evaluations and learning logs
      const recentHistory = history.slice(0, 15);
      for (const h of recentHistory) {
        if (h && h.evalResult) {
          await saveEvaluationToCloud(h.ownerUid || targetUid, {
            id: h.id,
            timestamp: h.timestamp,
            studentName: h.studentName,
            subject: h.subject || subject || 'सामान्य अध्ययन',
            obtained: h.obtained,
            max_marks: h.max_marks,
            evalResult: h.evalResult,
            modelAnswer: h.modelAnswer,
            uploadedPages: h.uploadedPages
          });
        }
      }
      const recentLogs = learningLogs.slice(0, 15);
      for (const log of recentLogs) {
        await saveLearningLogToCloud(targetUid, log);
      }
      setLastCloudSyncedAt(new Date().toLocaleTimeString());
      showToast('☁️ सभी प्रॉम्प्ट स्लॉट्स, सेटिंग्स व स्कोरकार्ड क्लाउड पर सुरक्षित हो गए!');
    } catch (err: any) {
      console.error('Cloud push failed:', err);
      setCloudSyncError('क्लाउड पर डेटा सेव करने में त्रुटि हुई।');
    } finally {
      setIsCloudSyncing(false);
    }
  };

  const handleForcePullFromCloud = async (uidOverride?: string, silentIfEmpty = false) => {
    const targetUid = uidOverride || cloudUser?.uid;
    if (!targetUid) return;
    setIsCloudSyncing(true);
    setCloudSyncError(null);
    try {
      const cloudConfig = await loadUserCloudConfig(targetUid);
      const isCurrentOwner = !auth.currentUser || isSuperAdminUser(auth.currentUser);
      if (!cloudConfig) {
        // First time user on cloud: push local configuration up to initialize parent doc
        await syncCurrentConfigToCloud(targetUid, activeSlotId, promptSlots);
        const policyLoaded = await loadPlatformPolicy();
        setPlatformPolicy(policyLoaded);
        if (auth.currentUser) {
          const prof = await ensureStudentProfile(auth.currentUser, policyLoaded.defaultStudentQuota);
          setStudentProfile(prof);
        }
        // For a student logging in for the first time, start with their own clean (0) copy history
        if (!isCurrentOwner) {
          setHistory([]);
        }
        if (!silentIfEmpty) {
          showToast('☁️ आपका पोर्टल अकाउंट सफलतापूर्वक सक्रिय हो गया!');
        }
      } else {
        if (isCurrentOwner) {
          const singleSlot1Slots = [
            { id: 1, name: 'Slot 1 (मुख्य सार्वभौमिक प्रॉम्प्ट V2.4)', content: MASTER_8_BLOCK_PROMPT },
            { id: 2, name: 'Slot 2 (खाली स्लॉट 2)', content: '' },
            { id: 3, name: 'Slot 3 (खाली स्लॉट 3)', content: '' },
            { id: 4, name: 'Slot 4 (खाली स्लॉट 4)', content: '' },
            { id: 5, name: 'Slot 5 (खाली स्लॉट 5)', content: '' },
          ];
          setPromptSlots(singleSlot1Slots);
          setActiveSlotId(1);
          localStorage.setItem('upsc_prompt_slots', JSON.stringify(singleSlot1Slots));
          localStorage.setItem('upsc_active_slot_id', '1');
        }
        if (isCurrentOwner) {
          const ms = cloudConfig.modelSettings || {};
          if (Array.isArray(ms.selectedModels) && ms.selectedModels.length > 0) {
            const validIds = ALL_GEMINI_MODELS.map((m) => m.id);
            const cleanedModels = ms.selectedModels
              .map((id: string) => (id === 'gemini-3.6-flash' ? 'gemini-4-hydrogen' : id))
              .filter((id: string) => validIds.includes(id));
            const finalModels = cleanedModels.includes('gemini-4-hydrogen')
              ? Array.from(new Set(cleanedModels))
              : DEFAULT_MODELS_CASCADE;
            setSelectedModels(finalModels);
            localStorage.setItem('upsc_selected_models', JSON.stringify(finalModels));
          }
          if (ms.evaluationStrictness) setEvaluationStrictness(ms.evaluationStrictness);
          if (ms.feedbackDetailLevel) setFeedbackDetailLevel(ms.feedbackDetailLevel);
          if (typeof ms.valueAdditionFocus === 'boolean') setValueAdditionFocus(ms.valueAdditionFocus);
          if (ms.ocrSensitivity) setOcrSensitivity(ms.ocrSensitivity);
          if (typeof ms.modelTemperature === 'number') setModelTemperature(ms.modelTemperature);
          if (ms.feedbackLanguage) setFeedbackLanguage(ms.feedbackLanguage);
          if (ms.annotationFont) setAnnotationFont(ms.annotationFont);
          if (typeof ms.evaluationMaxTokens === 'number') setEvaluationMaxTokens(ms.evaluationMaxTokens);
          if (isValidThinkingLevel(ms.evaluationThinkingLevel)) {
            setEvaluationThinkingLevel(ms.evaluationThinkingLevel);
            localStorage.setItem('upsc_evaluation_thinking_level', ms.evaluationThinkingLevel);
          }
          if (typeof ms.maxMarks === 'number') setMaxMarks(ms.maxMarks);
          if (typeof ms.modelAnswer === 'string' && ms.modelAnswer) setModelAnswer(ms.modelAnswer);
          if (typeof ms.rubricRules === 'string' && ms.rubricRules) setRubricRules(ms.rubricRules);
        }

        const policyLoaded = await loadPlatformPolicy();
        setPlatformPolicy(policyLoaded);
        if (auth.currentUser) {
          const prof = await ensureStudentProfile(auth.currentUser, policyLoaded.defaultStudentQuota);
          setStudentProfile(prof);
        }

        const cloudEvals = await loadEvaluationsFromCloud(targetUid, policyLoaded.retentionDays);
        if (!isCurrentOwner) {
          // Student account: show ONLY this student's own cloud evaluations + their own user-scoped local images
          const studentLocalCache =
            (await localforage.getItem<HistoryEntry[]>(`upsc_mains_history_${targetUid}`).catch(() => [])) || [];
          const studentMap = new Map<string, HistoryEntry>(studentLocalCache.map((item) => [item.id, item]));
          const studentMerged = cloudEvals
            .map((cItem) => {
              const existingLocal = studentMap.get(cItem.id);
              return existingLocal && existingLocal.uploadedPages && existingLocal.uploadedPages.length > 0
                ? { ...cItem, uploadedPages: existingLocal.uploadedPages }
                : cItem;
            })
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setHistory(studentMerged);
          localforage.setItem(`upsc_mains_history_${targetUid}`, studentMerged).catch(() => {});
        } else {
          // Owner account: restore Owner's local IndexedDB history and merge with Owner's + ALL Students' cloud evaluations
          const ownerLocalCache =
            (await localforage.getItem<HistoryEntry[]>('upsc_mains_history').catch(() => [])) || [];
          const localMap = new Map<string, HistoryEntry>(ownerLocalCache.map((item) => [item.id, item]));
          const allStudentCloudEvals = await loadAllStudentEvaluationsForAdmin(policyLoaded.retentionDays).catch(() => []);
          const combinedCloudEvals = [...cloudEvals, ...allStudentCloudEvals];

          for (const cItem of combinedCloudEvals) {
            let existingLocal = localMap.get(cItem.id);
            if ((!existingLocal || !existingLocal.uploadedPages || existingLocal.uploadedPages.length === 0) && cItem.ownerUid) {
              const studentLocalList =
                (await localforage.getItem<HistoryEntry[]>(`upsc_mains_history_${cItem.ownerUid}`).catch(() => [])) || [];
              const foundInStudentLocal = studentLocalList.find((sItem) => sItem.id === cItem.id);
              if (foundInStudentLocal && foundInStudentLocal.uploadedPages && foundInStudentLocal.uploadedPages.length > 0) {
                existingLocal = foundInStudentLocal;
              }
            }
            if (existingLocal) {
              localMap.set(cItem.id, {
                ...cItem,
                uploadedPages:
                  existingLocal.uploadedPages && existingLocal.uploadedPages.length > 0
                    ? existingLocal.uploadedPages
                    : cItem.uploadedPages
              });
            } else {
              localMap.set(cItem.id, cItem);
            }
          }
          const merged = Array.from(localMap.values())
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 50);
          setHistory(merged);
          localforage.setItem('upsc_mains_history', merged).catch(() => {});
        }

        // Pull cloud learning logs and merge
        const cloudLogs = await loadLearningLogsFromCloud(targetUid);
        if (cloudLogs.length > 0) {
          setLearningLogs((prevLogs) => {
            const logMap = new Map<string, LearningLog>(prevLogs.map((l) => [l.id, l]));
            for (const cLog of cloudLogs) {
              if (!logMap.has(cLog.id)) {
                logMap.set(cLog.id, cLog);
              }
            }
            const mergedLogs = Array.from(logMap.values()).sort(
              (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
            localStorage.setItem('upsc_learning_logs', JSON.stringify(mergedLogs));
            return mergedLogs;
          });
        }

        setLastCloudSyncedAt(new Date().toLocaleTimeString());
        if (!silentIfEmpty) {
          showToast('☁️ क्लाउड डेटाबेस से प्रॉम्प्ट स्लॉट्स, सेटिंग्स व इतिहास सफलतापूर्वक सिंक हो गए!');
        }
      }
    } catch (err: any) {
      console.error('Cloud pull failed:', err);
      setCloudSyncError('क्लाउड से डेटा लोड करने में त्रुटि हुई।');
    } finally {
      setIsCloudSyncing(false);
    }
  };

  const lastPulledAuthUidRef = useRef<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setCloudUser(u);
      if (u) {
        setShowEdTechLoginScreen(false);
        if (!isSuperAdminUser(u)) {
          const autoName = u.displayName || (u.email ? u.email.split('@')[0] : 'UPSC अभ्यर्थी');
          setStudentName(autoName);
        }
        if (lastPulledAuthUidRef.current !== u.uid) {
          lastPulledAuthUidRef.current = u.uid;
          handleForcePullFromCloud(u.uid, true);
        }
      } else {
        lastPulledAuthUidRef.current = null;
        setStudentProfile(null);
      }
    });
    return () => unsub();
  }, []);

  const handleCloudSignIn = async () => {
    setIsCloudSyncing(true);
    setCloudSyncError(null);
    try {
      const u = await signInWithGoogle(true);
      if (!u) {
        setCloudSyncError('लॉगिन पॉपअप बंद कर दिया गया। लॉगिन करने के लिए पुनः प्रयास करें।');
        return;
      }
      setCloudUser(u);
      setShowEdTechLoginScreen(false);
      if (!isSuperAdminUser(u)) {
        const autoName = u.displayName || (u.email ? u.email.split('@')[0] : 'UPSC अभ्यर्थी');
        setStudentName(autoName);
      }
      await handleForcePullFromCloud(u.uid, false);
      showToast(`✓ स्वागत है ${u.displayName || u.email}! आपका पोर्टल सक्रिय हो गया।`);
    } catch (err: any) {
      const code = String(err?.code || '');
      if (code === 'auth/popup-blocked') {
        setCloudSyncError('ब्राउज़र ने लॉगिन पॉपअप ब्लॉक कर दिया है। कृपया पॉपअप की अनुमति (Allow Popups) दें।');
      } else {
        console.warn('Google Sign-In warning:', err);
        setCloudSyncError(err?.message || 'Google लॉगिन निरस्त या विफल रहा।');
      }
    } finally {
      setIsCloudSyncing(false);
    }
  };

  const handleCloudSignOut = async () => {
    try {
      await signOutUser();
      setCloudUser(null);
      setStudentProfile(null);
      setIsStudentPreviewMode(false);
      setLastCloudSyncedAt(null);
      setShowEdTechLoginScreen(true);
      showToast('आप सफलतापूर्वक लॉगआउट हो गए हैं।');
    } catch (err) {
      console.warn('Sign-out warning:', err);
    }
  };

  const handleSwitchGoogleAccount = async () => {
    try {
      setIsStudentPreviewMode(false);
      await handleCloudSignIn();
    } catch (err) {
      console.warn('Account switch warning:', err);
    }
  };

  // Owner Admin: Open any student's evaluated copy onto the main Red-Pen Canvas for inspection/override
  const handleInspectStudentCopyFromAdmin = async (student: StudentProfileData, copyRecord: any) => {
    if (!copyRecord?.evalResult) {
      showToast('इस कॉपी का मूल्यांकन डेटा उपलब्ध नहीं है।');
      return;
    }
    let resolvedPages: UploadedPage[] = Array.isArray(copyRecord.uploadedPages) ? copyRecord.uploadedPages : [];
    const hadCloudPages = resolvedPages.length > 0;

    // Fallback to IndexedDB caches if cloud record was created before image sync or if local high-res exists
    if (resolvedPages.length === 0) {
      const studentLocal =
        (await localforage.getItem<HistoryEntry[]>(`upsc_mains_history_${student.ownerId}`).catch(() => [])) || [];
      const foundStudentLocal = studentLocal.find((item) => item.id === copyRecord.id);
      if (foundStudentLocal?.uploadedPages && foundStudentLocal.uploadedPages.length > 0) {
        resolvedPages = foundStudentLocal.uploadedPages;
      } else {
        const ownerLocal =
          (await localforage.getItem<HistoryEntry[]>('upsc_mains_history').catch(() => [])) || [];
        const foundOwnerLocal = ownerLocal.find((item) => item.id === copyRecord.id);
        if (foundOwnerLocal?.uploadedPages && foundOwnerLocal.uploadedPages.length > 0) {
          resolvedPages = foundOwnerLocal.uploadedPages;
        } else {
          const autoSaved: any = await localforage.getItem('upsc_mains_autosave_session').catch(() => null);
          if (
            autoSaved?.uploadedPages?.length > 0 &&
            autoSaved?.evalResult?.pages?.length === copyRecord.evalResult?.pages?.length &&
            autoSaved?.evalResult?.total_marks?.obtained === copyRecord.evalResult?.total_marks?.obtained
          ) {
            resolvedPages = autoSaved.uploadedPages;
          }
        }
      }
    }

    let normalizedPages: UploadedPage[] = resolvedPages.map((p: any, idx: number) => ({
      id: p.id || `page-${idx + 1}`,
      name: p.name || `Page ${idx + 1}`,
      pageNumber: p.pageNumber || idx + 1,
      dataUrl: p.dataUrl || p.imageUrl || '',
      imageUrl: p.imageUrl || p.dataUrl || ''
    }));

    // Do NOT trigger a Firestore write merely from opening/viewing a copy; cloud sync happens only on explicit save.

    // If a legacy cloud record from another device has 0 saved images, synthesize UPSC sheet pages so Red-Pen annotations still display
    if (normalizedPages.length === 0 && Array.isArray(copyRecord.evalResult?.pages)) {
      normalizedPages = copyRecord.evalResult.pages.map((p: any, idx: number) => ({
        id: `legacy-page-${idx + 1}`,
        name: `Page ${idx + 1}`,
        pageNumber: p.page_number || idx + 1,
        dataUrl: `MOCK_LEGACY_${idx + 1}`,
        imageUrl: `MOCK_LEGACY_${idx + 1}`
      }));
    }

    if (copyRecord.evalResult?.annotation_font) {
      setAnnotationFont(copyRecord.evalResult.annotation_font);
    }
    setEvalResult(copyRecord.evalResult);
    setOriginalEvalResult(JSON.parse(JSON.stringify(copyRecord.evalResult)));
    setStudentName(copyRecord.studentName || student.displayName);
    setMaxMarks(copyRecord.max_marks || 10);
    if (copyRecord.modelAnswer) setModelAnswer(copyRecord.modelAnswer);
    setUploadedPages(normalizedPages);
    setEvaluationState('completed');
    setEvaluationMode('single');
    setSelectedPageNum(1);
    const recordTimestamp = copyRecord.timestamp || new Date().toISOString();
    setInspectedStudentRecord({
      student,
      copyId: copyRecord.id,
      timestamp: recordTimestamp
    });
    setActiveCopyRecord({
      id: copyRecord.id,
      ownerUid: student.ownerId,
      timestamp: recordTimestamp,
      studentEmail: student.email
    });
    showToast(`👑 छात्र '${student.displayName}' की चेक्ड कॉपी एवं स्कोरकार्ड ओनर समीक्षा मोड में खोले गए!`);
  };

  const handleSaveOwnerOverrideToStudent = async () => {
    const targetOwnerUid = inspectedStudentRecord?.student.ownerId || activeCopyRecord?.ownerUid || cloudUser?.uid;
    const targetCopyId = inspectedStudentRecord?.copyId || activeCopyRecord?.id;
    const targetTimestamp = inspectedStudentRecord?.timestamp || activeCopyRecord?.timestamp || new Date().toISOString();
    if (!targetCopyId || !evalResult) return;

    const updatedEntry: HistoryEntry = {
      id: targetCopyId,
      timestamp: targetTimestamp,
      studentName: studentName || inspectedStudentRecord?.student.displayName || 'UPSC अभ्यर्थी',
      ownerUid: targetOwnerUid,
      studentEmail: inspectedStudentRecord?.student.email || activeCopyRecord?.studentEmail,
      subject: subject || 'सामान्य अध्ययन',
      obtained: evalResult.total_marks.obtained,
      max_marks: evalResult.total_marks.max_marks,
      evalResult,
      uploadedPages,
      modelAnswer
    };

    setHistory((prev) => {
      const exists = prev.some((item) => item.id === targetCopyId);
      const next = exists
        ? prev.map((item) => (item.id === targetCopyId ? { ...item, ...updatedEntry } : item))
        : [updatedEntry, ...prev].slice(0, 50);
      localforage.setItem('upsc_mains_history', next).catch(() => {});
      return next;
    });

    if (targetOwnerUid) {
      localforage
        .getItem<HistoryEntry[]>(`upsc_mains_history_${targetOwnerUid}`)
        .then((studentCache) => {
          const existing = Array.isArray(studentCache) ? studentCache : [];
          const exists = existing.some((item) => item.id === targetCopyId);
          const nextStudent = exists
            ? existing.map((item) => (item.id === targetCopyId ? { ...item, ...updatedEntry } : item))
            : [updatedEntry, ...existing].slice(0, 50);
          localforage.setItem(`upsc_mains_history_${targetOwnerUid}`, nextStudent).catch(() => {});
        })
        .catch(() => {});
    }

    try {
      if (targetOwnerUid) {
        await saveEvaluationToCloud(targetOwnerUid, {
          id: targetCopyId,
          timestamp: targetTimestamp,
          studentName: updatedEntry.studentName,
          subject: updatedEntry.subject,
          obtained: updatedEntry.obtained,
          max_marks: updatedEntry.max_marks,
          evalResult,
          modelAnswer,
          uploadedPages,
          skipPageRecompression: true
        });
      }
      showToast(
        inspectedStudentRecord
          ? `✓ आपके द्वारा किए गए अंक/टिप्पणी सुधार छात्र '${inspectedStudentRecord.student.displayName}' के सेक्शन व क्लाउड अकाउंट में सेव हो गए!`
          : '✓ कॉपी में किए गए सभी बदलाव छात्र अनुभाग एवं इतिहास में अपडेट हो गए!'
      );
    } catch (err) {
      console.error('Failed to save owner override to student account:', err);
      setErrorMessage('छात्र के अकाउंट में संशोधन सेव करने में त्रुटि आई।');
    }
  };

  const fetchSystemPrompt = async () => {
    try {
      const migratedKey = 'upsc_universal_slot1_v2_4';
      const isMigrated = localStorage.getItem(migratedKey) === 'true';

      const cleanSlot1State = [
        { id: 1, name: 'Slot 1 (मुख्य सार्वभौमिक प्रॉम्प्ट V2.4)', content: MASTER_8_BLOCK_PROMPT },
        { id: 2, name: 'Slot 2 (खाली स्लॉट 2)', content: '' },
        { id: 3, name: 'Slot 3 (खाली स्लॉट 3)', content: '' },
        { id: 4, name: 'Slot 4 (खाली स्लॉट 4)', content: '' },
        { id: 5, name: 'Slot 5 (खाली स्लॉट 5)', content: '' },
      ];

      if (!isMigrated) {
        localStorage.setItem('upsc_prompt_slots', JSON.stringify(cleanSlot1State));
        localStorage.setItem('upsc_active_slot_id', '1');
        localStorage.setItem(migratedKey, 'true');
        setPromptSlots(cleanSlot1State);
        setActiveSlotId(1);
        fetch('/api/system-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: MASTER_8_BLOCK_PROMPT,
            slotId: 1,
            slotName: 'Slot 1 (मुख्य सार्वभौमिक प्रॉम्प्ट V2.4)'
          })
        }).catch(() => {});
        return;
      }

      const savedSlots = localStorage.getItem('upsc_prompt_slots');
      const savedActiveId = localStorage.getItem('upsc_active_slot_id');

      if (savedSlots) {
        try {
          const parsed = JSON.parse(savedSlots);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const populated = [1, 2, 3, 4, 5].map(id => {
              const existing = parsed.find((s: any) => s.id === id);
              if (id === 1) {
                const hasValidSlot1 =
                  existing?.content &&
                  existing.content.includes('खंड 1: अटल भाषा और शब्दावली नियम');
                return {
                  id: 1,
                  name: existing?.name || 'Slot 1 (मुख्य सार्वभौमिक प्रॉम्प्ट V2.4)',
                  content: hasValidSlot1 ? existing.content : MASTER_8_BLOCK_PROMPT
                };
              }
              return {
                id,
                name: existing?.name || `Slot ${id} (खाली स्लॉट ${id})`,
                content: existing?.content || ''
              };
            });
            localStorage.setItem('upsc_prompt_slots', JSON.stringify(populated));
            setPromptSlots(populated);
            setActiveSlotId(savedActiveId ? Number(savedActiveId) : 1);
            return;
          }
        } catch {
          // fallback if parsing failed
        }
      }

      setPromptSlots(cleanSlot1State);
      setActiveSlotId(1);
    } catch (e) {
      console.error('Failed to fetch system prompt:', e);
    }
  };

  const saveSystemPrompt = async () => {
    setIsSavingSystemPrompt(true);
    try {
      localStorage.setItem('upsc_prompt_slots', JSON.stringify(promptSlots));
      localStorage.setItem('upsc_active_slot_id', activeSlotId.toString());
      
      const activeSlot = promptSlots.find(s => s.id === activeSlotId);
      const fallbackPreset = UPSC_PROMPT_PRESETS[activeSlotId - 1] || UPSC_PROMPT_PRESETS[0];
      const activeContent = (activeSlot?.content && activeSlot.content.trim() !== '') ? activeSlot.content : fallbackPreset.content;
      const activeName = activeSlot?.name || `Slot ${activeSlotId} (${fallbackPreset.name})`;

      const res = await fetch('/api/system-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: activeContent,
          slotId: activeSlotId,
          slotName: activeName
        })
      });
      if (res.ok) {
        showToast(`स्लॉट ${activeSlotId} ("${activeName}") सफलतापूर्वक सहेजा गया और सख्ती से लागू किया गया!`);
        setShowSystemPromptSettings(false);
        if (cloudUser) {
          syncCurrentConfigToCloud(cloudUser.uid, activeSlotId, promptSlots).catch((e) =>
            console.warn('Cloud prompt save sync error:', e)
          );
        }
      } else {
        setErrorMessage('Failed to save system prompt to server.');
      }
    } catch (e) {
      console.error('Failed to save system prompt:', e);
      setErrorMessage('Network error while saving system prompt.');
    }
    setIsSavingSystemPrompt(false);
  };

  const resetSystemPrompt = async () => {
    setIsSavingSystemPrompt(true);
    try {
      const res = await fetch('/api/system-prompt/reset', { method: 'POST' });
      const data = await res.json();
      if (data.prompt) {
        setPromptSlots(prev => prev.map(s => s.id === activeSlotId ? { ...s, content: data.prompt } : s));
        showToast('Active slot reset to default standard.');
      }
    } catch (e) {
      console.error('Failed to reset system prompt:', e);
    }
    setIsSavingSystemPrompt(false);
  };

  const saveSlotName = (id: number, newName: string) => {
    if (newName && newName.trim()) {
      setPromptSlots(prev => prev.map(s => s.id === id ? { ...s, name: newName.trim() } : s));
    }
    setEditingSlotId(null);
  };

  const handleModelAnswerFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsExtractingText(true);
    setErrorMessage(null);
    try {
      let fileDataUrl = '';
      if (file.type === 'text/plain') {
        const text = await file.text();
        setModelAnswer(text);
        setIsExtractingText(false);
        return;
      } else {
        fileDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      const res = await fetch('/api/extract-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileDataUrl, mimeType: file.type })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Extract failed');
      
      if (data.text) {
        setModelAnswer(data.text);
      } else {
        setErrorMessage("फाइल से कोई टेक्स्ट नहीं निकाला जा सका।");
      }
    } catch (err: any) {
      console.error("Extraction error:", err);
      setErrorMessage(`टेक्स्ट निकालने में त्रुटि: ${err.message}`);
    } finally {
      setIsExtractingText(false);
      if (modelAnswerFileInputRef.current) {
        modelAnswerFileInputRef.current.value = '';
      }
    }
  };

  // Convert PDF file to separate image pages using PDF.js CDN
  const processPdfFile = async (file: File) => {
    // @ts-ignore
    if (!window.pdfjsLib) {
      setErrorMessage("PDF.js लाइब्रेरी लोड नहीं हो पाई। कृपया इंटरनेट कनेक्शन की जांच करें।");
      return;
    }

    
    try {
      setIsProcessingPdf(true);
      setPdfProcessingProgress(10);
      const fileReader = new FileReader();
      
      fileReader.onload = async function () {
        
    try {
          const typedarray = new Uint8Array(this.result as ArrayBuffer);
          // @ts-ignore
          const pdf = await window.pdfjsLib.getDocument(typedarray).promise;
          const totalPages = pdf.numPages;
          const pagesArray: UploadedPage[] = [];

          for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            setPdfProcessingProgress(Math.round((pageNum / totalPages) * 90));
            const page = await pdf.getPage(pageNum);
            
            // Render at a balanced resolution (scale: 1.5) to preserve quality but avoid mobile memory crashes
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d', { willReadFrequently: true });
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            if (context) {
              await page.render({ canvasContext: context, viewport: viewport }).promise;
              // Compress to 80% JPEG quality to preserve text clarity while saving memory
              const dataUrl = canvas.toDataURL('image/jpeg', 0.80);
              pagesArray.push({
                id: `pdf-page-${pageNum}-${Date.now()}`,
                name: `${file.name}_Page_${pageNum}.jpg`,
                dataUrl: dataUrl
              });
              
              // Clear canvas memory aggressively to prevent OOM crash on mobile
              canvas.width = 0;
              canvas.height = 0;
            }
          }

          setUploadedPages((prev) => {
            const combined = [...prev, ...pagesArray];
            if (isEffectiveStudentView && combined.length > maxAllowedPagesForCurrentMarks) {
              showToast(
                `⚠️ ${maxMarks} अंकों के प्रश्न हेतु अधिकतम ${maxAllowedPagesForCurrentMarks} पृष्ठ अनुमत हैं। प्रथम ${maxAllowedPagesForCurrentMarks} पृष्ठ जोड़े गए।`
              );
              return combined.slice(0, maxAllowedPagesForCurrentMarks);
            }
            return combined;
          });
          setPdfProcessingProgress(100);
          setIsProcessingPdf(false);
          setPdfProcessingProgress(0);
        } catch (err: any) {
          console.error("Error parsing PDF pages: ", err);
          setErrorMessage("PDF फाइल को पार्स करने में त्रुटि आई। केवल सुरक्षित या गैर-पासवर्ड वाली PDF ही स्वीकार्य हैं।");
          setIsProcessingPdf(false);
        }
      };

      fileReader.readAsArrayBuffer(file);
    } catch (err: any) {
      console.error(err);
      setErrorMessage("PDF प्रोसेसिंग विफल रही।");
      setIsProcessingPdf(false);
    }
  };

  const processTextAsPages = (text: string, title: string = 'Text_Answer') => {
    const textPages = generateTextAnswerPages(text, title);
    if (textPages.length > 0) {
      setUploadedPages((prev) => {
        const combined = [...prev, ...textPages];
        if (isEffectiveStudentView && combined.length > maxAllowedPagesForCurrentMarks) {
          showToast(
            `⚠️ ${maxMarks} अंकों के प्रश्न हेतु अधिकतम ${maxAllowedPagesForCurrentMarks} पृष्ठ अनुमत हैं। प्रथम ${maxAllowedPagesForCurrentMarks} पृष्ठ जोड़े गए।`
          );
          return combined.slice(0, maxAllowedPagesForCurrentMarks);
        }
        return combined;
      });
    }
  };

  const processFilesArray = (files: File[]) => {
    setErrorMessage(null);
    
    // Set student name and original file name (cleaning embedded _undefined / null tokens)
    if (files.length > 0) {
      const firstFileName = files[0].name.replace(/[_\-\s]*\b(?:undefined|null|nan)\b[_\-\s]*/gi, '_').replace(/^_+|_+$/g, '');
      setOriginalFileName(firstFileName || files[0].name);
      const nameWithoutExtension = (firstFileName || files[0].name)
        .replace(/\.[^/.]+$/, '')
        .replace(/[_\-\s]*\b(?:undefined|null|nan)\b[_\-\s]*/gi, ' ')
        .trim();
      setStudentName(nameWithoutExtension);
    }

    files.forEach((f) => {
      const file = f;
      if (file.type === 'application/pdf') {
        processPdfFile(file);
      } else if (file.type === 'text/plain') {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            processTextAsPages(event.target.result as string, file.name || 'Pasted_Text');
          }
        };
        reader.readAsText(file);
      } else if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            const rawDataUrl = event.target.result as string;
            const img = new Image();
            img.onload = () => {
              try {
                // High performance instant client-side canvas normalization (maxDim 1600px, 85% JPEG)
                const maxDim = 1600;
                let width = img.width || 1200;
                let height = img.height || 1600;

                if (width > maxDim || height > maxDim) {
                  if (width > height) {
                    height = Math.round((height * maxDim) / width);
                    width = maxDim;
                  } else {
                    width = Math.round((width * maxDim) / height);
                    height = maxDim;
                  }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (ctx) {
                  ctx.drawImage(img, 0, 0, width, height);
                  const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
                  setUploadedPages((prev) => {
                    if (isEffectiveStudentView && prev.length >= maxAllowedPagesForCurrentMarks) {
                      showToast(
                        `⚠️ ${maxMarks} अंकों के प्रश्न हेतु अधिकतम ${maxAllowedPagesForCurrentMarks} पृष्ठ अनुमत हैं।`
                      );
                      return prev;
                    }
                    return [
                      ...prev,
                      {
                        id: `img-page-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        name: file.name || 'Pasted_Image.jpg',
                        dataUrl: compressedDataUrl
                      }
                    ];
                  });
                  canvas.width = 0;
                  canvas.height = 0;
                } else {
                  setUploadedPages((prev) => {
                    if (isEffectiveStudentView && prev.length >= maxAllowedPagesForCurrentMarks) {
                      return prev;
                    }
                    return [
                      ...prev,
                      {
                        id: `img-page-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        name: file.name || 'Pasted_Image.jpg',
                        dataUrl: rawDataUrl
                      }
                    ];
                  });
                }
              } catch (error) {
                console.error("Error normalizing image:", error);
                setUploadedPages((prev) => {
                  if (isEffectiveStudentView && prev.length >= maxAllowedPagesForCurrentMarks) {
                    return prev;
                  }
                  return [
                    ...prev,
                    {
                      id: `img-page-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                      name: file.name || 'Pasted_Image.jpg',
                      dataUrl: rawDataUrl
                    }
                  ];
                });
              }
            };
            img.onerror = () => {
              setErrorMessage("चित्र लोड करने में त्रुटि आई। कृपया दोबारा प्रयास करें।");
            };
            img.src = rawDataUrl;
          }
        };
        reader.readAsDataURL(file);
      } else {
        setErrorMessage("अमान्य फाइल प्रकार! कृपया केवल PDF या चित्र अपलोड करें।");
      }
    });
  };

  // File Upload Handler (accepts PDF, Images, Text)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    processFilesArray(Array.from(files));
  };

  // Global Keyboard Shortcuts for Review Mode
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      // Only process shortcuts if we are actively viewing/reviewing an evaluation
      if (evaluationState !== 'completed') {
        return;
      }

      const key = e.key.toLowerCase();

      if (key === 'n' || e.key === 'ArrowRight') {
        e.preventDefault();
        setSelectedPageNum(prev => Math.min(uploadedPages.length, prev + 1));
      } else if (key === 'p' || e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelectedPageNum(prev => Math.max(1, prev - 1));
      } else if (key === 's' && isAddingAnnotation) {
        e.preventDefault();
        saveCustomAnnotation();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [evaluationState, uploadedPages.length, isAddingAnnotation, customAnnotationText]);

  // Global Paste Listener for uploading student copies
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      // Ignore paste if user is typing in an input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      const items = e.clipboardData?.items;
      if (!items) return;
      
      const filesToProcess: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          const file = items[i].getAsFile();
          if (file) filesToProcess.push(file);
        }
      }
      
      if (filesToProcess.length > 0) {
        processFilesArray(filesToProcess);
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, [uploadedPages]); // Needs to depend on states if used inside, but setUploadedPages uses prev state. Still good to attach properly.

  // Trigger File Input Click
  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleClipboardPaste = async (e: React.MouseEvent) => {
    e.stopPropagation(); // prevent triggering the file input behind it
    try {
      // Check if API exists and we're not in an iframe restriction
      if (!navigator.clipboard || !navigator.clipboard.read) {
        setShowTextAnswerInput(true);
        setErrorMessage("सुरक्षा कारणों से सीधा पेस्ट ब्लॉक है। कृपया नीचे खुले हुए टेक्स्ट बॉक्स में (Ctrl+V या लॉन्ग प्रेस) पेस्ट करें।");
        return;
      }
      
      const clipboardItems = await navigator.clipboard.read();
      const filesToProcess: File[] = [];

      for (const clipboardItem of clipboardItems) {
        for (const type of clipboardItem.types) {
          if (type.startsWith('image/')) {
            const blob = await clipboardItem.getType(type);
            const file = new File([blob], `Pasted_Image_${Date.now()}.png`, { type });
            filesToProcess.push(file);
            break;
          } else if (type === 'text/plain') {
             const blob = await clipboardItem.getType(type);
             const text = await blob.text();
             const file = new File([blob], `Pasted_Text_${Date.now()}.txt`, { type: 'text/plain' });
             filesToProcess.push(file);
             break;
          }
        }
      }
      
      if (filesToProcess.length > 0) {
        processFilesArray(filesToProcess);
      } else {
         const text = await navigator.clipboard.readText();
         if (text) {
           const file = new File([text], `Pasted_Text_${Date.now()}.txt`, { type: 'text/plain' });
           processFilesArray([file]);
         } else {
           setErrorMessage("क्लिपबोर्ड में कोई मान्य चित्र या टेक्स्ट नहीं मिला।");
         }
      }
    } catch (err) {
      console.warn("Clipboard API error:", err);
      // Fallback: If clipboard API is blocked (like in iframes), show instruction gently
      setShowTextAnswerInput(true);
      setErrorMessage("ब्राउज़र सुरक्षा के कारण सीधा पेस्ट ब्लॉक है। कृपया नीचे खुले हुए टेक्स्ट बॉक्स में (Ctrl+V या Long-Press करके) पेस्ट करें।");
    }
  };

  // Clear Uploaded Files / Next Copy Fast Reset
  const clearUploadedFiles = () => {
    setUploadedPages([]);
    setStudentName('');
    setOriginalFileName('');
    setTextAnswerInput('');
    setErrorMessage(null);
    setSuccessMessage(null);
    setBaseAiMarks(null);
    setActiveBatchReviewItem(null);
    setActiveCopyRecord(null);
    setInspectedStudentRecord(null);
    if (evaluationState !== 'evaluating') {
      setEvaluationState('idle');
      setEvalResult(null);
      setOriginalEvalResult(null);
      setUndoStack([]);
      setRedoStack([]);
    }
    setSelectedPageNum(1);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    localforage.removeItem('upsc_mains_autosave_session').catch(() => {});
    setLastAutoSaveTime(null);
    setPendingRestoreSession(null);
    showToast("✓ नया एकल मूल्यांकन सेटअप तैयार है।");
    // Smooth scroll to top of page
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Open / Switch to Single Evaluation (starts fresh evaluation if one was already done/reviewed)
  const handleOpenSingleEvaluation = () => {
    setEvaluationMode('single');
    setActiveBatchReviewItem(null);
    if (evalResult || evaluationState === 'completed' || uploadedPages.length > 0) {
      clearUploadedFiles();
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Drag-and-drop thumbnail state
  const [draggedThumbnailIndex, setDraggedThumbnailIndex] = useState<number | null>(null);
  const [dragOverThumbnailIndex, setDragOverThumbnailIndex] = useState<number | null>(null);

  // Delete specific page from the upload list
  const deleteUploadedPage = (id: string) => {
    setUploadedPages((prev) => prev.filter((p) => p.id !== id));
    showToast("पृष्ठ हटाया गया");
  };

  // Instant 90° Clockwise Rotation for uploaded page
  const rotateUploadedPage = (id: string, degrees: number = 90) => {
    setUploadedPages((prev) => {
      return prev.map((page) => {
        if (page.id !== id) return page;

        const img = new Image();
        img.src = page.dataUrl;

        const canvas = document.createElement('canvas');
        if (degrees === 90 || degrees === 270) {
          canvas.width = img.height || 1600;
          canvas.height = img.width || 1200;
        } else {
          canvas.width = img.width || 1200;
          canvas.height = img.height || 1600;
        }

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate((degrees * Math.PI) / 180);
          ctx.drawImage(img, -img.width / 2, -img.height / 2);
          const newUrl = canvas.toDataURL('image/jpeg', 0.85);
          canvas.width = 0;
          canvas.height = 0;
          return {
            ...page,
            dataUrl: newUrl
          };
        }
        return page;
      });
    });
    showToast("✓ पृष्ठ 90° घुमाया गया (Rotated 90°)");
  };

  const moveUploadedPage = (fromIndex: number, toIndex: number) => {
    if (
      fromIndex < 0 || 
      toIndex < 0 || 
      fromIndex >= uploadedPages.length || 
      toIndex >= uploadedPages.length || 
      fromIndex === toIndex
    ) {
      return;
    }
    handleThumbnailDrop(fromIndex, toIndex);
  };

  const handleThumbnailDrop = (dragIdx: number, dropIdx: number) => {
    if (isNaN(dragIdx) || dragIdx === dropIdx || dragIdx < 0 || dropIdx < 0) {
      setDraggedThumbnailIndex(null);
      setDragOverThumbnailIndex(null);
      return;
    }

    const newPages = [...uploadedPages];
    const [draggedItem] = newPages.splice(dragIdx, 1);
    newPages.splice(dropIdx, 0, draggedItem);
    setUploadedPages(newPages);

    const oldIndices = Array.from({length: uploadedPages.length}, (_, i) => i);
    const [movedIndex] = oldIndices.splice(dragIdx, 1);
    oldIndices.splice(dropIdx, 0, movedIndex);
    
    const pageNumberMap: Record<number, number> = {};
    for (let newIdx = 0; newIdx < oldIndices.length; newIdx++) {
      pageNumberMap[oldIndices[newIdx] + 1] = newIdx + 1;
    }

    if (evalResult && evalResult.pages) {
      const remappedPages = evalResult.pages.map(p => ({
        ...p,
        page_number: pageNumberMap[p.page_number] || p.page_number
      })).sort((a, b) => a.page_number - b.page_number);

      setEvalResult({
        ...evalResult,
        pages: remappedPages
      });
    }

    setSelectedPageNum(pageNumberMap[selectedPageNum] || selectedPageNum);
    setDraggedThumbnailIndex(null);
    setDragOverThumbnailIndex(null);
    showToast(`पृष्ठों का क्रम बदला गया (पृष्ठ ${dragIdx + 1} ➔ पृष्ठ ${dropIdx + 1})`);
  };

  // Call Server-Side Gemini AI Evaluation
  const handleStartEvaluation = async () => {
    if (uploadedPages.length === 0) {
      setErrorMessage("कृपया मूल्यांकन शुरू करने से पहले कम से कम एक पृष्ठ अपलोड करें या सैंपल कॉपी लोड करें।");
      return;
    }

    // Require Google Login before running any evaluation
    if (!cloudUser) {
      setShowEdTechLoginScreen(true);
      setErrorMessage("🔒 मूल्यांकन शुरू करने के लिए कृपया पहले अपने Google अकाउंट से लॉगिन करें।");
      return;
    }

    // Enforce Per-Question Max Pages Limit for Students (10 Marker: Max 3 Pages, 15 Marker: Max 4 Pages)
    if (isEffectiveStudentView && uploadedPages.length > maxAllowedPagesForCurrentMarks) {
      setErrorMessage(
        `⚠️ ${maxMarks} अंकों के प्रश्न के लिए अधिकतम ${maxAllowedPagesForCurrentMarks} पृष्ठों की अनुमति है (अभी ${uploadedPages.length} पृष्ठ हैं)। कृपया ${uploadedPages.length - maxAllowedPagesForCurrentMarks} अतिरिक्त पृष्ठ हटाएं।`
      );
      return;
    }

    // Enforce Platform Access, Block Status, and Copy Quota for Student accounts
    if (studentProfile && !isOwnerAccount) {
      if (studentProfile.status === 'blocked') {
        setErrorMessage("🚫 आपका अकाउंट एडमिन द्वारा अस्थायी रूप से रोका (Blocked) गया है। कृपया संस्थान/मेंटॉर से संपर्क करें।");
        return;
      }
      if (!platformPolicy.allowStudentUploads && studentProfile.role === 'student') {
        setErrorMessage("🔒 अभी एडमिन द्वारा नए AI मूल्यांकन अस्थायी रूप से रोके गए हैं। आप अपने पुराने मूल्यांकित स्कोरकार्ड देख सकते हैं।");
        return;
      }
      if (studentProfile.role === 'student' && studentProfile.usedCount >= studentProfile.quotaLimit) {
        setErrorMessage(`⚠️ आपका कॉपी मूल्यांकन कोटा (${studentProfile.usedCount}/${studentProfile.quotaLimit} कॉपियाँ) समाप्त हो गया है। अधिक कॉपियों की अनुमति के लिए एडमिन से संपर्क करें।`);
        return;
      }
    }

    setErrorMessage(null);
    setEvaluationState('evaluating');

    // Retrieve active prompt slot content strictly
    const activeSlot = promptSlots.find(s => s.id === activeSlotId) || promptSlots[0];
    const fallbackPreset = UPSC_PROMPT_PRESETS[(activeSlotId || 1) - 1] || UPSC_PROMPT_PRESETS[0];
    let activePromptContent = (activeSlot?.content && activeSlot.content.trim() !== '') ? activeSlot.content : fallbackPreset.content;
    const activeSlotNameToPass = activeSlot?.name || `Slot ${activeSlotId} (${fallbackPreset.name})`;

    if (!isEffectiveStudentView && isOwnerAccount) {
      showToast(`सक्रिय स्लॉट "${activeSlotNameToPass}" के दिशानिर्देशों का 100% कठोरता से अनुपालन किया जा रहा है...`);
    } else {
      showToast(`🎓 मानक UPSC मुख्य परीक्षा मूल्यांकन प्रोटोकॉल के तहत कॉपी जाँची जा रही है...`);
    }

    try {
      const imagesPayload = uploadedPages.map((p) => p.dataUrl);

      const perfStart = performance.now();
      const requestBodyStr = JSON.stringify({
        images: imagesPayload,
        requestedModels: selectedModels,
        subject: subject || 'सामान्य अध्ययन',
        question: questionText || '',
        maxMarks,
        modelAnswer: (!isEffectiveStudentView && isOwnerAccount) ? modelAnswer : '',
        rubricRules,
        slotId: (!isEffectiveStudentView && isOwnerAccount) ? activeSlotId : undefined,
        slotName: (!isEffectiveStudentView && isOwnerAccount) ? activeSlotNameToPass : undefined,
        systemPrompt: (!isEffectiveStudentView && isOwnerAccount) ? (activePromptContent || undefined) : undefined,
        evaluationStrictness,
        feedbackDetailLevel,
        valueAdditionFocus,
        ocrSensitivity,
        temperature: modelTemperature,
        feedbackLanguage,
        maxOutputTokens: evaluationMaxTokens,
        thinkingLevel: evaluationThinkingLevel
      });

      let response: Response | null = null;
      let responseText = '';
      let result: EvaluationResult | null = null;
      const maxEvalAttempts = 3;

      for (let attempt = 1; attempt <= maxEvalAttempts; attempt++) {
        const initialAuthSearch = (window as any).__AISTUDIO_INITIAL_AUTH_SEARCH || '';
        const evalUrl = attempt > 1 && initialAuthSearch ? `/api/evaluate${initialAuthSearch}` : '/api/evaluate';
        response = await fetch(evalUrl, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: requestBodyStr,
        });

        responseText = await response.text();
        try {
          result = JSON.parse(responseText);
          break;
        } catch {
          const isHtmlResponse = /^\s*<!doctype html>|^\s*<html/i.test(responseText);
          if (isHtmlResponse && attempt < maxEvalAttempts) {
            // Sync session cookie / wait for dev server warmup before retrying
            const healthUrl = initialAuthSearch
              ? `/api/health${initialAuthSearch}`
              : '/api/health?__storage_access_granted=true';
            await fetch(healthUrl, { credentials: 'include', cache: 'no-store' }).catch(() => {});
            await new Promise((r) => setTimeout(r, 2200 * attempt));
            continue;
          }
          if (isHtmlResponse) {
            if (/Cookie check/i.test(responseText)) {
              throw new Error('ब्राउज़र सत्र (Session Cookie) रीफ़्रेश की आवश्यकता है। कृपया पेज को एक बार रीलोड (Reload) करके पुनः प्रयास करें।');
            }
            if (/Starting Server/i.test(responseText)) {
              throw new Error('सर्वर अभी स्टार्ट हो रहा है। कृपया 3-4 सेकंड बाद पुनः प्रयास करें।');
            }
            throw new Error('सर्वर या नेटवर्क प्रॉक्सी से HTML उत्तर प्राप्त हुआ। कृपया पेज को एक बार रीलोड (Reload) करके पुनः प्रयास करें।');
          }
          throw new Error(`सर्वर से अमान्य उत्तर प्राप्त हुआ। (Response: ${responseText.substring(0, 100)})`);
        }
      }

      const perfEnd = performance.now();
      const latencyMs = Math.round(perfEnd - perfStart);

      if (!response || !result) {
        throw new Error('सर्वर से कोई उत्तर प्राप्त नहीं हुआ। कृपया पुनः प्रयास करें।');
      }

      if (!response.ok) {
        throw new Error((result as any)?.error || `सर्वर एरर: ${response.status}`);
      }

      if (isPerfTrackingEnabled) {
        const modelUsed = result.model_used || 'unknown-model';
        console.log(`[Perf Tracking] Single Evaluation | Model: ${modelUsed} | Latency: ${latencyMs}ms`);
        setPerfLogs(prev => [{
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          model: modelUsed,
          latencyMs,
          mode: 'single',
          timestamp: new Date()
        }, ...prev]);
      }
      
      // Clean up evaluation pages sequence and enforce annotations properly
      const validatedPages = result.pages.map((p, pIndex) => {
        const pageNum = pIndex + 1;
        const normalizedPageType =
          (p.page_type as string) === 'answer_content'
            ? 'answer_page'
            : (p.page_type as string) === 'blank_or_Test'
              ? 'blank_page'
              : (p.page_type || (pageNum === 1 ? 'cover_page' : 'answer_page'));
        const isBlank = normalizedPageType === 'blank_page';
        const isCoverPageNoAnswer =
          normalizedPageType === 'cover_page' ||
          (pageNum === 1 && (!p.annotations || p.annotations.length === 0));
        // Never place margin comments on blank pages or pure cover pages
        const rawAnnotations = (isBlank || isCoverPageNoAnswer) ? [] : (p.annotations || []);

        const sanitizedAnns = rawAnnotations.map((ann, aIndex) => {
          const isStamp = ann.text === '✔' || ann.text === '❌' || ann.text === '◯' || ann.text === '➔' || ann.text === '→' || ann.text === '←' || ann.text === '•' || ann.text === '⭐';
          const isLeft = ann.x_percent < 50;
          
          let clampedX = ann.x_percent;
          let clampedY = ann.y_percent;
          let cleanText = ann.text;

          if (!isStamp) {
            // For written text, clamp to strict margins and avoid top-left Q box & top-right instruction box
            clampedX = isLeft 
              ? 0.5
              : Math.max(86.5, Math.min(89, ann.x_percent));
            
            // Avoid Q box printed in top left margin (extends to ~22%) and printed warning in top right margin (extends to ~25%)
            if (isLeft && ann.y_percent < 22.5) {
              clampedY = 23;
            } else if (!isLeft && ann.y_percent < 25.5) {
              clampedY = 26;
            } else {
              clampedY = Math.max(14, Math.min(88, ann.y_percent));
            }

            // SMART ANNOTATION SANITIZATION & HEALING
            // Prevents empty quotes (' ' या ' ') and maps UPSC/Food Security keywords accurately
            if (typeof cleanText === 'string') {
              cleanText = sanitizeAnnotationText(cleanText, feedbackLanguage);
            }
          } else {
             // For stamps, allow them anywhere (usually 15-85)
             clampedY = Math.max(5, Math.min(95, ann.y_percent));
          }
          
          return {
            ...ann,
            id: ann.id || `ann-${pageNum}-${aIndex}-${Date.now()}`,
            text: cleanText,
            x_percent: clampedX,
            y_percent: clampedY,
            font_scale: ann.font_scale || defaultAnnotationFontScale || 1.0,
            is_bold: ann.is_bold !== undefined ? ann.is_bold : defaultAnnotationFormat.is_bold,
            is_italic: ann.is_italic !== undefined ? ann.is_italic : defaultAnnotationFormat.is_italic,
            is_underline: ann.is_underline !== undefined ? ann.is_underline : defaultAnnotationFormat.is_underline
          };
        });

        const diversifiedAnns = deduplicateAndDiversifyPageAnnotations(sanitizedAnns, feedbackLanguage);

        return {
          ...p,
          page_number: pageNum,
          page_type: normalizedPageType as any,
          detected_content_summary: p.detected_content_summary,
          annotations: diversifiedAnns
        };
      });

      const targetWords = maxMarks >= 15 ? 250 : 150;
      let calculatedWords = 0;
      validatedPages.forEach((p) => {
        if (p.page_type === 'answer_page') {
          calculatedWords += p.page_word_count || 85;
        }
      });
      if (calculatedWords === 0) calculatedWords = Math.round(targetWords * 0.95);

      const wordCountData: WordCountAnalysis = result.word_count || {
        total_words: calculatedWords,
        target_words: targetWords,
        status: Math.abs((calculatedWords - targetWords) / targetWords) <= 0.12 
          ? 'within_limit' 
          : (calculatedWords < targetWords ? 'under_limit' : 'over_limit'),
        breakdown: {
          intro_words: Math.round(calculatedWords * 0.15),
          body_words: Math.round(calculatedWords * 0.70),
          conclusion_words: Math.round(calculatedWords * 0.15)
        },
        comment: `मानक शब्द सीमा (${targetWords} शब्द) के आधार पर मूल्यांकन किया गया।`
      };

      const finalResult: EvaluationResult = {
        ...result,
        word_count: wordCountData,
        pages: validatedPages
      };

      // Initialize criteria scores from AI rubric_breakdown or derived from obtained ratio
      const baseRatio = (finalResult.total_marks.obtained / finalResult.total_marks.max_marks) * 10;
      const initialRubricScores: Record<string, any> = {
                introduction: finalResult.rubric_breakdown?.introduction || {
          score: Math.min(2.0, Math.max(0, Math.round(baseRatio * 0.2 * 10) / 10)),
          max_score: 2.0,
          feedback: 'भूमिका में सटीक परिभाषा है'
        },
        main_body: finalResult.rubric_breakdown?.main_body || {
          score: Math.min(6.0, Math.max(0, Math.round(baseRatio * 0.6 * 10) / 10)),
          max_score: 6.0,
          matched_points: [],
          missing_points: [],
          presentation_feedback: 'मुख्य भाग सुव्यवस्थित है'
        },
        conclusion: finalResult.rubric_breakdown?.conclusion || {
          score: Math.min(2.0, Math.max(0, Math.round(baseRatio * 0.2 * 10) / 10)),
          max_score: 2.0,
          feedback: 'निष्कर्ष ठीक है'
        }
      };

      setRubricScores(initialRubricScores);
      setBaseAiMarks(finalResult.total_marks.obtained);
      setRubricPenalties({
        word_limit: false,
        irrelevant_content: false,
        poor_handwriting: false,
        missing_conclusion: false
      });

      finalResult.annotation_font = annotationFont;
      finalResult.default_font_scale = defaultAnnotationFontScale;
      setEvalResult(finalResult);
      setOriginalEvalResult(JSON.parse(JSON.stringify(finalResult)));
      setUndoStack([]);
      setRedoStack([]);
      setEvaluationState('completed');
      setSelectedPageNum(1);
      

      const detectedSubj = (finalResult as any)?.question_analysis?.detected_subject;
      const resolvedSubject =
        typeof detectedSubj === 'string' && detectedSubj.trim().length > 0
          ? detectedSubj.trim()
          : subject || 'सामान्य अध्ययन';
      if (resolvedSubject !== subject) {
        setSubject(resolvedSubject);
      }

      // Save to local history
      const newEntry: HistoryEntry = {
        id: `history-${Date.now()}`,
        timestamp: new Date().toISOString(),
        studentName: studentName || 'Unknown Student',
        ownerUid: cloudUser?.uid,
        studentEmail: cloudUser?.email || undefined,
        subject: resolvedSubject,
        obtained: finalResult.total_marks.obtained,
        max_marks: finalResult.total_marks.max_marks,
        evalResult: finalResult,
        uploadedPages,
        modelAnswer
      };

      setActiveCopyRecord({
        id: newEntry.id,
        ownerUid: cloudUser?.uid || '',
        timestamp: newEntry.timestamp,
        studentEmail: cloudUser?.email || undefined
      });
      
      setHistory(prev => {
        const updated = [newEntry, ...prev].slice(0, 50); // Keep last 50 max
        const historyStorageKey =
          cloudUser && !isOwnerAccount ? `upsc_mains_history_${cloudUser.uid}` : 'upsc_mains_history';
        localforage.setItem(historyStorageKey, updated).catch(e => {
          console.error("Failed to save history to IndexedDB", e);
        });
        // Also mirror into unified 'upsc_mains_history' on this device so Owner switching on same device has full-res pages immediately
        if (cloudUser && !isOwnerAccount) {
          localforage.getItem<HistoryEntry[]>('upsc_mains_history').then((ownerCache) => {
            const existing = Array.isArray(ownerCache) ? ownerCache : [];
            const mergedOwner = [newEntry, ...existing.filter((x) => x.id !== newEntry.id)].slice(0, 50);
            localforage.setItem('upsc_mains_history', mergedOwner).catch(() => {});
          }).catch(() => {});
        }
        return updated;
      });

      if (cloudUser) {
        (async () => {
          try {
            await saveEvaluationToCloud(cloudUser.uid, {
              id: newEntry.id,
              timestamp: newEntry.timestamp,
              studentName: newEntry.studentName,
              subject: resolvedSubject,
              obtained: newEntry.obtained,
              max_marks: newEntry.max_marks,
              evalResult: finalResult,
              modelAnswer,
              uploadedPages
            });
            if (studentProfile) {
              const updatedProf = await incrementStudentUsage(studentProfile);
              setStudentProfile(updatedProf);
            }
          } catch (e) {
            console.warn('Cloud evaluation sync error:', e);
          }
        })();
      }

    } catch (error: any) {
      console.error(error);
      setErrorMessage(error.message || "मूल्यांकन विफल रहा। कृपया पुनः प्रयास करें।");
      setEvaluationState('idle');
    }
  };

  // --- DYNAMIC RUBRIC EVALUATION CONTROLS & RECALCULATION ENGINE ---

  // Helper to calculate dynamic marks based on active criteria, weights, scores, and deductions
  const computeDynamicMarks = (
    weights: Record<string, number>,
    enabled: Record<string, boolean>,
    scores: Record<string, any>,
    penalties: typeof rubricPenalties,
    targetMaxMarks: number
  ) => {
    let totalActiveWeight = 0;
    RUBRIC_CRITERIA_CONFIG.forEach(c => {
      if (enabled[c.id]) {
        totalActiveWeight += (weights[c.id] || 0);
      }
    });

    if (totalActiveWeight === 0) return 0;

    let weightedSumOutOf10 = 0;
    RUBRIC_CRITERIA_CONFIG.forEach(c => {
      if (enabled[c.id]) {
        const normalizedWeight = (weights[c.id] || 0) / totalActiveWeight;
        const scoreOutOf10 = scores[c.id]?.score ?? 5;
        weightedSumOutOf10 += normalizedWeight * scoreOutOf10;
      }
    });

    let rawMarks = (weightedSumOutOf10 / 10) * targetMaxMarks;

    let deductions = 0;
    if (penalties.word_limit) deductions += 0.5;
    if (penalties.irrelevant_content) deductions += 0.5;
    if (penalties.poor_handwriting) deductions += 0.5;
    if (penalties.missing_conclusion) deductions += 0.5;

    const finalMarks = Math.max(0, Math.min(targetMaxMarks, rawMarks - deductions));
    return Math.round(finalMarks * 10) / 10;
  };

  // Update dynamic total in evalResult
  const applyRubricChanges = (
    newWeights = rubricWeights,
    newEnabled = rubricEnabled,
    newScores = rubricScores,
    newPenalties = rubricPenalties
  ) => {
    if (!evalResult) return;
    const newTotal = computeDynamicMarks(
      newWeights,
      newEnabled,
      newScores,
      newPenalties,
      evalResult.total_marks.max_marks
    );
    setEvalResult({
      ...evalResult,
      total_marks: {
        ...evalResult.total_marks,
        obtained: newTotal
      }
    });
  };

  const handleWeightChange = (id: string, newWeight: number) => {
    const updated = { ...rubricWeights, [id]: Math.max(0, Math.min(100, newWeight)) };
    setRubricWeights(updated);
    localStorage.setItem('upsc_rubric_weights', JSON.stringify(updated));
    applyRubricChanges(updated, rubricEnabled, rubricScores, rubricPenalties);
  };

  const handleScoreChange = (id: string, newScore: number) => {
    const clamped = Math.max(0, Math.min(10, Math.round(newScore * 10) / 10));
    const updated = {
      ...rubricScores,
      [id]: {
        ...rubricScores[id],
        score: clamped
      }
    };
    setRubricScores(updated);
    applyRubricChanges(rubricWeights, rubricEnabled, updated, rubricPenalties);
  };

  const handleToggleCriterion = (id: string) => {
    const updated = { ...rubricEnabled, [id]: !rubricEnabled[id] };
    setRubricEnabled(updated);
    applyRubricChanges(rubricWeights, updated, rubricScores, rubricPenalties);
  };

  const handleTogglePenalty = (key: keyof typeof rubricPenalties) => {
    const updated = { ...rubricPenalties, [key]: !rubricPenalties[key] };
    setRubricPenalties(updated);
    applyRubricChanges(rubricWeights, rubricEnabled, rubricScores, updated);
  };

  const handleResetRubric = () => {
    if (baseAiMarks !== null && evalResult) {
      const baseRatio = (baseAiMarks / evalResult.total_marks.max_marks) * 10;
      const initialRubricScores: Record<string, any> = {
        content_demand: { score: Math.min(10, Math.max(0, Math.round(baseRatio * 10) / 10)), feedback: 'मुख्य मांग का अच्छा विश्लेषण' },
        structure_flow: { score: Math.min(10, Math.max(0, Math.round(Math.min(10, baseRatio + 0.5) * 10) / 10)), feedback: 'भूमिका और मुख्य भाग सुव्यवस्थित हैं' },
        facts_evidence: { score: Math.min(10, Math.max(0, Math.round(Math.max(0, baseRatio - 0.5) * 10) / 10)), feedback: 'महत्वपूर्ण उदाहरण और रिपोर्ट्स की आवश्यकता' },
        presentation_diagrams: { score: Math.min(10, Math.max(0, Math.round(baseRatio * 10) / 10)), feedback: 'बुलेट बिंदुओं का अच्छा उपयोग' },
        language_discipline: { score: Math.min(10, Math.max(0, Math.round(Math.min(10, baseRatio + 0.3) * 10) / 10)), feedback: 'भाषा प्रवाह एवं शब्द सीमा उत्तम' }
      };
      setRubricScores(initialRubricScores);
      setRubricPenalties({
        word_limit: false,
        irrelevant_content: false,
        poor_handwriting: false,
        missing_conclusion: false
      });
    }
  };

  // --- INTERACTIVE ANNOTATION CONTROLS ---

  // Handle clicking on Left/Right Margin to create annotation (or deselect active annotation)
  const handleMarginClick = (e: React.MouseEvent<HTMLDivElement>, targetPageNum?: number) => {
    if (!evalResult) return;

    if (targetPageNum && targetPageNum !== selectedPageNum) {
      setSelectedPageNum(targetPageNum);
    }

    // Students have 100% Read-Only access to the evaluated answer sheet
    if (isEffectiveStudentView || !isOwnerAccount) {
      return;
    }

    // If an annotation is currently being edited/selected, dismiss the tool and keep it saved
    if (selectedAnnotationId) {
      setSelectedAnnotationId(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const xPercent = (clickX / rect.width) * 100;
    const yPercent = (clickY / rect.height) * 100;

    // Determine side for suggestion stamp mapping
    setSelectedMargin(xPercent < 50 ? 'left' : 'right');
    setCustomAnnotationX(xPercent < 50 ? 0.5 : Math.min(84.5, Math.round(xPercent)));
    setCustomAnnotationY(Math.round(yPercent));
    setCustomAnnotationText('');
    setCustomAnnotationScale(evalResult.default_font_scale || defaultAnnotationFontScale || 1.0);
    setCustomAnnotationFormat({ ...defaultAnnotationFormat });
    setIsAddingAnnotation(true);
  };

  const [draggingAnnId, setDraggingAnnId] = useState<string | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, ann: Annotation & { _adjustedY?: number }) => {
    // Students cannot drag or reposition evaluator annotations
    if (isEffectiveStudentView || !isOwnerAccount) {
      return;
    }

    // If clicking on resize handles or toolbar buttons, let them handle it directly
    const targetEl = e.target as HTMLElement | null;
    if (targetEl?.closest('.annotation-quick-toolbar') || targetEl?.closest('.annotation-resize-handle')) {
      return;
    }

    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startAnnX = ann.x_percent;
    const startAnnY = typeof ann._adjustedY === 'number' ? ann._adjustedY : ann.y_percent;

    const container = (e.currentTarget.closest('.page-canvas-container') as HTMLElement) || canvasContainerRef.current;
    if (!container) return;

    let hasMetDragThreshold = false;
    const target = e.currentTarget;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaXPixels = moveEvent.clientX - startX;
      const deltaYPixels = moveEvent.clientY - startY;

      // Threshold check: ignore small accidental finger/mouse jitters (< 4px) when just clicking/tapping
      if (!hasMetDragThreshold) {
        if (Math.hypot(deltaXPixels, deltaYPixels) > 4) {
          hasMetDragThreshold = true;
          setDraggingAnnId(ann.id);
          setSelectedAnnotationId(ann.id);
          try {
            target.setPointerCapture(e.pointerId);
          } catch (_) {}

          // Capture snapshot prior to drag move
          if (evalResult) {
            dragInitialSnapshotRef.current = JSON.parse(JSON.stringify(evalResult));
          }
          dragMovedRef.current = false;
        } else {
          return;
        }
      }

      moveEvent.stopPropagation();
      moveEvent.preventDefault();

      const rect = container.getBoundingClientRect();
      const deltaXPercent = (deltaXPixels / rect.width) * 100;
      const deltaYPercent = (deltaYPixels / rect.height) * 100;

      const x_percent = Math.max(0, Math.min(100, Math.round((startAnnX + deltaXPercent) * 10) / 10));
      const y_percent = Math.max(5, Math.min(95, Math.round((startAnnY + deltaYPercent) * 10) / 10));

      dragMovedRef.current = true;

      setEvalResult(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          pages: prev.pages.map(p => {
            if (p.annotations.some(a => a.id === ann.id)) {
              return {
                ...p,
                annotations: p.annotations.map(a => 
                  a.id === ann.id ? { ...a, x_percent, y_percent, is_custom_positioned: true } : a
                )
              };
            }
            return p;
          })
        };
      });
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (hasMetDragThreshold) {
        try {
          target.releasePointerCapture(upEvent.pointerId);
        } catch (_) {}
      }
      target.removeEventListener('pointermove', handlePointerMove);
      target.removeEventListener('pointerup', handlePointerUp);
      setDraggingAnnId(null);

      // If user simply clicked (not dragged), select the annotation with zero movement
      if (!hasMetDragThreshold) {
        setSelectedAnnotationId(ann.id);
      }

      // If annotation was actually moved, commit the initial snapshot to undo history
      if (dragMovedRef.current && dragInitialSnapshotRef.current) {
        const snapshot = dragInitialSnapshotRef.current;
        setUndoStack(prev => [...prev.slice(-29), snapshot]);
        setRedoStack([]);
        dragInitialSnapshotRef.current = null;
        dragMovedRef.current = false;
      }
    };

    target.addEventListener('pointermove', handlePointerMove);
    target.addEventListener('pointerup', handlePointerUp);
  };

  const [resizingAnnId, setResizingAnnId] = useState<string | null>(null);
  const [liveResizeDimensions, setLiveResizeDimensions] = useState<{ width: number; height: number } | null>(null);
  const resizeInitialSnapshotRef = useRef<any>(null);
  const resizeMovedRef = useRef<boolean>(false);

  // Resize box width & height directly using Mouse, Tab Touch, or Stylus
  const handleResizePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    ann: Annotation,
    mode: 'width' | 'height' | 'both',
    isLeft: boolean
  ) => {
    e.stopPropagation();
    e.preventDefault();

    if (evalResult) {
      resizeInitialSnapshotRef.current = JSON.parse(JSON.stringify(evalResult));
    }
    resizeMovedRef.current = false;

    const container = (e.currentTarget.closest('.page-canvas-container') as HTMLElement) || canvasContainerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = ann.width_percent || 14.5;
    const startHeight = ann.min_height_px || 40;

    setResizingAnnId(ann.id);
    setLiveResizeDimensions({ width: startWidth, height: startHeight });

    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    let currentW = startWidth;
    let currentH = startHeight;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.stopPropagation();
      moveEvent.preventDefault();
      resizeMovedRef.current = true;

      if (mode === 'width' || mode === 'both') {
        const deltaXPixels = moveEvent.clientX - startX;
        const deltaXPercent = (deltaXPixels / containerRect.width) * 100;
        if (isLeft) {
          // On left margin, dragging right expands width
          currentW = Math.max(6, Math.min(48, Math.round((startWidth + deltaXPercent) * 10) / 10));
        } else {
          // On right margin, dragging left expands width inward
          currentW = Math.max(6, Math.min(48, Math.round((startWidth - deltaXPercent) * 10) / 10));
        }
      }

      if (mode === 'height' || mode === 'both') {
        const deltaYPixels = moveEvent.clientY - startY;
        currentH = Math.max(24, Math.min(360, Math.round(startHeight + deltaYPixels)));
      }

      setLiveResizeDimensions({ width: currentW, height: currentH });

      setEvalResult(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          pages: prev.pages.map(p => {
            if (p.annotations.some(a => a.id === ann.id)) {
              return {
                ...p,
                annotations: p.annotations.map(a => {
                  if (a.id === ann.id) {
                    return {
                      ...a,
                      width_percent: currentW,
                      min_height_px: currentH
                    };
                  }
                  return a;
                })
              };
            }
            return p;
          })
        };
      });
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      target.releasePointerCapture(upEvent.pointerId);
      target.removeEventListener('pointermove', handlePointerMove);
      target.removeEventListener('pointerup', handlePointerUp);
      setResizingAnnId(null);
      setLiveResizeDimensions(null);

      if (resizeMovedRef.current && resizeInitialSnapshotRef.current) {
        const snapshot = resizeInitialSnapshotRef.current;
        setUndoStack(prev => [...prev.slice(-29), snapshot]);
        setRedoStack([]);
        resizeInitialSnapshotRef.current = null;
        resizeMovedRef.current = false;
      }
    };

    target.addEventListener('pointermove', handlePointerMove);
    target.addEventListener('pointerup', handlePointerUp);
  };

  // Quick adjust width, height or font size from toolbar or buttons
  const adjustAnnotationSize = (
    annId: string, 
    deltaWidth: number, 
    deltaHeight: number, 
    deltaFontScale: number
  ) => {
    if (!evalResult) return;
    pushDebouncedUndoSnapshot();

    setEvalResult(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        pages: prev.pages.map(p => {
          if (p.annotations.some(a => a.id === annId)) {
            return {
              ...p,
              annotations: p.annotations.map(a => {
                if (a.id === annId) {
                  const curW = a.width_percent || 14.5;
                  const newW = Math.max(6, Math.min(48, Math.round((curW + deltaWidth) * 10) / 10));

                  const curH = a.min_height_px || 40;
                  const newH = Math.max(24, Math.min(360, Math.round(curH + deltaHeight)));

                  const curScale = a.font_scale || evalResult.default_font_scale || defaultAnnotationFontScale || 1.0;
                  const newScale = Math.max(0.65, Math.min(2.0, Math.round((curScale + deltaFontScale) * 100) / 100));

                  return {
                    ...a,
                    width_percent: newW,
                    min_height_px: newH,
                    font_scale: newScale
                  };
                }
                return a;
              })
            };
          }
          return p;
        })
      };
    });
  };

  // One-Time Fix: Apply font scale to all existing annotations & lock as permanent default
  const applyFontScaleToAllAnnotations = (targetScale: number, showFeedback = true) => {
    const clampedScale = Math.max(0.65, Math.min(2.0, Math.round(targetScale * 100) / 100));
    setDefaultAnnotationFontScale(clampedScale);
    setCustomAnnotationScale(clampedScale);
    localStorage.setItem('upsc_default_annotation_font_scale', String(clampedScale));

    if (evalResult) {
      pushDebouncedUndoSnapshot();
      setEvalResult(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          default_font_scale: clampedScale,
          pages: prev.pages.map(p => ({
            ...p,
            annotations: p.annotations.map(a => {
              const isStamp = a.text === '✔' || a.text === '❌' || a.text === '◯' || a.text === '➔' || a.text === '→' || a.text === '←' || a.text === '•' || a.text === '⭐';
              if (isStamp) return a;
              return {
                ...a,
                font_scale: clampedScale
              };
            })
          }))
        };
      });
    }

    if (showFeedback) {
      showToast(`📌 अक्षर आकार ${Math.round(clampedScale * 100)}% सभी टिप्पणियों पर लागू व स्थायी सेट (One-Time Fix) कर दिया गया!`);
    }
  };

  // Toggle Bold / Italic / Underline on a single annotation
  const toggleAnnotationFormat = (
    annId: string,
    field: 'is_bold' | 'is_italic' | 'is_underline'
  ) => {
    if (!evalResult) return;
    pushDebouncedUndoSnapshot();

    setEvalResult(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        pages: prev.pages.map(p => {
          if (p.annotations.some(a => a.id === annId)) {
            return {
              ...p,
              annotations: p.annotations.map(a => {
                if (a.id === annId) {
                  const currentVal = field === 'is_bold'
                    ? (a.is_bold !== undefined ? a.is_bold : true)
                    : Boolean(a[field]);
                  return {
                    ...a,
                    [field]: !currentVal
                  };
                }
                return a;
              })
            };
          }
          return p;
        })
      };
    });
  };

  // Apply Bold / Italic / Underline format to all annotations & save as default
  const applyFormatToAllAnnotations = (
    nextFormat: { is_bold: boolean; is_italic: boolean; is_underline: boolean },
    showFeedback = true
  ) => {
    setDefaultAnnotationFormat(nextFormat);
    setCustomAnnotationFormat(nextFormat);
    localStorage.setItem('upsc_default_annotation_format', JSON.stringify(nextFormat));

    if (evalResult) {
      pushDebouncedUndoSnapshot();
      setEvalResult(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          pages: prev.pages.map(p => ({
            ...p,
            annotations: p.annotations.map(a => {
              const isStamp = a.text === '✔' || a.text === '❌' || a.text === '◯' || a.text === '➔' || a.text === '→' || a.text === '←' || a.text === '•' || a.text === '⭐';
              if (isStamp) return a;
              return {
                ...a,
                is_bold: nextFormat.is_bold,
                is_italic: nextFormat.is_italic,
                is_underline: nextFormat.is_underline
              };
            })
          }))
        };
      });
    }

    if (showFeedback) {
      const activeLabels: string[] = [];
      if (nextFormat.is_bold) activeLabels.push('Bold');
      if (nextFormat.is_italic) activeLabels.push('Italic');
      if (nextFormat.is_underline) activeLabels.push('Underline');
      const summary = activeLabels.length > 0 ? activeLabels.join(' + ') : 'Normal (सामान्य)';
      showToast(`📌 टेक्स्ट फ़ॉर्मेट (${summary}) सभी टिप्पणियों पर लागू व स्थायी सेट कर दिया गया!`);
    }
  };

  // Reset custom dimensions and scaling back to default
  const resetAnnotationDimensions = (annId: string) => {
    if (!evalResult) return;
    pushUndoSnapshot();
    setEvalResult(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        pages: prev.pages.map(p => {
          if (p.annotations.some(a => a.id === annId)) {
            return {
              ...p,
              annotations: p.annotations.map(a => {
                if (a.id === annId) {
                  const { width_percent, min_height_px, font_scale, is_custom_positioned, is_bold, is_italic, is_underline, ...rest } = a;
                  return {
                    ...rest,
                    font_scale: defaultAnnotationFontScale,
                    is_bold: defaultAnnotationFormat.is_bold,
                    is_italic: defaultAnnotationFormat.is_italic,
                    is_underline: defaultAnnotationFormat.is_underline
                  };
                }
                return a;
              })
            };
          }
          return p;
        })
      };
    });
  };

  // Append new annotation to active page
  const saveCustomAnnotation = (overrideText?: string) => {
    const textToSave = (typeof overrideText === 'string' ? overrideText : customAnnotationText).trim();
    if (!evalResult || !textToSave) {
      setIsAddingAnnotation(false);
      return;
    }

    pushUndoSnapshot();

    const newAnn: Annotation = {
      id: `custom-ann-${Date.now()}`,
      x_percent: customAnnotationX,
      y_percent: customAnnotationY,
      text: textToSave,
      is_custom_positioned: true,
      font_scale: customAnnotationScale || evalResult.default_font_scale || defaultAnnotationFontScale || 1.0,
      is_bold: customAnnotationFormat.is_bold,
      is_italic: customAnnotationFormat.is_italic,
      is_underline: customAnnotationFormat.is_underline
    };

    const updatedPages = [...evalResult.pages];
    let pageEval = updatedPages.find((p) => p.page_number === selectedPageNum);

    if (!pageEval) {
      pageEval = { page_number: selectedPageNum, annotations: [] };
      updatedPages.push(pageEval);
    }

    pageEval.annotations.push(newAnn);

    setEvalResult({
      ...evalResult,
      pages: updatedPages
    });

    setIsAddingAnnotation(false);
    setCustomAnnotationText('');
    setOpenFormatDropdownId(null);
  };

  // Delete annotation from active page
  const deleteAnnotation = (annId: string) => {
    if (!evalResult) return;

    pushUndoSnapshot();

    const updatedPages = evalResult.pages.map((p) => {
      if (p.annotations.some(a => a.id === annId)) {
        return {
          ...p,
          annotations: p.annotations.filter((ann) => ann.id !== annId)
        };
      }
      return p;
    });

    setEvalResult({
      ...evalResult,
      pages: updatedPages
    });

    if (selectedAnnotationId === annId) {
      setSelectedAnnotationId(null);
    }
  };

  const clearAllAnnotations = () => {
    if (!evalResult) return;
    if (!window.confirm('क्या आप सुनिश्चित हैं कि आप इस कॉपी के सभी पृष्ठों से सभी टिप्पणियां हटाना चाहते हैं? यह क्रिया पूर्ववत (Undo) की जा सकती है।')) return;

    pushUndoSnapshot();

    const updatedPages = evalResult.pages.map((p) => ({
      ...p,
      annotations: []
    }));

    setEvalResult({
      ...evalResult,
      pages: updatedPages
    });
    setSelectedAnnotationId(null);
  };

  const loadHistoryEntry = async (entry: HistoryEntry) => {
    let resolvedPages: UploadedPage[] = Array.isArray(entry.uploadedPages) ? entry.uploadedPages : [];
    const hadCloudPages = resolvedPages.length > 0;

    if (resolvedPages.length === 0) {
      if (entry.ownerUid) {
        const studentLocal =
          (await localforage.getItem<HistoryEntry[]>(`upsc_mains_history_${entry.ownerUid}`).catch(() => [])) || [];
        const found = studentLocal.find((item) => item.id === entry.id);
        if (found?.uploadedPages && found.uploadedPages.length > 0) {
          resolvedPages = found.uploadedPages;
        }
      }
      if (resolvedPages.length === 0) {
        const ownerLocal =
          (await localforage.getItem<HistoryEntry[]>('upsc_mains_history').catch(() => [])) || [];
        const foundOwner = ownerLocal.find((item) => item.id === entry.id);
        if (foundOwner?.uploadedPages && foundOwner.uploadedPages.length > 0) {
          resolvedPages = foundOwner.uploadedPages;
        } else {
          const autoSaved: any = await localforage.getItem('upsc_mains_autosave_session').catch(() => null);
          if (
            autoSaved?.uploadedPages?.length > 0 &&
            autoSaved?.evalResult?.pages?.length === entry.evalResult?.pages?.length &&
            autoSaved?.evalResult?.total_marks?.obtained === entry.evalResult?.total_marks?.obtained
          ) {
            resolvedPages = autoSaved.uploadedPages;
          }
        }
      }
    }

    let normalizedPages: UploadedPage[] = resolvedPages.map((p: any, idx: number) => ({
      id: p.id || `page-${idx + 1}`,
      name: p.name || `Page ${idx + 1}`,
      pageNumber: p.pageNumber || idx + 1,
      dataUrl: p.dataUrl || p.imageUrl || '',
      imageUrl: p.imageUrl || p.dataUrl || ''
    }));

    // Opening a copy from history is strictly a read-only local operation; never write to Firestore on view.

    if (normalizedPages.length === 0 && Array.isArray(entry.evalResult?.pages)) {
      normalizedPages = entry.evalResult.pages.map((p: any, idx: number) => ({
        id: `legacy-page-${idx + 1}`,
        name: `Page ${idx + 1}`,
        pageNumber: p.page_number || idx + 1,
        dataUrl: `MOCK_LEGACY_${idx + 1}`,
        imageUrl: `MOCK_LEGACY_${idx + 1}`
      }));
    }

    if (entry.evalResult?.annotation_font) {
      setAnnotationFont(entry.evalResult.annotation_font);
    }
    setEvalResult(entry.evalResult);
    setOriginalEvalResult(JSON.parse(JSON.stringify(entry.evalResult)));
    setUndoStack([]);
    setRedoStack([]);
    setUploadedPages(normalizedPages);
    setModelAnswer(entry.modelAnswer || '');
    setStudentName(entry.studentName || '');
    setMaxMarks(entry.max_marks || 10);
    setEvaluationState('completed');
    setActiveCopyRecord({
      id: entry.id,
      ownerUid: entry.ownerUid || cloudUser?.uid || '',
      timestamp: entry.timestamp || new Date().toISOString(),
      studentEmail: entry.studentEmail
    });

    // If Owner is loading a student's copy from unified History, enable Owner Override banner
    if (isOwnerAccount && entry.ownerUid && entry.ownerUid !== cloudUser?.uid) {
      setInspectedStudentRecord({
        student: {
          ownerId: entry.ownerUid,
          email: entry.studentEmail || '',
          displayName: entry.studentName || 'UPSC अभ्यर्थी',
          role: 'student',
          status: 'active',
          quotaLimit: platformPolicy.defaultStudentQuota,
          usedCount: 0,
          joinedAt: entry.timestamp
        },
        copyId: entry.id,
        timestamp: entry.timestamp
      });
    } else {
      setInspectedStudentRecord(null);
    }
    
    setSelectedPageNum(1);
    setShowHistory(false);
  };

  const deleteHistoryEntry = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => {
      const updated = prev.filter(item => item.id !== id);
      localforage.setItem('upsc_mains_history', updated).catch(err => {
        console.error("Failed to update history on delete", err);
      });
      return updated;
    });
  };

  // Adjust coordinates or text of annotation (works across both primary & secondary split-view pages)
  const updateAnnotationCoordinates = (annId: string, updates: Partial<Annotation>) => {
    if (!evalResult) return;
    pushDebouncedUndoSnapshot();

    const hasPositionChange =
      typeof updates.x_percent === 'number' || typeof updates.y_percent === 'number';

    const updatedPages = evalResult.pages.map((p) => {
      if (p.annotations.some((ann) => ann.id === annId)) {
        return {
          ...p,
          annotations: p.annotations.map((ann) => {
            if (ann.id === annId) {
              return {
                ...ann,
                ...updates,
                ...(hasPositionChange ? { is_custom_positioned: true } : {})
              };
            }
            return ann;
          })
        };
      }
      return p;
    });

    setEvalResult({
      ...evalResult,
      pages: updatedPages
    });
  };

  // Automatically propagate any Owner edits (annotations, positions, font, marks, rubric, metadata)
  // to in-memory History and Local IndexedDB immediately (ZERO automatic Firestore writes inside useEffect to prevent quota loops;
  // cloud persistence happens strictly via explicit Owner Save or new Evaluation completion).
  useEffect(() => {
    if (!isOwnerAccount || evaluationState !== 'completed' || !evalResult || !activeCopyRecord?.id) {
      return;
    }

    const targetCopyId = activeCopyRecord.id;
    const targetOwnerUid =
      inspectedStudentRecord?.student.ownerId || activeCopyRecord.ownerUid || cloudUser?.uid || '';
    const targetTimestamp =
      inspectedStudentRecord?.timestamp || activeCopyRecord.timestamp || new Date().toISOString();

    const syncedEntry: HistoryEntry = {
      id: targetCopyId,
      timestamp: targetTimestamp,
      studentName: studentName || inspectedStudentRecord?.student.displayName || 'Unknown Student',
      ownerUid: targetOwnerUid || undefined,
      studentEmail: inspectedStudentRecord?.student.email || activeCopyRecord.studentEmail,
      subject: subject || 'सामान्य अध्ययन',
      obtained: evalResult.total_marks.obtained,
      max_marks: evalResult.total_marks.max_marks,
      evalResult,
      uploadedPages,
      modelAnswer
    };

    // 1. Immediately update in-memory History and unified IndexedDB cache
    setHistory((prev) => {
      const idx = prev.findIndex((item) => item.id === targetCopyId);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        ...syncedEntry,
        uploadedPages:
          uploadedPages.length > 0 ? uploadedPages : next[idx].uploadedPages
      };
      localforage.setItem('upsc_mains_history', next).catch(() => {});
      return next;
    });

    // 2. Also update the student-specific IndexedDB cache if on the same device
    if (targetOwnerUid) {
      localforage
        .getItem<HistoryEntry[]>(`upsc_mains_history_${targetOwnerUid}`)
        .then((studentCache) => {
          if (!Array.isArray(studentCache)) return;
          const idx = studentCache.findIndex((item) => item.id === targetCopyId);
          if (idx === -1) return;
          const nextStudent = [...studentCache];
          nextStudent[idx] = {
            ...nextStudent[idx],
            ...syncedEntry,
            uploadedPages:
              uploadedPages.length > 0 ? uploadedPages : nextStudent[idx].uploadedPages
          };
          localforage.setItem(`upsc_mains_history_${targetOwnerUid}`, nextStudent).catch(() => {});
        })
        .catch(() => {});
    }
  }, [
    isOwnerAccount,
    evaluationState,
    evalResult,
    studentName,
    subject,
    maxMarks,
    modelAnswer,
    activeCopyRecord,
    inspectedStudentRecord,
    cloudUser
  ]);

  const syncActiveChangesToVault = (updatedEval: EvaluationResult) => {
    if (activeBatchReviewItem) {
      localforage.getItem("upsc_mains_batch_vault").then((savedBatch: any) => {
        if (savedBatch && Array.isArray(savedBatch)) {
          const updated = savedBatch.map((b: BatchItem) => {
            if (b.id === activeBatchReviewItem.id) {
              return {
                ...b,
                evalResult: updatedEval,
              };
            }
            return b;
          });
          localforage.setItem("upsc_mains_batch_vault", updated).catch(e => console.error(e));
        }
      });
    }
  };

  const handleUpdatePartScore = (part: 'introduction' | 'main_body' | 'conclusion' | 'presentation', newScore: number) => {
    if (part === 'main_body' && evalResult?.rubric_breakdown?.main_body?.parts?.filter((p) => p.kind !== 'presentation').length) return;
    if (!evalResult) return;
    pushUndoSnapshot();
    const max = evalResult.total_marks.max_marks || 10;
    const currentDist = getMarksDistribution(evalResult);
    if (!currentDist) return;

    let updatedIntro = currentDist.intro.score;
    let updatedBody = currentDist.body.score;
    let updatedConcl = currentDist.conclusion.score;
    let updatedPres = currentDist.presentation.score;

    if (part === 'introduction') {
      updatedIntro = Math.max(0, Math.min(currentDist.intro.max, Math.round(newScore * 4) / 4));
    } else if (part === 'main_body') {
      updatedBody = Math.max(0, Math.min(currentDist.body.max, Math.round(newScore * 4) / 4));
    } else if (part === 'conclusion') {
      updatedConcl = Math.max(0, Math.min(currentDist.conclusion.max, Math.round(newScore * 4) / 4));
    } else if (part === 'presentation') {
      updatedPres = Math.max(0, Math.min(currentDist.presentation.max, Math.round(newScore * 4) / 4));
    }

    const newObtained = Math.min(max, Math.round((updatedIntro + updatedBody + updatedConcl + updatedPres) * 10) / 10);

    const updatedEvalResult: EvaluationResult = {
      ...evalResult,
      total_marks: {
        ...evalResult.total_marks,
        obtained: newObtained
      },
      rubric_breakdown: {
        ...evalResult.rubric_breakdown,
        introduction: {
          ...evalResult.rubric_breakdown?.introduction,
          score: updatedIntro,
          max_score: currentDist.intro.max,
          feedback: evalResult.rubric_breakdown?.introduction?.feedback || currentDist.intro.feedback
        },
        main_body: {
          ...evalResult.rubric_breakdown?.main_body,
          score: updatedBody,
          max_score: currentDist.body.max,
          matched_points: evalResult.rubric_breakdown?.main_body?.matched_points || currentDist.body.matchedPoints,
          missing_points: evalResult.rubric_breakdown?.main_body?.missing_points || currentDist.body.missingPoints,
          presentation_feedback: evalResult.rubric_breakdown?.main_body?.presentation_feedback || currentDist.presentation.formatAndFlow,
          parts: currentDist.body.parts
        },
        conclusion: {
          ...evalResult.rubric_breakdown?.conclusion,
          score: updatedConcl,
          max_score: currentDist.conclusion.max,
          feedback: evalResult.rubric_breakdown?.conclusion?.feedback || currentDist.conclusion.feedback
        },
        presentation: {
          ...evalResult.rubric_breakdown?.presentation,
          score: updatedPres,
          max_score: currentDist.presentation.max,
          format_and_flow: currentDist.presentation.formatAndFlow,
          diagram_scope: currentDist.presentation.diagramScope,
          legibility_and_spacing: currentDist.presentation.legibilityAndSpacing,
          feedback: currentDist.presentation.feedback
        }
      }
    };

    setEvalResult(updatedEvalResult);

    if (activeBatchReviewItem) {
      localforage.getItem('upsc_mains_batch_vault').then((savedBatch: any) => {
        if (savedBatch && Array.isArray(savedBatch)) {
          const updated = savedBatch.map((b: BatchItem) => {
            if (b.id === activeBatchReviewItem.id) {
              return {
                ...b,
                evalResult: updatedEvalResult,
                progressText: `समीक्षा संपन्न (${newObtained}/${max})`
              };
            }
            return b;
          });
          localforage.setItem('upsc_mains_batch_vault', updated).catch(e => console.error(e));
        }
      });
    }
  };

  const handleUpdateBodyPart = (index: number, newScore: number) => {
    if (!evalResult) return;
    const currentDist = getMarksDistribution(evalResult);
    if (!currentDist) return;
    const parts = currentDist.body.parts;
    if (!parts || !parts[index]) return;
    pushUndoSnapshot();
    const q = (n: number) => Math.round(n * 4) / 4;
    const max = evalResult.total_marks.max_marks || 10;
    const target = parts[index];
    const clamped = Math.max(0, Math.min(target.max_score, q(newScore)));
    const newParts = parts.map((p, i) => {
      if (i !== index) return p;
      const evScore = Math.min(p.evidence_score ?? 0, clamped);
      const ctScore = Math.max(0, q(clamped - (evScore ?? 0)));
      return {
        ...p,
        score: clamped,
        evidence_score: evScore,
        content_score: ctScore
      };
    });
    const newBody = q(newParts.reduce((a, p) => a + p.score, 0));
    const intro = currentDist.intro.score;
    const concl = currentDist.conclusion.score;
    const pres = currentDist.presentation.score;
    const newObtained = Math.min(max, q(intro + newBody + concl + pres));
    const rb = evalResult.rubric_breakdown || {};
    const updated: EvaluationResult = {
      ...evalResult,
      total_marks: { ...evalResult.total_marks, obtained: newObtained },
      rubric_breakdown: {
        ...rb,
        main_body: {
          ...rb.main_body,
          max_score: currentDist.body.max,
          parts: newParts,
          score: newBody
        },
        presentation: {
          ...rb.presentation,
          score: pres,
          max_score: currentDist.presentation.max,
          format_and_flow: currentDist.presentation.formatAndFlow,
          diagram_scope: currentDist.presentation.diagramScope,
          legibility_and_spacing: currentDist.presentation.legibilityAndSpacing,
          feedback: currentDist.presentation.feedback
        }
      }
    };
    setEvalResult(updated);
    if (activeBatchReviewItem) {
      localforage.getItem('upsc_mains_batch_vault').then((savedBatch: any) => {
        if (savedBatch && Array.isArray(savedBatch)) {
          const next = savedBatch.map((b: BatchItem) =>
            b.id === activeBatchReviewItem.id
              ? { ...b, evalResult: updated, progressText: `समीक्षा संपन्न (${newObtained}/${max})` }
              : b
          );
          localforage.setItem('upsc_mains_batch_vault', next).catch(e => console.error(e));
        }
      });
    }
  };

  const handleEditObtainedMarks = (val: number) => {
    if (!evalResult) return;
    pushUndoSnapshot();
    const currentDist = getMarksDistribution(evalResult);
    if (!currentDist) return;
    const q = (n: number) => Math.round(n * 4) / 4;
    // Keep it between 0 and max_marks, rounded to 0.25
    const max = evalResult.total_marks.max_marks || 10;
    const validated = Math.max(0, Math.min(max, q(val)));
    const ratio = max > 0 ? validated / max : 0.5;
    
    const currentRb = evalResult.rubric_breakdown;
    const introMax = currentDist.intro.max;
    const conclMax = currentDist.conclusion.max;
    const presMax = currentDist.presentation.max;
    const bodyMax = currentDist.body.max;

    const newIntro = Math.min(introMax, q(introMax * ratio));
    const newConcl = Math.min(conclMax, q(conclMax * ratio));
    const newPres = Math.min(presMax, q(presMax * ratio));
    const newBody = Math.max(0, Math.min(bodyMax, q(validated - newIntro - newConcl - newPres)));

    const oldParts = currentDist.body.parts;
    let scaledParts = oldParts;
    let finalBody = newBody;
    if (oldParts && oldParts.length > 0) {
      const oldSum = oldParts.reduce((a, p) => a + p.score, 0);
      const f = oldSum > 0 ? newBody / oldSum : 0;
      scaledParts = oldParts.map((p) => {
        const s = Math.max(0, Math.min(p.max_score, q(p.score * f)));
        const evS = Math.min(p.evidence_score ?? 0, s);
        const ctS = Math.max(0, q(s - (evS ?? 0)));
        return { ...p, score: s, evidence_score: evS, content_score: ctS };
      });
      finalBody = q(scaledParts.reduce((a, p) => a + p.score, 0));
    }
    const finalObtained = oldParts && oldParts.length > 0 ? Math.min(max, q(newIntro + finalBody + newConcl + newPres)) : validated;

    const updatedResult: EvaluationResult = {
      ...evalResult,
      total_marks: {
        ...evalResult.total_marks,
        obtained: finalObtained
      },
      rubric_breakdown: {
        ...currentRb,
        introduction: {
          ...currentRb?.introduction,
          score: newIntro,
          max_score: introMax,
          feedback: currentRb?.introduction?.feedback || 'भूमिका का मूल्यांकन'
        },
        main_body: {
          ...currentRb?.main_body,
          score: finalBody,
          max_score: bodyMax,
          parts: scaledParts,
          matched_points: currentRb?.main_body?.matched_points || [],
          missing_points: currentRb?.main_body?.missing_points || [],
          presentation_feedback: currentRb?.main_body?.presentation_feedback || currentDist.presentation.formatAndFlow
        },
        conclusion: {
          ...currentRb?.conclusion,
          score: newConcl,
          max_score: conclMax,
          feedback: currentRb?.conclusion?.feedback || 'निष्कर्ष का मूल्यांकन'
        },
        presentation: {
          ...currentRb?.presentation,
          score: newPres,
          max_score: presMax,
          format_and_flow: currentDist.presentation.formatAndFlow,
          diagram_scope: currentDist.presentation.diagramScope,
          legibility_and_spacing: currentDist.presentation.legibilityAndSpacing,
          feedback: currentDist.presentation.feedback
        }
      }
    };

    setEvalResult(updatedResult);

    if (activeBatchReviewItem) {
      localforage.getItem('upsc_mains_batch_vault').then((savedBatch: any) => {
        if (savedBatch && Array.isArray(savedBatch)) {
          const updated = savedBatch.map((b: BatchItem) => {
            if (b.id === activeBatchReviewItem.id) {
              return {
                ...b,
                evalResult: updatedResult,
                progressText: `समीक्षा संपन्न (${finalObtained}/${max})`
              };
            }
            return b;
          });
          localforage.setItem('upsc_mains_batch_vault', updated).catch(e => console.error(e));
        }
      });
    }
  };

  const handleUpdateWordCount = (newTotal: number) => {
    if (!evalResult) return;
    const target = evalResult.word_count?.target_words || (maxMarks >= 15 ? 250 : 150);
    const validTotal = Math.max(0, newTotal);
    const deviation = (validTotal - target) / target;
    const status: 'within_limit' | 'under_limit' | 'over_limit' = 
      Math.abs(deviation) <= 0.12 ? 'within_limit' : (deviation < 0 ? 'under_limit' : 'over_limit');

    const currentComment = evalResult.word_count?.comment;
    const comment = status === 'within_limit'
      ? `शब्द सीमा (${target} शब्द) के पूर्णतः अनुकूल एवं संतुलित उत्तर।`
      : (status === 'under_limit' ? `उत्तर थोड़ा संक्षिप्त है (${target} शब्द अपेक्षित)। मुख्य भाग में और बिंदु जोड़ें।` : `शब्द सीमा (${target} शब्द) से अधिक विस्तार है। मुख्य बिंदुओं को सारगर्भित रखें।`);

    setEvalResult({
      ...evalResult,
      word_count: {
        total_words: validTotal,
        target_words: target,
        status,
        breakdown: {
          intro_words: Math.round(validTotal * 0.15),
          body_words: Math.round(validTotal * 0.70),
          conclusion_words: Math.round(validTotal * 0.15)
        },
        comment: currentComment || comment
      }
    });
  };

  /** 1-Click WhatsApp Share: copies complete formatted text and opens WhatsApp */
  const handleShareWhatsApp = () => {
    if (!evalResult) return;
    const text = generateWhatsAppReportText(evalResult, studentName, platformPolicy);

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }

    const encoded = encodeURIComponent(text);
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encoded}`;

    try {
      const win = window.open(whatsappUrl, "_blank");
      if (win) {
        showToast("✓ WhatsApp खुल रहा है व पूरी रिपोर्ट क्लिपबोर्ड पर भी कॉपी हो गई!");
      } else {
        showToast("✓ पूरी रिपोर्ट क्लिपबोर्ड पर कॉपी हो गई! WhatsApp चैट में पेस्ट (Ctrl+V) करें।");
      }
    } catch {
      showToast("✓ पूरी रिपोर्ट क्लिपबोर्ड पर कॉपी हो गई! WhatsApp चैट में पेस्ट (Ctrl+V) करें।");
    }
  };

  /** 1-Click Copy full audit report text */
  const handleCopyAuditText = () => {
    if (!evalResult) return;
    const text = generateWhatsAppReportText(evalResult, studentName, platformPolicy);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast("✓ संपूर्ण अंक विभाजन ऑडिट रिपोर्ट क्लिपबोर्ड पर कॉपी हो गई!");
      }).catch(() => {
        showToast("कॉपी करने में असमर्थ, कृपया पुनः प्रयास करें।");
      });
    }
  };

  const exportEvaluationToPDF = async (
    targetResult: EvaluationResult,
    targetPages: UploadedPage[],
    targetStudentName: string,
    targetOriginalFileName?: string,
    onProgress?: (percent: number) => void
  ) => {
    await exportEvaluationPagesToPDF({
      targetResult,
      targetPages,
      targetStudentName,
      targetOriginalFileName,
      annotationFont: targetResult?.annotation_font || annotationFont,
      branding: platformPolicy,
      onProgress,
      showToast,
      setErrorMessage
    });
  };

  const handleSaveToLearningLogs = () => {
    if (!evalResult || !originalEvalResult) {
      showToast('लर्निंग डेटाबेस में सुरक्षित करने के लिए कोई सक्रिय मूल्यांकन नहीं है।');
      return;
    }
    const newLog = {
       id: `log-${Date.now()}`,
       timestamp: new Date().toISOString(),
       studentName: studentName || 'Unknown Student',
       originalEval: originalEvalResult,
       correctedEval: evalResult
    };
    const updatedLogs = [newLog, ...learningLogs];
    setLearningLogs(updatedLogs);
    localStorage.setItem('upsc_learning_logs', JSON.stringify(updatedLogs));
    showToast('🧠 मूल्यांकन परिवर्तन AI लर्निंग डेटाबेस में सुरक्षित कर लिया गया है!');
    if (cloudUser) {
      saveLearningLogToCloud(cloudUser.uid, newLog).catch((e) =>
        console.warn('Cloud learning log sync error:', e)
      );
    }
  };

  const handleClearLearningLogs = () => {
    setLearningLogs([]);
    localStorage.removeItem('upsc_learning_logs');
    showToast('लर्निंग डेटाबेस क्लियर कर दिया गया है।');
  };

  const handleDeleteLearningLog = (id: string) => {
    const updated = learningLogs.filter(l => l.id !== id);
    setLearningLogs(updated);
    localStorage.setItem('upsc_learning_logs', JSON.stringify(updated));
    if (cloudUser) {
      deleteLearningLogFromCloud(cloudUser.uid, id).catch((e) =>
        console.warn('Cloud learning log delete error:', e)
      );
    }
  };


  const handleExportPDF = async () => {
    if (!evalResult) return;
    setIsProcessingPdf(true);
    setPdfProcessingProgress(15);
    
    try {
      await exportEvaluationToPDF(
        evalResult,
        uploadedPages,
        studentName,
        originalFileName,
        (progress) => setPdfProcessingProgress(progress)
      );
    } finally {
      setTimeout(() => {
        setIsProcessingPdf(false);
        setPdfProcessingProgress(0);
      }, 500);
    }
  };

  const handleDownloadHistoryItem = async (entry: HistoryEntry) => {
    if (!entry.evalResult || !entry.uploadedPages || entry.uploadedPages.length === 0) {
      showToast("डाउनलोड के लिए पृष्ठ डेटा उपलब्ध नहीं है।");
      return;
    }
    setDownloadingHistoryId(entry.id);
    try {
      const safeName =
        entry.studentName && entry.studentName !== 'undefined' && entry.studentName !== 'null' && entry.studentName.trim()
          ? entry.studentName.trim()
          : '';
      await exportEvaluationToPDF(
        entry.evalResult,
        entry.uploadedPages,
        safeName,
        safeName ? `${safeName}_evaluated.pdf` : `evaluated_copy_${new Date().toISOString().slice(0, 10)}.pdf`
      );
    } finally {
      setDownloadingHistoryId(null);
    }
  };

  // Generate smart suggestions for margin annotations
  const getAutoSuggestions = () => {
    if (!evalResult) return [];
    const suggestions: string[] = [];
    
    // 1. From Page Content Summary
    const pageData = evalResult.pages.find(p => p.page_number === selectedPageNum);
    if (pageData && pageData.detected_content_summary) {
      const summaryLower = pageData.detected_content_summary.toLowerCase();
      if (summaryLower.includes('paragraph') || summaryLower.includes('पैराग्राफ') || summaryLower.includes('long')) {
         suggestions.push('लंबे पैराग्राफ की जगह छोटे बुलेट पॉइंट्स का प्रयोग करें।');
      }
      if (summaryLower.includes('diagram') || summaryLower.includes('चित्र') || summaryLower.includes('flowchart')) {
         suggestions.push('आरेख एवं फ्लोचार्ट का प्रासंगिक प्रयोग।');
      } else {
         suggestions.push('यहाँ एक फ्लोचार्ट या आरेख बनाया जा सकता था।');
      }
      if (summaryLower.includes('example') || summaryLower.includes('उदाहरण')) {
         suggestions.push('सटीक एवं समकालीन उदाहरण दिया गया है।');
      } else {
         suggestions.push('इस बिंदु को स्पष्ट करने के लिए समकालीन उदाहरण जोड़ें।');
      }
    }

    // 2. From Rubric Breakdown Feedbacks
    if (evalResult.rubric_breakdown) {
      const { main_body, introduction, conclusion } = evalResult.rubric_breakdown;
      if (introduction && introduction.score < (introduction.max_score || 2.0) * 0.6) {
         suggestions.push('भूमिका को अधिक सटीक और विषय-केंद्रित बनाएं।');
      }
      if (main_body && main_body.score < (main_body.max_score || 6.0) * 0.6) {
         suggestions.push('उत्तर के प्रस्तुतीकरण व संरचना में सुधार की आवश्यकता है।');
      }
      if (conclusion && conclusion.score < (conclusion.max_score || 2.0) * 0.6) {
         suggestions.push('निष्कर्ष में आगे की राह शामिल करें।');
      }
    }

    // 3. Contextual Defaults based on Y position
    if (customAnnotationY < 25) {
      suggestions.push('भूमिका को अधिक सटीक और विषय-केंद्रित बनाएं।');
    } else if (customAnnotationY > 75) {
      suggestions.push('निष्कर्ष में आगे की राह शामिल करें।');
    } else {
      suggestions.push('मुख्य मांग से जुड़ा प्रासंगिक बिंदु।');
      suggestions.push('अप्रासंगिक विवरण, मुख्य मांग से भटकाव।');
      suggestions.push('इस बिंदु को और अधिक विस्तार से समझाएं।');
    }

    return Array.from(new Set(suggestions)).slice(0, 5);
  };

  if (showEdTechLoginScreen && !cloudUser) {
    return (
      <EdTechLoginScreen
        onGoogleLogin={handleCloudSignIn}
        isSigningIn={isCloudSyncing}
        errorMessage={cloudSyncError}
        platformPolicy={platformPolicy}
      />
    );
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#fcfbfa] font-sans antialiased selection:bg-orange-100 flex flex-col">
      {/* PREMIUM EDTECH BRANDED HEADER */}
      <AppHeader
        isEffectiveStudentView={isEffectiveStudentView}
        isOwnerAccount={isOwnerAccount}
        evaluationMode={evaluationMode}
        setEvaluationMode={setEvaluationMode}
        onOpenSingleEvaluation={handleOpenSingleEvaluation}
        evalResult={evalResult}
        showHistory={showHistory}
        setShowHistory={setShowHistory}
        historyCount={history.length}
        selectedModels={selectedModels}
        setShowModelSettings={setShowModelSettings}
        setShowLearningDatabase={setShowLearningDatabase}
        setShowOwnerAdminModal={setShowOwnerAdminModal}
        setShowCloudSyncModal={setShowCloudSyncModal}
        cloudUser={cloudUser}
        isCloudSyncing={isCloudSyncing}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleTheme}
        studentProfile={studentProfile}
        platformPolicy={platformPolicy}
        onSwitchGoogleAccount={handleSwitchGoogleAccount}
        onCloudSignOut={handleCloudSignOut}
        setShowEdTechLoginScreen={setShowEdTechLoginScreen}
        onStudentProfileUpdated={(updatedProf) => setStudentProfile(updatedProf)}
        onPolicyUpdated={(newPol) => setPlatformPolicy(newPol)}
        isStudentPreviewMode={isStudentPreviewMode}
        onToggleStudentPreviewMode={() => {
          setIsStudentPreviewMode((prev) => !prev);
          setEvaluationMode('single');
        }}
        onOpenProgressCard={() => setShowProgressCardModal(true)}
        onOpenQuotaUpgrade={() => setShowQuotaUpgradeModal(true)}
        showToast={showToast}
      />

      {/* MAIN LAYOUT */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-3.5 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 flex flex-col gap-5 sm:gap-6">
        {/* Owner Student-Preview Return Strip (Shown ONLY when Owner is previewing Student View) */}
        {isStudentPreviewMode && isOwnerAccount && (
          <div className="bg-indigo-950 text-white px-4 py-2.5 rounded-xl shadow-sm border border-indigo-500/30 flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-indigo-200">
              👁️ आप अभी <strong>Student Portal Preview Mode</strong> देख रहे हैं (छात्रों को पोर्टल ऐसा दिखेगा)।
            </span>
            <button
              onClick={() => setIsStudentPreviewMode(false)}
              className="px-3 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black cursor-pointer shrink-0"
            >
              👑 Owner Mode में वापस जाएं
            </button>
          </div>
        )}

        {/* Owner Inspecting a Student's Copy Override Banner */}
        {inspectedStudentRecord && isOwnerAccount && (
          <div className="bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-lg border-2 border-amber-400 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <p className="text-sm font-extrabold text-amber-300">
                  👑 ओनर समीक्षा एवं अंक संशोधन मोड: {inspectedStudentRecord.student.displayName} ({inspectedStudentRecord.student.email})
                </p>
                <p className="text-xs text-slate-300">
                  आप इस छात्र के अंक या लाल पेन टिप्पणियों में जो भी बदलाव करेंगे, उन्हें सीधे छात्र के क्लाउड अकाउंट में सेव कर सकते हैं।
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveOwnerOverrideToStudent}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>छात्र के अकाउंट में सुधार सेव करें</span>
              </button>
              <button
                onClick={() => setInspectedStudentRecord(null)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-600 cursor-pointer"
              >
                बंद करें
              </button>
            </div>
          </div>
        )}
        
        {/* Active Batch Review Return Banner */}
        {activeBatchReviewItem && (
          <div className="bg-amber-50 text-amber-900 px-5 py-3 rounded-xl font-bold flex flex-wrap justify-between items-center shadow-sm border border-amber-200/80 backdrop-blur-sm">
            <div className="flex items-center gap-2.5">
              <div className="bg-amber-100 p-1.5 rounded-lg border border-amber-200">
                <Layers className="w-5 h-5 text-amber-600" />
              </div>
              <span className="text-sm">
                बंच कॉपी समीक्षा सक्रिय: <span className="font-extrabold underline decoration-amber-400 decoration-2 underline-offset-2">{activeBatchReviewItem.studentName}</span> (फाइल: {activeBatchReviewItem.fileName})
              </span>
            </div>
            <button
              onClick={handleReturnToBatch}
              className="bg-white hover:bg-amber-100 text-amber-700 border border-amber-300 px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <RotateCcw className="w-4 h-4" />
              <span>सहेजें एवं बंच सूची पर लौटें</span>
            </button>
          </div>
        )}

        {/* 30-Second Auto-Save Restore Draft Banner */}
        {pendingRestoreSession && !evalResult && (
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-2 border-emerald-500 rounded-xl p-4 text-white shadow-xl flex flex-wrap items-center justify-between gap-4 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/20 border border-emerald-400/50 rounded-lg text-emerald-400">
                <Save className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                  <span>अपूर्ण मूल्यांकन सत्र मिला (Auto-Saved Draft Available)</span>
                  <span className="text-[10px] bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 px-2 py-0.5 rounded-full font-mono">
                    {pendingRestoreSession.timestamp ? new Date(pendingRestoreSession.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'सुरक्षित'}
                  </span>
                </h4>
                <p className="text-xs text-slate-300 mt-1">
                  {pendingRestoreSession.studentName ? `विद्यार्थी: ${pendingRestoreSession.studentName} | ` : ''}
                  {pendingRestoreSession.uploadedPages?.length || 0} पृष्ठ
                  {pendingRestoreSession.evalResult?.total_marks ? ` | प्राप्तांक: ${pendingRestoreSession.evalResult.total_marks.obtained}/${pendingRestoreSession.evalResult.total_marks.max_marks}` : ''}
                  {' — पिछला मूल्यांकन सत्र localForage में स्वतः सुरक्षित था, आप इसे तुरंत बहाल कर सकते हैं।'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRestoreAutoSave}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow-md transition-all hover:scale-105 flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>सत्र बहाल करें (Restore Draft)</span>
              </button>
              <button
                type="button"
                onClick={handleDiscardAutoSave}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-600 transition-colors cursor-pointer"
              >
                <span>खारिज करें</span>
              </button>
            </div>
          </div>
        )}

        {evaluationMode === 'batch' ? (
          <BatchEvaluationView
            onReviewCopy={handleReviewBatchCopy}
            onBackToSingle={handleOpenSingleEvaluation}
            sharedModelAnswer={modelAnswer}
            setSharedModelAnswer={setModelAnswer}
            sharedMaxMarks={maxMarks}
            setSharedMaxMarks={setMaxMarks}
            sharedRubricRules={rubricRules}
            setSharedRubricRules={setRubricRules}
            isDarkMode={isDarkMode}
            showToast={showToast}
            activeSystemPrompt={(promptSlots.find(s => s.id === activeSlotId)?.content && promptSlots.find(s => s.id === activeSlotId)!.content.trim() !== '') ? promptSlots.find(s => s.id === activeSlotId)!.content : UPSC_PROMPT_PRESETS[(activeSlotId || 1) - 1]?.content}
            activeSlotId={activeSlotId}
            activeSlotName={promptSlots.find(s => s.id === activeSlotId)?.name || `Slot ${activeSlotId}`}
            selectedModels={selectedModels}
            evaluationSettings={{
              evaluationStrictness,
              feedbackDetailLevel,
              valueAdditionFocus,
              ocrSensitivity,
              temperature: modelTemperature,
              feedbackLanguage
            }}
            onLogPerformance={(model, latencyMs) => {
              if (isPerfTrackingEnabled) {
                console.log(`[Perf Tracking] Batch Evaluation | Model: ${model} | Latency: ${latencyMs}ms`);
                setPerfLogs(prev => [{
                  id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                  model,
                  latencyMs,
                  mode: 'batch',
                  timestamp: new Date()
                }, ...prev]);
              }
            }}
          />
        ) : evaluationState === 'idle' || evaluationState === 'evaluating' ? (
          <div className="w-full max-w-5xl mx-auto flex flex-col gap-5 sm:gap-6">
            {/* SUCCESS TOAST PANEL */}
            {successMessage && (
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl shadow-2xs animate-fade-in">
                <div className="flex items-start gap-3">
                  <span className="text-emerald-600 text-lg font-bold">✓</span>
                  <div>
                    <p className="text-xs text-emerald-800 font-medium leading-relaxed">{successMessage}</p>
                  </div>
                </div>
              </div>
            )}

            {/* ERROR STATUS PANEL */}
            {errorMessage && (
              <div className="bg-red-50 border border-red-200 p-4 rounded-xl shadow-2xs">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-red-800">मूल्यांकन प्रक्रिया अवरुद्ध</h4>
                    <p className="text-xs text-red-700 mt-1 leading-relaxed">{errorMessage}</p>
                  </div>
                </div>
              </div>
            )}

            {evaluationState === 'evaluating' ? (
              <SmartLoadingState instituteName={platformPolicy.instituteName} />
            ) : (
              <EvaluationSetupStudio
                isEffectiveStudentView={isEffectiveStudentView}
                isOwnerAccount={isOwnerAccount}
                activeSlotId={activeSlotId}
                promptSlots={promptSlots}
                onSelectSlot={handleSelectSlot}
                onOpenSystemPromptSettings={() => {
                  fetchSystemPrompt();
                  setShowSystemPromptSettings(true);
                }}
                studentProfile={studentProfile}
                onOpenHistory={() => setShowHistory(true)}
                cloudUser={cloudUser}
                studentName={studentName}
                setStudentName={setStudentName}
                maxMarks={maxMarks}
                setMaxMarks={setMaxMarks}
                subject={subject}
                setSubject={setSubject}
                modelAnswer={modelAnswer}
                setModelAnswer={setModelAnswer}
                modelAnswerFileInputRef={modelAnswerFileInputRef}
                onModelAnswerFileUpload={handleModelAnswerFileUpload}
                isExtractingText={isExtractingText}
                uploadedPages={uploadedPages}
                onClearUploadedFiles={clearUploadedFiles}
                onTriggerFileInput={triggerFileInput}
                onClipboardPaste={handleClipboardPaste}
                showTextAnswerInput={showTextAnswerInput}
                setShowTextAnswerInput={setShowTextAnswerInput}
                fileInputRef={fileInputRef}
                onFileChange={handleFileChange}
                textAnswerInput={textAnswerInput}
                setTextAnswerInput={setTextAnswerInput}
                onProcessTextAsPages={processTextAsPages}
                isProcessingPdf={isProcessingPdf}
                pdfProcessingProgress={pdfProcessingProgress}
                draggedThumbnailIndex={draggedThumbnailIndex}
                setDraggedThumbnailIndex={setDraggedThumbnailIndex}
                dragOverThumbnailIndex={dragOverThumbnailIndex}
                setDragOverThumbnailIndex={setDragOverThumbnailIndex}
                onThumbnailDrop={handleThumbnailDrop}
                onMoveUploadedPage={moveUploadedPage}
                onRotateUploadedPage={rotateUploadedPage}
                onDeleteUploadedPage={deleteUploadedPage}
                onStartEvaluation={handleStartEvaluation}
                evaluationState={evaluationState}
                maxAllowedPages={maxAllowedPagesForCurrentMarks}
                allowStudentUploads={platformPolicy.allowStudentUploads}
                platformBanner={platformPolicy.platformBanner}
                instituteName={platformPolicy.instituteName}
                onOpenQuotaUpgrade={() => setShowQuotaUpgradeModal(true)}
                onOpenProgressCard={() => setShowProgressCardModal(true)}
                evaluationThinkingLevel={evaluationThinkingLevel}
                onSelectThinkingLevel={(level) => {
                  setEvaluationThinkingLevel(level);
                  localStorage.setItem('upsc_evaluation_thinking_level', level);
                  showToast(`✓ AI थिंकिंग स्तर '${getThinkingLevelInfo(level).label}' सक्रिय किया गया!`);
                }}
                selectedModels={selectedModels}
                onOpenModelSettings={() => setShowModelSettings(true)}
              />
            )}
      </div>
    ) : evalResult ? (
          <div className={`w-full ${isZenMode ? 'fixed inset-0 z-50 bg-slate-950 overflow-y-auto p-3 sm:p-6 text-slate-100 flex flex-col gap-4' : 'max-w-7xl mx-auto flex flex-col gap-6 animate-fade-in'}`}>
            {/* ZEN FOCUS MODE FLOATING AUDIT BAR */}
            {isZenMode && (
              <div className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-md border border-amber-500/60 p-3 rounded-xl shadow-2xl flex flex-wrap items-center justify-between gap-3 text-white">
                <div className="flex items-center gap-2.5">
                  <span className="px-2.5 py-1 rounded-md bg-amber-500 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-sm">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>ZEN FOCUS MODE</span>
                  </span>
                  <span className="text-xs font-bold text-slate-200">
                    उत्तर-पुस्तिका • {uploadedPages.length} पृष्ठ
                  </span>
                </div>

                {/* Quick Touch Stepper for Marks (Owner Only) vs Locked Score for Student */}
                {!isEffectiveStudentView && isOwnerAccount ? (
                  <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 px-2 py-1 rounded-lg">
                    <span className="text-xs font-bold text-slate-300 mr-1 hidden sm:inline">त्वरित अंक:</span>
                    <button
                      type="button"
                      onClick={() => handleEditObtainedMarks(evalResult.total_marks.obtained - 1.0)}
                      className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded text-xs font-bold transition-colors cursor-pointer"
                      title="-1.0 अंक"
                    >
                      -1.0
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditObtainedMarks(evalResult.total_marks.obtained - 0.5)}
                      className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded text-xs font-bold transition-colors cursor-pointer"
                      title="-0.5 अंक"
                    >
                      -0.5
                    </button>
                    <div className="px-2.5 py-0.5 bg-amber-500 text-slate-950 rounded font-black text-sm min-w-[55px] text-center font-serif">
                      {evalResult.total_marks.obtained} <span className="text-[10px] text-slate-900 font-sans">/ {evalResult.total_marks.max_marks}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleEditObtainedMarks(evalResult.total_marks.obtained + 0.5)}
                      className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded text-xs font-bold transition-colors cursor-pointer"
                      title="+0.5 अंक"
                    >
                      +0.5
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditObtainedMarks(evalResult.total_marks.obtained + 1.0)}
                      className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded text-xs font-bold transition-colors cursor-pointer"
                      title="+1.0 अंक"
                    >
                      +1.0
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 px-3 py-1 rounded-lg">
                    <span className="text-xs font-bold text-slate-300">प्राप्तांक:</span>
                    <div className="px-2.5 py-0.5 bg-amber-500 text-slate-950 rounded font-black text-sm font-serif">
                      {evalResult.total_marks.obtained} <span className="text-[10px] text-slate-900 font-sans">/ {evalResult.total_marks.max_marks}</span>
                    </div>
                  </div>
                )}

                {/* Quick Actions in Zen Bar */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Zoom Controls */}
                  <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 px-2 py-1 rounded-lg text-xs font-bold">
                    <button 
                      type="button"
                      onClick={() => setZoomLevel(Math.max(50, zoomLevel - 10))}
                      className="p-0.5 hover:text-amber-400 cursor-pointer"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-mono text-[11px] min-w-[34px] text-center text-amber-300">{zoomLevel}%</span>
                    <button 
                      type="button"
                      onClick={() => setZoomLevel(Math.min(150, zoomLevel + 10))}
                      className="p-0.5 hover:text-amber-400 cursor-pointer"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Toggle Comments Sidebar in Zen Mode */}
                  <button
                    type="button"
                    onClick={() => setZenShowCommentsPanel(!zenShowCommentsPanel)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                      zenShowCommentsPanel 
                        ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-amber-500/50' 
                        : 'bg-slate-800/60 hover:bg-slate-700 text-slate-400 border-slate-700'
                    }`}
                    title={zenShowCommentsPanel ? 'टिप्पणी सूची छुपाएं (100% फुल स्क्रीन कॉपी फोकस)' : 'टिप्पणी सूची दिखाएं'}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{zenShowCommentsPanel ? 'टिप्पणियां: खुली' : 'टिप्पणियां: बंद'}</span>
                  </button>

                  {uploadedPages.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setIsDualPageView(!isDualPageView)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                        isDualPageView 
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold shadow-sm' 
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                      }`}
                      title="डुअल पेज स्प्लिट व्यू चालू/बंद करें"
                    >
                      <Columns className="w-3.5 h-3.5" />
                      <span>{isDualPageView ? 'एकल दृश्य' : 'डुअल स्प्लिट'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsZenMode(false)}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md transition-transform hover:scale-105 cursor-pointer"
                    title="पूर्ण स्क्रीन ज़ेन मोड से बाहर निकलें (ESC)"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span>सामान्य दृश्य (ESC)</span>
                  </button>
                </div>
              </div>
            )}
            {/* SUCCESS TOAST PANEL */}
            {successMessage && (
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl shadow-2xs animate-fade-in">
                <div className="flex items-start gap-3">
                  <span className="text-emerald-600 text-lg font-bold">✓</span>
                  <div>
                    <p className="text-xs text-emerald-800 font-medium leading-relaxed">{successMessage}</p>
                  </div>
                </div>
              </div>
            )}

            {/* ERROR STATUS PANEL */}
            {errorMessage && (
              <div className="bg-red-50 border border-red-200 p-4 rounded-xl shadow-2xs">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-red-800">मूल्यांकन प्रक्रिया अवरुद्ध</h4>
                    <p className="text-xs text-red-700 mt-1 leading-relaxed">{errorMessage}</p>
                  </div>
                </div>
              </div>
            )}

              {/* 2. ⚡ EXECUTIVE SCORECARD & CONTROL BAR */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-2 border-amber-500 rounded-xl p-4 shadow-lg text-white flex flex-col gap-3">
                {/* Row 1: Candidate Info & Compact Telemetry Strip */}
                <div className="flex flex-wrap justify-between items-center gap-2.5 border-b border-slate-700/80 pb-2.5">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="bg-amber-500 text-slate-950 p-1.5 rounded-lg font-extrabold flex items-center justify-center shrink-0">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs sm:text-sm text-slate-300">
                      <span className="text-sm sm:text-base font-extrabold text-white">
                        {cleanCandidateName(studentName)}
                      </span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="font-semibold text-amber-300">
                        {subject?.split(':')[0] || 'GS'}
                      </span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="font-medium">
                        {uploadedPages.length} पृष्ठ
                      </span>
                    </div>
                  </div>

                  {/* Right Side: Owner Telemetry Pills (Clean & Compact) */}
                  {!isEffectiveStudentView && isOwnerAccount ? (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Slot Badge */}
                      <div
                        className="text-[10px] bg-amber-500/20 text-amber-200 border border-amber-400/40 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5"
                        title="इस मूल्यांकन में लागू प्रॉम्प्ट स्लॉट"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                        <span className="text-white font-extrabold max-w-[130px] truncate">
                          {evalResult.applied_slot?.name ||
                            promptSlots.find((s) => s.id === activeSlotId)?.name ||
                            `स्लॉट ${activeSlotId}`}
                        </span>
                      </div>

                      {/* Combined Model + Token Audit Pill */}
                      {(() => {
                        const pTok = evalResult.token_usage?.prompt_tokens ?? 0;
                        const cTok = evalResult.token_usage?.completion_tokens ?? 0;
                        const totTok =
                          evalResult.token_usage?.total_tokens ??
                          (evalResult.word_count?.total_words ? evalResult.word_count.total_words * 12 : 1940);
                        const cachedTok = evalResult.token_usage?.cached_tokens ?? 0;
                        const thinkTok =
                          evalResult.token_usage?.thinking_tokens !== undefined
                            ? evalResult.token_usage.thinking_tokens
                            : Math.max(0, totTok - (pTok + cTok));

                        return (
                          <button
                            type="button"
                            onClick={() => {
                              setAuditEntryToInspect(evalResult);
                              setShowModelAuditModal(true);
                            }}
                            className="text-[10px] bg-slate-800/90 hover:bg-slate-700 text-cyan-200 border border-slate-600 hover:border-cyan-400 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                            title={`मॉडल: ${evalResult.model_used || 'gemini-4-hydrogen'} | Thinking: ${String(evalResult.thinking_level_used || evaluationThinkingLevel).toUpperCase()} | कुल टोकन: ${totTok.toLocaleString()} (In: ${pTok.toLocaleString()}, Out: ${cTok.toLocaleString()}, Think: ${thinkTok.toLocaleString()}) — पूर्ण ऑडिट देखने हेतु क्लिक करें`}
                          >
                            <Cpu className="w-3 h-3 text-purple-400" />
                            <span className="font-mono text-purple-200 font-extrabold">
                              {(evalResult.model_used || 'gemini-4-hydrogen').replace('gemini-', '')}
                            </span>
                            {evalResult.fallback_occurred && (
                              <span className="text-amber-300 font-extrabold">(फॉलबैक)</span>
                            )}
                            <span className="text-slate-500">•</span>
                            <Brain className="w-3 h-3 text-amber-400" />
                            <span className="font-mono text-amber-300 font-extrabold uppercase">
                              {String(evalResult.thinking_level_used || evaluationThinkingLevel)}
                            </span>
                            <span className="text-slate-500">•</span>
                            <Coins className="w-3 h-3 text-cyan-400" />
                            <span className="font-mono text-cyan-100 font-extrabold">{totTok.toLocaleString()}</span>
                            {showDetailedModelTokens && pTok > 0 && (
                              <span className="text-[9px] text-slate-300 font-mono hidden sm:inline">
                                (In:{pTok.toLocaleString()}/Think:{thinkTok.toLocaleString()}/Out:{cTok.toLocaleString()}
                                {cachedTok > 0 ? `/⚡${cachedTok.toLocaleString()}` : ''})
                              </span>
                            )}
                          </button>
                        );
                      })()}
                    </div>
                  ) : (
                    <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>आधिकारिक मूल्यांकन रिपोर्ट</span>
                    </span>
                  )}
                </div>

                {/* Fallback Banner Notification (Owner Only) */}
                {!isEffectiveStudentView && isOwnerAccount && evalResult.fallback_occurred && showFallbackAlertBanner && (
                  <div className="bg-amber-500/15 border border-amber-500/50 rounded-lg p-2.5 text-xs text-amber-200 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <div>
                        <span className="font-bold text-amber-100">AI मॉडल फॉलबैक सक्रिय:</span>{' '}
                        <span>
                          प्राथमिक मॉडल ({evalResult.primary_model_requested || 'प्राथमिक'}) के स्थान पर सिस्टम ने स्वतः{' '}
                          <strong className="font-mono text-amber-100 font-bold">{evalResult.model_used}</strong> पर स्विच कर 100% मूल्यांकन पूर्ण किया।
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setAuditEntryToInspect(evalResult);
                          setShowModelAuditModal(true);
                        }}
                        className="text-[10px] font-bold bg-amber-500/30 hover:bg-amber-500/50 text-amber-100 border border-amber-400/50 px-2.5 py-1 rounded transition-colors cursor-pointer"
                      >
                        ऑडिट देखें
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowFallbackAlertBanner(false)}
                        className="text-amber-400/70 hover:text-white p-0.5 rounded transition-colors cursor-pointer"
                        title="छुपाएं"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Row 2: Marks Stepper & Streamlined Primary Action Toolbar */}
                <div className="flex flex-wrap justify-between items-center gap-2.5">
                  {/* Left: Marks Control (Owner) or Final Score Badge (Student) */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {!isEffectiveStudentView && isOwnerAccount ? (
                      <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 px-2.5 py-1.5 rounded-lg">
                        <span className="text-xs font-bold text-slate-300 mr-0.5">अंक:</span>
                        <button
                          onClick={() => handleEditObtainedMarks(evalResult.total_marks.obtained - 1.0)}
                          className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-bold transition-colors cursor-pointer"
                          title="-1.0 अंक"
                        >
                          -1.0
                        </button>
                        <button
                          onClick={() => handleEditObtainedMarks(evalResult.total_marks.obtained - 0.5)}
                          className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-bold transition-colors cursor-pointer"
                          title="-0.5 अंक"
                        >
                          -0.5
                        </button>
                        <div className="px-3 py-1 bg-amber-500 text-slate-950 rounded font-black text-sm min-w-[64px] text-center shadow-inner font-serif">
                          {evalResult.total_marks.obtained}{' '}
                          <span className="text-[10px] text-slate-800 font-sans">/ {evalResult.total_marks.max_marks}</span>
                        </div>
                        <button
                          onClick={() => handleEditObtainedMarks(evalResult.total_marks.obtained + 0.5)}
                          className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-bold transition-colors cursor-pointer"
                          title="+0.5 अंक"
                        >
                          +0.5
                        </button>
                        <button
                          onClick={() => handleEditObtainedMarks(evalResult.total_marks.obtained + 1.0)}
                          className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-bold transition-colors cursor-pointer"
                          title="+1.0 अंक"
                        >
                          +1.0
                        </button>
                        <button
                          onClick={handleResetRubric}
                          className="ml-1 p-1.5 bg-slate-700/70 hover:bg-slate-600 text-slate-300 hover:text-white rounded transition-colors cursor-pointer"
                          title="मूल AI मूल्यांकन पर रीसेट करें"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 bg-slate-800/90 border border-amber-500/40 px-3.5 py-1.5 rounded-lg">
                        <span className="text-xs sm:text-sm font-bold text-amber-300">🏆 अंतिम प्राप्तांक:</span>
                        <div className="px-3 py-1 bg-amber-500 text-slate-950 rounded font-black text-sm sm:text-base min-w-[65px] text-center shadow-inner font-serif">
                          {evalResult.total_marks.obtained}{' '}
                          <span className="text-xs text-slate-800 font-sans">/ {evalResult.total_marks.max_marks}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right: Cleanly Grouped Primary Action Buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setShowMarksDistributionModal(true)}
                      className="bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs sm:text-sm px-3 py-2 rounded-lg shadow-xs flex items-center gap-1.5 border border-amber-500/40 cursor-pointer transition-all"
                      title="संपूर्ण 4-स्तंभीय अंक विभाजन एवं विस्तृत रूब्रिक ऑडिट रिपोर्ट खोलें"
                    >
                      <PieChart className="w-4 h-4 text-amber-400" />
                      <span>विस्तृत रिपोर्ट</span>
                    </button>

                    <button
                      onClick={() => setShowModelAnswerDrawer(true)}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs sm:text-sm px-3 py-2 rounded-lg shadow-xs flex items-center gap-1.5 border border-slate-700 cursor-pointer transition-all"
                      title="प्रश्न एवं मॉडल उत्तर की समीक्षा करें"
                    >
                      <BookOpen className="w-4 h-4 text-amber-400" />
                      <span>मॉडल उत्तर</span>
                    </button>

                    {!isEffectiveStudentView && isOwnerAccount && (
                      <>
                        <button
                          onClick={() => setShowEditMetadataDrawer(true)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs sm:text-sm px-3 py-2 rounded-lg shadow-xs flex items-center gap-1.5 border border-slate-700 cursor-pointer transition-all"
                          title="छात्र का नाम, विषय या अधिकतम अंक संपादित करें"
                        >
                          <Sliders className="w-4 h-4 text-blue-400" />
                          <span className="hidden sm:inline">विवरण</span>
                        </button>

                        <button
                          onClick={handleSaveToLearningLogs}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm px-3 py-2 rounded-lg shadow-xs flex items-center gap-1.5 border border-indigo-400 cursor-pointer transition-all"
                          title="संशोधित मूल्यांकन को AI लर्निंग मेमोरी में सेव करें"
                        >
                          <Database className="w-4 h-4 text-indigo-200" />
                          <span className="hidden sm:inline">लर्निंग सेव</span>
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={handleShareWhatsApp}
                      className="bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs sm:text-sm px-3 py-2 rounded-lg shadow-xs flex items-center gap-1.5 border border-emerald-500 cursor-pointer transition-all"
                      title="WhatsApp पर पूरी मूल्यांकन रिपोर्ट शेयर करें"
                    >
                      <span>📲 WhatsApp</span>
                    </button>

                    <button
                      onClick={handleExportPDF}
                      disabled={isProcessingPdf}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs sm:text-sm px-3.5 py-2 rounded-lg shadow-xs flex items-center gap-1.5 border border-emerald-400 cursor-pointer transition-all"
                    >
                      {isProcessingPdf ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>PDF ({pdfProcessingProgress}%)...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          <span>PDF डाउनलोड</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* LIVE 4-PILLAR RUBRIC SCORECARD & BOXED BREAKDOWN */}
                {evalResult && (() => {
                  const marksDist = getMarksDistribution(evalResult);
                  if (!marksDist) return null;

                  const getTagChipDarkClass = (tone?: 'green' | 'amber' | 'red') => {
                    if (tone === 'green') return 'bg-emerald-950/90 text-emerald-300 border-emerald-600/80';
                    if (tone === 'amber') return 'bg-amber-950/90 text-amber-300 border-amber-600/80';
                    return 'bg-rose-950/90 text-rose-300 border-rose-600/80';
                  };

                  return (
                    <div className="w-full bg-slate-950/85 border border-slate-800 rounded-xl p-3 sm:p-4 shadow-inner flex flex-col gap-3.5">
                      {/* 5-Box Score Strip (Total + 4 Pillars with % Badges) & Collapse Toggle */}
                      <div className="flex flex-col gap-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs sm:text-sm font-extrabold text-amber-300">
                              📊 4-स्तंभीय रूब्रिक एवं अंक विभाजन (4-Pillar Rubric Breakdown)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsMarksBreakdownExpanded(!isMarksBreakdownExpanded)}
                            className="text-xs font-bold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                          >
                            {isMarksBreakdownExpanded ? (
                              <>
                                <span>संक्षिप्त करें</span>
                                <ChevronUp className="w-4 h-4 text-amber-400" />
                              </>
                            ) : (
                              <>
                                <span>विस्तार से देखें</span>
                                <ChevronDown className="w-4 h-4 text-amber-400" />
                              </>
                            )}
                          </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                          {/* Total */}
                          <div className="bg-gradient-to-br from-amber-950/60 to-slate-900 border-2 border-amber-500/80 rounded-xl p-2.5 sm:p-3 flex flex-col justify-between col-span-2 sm:col-span-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs sm:text-sm font-extrabold text-amber-200">🏆 कुल प्राप्तांक</span>
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-500/25 text-amber-300 border border-amber-500/40">
                                {marksDist.totalPercent}%
                              </span>
                            </div>
                            <div className="font-mono text-xl sm:text-2xl font-black text-amber-400 mt-1">
                              {formatQuarterMark(evalResult.total_marks.obtained)} <span className="text-sm font-bold text-amber-200/80">/ {formatQuarterMark(evalResult.total_marks.max_marks)}</span>
                            </div>
                          </div>

                          {/* 1. भूमिका */}
                          <div className="bg-blue-950/40 border border-blue-800/80 rounded-xl p-2.5 sm:p-3 flex flex-col justify-between">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs sm:text-sm font-extrabold text-blue-200">🎯 1. भूमिका</span>
                              <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-blue-900/60 text-blue-200">
                                {marksDist.intro.percent}%
                              </span>
                            </div>
                            <div className="font-mono text-lg sm:text-xl font-black text-blue-300 mt-1">
                              {formatQuarterMark(marksDist.intro.score)} <span className="text-xs font-bold text-blue-300/75">/ {formatQuarterMark(marksDist.intro.max)}</span>
                            </div>
                          </div>

                          {/* 2. मुख्य भाग */}
                          <div className="bg-purple-950/40 border border-purple-800/80 rounded-xl p-2.5 sm:p-3 flex flex-col justify-between">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs sm:text-sm font-extrabold text-purple-200">📐 2. मुख्य भाग</span>
                              <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-purple-900/60 text-purple-200">
                                {marksDist.body.percent}%
                              </span>
                            </div>
                            <div className="font-mono text-lg sm:text-xl font-black text-purple-300 mt-1">
                              {formatQuarterMark(marksDist.body.score)} <span className="text-xs font-bold text-purple-300/75">/ {formatQuarterMark(marksDist.body.max)}</span>
                            </div>
                          </div>

                          {/* 3. प्रस्तुतीकरण */}
                          <div className="bg-orange-950/40 border border-orange-800/80 rounded-xl p-2.5 sm:p-3 flex flex-col justify-between">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs sm:text-sm font-extrabold text-orange-200">📊 3. प्रस्तुतीकरण</span>
                              <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-orange-900/60 text-orange-200">
                                {marksDist.presentation.percent}%
                              </span>
                            </div>
                            <div className="font-mono text-lg sm:text-xl font-black text-orange-300 mt-1">
                              {formatQuarterMark(marksDist.presentation.score)} <span className="text-xs font-bold text-orange-300/75">/ {formatQuarterMark(marksDist.presentation.max)}</span>
                            </div>
                          </div>

                          {/* 4. निष्कर्ष */}
                          <div className="bg-emerald-950/40 border border-emerald-800/80 rounded-xl p-2.5 sm:p-3 flex flex-col justify-between">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs sm:text-sm font-extrabold text-emerald-200">✨ 4. निष्कर्ष</span>
                              <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-emerald-900/60 text-emerald-200">
                                {marksDist.conclusion.percent}%
                              </span>
                            </div>
                            <div className="font-mono text-lg sm:text-xl font-black text-emerald-300 mt-1">
                              {formatQuarterMark(marksDist.conclusion.score)} <span className="text-xs font-bold text-emerald-300/75">/ {formatQuarterMark(marksDist.conclusion.max)}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Rich Boxed Sections */}
                      {isMarksBreakdownExpanded && (
                        <div className="flex flex-col gap-3.5 pt-1">
                          {/* Row 1: 2-Column Grid for 1. भूमिका & 4. निष्कर्ष */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                            {/* 1. भूमिका (INTRODUCTION AUDIT) */}
                            <div className="bg-slate-900/95 border border-blue-800/80 rounded-xl overflow-hidden flex flex-col">
                              <div className="px-3.5 py-2.5 bg-blue-950/60 border-b border-blue-900/70 flex items-center justify-between">
                                <span className="text-sm sm:text-base font-extrabold text-blue-200">
                                  🎯 1. भूमिका मूल्यांकन (Introduction)
                                </span>
                                <span className="px-2.5 py-0.5 rounded-md bg-blue-900/80 border border-blue-700 font-mono text-xs sm:text-sm font-extrabold text-blue-200">
                                  {formatQuarterMark(marksDist.intro.score)} / {formatQuarterMark(marksDist.intro.max)} ({marksDist.intro.percent}%)
                                </span>
                              </div>
                              <div className="p-3 sm:p-3.5 space-y-2.5 flex-1">
                                {marksDist.intro.strengths && (
                                  <div className="p-3 rounded-lg bg-emerald-950/35 border border-emerald-800/70 border-l-4 border-l-emerald-500 space-y-1">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <span className="text-xs sm:text-sm font-extrabold text-emerald-300">
                                        ✓ प्रभावी पक्ष:
                                      </span>
                                      {marksDist.intro.strengthsTag && (
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs sm:text-sm font-extrabold border ${getTagChipDarkClass(marksDist.intro.strengthsTone)}`}>
                                          {marksDist.intro.strengthsTag}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm sm:text-base text-slate-100 leading-relaxed font-medium">
                                      {marksDist.intro.strengths}
                                    </p>
                                  </div>
                                )}
                                {marksDist.intro.improvements && (
                                  <div className="p-3 rounded-lg bg-rose-950/35 border border-rose-800/70 border-l-4 border-l-rose-500 space-y-1">
                                    <div className="text-xs sm:text-sm font-extrabold text-rose-300">
                                      ⚠️ सुधार के क्षेत्र:
                                    </div>
                                    <p className="text-sm sm:text-base text-slate-100 leading-relaxed font-medium">
                                      {marksDist.intro.improvements}
                                    </p>
                                  </div>
                                )}
                                {marksDist.intro.idealApproach && (
                                  <div className="p-3 rounded-lg bg-purple-950/40 border border-purple-800/70 border-l-4 border-l-purple-500 space-y-1">
                                    <div className="text-xs sm:text-sm font-extrabold text-purple-300">
                                      💡 आदर्श दृष्टिकोण:
                                    </div>
                                    <p className="text-sm sm:text-base text-slate-100 leading-relaxed font-semibold">
                                      {marksDist.intro.idealApproach}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* 4. निष्कर्ष (CONCLUSION AUDIT) */}
                            <div className="bg-slate-900/95 border border-emerald-800/80 rounded-xl overflow-hidden flex flex-col">
                              <div className="px-3.5 py-2.5 bg-emerald-950/60 border-b border-emerald-900/70 flex items-center justify-between">
                                <span className="text-sm sm:text-base font-extrabold text-emerald-200">
                                  ✨ 4. निष्कर्ष एवं आगे की राह (Conclusion)
                                </span>
                                <span className="px-2.5 py-0.5 rounded-md bg-emerald-900/80 border border-emerald-700 font-mono text-xs sm:text-sm font-extrabold text-emerald-200">
                                  {formatQuarterMark(marksDist.conclusion.score)} / {formatQuarterMark(marksDist.conclusion.max)} ({marksDist.conclusion.percent}%)
                                </span>
                              </div>
                              <div className="p-3 sm:p-3.5 space-y-2.5 flex-1">
                                {marksDist.conclusion.strengths && (
                                  <div className="p-3 rounded-lg bg-emerald-950/35 border border-emerald-800/70 border-l-4 border-l-emerald-500 space-y-1">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <span className="text-xs sm:text-sm font-extrabold text-emerald-300">
                                        ✓ प्रभावी पक्ष:
                                      </span>
                                      {marksDist.conclusion.strengthsTag && (
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs sm:text-sm font-extrabold border ${getTagChipDarkClass(marksDist.conclusion.strengthsTone)}`}>
                                          {marksDist.conclusion.strengthsTag}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm sm:text-base text-slate-100 leading-relaxed font-medium">
                                      {marksDist.conclusion.strengths}
                                    </p>
                                  </div>
                                )}
                                {marksDist.conclusion.improvements && (
                                  <div className="p-3 rounded-lg bg-rose-950/35 border border-rose-800/70 border-l-4 border-l-rose-500 space-y-1">
                                    <div className="text-xs sm:text-sm font-extrabold text-rose-300">
                                      ⚠️ सुधार के क्षेत्र:
                                    </div>
                                    <p className="text-sm sm:text-base text-slate-100 leading-relaxed font-medium">
                                      {marksDist.conclusion.improvements}
                                    </p>
                                  </div>
                                )}
                                {marksDist.conclusion.idealApproach && (
                                  <div className="p-3 rounded-lg bg-purple-950/40 border border-purple-800/70 border-l-4 border-l-purple-500 space-y-1">
                                    <div className="text-xs sm:text-sm font-extrabold text-purple-300">
                                      💡 आदर्श दृष्टिकोण:
                                    </div>
                                    <p className="text-sm sm:text-base text-slate-100 leading-relaxed font-semibold">
                                      {marksDist.conclusion.idealApproach}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Row 2: 2. मुख्य भाग (MAIN BODY AUDIT) */}
                          <div className="bg-slate-900/95 border border-purple-800/80 rounded-xl overflow-hidden">
                            <div className="px-3.5 py-2.5 bg-purple-950/60 border-b border-purple-900/70 flex items-center justify-between">
                              <span className="text-sm sm:text-base font-extrabold text-purple-200">
                                📐 2. मुख्य भाग — प्रश्न की मांग एवं उप-भाग विश्लेषण (Main Body)
                              </span>
                              <span className="px-2.5 py-0.5 rounded-md bg-purple-900/80 border border-purple-700 font-mono text-xs sm:text-sm font-extrabold text-purple-200">
                                {formatQuarterMark(marksDist.body.score)} / {formatQuarterMark(marksDist.body.max)} ({marksDist.body.percent}%)
                              </span>
                            </div>
                            <div className="p-3 sm:p-3.5">
                              {marksDist.body.parts && marksDist.body.parts.length > 0 && (
                                <BodyPartsBreakdown
                                  parts={marksDist.body.parts}
                                  onChange={handleUpdateBodyPart}
                                  directiveWord={evalResult?.question_analysis?.directive_word}
                                  coreDemandMet={evalResult?.question_analysis?.core_demand_met}
                                  coreDemandNote={evalResult?.question_analysis?.core_demand_note}
                                  missingPoints={marksDist.body.missingPoints}
                                  matchedPoints={marksDist.body.matchedPoints}
                                />
                              )}
                            </div>
                          </div>

                          {/* Row 3: 3. प्रस्तुतीकरण एवं संरचना (PRESENTATION & STRUCTURE) */}
                          <div className="bg-slate-900/95 border border-orange-800/80 rounded-xl overflow-hidden">
                            <div className="px-3.5 py-2.5 bg-orange-950/60 border-b border-orange-900/70 flex items-center justify-between">
                              <span className="text-sm sm:text-base font-extrabold text-orange-200">
                                📊 3. प्रस्तुतीकरण एवं संरचना (Presentation & Structure)
                              </span>
                              <span className="px-2.5 py-0.5 rounded-md bg-orange-900/80 border border-orange-700 font-mono text-xs sm:text-sm font-extrabold text-orange-200">
                                {formatQuarterMark(marksDist.presentation.score)} / {formatQuarterMark(marksDist.presentation.max)} ({marksDist.presentation.percent}%)
                              </span>
                            </div>
                            <div className="p-3 sm:p-3.5 grid grid-cols-1 md:grid-cols-2 gap-2.5">
                              {marksDist.presentation.formatAndFlow && (
                                <div className="p-3 rounded-lg bg-orange-950/35 border border-orange-800/70 border-l-4 border-l-orange-500 space-y-1">
                                  <div className="text-xs sm:text-sm font-extrabold text-orange-300">
                                    📐 प्रारूप, उप-शीर्षक एवं प्रवाह (Format & Flow):
                                  </div>
                                  <p className="text-sm sm:text-[15px] text-slate-100 leading-relaxed font-medium">
                                    {marksDist.presentation.formatAndFlow}
                                  </p>
                                </div>
                              )}
                              {marksDist.presentation.legibilityAndSpacing && (
                                <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-700/80 border-l-4 border-l-slate-400 space-y-1">
                                  <div className="text-xs sm:text-sm font-extrabold text-slate-300">
                                    ✍️ पठनीयता एवं प्रस्तुति अनुशासन (Legibility):
                                  </div>
                                  <p className="text-sm sm:text-[15px] text-slate-100 leading-relaxed font-medium">
                                    {marksDist.presentation.legibilityAndSpacing}
                                  </p>
                                </div>
                              )}
                              {marksDist.presentation.diagramScope && (
                                <div className="p-3 rounded-lg bg-blue-950/35 border border-blue-800/70 border-l-4 border-l-blue-500 space-y-1 md:col-span-2">
                                  <div className="text-xs sm:text-sm font-extrabold text-blue-300">
                                    🗺️ आरेख / फ्लोचार्ट / मानचित्र गुंजाइश (Diagram Scope):
                                  </div>
                                  <p className="text-sm sm:text-[15px] text-slate-100 leading-relaxed font-medium">
                                    {marksDist.presentation.diagramScope}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* TAB CONTENT WRAPPER */}
              <div className="flex flex-col gap-5 w-full">
                {/* TAB CONTENT 2: ANSWER SHEET REVIEW PANEL */}
              {true && (
                <div id="review-pane" className="w-full flex flex-col gap-5">
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                    
                    {/* LEFT SPLIT PANEL: UPSC SHEET VIEWER */}
                    <div className={`${!zenShowCommentsPanel && !selectedAnnotationId ? 'xl:col-span-12' : 'xl:col-span-8'} flex flex-col gap-3`}>
                      
                      {/* Horizontal Thumbnail Bar */}
                      <div className="w-full shrink-0 flex flex-row gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-300">
                        {uploadedPages.map((page, idx) => {
                          const pNum = idx + 1;
                          const pageData = evalResult.pages.find(p => p.page_number === pNum);
                          const annCount = pageData?.annotations?.length || 0;
                          const isDragging = draggedThumbnailIndex === idx;
                          const isDragOver = dragOverThumbnailIndex === idx;
                          
                          return (
                          <button
                            key={page.id}
                            draggable={!isEffectiveStudentView && isOwnerAccount}
                            onDragStart={(e) => {
                              if (isEffectiveStudentView || !isOwnerAccount) {
                                e.preventDefault();
                                return;
                              }
                              setDraggedThumbnailIndex(idx);
                              e.dataTransfer.setData('text/plain', idx.toString());
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragOver={(e) => {
                              if (isEffectiveStudentView || !isOwnerAccount) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                              if (dragOverThumbnailIndex !== idx) {
                                setDragOverThumbnailIndex(idx);
                              }
                            }}
                            onDragLeave={(e) => {
                              if (isEffectiveStudentView || !isOwnerAccount) return;
                              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                              if (dragOverThumbnailIndex === idx) {
                                setDragOverThumbnailIndex(null);
                              }
                            }}
                            onDrop={(e) => {
                              if (isEffectiveStudentView || !isOwnerAccount) return;
                              e.preventDefault();
                              const dragIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                              handleThumbnailDrop(dragIdx, idx);
                            }}
                            onDragEnd={() => {
                              setDraggedThumbnailIndex(null);
                              setDragOverThumbnailIndex(null);
                            }}
                            onClick={() => {
                              if (isDualPageView) {
                                if (selectedPageNum === pNum) {
                                  // already primary
                                } else if (secondaryPageNum === pNum) {
                                  setSelectedPageNum(pNum);
                                } else {
                                  setSecondaryPageNum(pNum);
                                  showToast(`दायाँ पृष्ठ: पृष्ठ ${pNum} लोड हुआ`);
                                }
                              } else {
                                setSelectedPageNum(pNum);
                              }
                            }}
                            className={`relative w-20 sm:w-24 border-2 rounded-lg flex-shrink-0 transition-all shadow-sm bg-white overflow-hidden ${!isEffectiveStudentView && isOwnerAccount ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} select-none ${
                              isDragging
                                ? 'opacity-30 scale-95 border-amber-500 border-dashed'
                                : isDragOver
                                  ? 'border-amber-500 ring-4 ring-amber-400/50 scale-105 z-20 shadow-lg'
                                  : selectedPageNum === pNum 
                                    ? 'border-amber-500 ring-2 ring-amber-500/30 shadow-md scale-[1.02] z-10' 
                                    : isDualPageView && secondaryPageNum === pNum
                                      ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-md scale-[1.02] z-10'
                                      : 'border-slate-200 hover:border-amber-400 opacity-60 hover:opacity-100'
                            }`}
                            title={!isEffectiveStudentView && isOwnerAccount ? `पृष्ठ ${pNum}: क्लिक करके देखें या ड्रैग करके क्रम बदलें` : `पृष्ठ ${pNum} देखें`}
                          >
                            <img 
                              src={page.dataUrl.startsWith('MOCK_') ? 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="141"><rect width="100" height="141" fill="%23f1f5f9"/><text x="50" y="70" font-family="sans-serif" font-size="12" fill="%2394a3b8" text-anchor="middle">MOCK</text></svg>' : page.dataUrl} 
                              alt={`Thumbnail ${pNum}`} 
                              draggable={false}
                              className="w-full aspect-[1/1.414] object-contain bg-white pointer-events-none select-none"
                            />
                            {isDragOver && (
                              <div className="absolute inset-0 bg-amber-500/20 backdrop-blur-[1px] flex items-center justify-center border-2 border-amber-500">
                                <span className="bg-amber-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
                                  यहाँ छोड़ें
                                </span>
                              </div>
                            )}
                            <div className={`absolute bottom-0 inset-x-0 text-[10px] font-bold flex justify-center items-center gap-1 py-0.5 ${
                              selectedPageNum === pNum 
                                ? 'bg-amber-500 text-slate-900' 
                                : isDualPageView && secondaryPageNum === pNum
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-800/80 text-white'
                            }`}>
                              <span>
                                {pNum} 
                                {isDualPageView && (selectedPageNum === pNum ? ' (L)' : secondaryPageNum === pNum ? ' (R)' : '')}
                              </span>
                              {annCount > 0 && (
                                <span className={`px-1 rounded-full text-[8px] font-extrabold ${
                                  selectedPageNum === pNum 
                                    ? 'bg-white text-amber-900' 
                                    : isDualPageView && secondaryPageNum === pNum
                                      ? 'bg-white text-blue-900'
                                      : 'bg-amber-500 text-slate-900'
                                }`}>
                                  {annCount}
                                </span>
                              )}
                            </div>
                          </button>
                        )})}
                      </div>

                      {/* Main Viewer & Controls */}
                      <div className="flex-1 flex flex-col gap-3 min-w-0">
                        {(() => {
                          const renderPageCanvas = (pageNum: number, isRightSide: boolean = false) => {
                            const pageIdx = pageNum - 1;
                            const pageData = uploadedPages[pageIdx];
                            const pageAnnotations: Annotation[] = evalResult?.pages.find((p) => p.page_number === pageNum)?.annotations || [];

                            // Dynamic Height-Aware Margin Placement & Anti-Overlap Engine
                            const finalRenderAnns = computeDynamicAnnotationPlacement<Annotation>(pageAnnotations, {
                              maxBottomPercent: 86.5,
                              defaultFontScale: evalResult?.default_font_scale || defaultAnnotationFontScale || 1.0
                            });

                            const targetWidth = isDualPageView 
                              ? `${490 * (zoomLevel / 100)}px` 
                              : `${560 * (zoomLevel / 100)}px`;

                            return (
                              <div 
                                key={`canvas-p-${pageNum}-${isRightSide ? 'R' : 'L'}`}
                                ref={isRightSide ? secondaryCanvasContainerRef : canvasContainerRef}
                                onClick={(e) => handleMarginClick(e, pageNum)}
                                className={`page-canvas-container relative bg-white border border-slate-300 shadow-md aspect-[1/1.414] select-none ${!isEffectiveStudentView && isOwnerAccount ? 'cursor-crosshair' : 'cursor-default'} overflow-hidden origin-top transition-all mx-auto`}
                                style={{ 
                                  width: targetWidth,
                                  maxWidth: '100%',
                                  containerType: 'inline-size'
                                }}
                              >
                                {/* RENDER ACTUAL IMAGE OR HANDWRITTEN CSS RULED PAGE MOCKUP */}
                                {pageData?.dataUrl.startsWith('MOCK_') ? (
                                  <div className="absolute inset-0 pt-16 px-[16%] pb-10 flex flex-col font-serif pointer-events-none bg-white">
                                    <div className="absolute inset-0 flex flex-col justify-between pt-16 pb-10 px-[15%] opacity-30 pointer-events-none">
                                      {Array.from({ length: 28 }).map((_, i) => (
                                        <div key={i} className="border-b border-sky-300 w-full h-0"></div>
                                      ))}
                                    </div>

                                    {pageNum === 1 ? (
                                      <div className="relative z-10 space-y-5 text-xs text-blue-900 leading-6 pl-2">
                                        <p className="font-bold text-sm text-slate-800 border-b border-slate-200 pb-1">
                                          उत्तर १: विकेंद्रीकृत योजना का महत्व
                                        </p>
                                        <p>
                                          विकेंद्रीकृत योजना का मुख्य उद्देश्य सत्ता का हस्तांतरण जमीनी स्तर पर करके जनता की भागीदारी को बढ़ाना है। हमारे देश में 73वें और 74वें संविधान संशोधन के द्वारा पंचायतों और नगरपालिकाओं को एक सुदृढ़ संवैधानिक ढांचा प्रदान किया गया।
                                        </p>
                                        <p className="font-bold text-slate-800">
                                          प्रमुख वित्तीय एवं प्रशासनिक बाधाएं:
                                        </p>
                                        <p className="pl-3">
                                          १. स्थानीय संस्थाओं के पास स्वतंत्र राजस्व जुटाने के स्रोतों का पूर्ण अभाव है, वे मुख्य रूप से राज्य सरकारों से मिलने वाले विवेकाधीन अनुदानों पर ही निर्भर रहती हैं।
                                        </p>
                                        <p className="pl-3">
                                          २. योजना निर्माण में जमीनी आवश्यकताओं के बजाय ऊपर से थोपे गए नौकरशाही मॉडल को वरीयता दी जाती है, जिससे योजनाएं अप्रभावी साबित होती हैं।
                                        </p>
                                        <p className="pl-3">
                                          ३. पंचायती स्तर पर तकनीकी मानव संसाधन और पर्याप्त अवसंरचना का घोर अभाव है, जिससे फंड लैप्स हो जाते हैं।
                                        </p>
                                      </div>
                                    ) : (
                                      <div className="relative z-10 space-y-5 text-xs text-blue-900 leading-6 pl-2">
                                        <p className="font-bold text-slate-800">
                                          {pageNum === uploadedPages.length ? 'निष्कर्ष व सुधारात्मक सुझाव:' : 'प्रशासनिक व नीतिगत सुधारात्मक सुझाव:'}
                                        </p>
                                        <p className="pl-3">
                                          - <b>3Fs (Funds, Functions, Functionaries):</b> राज्य वित्त आयोग की सिफारिशों को समय पर पूर्णतः लागू किया जाए ताकि स्वायत्तता बढ़े।
                                        </p>
                                        <p className="pl-3">
                                          - <b>नागरिक सशक्तिकरण:</b> ग्राम सभा की बैठकों को प्रशासनिक स्तर पर निर्णय लेने हेतु उत्तरदायी बनाकर सुशासन को धरातल पर उतारा जाए।
                                        </p>
                                        <p className="pl-3">
                                          - <b>क्षमता निर्माण:</b> पंचायतों को डिजिटल रूप से साक्षर किया जाए और एक एकीकृत स्थानिक योजना मंच बनाया जाए।
                                        </p>
                                        <p className="italic mt-4 text-slate-600 border-t border-slate-100 pt-3">
                                          निष्कर्षतः, यदि भारत को सुशासन की दिशा में आगे बढ़ना है तो विकेंद्रीकृत शासन को वास्तविक अधिकार सौंपने होंगे।
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <img 
                                    src={pageData?.dataUrl} 
                                    alt={`Answer Copy Page ${pageNum}`} 
                                    className="w-full h-full object-fill pointer-events-none select-none"
                                  />
                                )}

                                {/* RENDER TOTAL MARKS CIRCLE ON FIRST PAGE */}
                                {pageNum === 1 && evalResult && (
                                  <div className="absolute top-3.5 right-3.5 z-30 flex items-center justify-center bg-white/95 border-[3px] border-red-600 rounded-full shadow-lg px-1.5" style={{ width: '13%', aspectRatio: '1/1', minWidth: '68px', maxWidth: '108px' }}>
                                    <span className="text-red-600 font-extrabold font-sans text-center whitespace-nowrap leading-none" style={{ fontSize: 'clamp(12px, 1.85vw, 20px)' }}>
                                      {evalResult.total_marks.obtained} / {evalResult.total_marks.max_marks}
                                    </span>
                                  </div>
                                )}

                                {/* RENDER RED PEN MARGIN ANNOTATIONS */}
                                <AnimatePresence>
                                  {finalRenderAnns.map((ann) => {
                                    const isLeft = ann.isLeft;
                                    const isDragging = draggingAnnId === ann.id;
                                    const isResizing = resizingAnnId === ann.id;
                                    const isSelected = selectedAnnotationId === ann.id && !ann.isStamp && !isEffectiveStudentView && isOwnerAccount;
                                    const currentWidth = ann.width_percent || 13.5;
                                    const effectiveCanvasFont = evalResult?.annotation_font || annotationFont;
                                    const leftPos = ann.isStamp
                                      ? `${ann.x_percent}%`
                                      : isDragging || ann.is_custom_positioned
                                        ? `${Math.max(0.5, Math.min(99 - currentWidth, ann.x_percent))}%`
                                        : isLeft
                                          ? '0.5%'
                                          : `${Math.max(50, 99 - currentWidth)}%`;

                                    return (
                                      <motion.div
                                        key={ann.id}
                                        initial={{ opacity: 0, scale: 0.7 }}
                                        animate={{ 
                                          opacity: isDragging ? 0.75 : 1, 
                                          scale: isDragging ? 1.03 : 1 
                                        }}
                                        exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.16 } }}
                                        transition={{ duration: 0.22, ease: "easeOut" }}
                                        onPointerDown={(e) => handlePointerDown(e, ann)}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (!isEffectiveStudentView && isOwnerAccount) {
                                            setSelectedAnnotationId(ann.id);
                                          }
                                          if (pageNum !== selectedPageNum) {
                                            setSelectedPageNum(pageNum);
                                          }
                                        }}
                                        className={`annotation-active-container group absolute leading-tight ${!isEffectiveStudentView && isOwnerAccount ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'} z-20 ${
                                          ann.isStamp
                                            ? 'border-none p-0 bg-transparent shadow-none text-indigo-700 font-black drop-shadow-md'
                                            : 'p-0.5 rounded text-red-600 bg-transparent border border-transparent'
                                        }`}
                                        style={{
                                          left: leftPos,
                                          top: isDragging || ann.is_custom_positioned ? `${ann.y_percent}%` : `${ann._adjustedY}%`,
                                          transform: 'translateY(-50%)',
                                          width: ann.isStamp ? 'auto' : `${currentWidth}%`,
                                          maxWidth: ann.isStamp ? 'none' : '50%',
                                          minHeight: !ann.isStamp && ann.min_height_px ? `${ann.min_height_px}px` : undefined,
                                          wordBreak: 'break-word',
                                          fontFamily: effectiveCanvasFont === 'mukta'
                                            ? "'Mukta', 'Noto Sans Devanagari', sans-serif"
                                            : "'Kalam', 'Noto Sans Devanagari', cursive, sans-serif",
                                          fontWeight: ann.isStamp ? 900 : ((ann.is_bold ?? defaultAnnotationFormat.is_bold ?? true) ? 700 : 400),
                                          fontStyle: !ann.isStamp && (ann.is_italic ?? defaultAnnotationFormat.is_italic) ? 'italic' : 'normal',
                                          textDecoration: !ann.isStamp && (ann.is_underline ?? defaultAnnotationFormat.is_underline) ? 'underline' : 'none',
                                          touchAction: 'none',
                                          fontSize: ann.isStamp ? '4cqi' : `${1.75 * (ann.font_scale || evalResult.default_font_scale || defaultAnnotationFontScale || 1.0)}cqi`
                                        }}
                                      >
                                        <div className="relative flex flex-col justify-start w-full h-full select-none">
                                          <span>{ann.text}</span>
                                        </div>
                                        
                                        {!ann.isStamp && !isSelected && (
                                          <div 
                                            className={`absolute ${isLeft ? 'left-full ml-2' : 'right-full mr-2'} top-1/2 -translate-y-1/2 z-50 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all bg-slate-900 text-white text-[13px] p-2.5 rounded shadow-xl pointer-events-none w-max max-w-[220px] text-left leading-relaxed font-sans font-medium`}
                                            style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
                                          >
                                            {ann.text}
                                          </div>
                                        )}

                                        {isSelected && (
                                          <>
                                            {isResizing && liveResizeDimensions && (
                                              <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900/95 text-white text-[10px] font-sans font-bold px-2.5 py-0.5 rounded-full shadow-xl whitespace-nowrap z-50 pointer-events-none flex items-center gap-1.5 border border-slate-700 backdrop-blur-sm animate-pulse">
                                                <span className="text-amber-300">↔ {liveResizeDimensions.width.toFixed(1)}% चौड़ाई</span>
                                                <span className="opacity-40">|</span>
                                                <span className="text-blue-300">↕ {Math.round(liveResizeDimensions.height)}px लम्बाई</span>
                                              </div>
                                            )}

                                            <div
                                              onClick={(e) => e.stopPropagation()}
                                              onPointerDown={(e) => e.stopPropagation()}
                                              className={`annotation-quick-toolbar absolute ${ann.y_percent < 22 ? 'top-full mt-2' : 'bottom-full mb-2'} ${isLeft ? 'left-0' : 'right-0'} bg-white text-slate-800 text-[10px] font-sans font-semibold p-1.5 rounded-lg shadow-xl border border-amber-300 flex flex-col gap-1.5 z-40 whitespace-nowrap select-none backdrop-blur-md`}
                                            >
                                              <div className="flex items-center gap-1 w-full">
                                                <input
                                                  type="text"
                                                  value={ann.text}
                                                  onChange={(e) => updateAnnotationCoordinates(ann.id, { text: e.target.value })}
                                                  placeholder="टिप्पणी संपादित करें..."
                                                  className="flex-1 min-w-[175px] px-2 py-0.5 text-[11px] font-medium text-slate-900 bg-amber-50/70 border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500"
                                                  style={{
                                                    fontWeight: (ann.is_bold ?? true) ? 700 : 400,
                                                    fontStyle: ann.is_italic ? 'italic' : 'normal',
                                                    textDecoration: ann.is_underline ? 'underline' : 'none'
                                                  }}
                                                />
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedAnnotationId(null);
                                                    setOpenFormatDropdownId(null);
                                                    showToast('✓ टिप्पणी में किया गया बदलाव छात्र व्यू एवं क्लाउड में सहेजा गया');
                                                  }}
                                                  className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1 shadow-xs active:scale-95 transition-all text-[10px] cursor-pointer"
                                                  title="एडिट पूरा करें और टूल हटाएं (Done / Save & Dismiss)"
                                                >
                                                  <Check className="w-3 h-3 stroke-[3]" />
                                                  <span>सहेजें</span>
                                                </button>
                                              </div>
                                              <div className="flex items-center gap-1 flex-wrap">

                                              {/* Format Dropdown (Bold / Italic / Underline) */}
                                              <div className="relative">
                                                <button
                                                  type="button"
                                                  onClick={() => setOpenFormatDropdownId(prev => prev === ann.id ? null : ann.id)}
                                                  className={`px-1.5 py-0.5 rounded border text-[9px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                                                    openFormatDropdownId === ann.id || (ann.is_italic || ann.is_underline || ann.is_bold === false)
                                                      ? 'bg-indigo-50 border-indigo-300 text-indigo-800'
                                                      : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                                                  }`}
                                                  title="टेक्स्ट फ़ॉर्मेट चुनें: Bold, Italics, या Underline"
                                                >
                                                  <Type className="w-3 h-3 text-indigo-600" />
                                                  <span>Format</span>
                                                  <ChevronDown className="w-2.5 h-2.5" />
                                                </button>
                                                {openFormatDropdownId === ann.id && (
                                                  <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-2xl p-1.5 z-50 min-w-[165px] flex flex-col gap-1">
                                                    <div className="text-[9px] font-bold text-slate-400 uppercase px-1 pb-0.5 border-b border-slate-100">
                                                      टेक्स्ट फ़ॉर्मेट (Format)
                                                    </div>
                                                    <button
                                                      type="button"
                                                      onClick={() => toggleAnnotationFormat(ann.id, 'is_bold')}
                                                      className={`w-full px-2 py-1 rounded text-left text-[10px] flex items-center justify-between cursor-pointer ${
                                                        (ann.is_bold ?? true) ? 'bg-indigo-50 text-indigo-800 font-bold' : 'hover:bg-slate-100 text-slate-700'
                                                      }`}
                                                    >
                                                      <span className="flex items-center gap-1.5">
                                                        <Bold className="w-3 h-3" />
                                                        <span className="font-bold">Bold (बोल्ड)</span>
                                                      </span>
                                                      {(ann.is_bold ?? true) && <Check className="w-3 h-3 text-indigo-600" />}
                                                    </button>
                                                    <button
                                                      type="button"
                                                      onClick={() => toggleAnnotationFormat(ann.id, 'is_italic')}
                                                      className={`w-full px-2 py-1 rounded text-left text-[10px] flex items-center justify-between cursor-pointer ${
                                                        ann.is_italic ? 'bg-indigo-50 text-indigo-800 font-bold' : 'hover:bg-slate-100 text-slate-700'
                                                      }`}
                                                    >
                                                      <span className="flex items-center gap-1.5">
                                                        <Italic className="w-3 h-3" />
                                                        <span className="italic">Italics (तिरछा)</span>
                                                      </span>
                                                      {ann.is_italic && <Check className="w-3 h-3 text-indigo-600" />}
                                                    </button>
                                                    <button
                                                      type="button"
                                                      onClick={() => toggleAnnotationFormat(ann.id, 'is_underline')}
                                                      className={`w-full px-2 py-1 rounded text-left text-[10px] flex items-center justify-between cursor-pointer ${
                                                        ann.is_underline ? 'bg-indigo-50 text-indigo-800 font-bold' : 'hover:bg-slate-100 text-slate-700'
                                                      }`}
                                                    >
                                                      <span className="flex items-center gap-1.5">
                                                        <Underline className="w-3 h-3" />
                                                        <span className="underline">Underline (रेखांकित)</span>
                                                      </span>
                                                      {ann.is_underline && <Check className="w-3 h-3 text-indigo-600" />}
                                                    </button>
                                                    <div className="pt-1 mt-0.5 border-t border-slate-100">
                                                      <button
                                                        type="button"
                                                        onClick={() => {
                                                          applyFormatToAllAnnotations({
                                                            is_bold: ann.is_bold ?? true,
                                                            is_italic: Boolean(ann.is_italic),
                                                            is_underline: Boolean(ann.is_underline)
                                                          });
                                                          setOpenFormatDropdownId(null);
                                                        }}
                                                        className="w-full px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[9px] flex items-center justify-center gap-1 cursor-pointer"
                                                        title="यही फ़ॉर्मेट सभी टिप्पणियों पर लागू व स्थायी करें"
                                                      >
                                                        <Pin className="w-2.5 h-2.5" />
                                                        <span>सब पर लागू व फिक्स करें</span>
                                                      </button>
                                                    </div>
                                                  </div>
                                                )}
                                              </div>

                                              <div className="flex items-center bg-amber-50 border border-amber-200 rounded px-1 py-0.5 gap-0.5" title="चौड़ाई (Width) घटाएं या बढ़ाएं">
                                                <span className="text-[9px] text-amber-900 font-bold mr-0.5">W:</span>
                                                <button
                                                  type="button"
                                                  onClick={() => adjustAnnotationSize(ann.id, -1.5, 0, 0)}
                                                  className="w-4 h-4 rounded bg-white hover:bg-amber-200 flex items-center justify-center text-amber-900 font-black shadow-2xs border border-amber-200 active:scale-95 cursor-pointer"
                                                  title="चौड़ाई कम करें (-1.5%)"
                                                >
                                                  -
                                                </button>
                                                <span className="text-[9px] font-mono font-bold text-amber-900 px-0.5 min-w-[24px] text-center">
                                                  {currentWidth.toFixed(0)}%
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={() => adjustAnnotationSize(ann.id, 1.5, 0, 0)}
                                                  className="w-4 h-4 rounded bg-white hover:bg-amber-200 flex items-center justify-center text-amber-900 font-black shadow-2xs border border-amber-200 active:scale-95 cursor-pointer"
                                                  title="चौड़ाई बढ़ाएं (+1.5%)"
                                                >
                                                  +
                                                </button>
                                              </div>

                                              <div className="flex items-center bg-blue-50 border border-blue-200 rounded px-1 py-0.5 gap-0.5" title="लम्बाई / ऊंचाई (Height) घटाएं या बढ़ाएं">
                                                <span className="text-[9px] text-blue-900 font-bold mr-0.5">H:</span>
                                                <button
                                                  type="button"
                                                  onClick={() => adjustAnnotationSize(ann.id, 0, -10, 0)}
                                                  className="w-4 h-4 rounded bg-white hover:bg-blue-200 flex items-center justify-center text-blue-900 font-black shadow-2xs border border-blue-200 active:scale-95 cursor-pointer"
                                                  title="लम्बाई कम करें (-10px)"
                                                >
                                                  -
                                                </button>
                                                <span className="text-[9px] font-mono font-bold text-blue-900 px-0.5 min-w-[24px] text-center">
                                                  {ann.min_height_px ? `${Math.round(ann.min_height_px)}px` : 'ऑटो'}
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={() => adjustAnnotationSize(ann.id, 0, 10, 0)}
                                                  className="w-4 h-4 rounded bg-white hover:bg-blue-200 flex items-center justify-center text-blue-900 font-black shadow-2xs border border-blue-200 active:scale-95 cursor-pointer"
                                                  title="लम्बाई बढ़ाएं (+10px)"
                                                >
                                                  +
                                                </button>
                                              </div>

                                              <div className="flex items-center bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5 gap-0.5" title="अक्षर का आकार (Font Size) बदलें या सब पर फिक्स करें">
                                                <span className="text-[9px] text-emerald-900 font-bold mr-0.5">A:</span>
                                                <button
                                                  type="button"
                                                  onClick={() => adjustAnnotationSize(ann.id, 0, 0, -0.05)}
                                                  className="w-4 h-4 rounded bg-white hover:bg-emerald-200 flex items-center justify-center text-emerald-900 font-black shadow-2xs border border-emerald-200 active:scale-95 cursor-pointer"
                                                  title="फॉन्ट छोटा करें (-5%)"
                                                >
                                                  -
                                                </button>
                                                <span className="text-[9px] font-mono font-bold text-emerald-900 px-0.5 min-w-[26px] text-center">
                                                  {Math.round((ann.font_scale || evalResult.default_font_scale || defaultAnnotationFontScale || 1.0) * 100)}%
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={() => adjustAnnotationSize(ann.id, 0, 0, 0.05)}
                                                  className="w-4 h-4 rounded bg-white hover:bg-emerald-200 flex items-center justify-center text-emerald-900 font-black shadow-2xs border border-emerald-200 active:scale-95 cursor-pointer"
                                                  title="फॉन्ट बड़ा करें (+5%)"
                                                >
                                                  +
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => applyFontScaleToAllAnnotations(ann.font_scale || evalResult.default_font_scale || defaultAnnotationFontScale || 1.0)}
                                                  className="ml-0.5 px-1.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[8px] flex items-center gap-0.5 shadow-2xs active:scale-95 cursor-pointer"
                                                  title="One-Time Fix: यही अक्षर आकार सभी टिप्पणियों पर एक साथ लागू करें और डिफ़ॉल्ट के रूप में स्थायी सेट करें"
                                                >
                                                  <Pin className="w-2.5 h-2.5" />
                                                  <span>फिक्स</span>
                                                </button>
                                              </div>

                                              <div
                                                onPointerDown={(e) => handlePointerDown(e, ann)}
                                                className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-move flex items-center justify-center"
                                                title="स्थान बदलें (पकड़कर ड्रैग करें / Drag to Reposition)"
                                              >
                                                <Move className="w-3 h-3" />
                                              </div>

                                              <button
                                                type="button"
                                                onClick={() => resetAnnotationDimensions(ann.id)}
                                                className="p-1 rounded hover:bg-amber-100 text-slate-500 hover:text-amber-800 transition-colors cursor-pointer"
                                                title="मूल आकार पर रीसेट करें"
                                              >
                                                <RotateCcw className="w-3 h-3" />
                                              </button>

                                              <button
                                                type="button"
                                                onClick={() => deleteAnnotation(ann.id)}
                                                className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                                                title="टिप्पणी हटाएं"
                                              >
                                                <Trash2 className="w-3 h-3" />
                                              </button>
                                              </div>
                                            </div>

                                            <div
                                              onPointerDown={(e) => handleResizePointerDown(e, ann, 'both', isLeft)}
                                              className={`annotation-resize-handle absolute ${isLeft ? '-bottom-2.5 -right-2.5' : '-bottom-2.5 -left-2.5'} w-6 h-6 rounded-full bg-red-600 text-white shadow-xl flex items-center justify-center cursor-nwse-resize hover:scale-125 active:scale-95 transition-transform z-30 select-none border-2 border-white ring-2 ring-red-400`}
                                              title="माउस या टैब टच से चौड़ाई और लम्बाई एक साथ बदलें (Resize Width & Height)"
                                            >
                                              <Maximize2 className="w-3 h-3 rotate-90" />
                                            </div>

                                            <div
                                              onPointerDown={(e) => handleResizePointerDown(e, ann, 'width', isLeft)}
                                              className={`annotation-resize-handle absolute ${isLeft ? '-right-2.5' : '-left-2.5'} top-1/2 -translate-y-1/2 w-4 h-7 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-md flex items-center justify-center cursor-ew-resize hover:scale-120 active:scale-95 transition-transform z-30 select-none border border-white`}
                                              title="माउस या टैब से चौड़ाई बदलें (Drag to Resize Width)"
                                            >
                                              <div className="flex flex-col gap-0.5 items-center">
                                                <span className="w-1.5 h-0.5 bg-white rounded-full"></span>
                                                <span className="w-1.5 h-0.5 bg-white rounded-full"></span>
                                                <span className="w-1.5 h-0.5 bg-white rounded-full"></span>
                                              </div>
                                            </div>

                                            <div
                                              onPointerDown={(e) => handleResizePointerDown(e, ann, 'height', isLeft)}
                                              className="annotation-resize-handle absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-7 h-4 rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow-md flex items-center justify-center cursor-ns-resize hover:scale-120 active:scale-95 transition-transform z-30 select-none border border-white"
                                              title="माउस या टैब से लम्बाई बदलें (Drag to Resize Height)"
                                            >
                                              <div className="flex gap-0.5 items-center">
                                                <span className="h-1.5 w-0.5 bg-white rounded-full"></span>
                                                <span className="h-1.5 w-0.5 bg-white rounded-full"></span>
                                                <span className="h-1.5 w-0.5 bg-white rounded-full"></span>
                                              </div>
                                            </div>
                                          </>
                                        )}
                                      </motion.div>
                                    );
                                  })}
                                </AnimatePresence>
                              </div>
                            );
                          };

                          if (isDualPageView && uploadedPages.length > 1) {
                            return (
                              <div className="flex flex-col gap-3 w-full">
                                {/* Dual Page Quick Controls & Presets Bar */}
                                <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-md text-white flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <div className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-400/40 text-amber-300 px-2.5 py-1 rounded-lg text-xs font-bold">
                                      <Columns className="w-3.5 h-3.5" />
                                      <span>डुअल-पेज स्प्लिट दृश्य (Side-by-Side)</span>
                                    </div>

                                    {/* Presets */}
                                    <div className="flex items-center gap-1 bg-slate-800 p-0.5 rounded-lg border border-slate-700 text-xs">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedPageNum(1);
                                          setSecondaryPageNum(2 <= uploadedPages.length ? 2 : 1);
                                        }}
                                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                                          selectedPageNum === 1 && secondaryPageNum === 2 ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-300 hover:text-white'
                                        }`}
                                        title="पृष्ठ १ और २ एक साथ देखें"
                                      >
                                        P1 & P2
                                      </button>
                                      {uploadedPages.length > 2 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedPageNum(2);
                                            setSecondaryPageNum(3 <= uploadedPages.length ? 3 : 2);
                                          }}
                                          className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                                            selectedPageNum === 2 && secondaryPageNum === 3 ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-300 hover:text-white'
                                          }`}
                                          title="पृष्ठ २ और ३ एक साथ देखें"
                                        >
                                          P2 & P3
                                        </button>
                                      )}
                                      {uploadedPages.length >= 3 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedPageNum(1);
                                            setSecondaryPageNum(uploadedPages.length);
                                          }}
                                          className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                                            selectedPageNum === 1 && secondaryPageNum === uploadedPages.length ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-300 hover:text-white'
                                          }`}
                                          title="प्रस्तावना (पृष्ठ १) और निष्कर्ष (अंतिम पृष्ठ) की तुलना करें"
                                        >
                                          प्रस्तावना vs निष्कर्ष
                                        </button>
                                      )}
                                    </div>

                                    {/* Swap Button */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const temp = selectedPageNum;
                                        setSelectedPageNum(secondaryPageNum);
                                        setSecondaryPageNum(temp);
                                      }}
                                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 hover:border-amber-400 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                                      title="बाएं और दाएं पृष्ठ को आपस में बदलें (Swap Left & Right)"
                                    >
                                      <span>⇄ स्वैप (Swap)</span>
                                    </button>
                                  </div>

                                  {/* Prev / Next Pair Navigation */}
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newLeft = Math.max(1, selectedPageNum - 2);
                                        const newRight = Math.min(uploadedPages.length, newLeft + 1);
                                        setSelectedPageNum(newLeft);
                                        setSecondaryPageNum(newRight);
                                      }}
                                      disabled={selectedPageNum <= 1}
                                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 rounded-lg text-xs font-bold border border-slate-700 flex items-center gap-1 cursor-pointer"
                                      title="पिछला पृष्ठ युग्म"
                                    >
                                      <ChevronLeft className="w-3.5 h-3.5" />
                                      <span>पिछला युग्म</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newLeft = Math.min(uploadedPages.length - 1, selectedPageNum + 2);
                                        const newRight = Math.min(uploadedPages.length, newLeft + 1);
                                        setSelectedPageNum(newLeft);
                                        setSecondaryPageNum(newRight);
                                      }}
                                      disabled={selectedPageNum >= uploadedPages.length - 1 || secondaryPageNum >= uploadedPages.length}
                                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 rounded-lg text-xs font-bold border border-slate-700 flex items-center gap-1 cursor-pointer"
                                      title="अगला पृष्ठ युग्म"
                                    >
                                      <span>अगला युग्म</span>
                                      <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* Dual Side-by-Side Canvas Cards */}
                                <div className={`bg-slate-200 dark:bg-slate-900/60 rounded-xl p-3 sm:p-4 shadow-inner overflow-auto ${isZenMode ? 'max-h-[calc(100vh-140px)]' : 'max-h-[760px]'}`}>
                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start justify-center w-full">
                                    {/* LEFT SHEET CARD */}
                                    <div className="bg-slate-100 dark:bg-slate-800/80 rounded-xl p-3 border border-slate-300 dark:border-slate-700 flex flex-col gap-2.5 shadow-sm">
                                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-700 text-xs">
                                        <div className="flex items-center gap-2">
                                          <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-black text-[11px]">
                                            बायाँ पृष्ठ (Page A)
                                          </span>
                                          <select
                                            value={selectedPageNum}
                                            onChange={(e) => setSelectedPageNum(Number(e.target.value))}
                                            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-0.5 font-bold text-xs cursor-pointer text-slate-800 dark:text-slate-100"
                                          >
                                            {uploadedPages.map((_, i) => (
                                              <option key={`p-sel-left-${i+1}`} value={i+1}>
                                                पृष्ठ {i+1} {i === 0 ? '(प्रस्तावना/कवर)' : i === uploadedPages.length - 1 ? '(निष्कर्ष)' : ''}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                                          {evalResult.pages.find(p => p.page_number === selectedPageNum)?.annotations.length || 0} टिप्पणियां
                                        </span>
                                      </div>
                                      {renderPageCanvas(selectedPageNum, false)}
                                    </div>

                                    {/* RIGHT SHEET CARD */}
                                    <div className="bg-slate-100 dark:bg-slate-800/80 rounded-xl p-3 border border-slate-300 dark:border-slate-700 flex flex-col gap-2.5 shadow-sm">
                                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-700 text-xs">
                                        <div className="flex items-center gap-2">
                                          <span className="px-2 py-0.5 rounded bg-blue-600 text-white font-black text-[11px]">
                                            दायाँ पृष्ठ (Page B)
                                          </span>
                                          <select
                                            value={secondaryPageNum}
                                            onChange={(e) => setSecondaryPageNum(Number(e.target.value))}
                                            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-0.5 font-bold text-xs cursor-pointer text-slate-800 dark:text-slate-100"
                                          >
                                            {uploadedPages.map((_, i) => (
                                              <option key={`p-sel-right-${i+1}`} value={i+1}>
                                                पृष्ठ {i+1} {i === 0 ? '(प्रस्तावना/कवर)' : i === uploadedPages.length - 1 ? '(निष्कर्ष)' : ''}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                                          {evalResult.pages.find(p => p.page_number === secondaryPageNum)?.annotations.length || 0} टिप्पणियां
                                        </span>
                                      </div>
                                      {renderPageCanvas(secondaryPageNum, true)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          // Single Page Canvas
                          return (
                            <div className={`bg-slate-200 rounded-lg p-4 shadow-inner flex items-center justify-center overflow-auto ${isZenMode ? 'max-h-[calc(100vh-140px)]' : 'max-h-[700px]'}`}>
                              {renderPageCanvas(selectedPageNum, false)}
                            </div>
                          );
                        })()}

                    {/* Dynamic Margin click instruction popup (Owner Only) */}
                    <AnimatePresence>
                      {isAddingAnnotation && !isEffectiveStudentView && isOwnerAccount && (
                        <motion.div 
                          key="add-annotation-box"
                          initial={{ opacity: 0, y: -12, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.15 } }}
                          transition={{ duration: 0.22, ease: "easeOut" }}
                          className="bg-amber-50 border border-amber-300 rounded-lg p-4 shadow-md flex flex-col gap-3"
                        >
                        <div className="flex flex-wrap justify-between items-center gap-2">
                          <span className="text-xs font-bold text-amber-900 uppercase">
                            हाशिये की टिप्पणी जोड़ें ({selectedMargin === 'left' ? 'बायां हाशिया' : 'दायां हाशिया'})
                          </span>
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Format Dropdown for Custom Comment */}
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setOpenFormatDropdownId(prev => prev === 'add-box' ? null : 'add-box')}
                                className="px-2 py-0.5 rounded bg-white hover:bg-indigo-50 border border-indigo-200 text-indigo-800 text-[10px] font-bold flex items-center gap-1 shadow-2xs cursor-pointer"
                                title="कस्टम टिप्पणी के लिए Bold, Italics, या Underline चुनें"
                              >
                                <Type className="w-3 h-3 text-indigo-600" />
                                <span>Format</span>
                                <span className="text-[9px] text-indigo-500 font-mono">
                                  ({[
                                    customAnnotationFormat.is_bold ? 'B' : '',
                                    customAnnotationFormat.is_italic ? 'I' : '',
                                    customAnnotationFormat.is_underline ? 'U' : ''
                                  ].filter(Boolean).join('') || 'N'})
                                </span>
                                <ChevronDown className="w-2.5 h-2.5" />
                              </button>
                              {openFormatDropdownId === 'add-box' && (
                                <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-2xl p-1.5 z-50 min-w-[175px] flex flex-col gap-1">
                                  <div className="text-[9px] font-bold text-slate-400 uppercase px-1 pb-0.5 border-b border-slate-100">
                                    टेक्स्ट फ़ॉर्मेट चुनें
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setCustomAnnotationFormat(prev => ({ ...prev, is_bold: !prev.is_bold }))}
                                    className={`w-full px-2 py-1 rounded text-left text-[10px] flex items-center justify-between cursor-pointer ${
                                      customAnnotationFormat.is_bold ? 'bg-indigo-50 text-indigo-800 font-bold' : 'hover:bg-slate-100 text-slate-700'
                                    }`}
                                  >
                                    <span className="flex items-center gap-1.5"><Bold className="w-3 h-3" /><span className="font-bold">Bold (बोल्ड)</span></span>
                                    {customAnnotationFormat.is_bold && <Check className="w-3 h-3 text-indigo-600" />}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setCustomAnnotationFormat(prev => ({ ...prev, is_italic: !prev.is_italic }))}
                                    className={`w-full px-2 py-1 rounded text-left text-[10px] flex items-center justify-between cursor-pointer ${
                                      customAnnotationFormat.is_italic ? 'bg-indigo-50 text-indigo-800 font-bold' : 'hover:bg-slate-100 text-slate-700'
                                    }`}
                                  >
                                    <span className="flex items-center gap-1.5"><Italic className="w-3 h-3" /><span className="italic">Italics (तिरछा)</span></span>
                                    {customAnnotationFormat.is_italic && <Check className="w-3 h-3 text-indigo-600" />}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setCustomAnnotationFormat(prev => ({ ...prev, is_underline: !prev.is_underline }))}
                                    className={`w-full px-2 py-1 rounded text-left text-[10px] flex items-center justify-between cursor-pointer ${
                                      customAnnotationFormat.is_underline ? 'bg-indigo-50 text-indigo-800 font-bold' : 'hover:bg-slate-100 text-slate-700'
                                    }`}
                                  >
                                    <span className="flex items-center gap-1.5"><Underline className="w-3 h-3" /><span className="underline">Underline (रेखांकित)</span></span>
                                    {customAnnotationFormat.is_underline && <Check className="w-3 h-3 text-indigo-600" />}
                                  </button>
                                  <div className="pt-1 mt-0.5 border-t border-slate-100">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        applyFormatToAllAnnotations(customAnnotationFormat);
                                        setOpenFormatDropdownId(null);
                                      }}
                                      className="w-full px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[9px] flex items-center justify-center gap-1 cursor-pointer"
                                    >
                                      <Pin className="w-2.5 h-2.5" />
                                      <span>सब पर लागू व स्थायी सेट करें</span>
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Font Size + One-Time Fix for Custom Comment */}
                            <div className="flex items-center bg-white border border-emerald-300 rounded px-1.5 py-0.5 gap-1">
                              <span className="text-[9px] text-emerald-800 font-bold">आकार:</span>
                              <button
                                type="button"
                                onClick={() => setCustomAnnotationScale(prev => Math.max(0.65, Math.round((prev - 0.05) * 100) / 100))}
                                className="w-4 h-4 rounded bg-emerald-50 hover:bg-emerald-200 text-emerald-900 font-black text-[10px] flex items-center justify-center cursor-pointer"
                                title="अक्षर छोटा करें (-5%)"
                              >
                                -
                              </button>
                              <span className="text-[10px] font-mono font-bold text-emerald-900 min-w-[28px] text-center">
                                {Math.round(customAnnotationScale * 100)}%
                              </span>
                              <button
                                type="button"
                                onClick={() => setCustomAnnotationScale(prev => Math.min(2.0, Math.round((prev + 0.05) * 100) / 100))}
                                className="w-4 h-4 rounded bg-emerald-50 hover:bg-emerald-200 text-emerald-900 font-black text-[10px] flex items-center justify-center cursor-pointer"
                                title="अक्षर बड़ा करें (+5%)"
                              >
                                +
                              </button>
                              <button
                                type="button"
                                onClick={() => applyFontScaleToAllAnnotations(customAnnotationScale)}
                                className="px-1.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[9px] flex items-center gap-0.5 cursor-pointer"
                                title="One-Time Fix: यही साइज़ सभी टिप्पणियों पर स्थायी फिक्स करें"
                              >
                                <Pin className="w-2.5 h-2.5" />
                                <span>सब पर फिक्स</span>
                              </button>
                            </div>

                            <span className="text-[10px] text-slate-500 font-semibold">
                              स्थान: {customAnnotationX}% X, {customAnnotationY}% Y
                            </span>
                          </div>
                        </div>

                        {/* Text box for custom note with Hindi Spell-Check */}
                        <HindiSpellCheckInput
                          value={customAnnotationText}
                          onChange={(newVal) => setCustomAnnotationText(newVal)}
                          placeholder="मूल्यांकन टिप्पणी लिखें..."
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              saveCustomAnnotation();
                            }
                          }}
                        />

                        {/* Auto-Suggestions Engine */}
                        {getAutoSuggestions().length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            <span className="text-[10px] text-slate-500 font-bold uppercase w-full">सुझाव:</span>
                            {getAutoSuggestions().map((suggestion, idx) => (
                              <button
                                key={`sugg-${idx}`}
                                onClick={() => setCustomAnnotationText(prev => prev ? prev + ' ' + suggestion : suggestion)}
                                className="text-left bg-white hover:bg-amber-100 border border-amber-200 text-amber-800 text-[10px] px-2 py-1 rounded shadow-sm transition-colors"
                              >
                                <Sparkles className="w-3 h-3 inline-block mr-1 text-amber-500" />
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Persistent Frequent Comments Library */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <span className="text-[10px] text-slate-500 font-bold uppercase w-full">अक्सर प्रयुक्त टिप्पणियां:</span>
                          {frequentComments.map((fc, idx) => (
                            <div key={`fc-${idx}`} className="flex items-stretch bg-white border border-slate-300 rounded shadow-sm overflow-hidden group">
                              <button
                                onClick={() => {
                                  if (!customAnnotationText) {
                                    // If empty, auto-save it immediately for speed
                                    saveCustomAnnotation(fc);
                                  } else {
                                    setCustomAnnotationText(prev => prev + ' ' + fc);
                                  }
                                }}
                                className="text-left hover:bg-slate-50 text-slate-700 text-[10px] px-2 py-1 transition-colors flex-1"
                              >
                                {fc}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFrequentComments(prev => prev.filter((_, i) => i !== idx));
                                }}
                                className="bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-600 px-1.5 flex items-center justify-center border-l border-slate-200 transition-colors"
                                title="हटाएं"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>

                        {/* Save Actions */}
                        <div className="flex justify-between items-center text-xs mt-2">
                          <button
                            onClick={() => {
                              const trimmed = customAnnotationText.trim();
                              if (trimmed) {
                                const cleaned = sanitizeAnnotationText(trimmed, 'pure_hindi');
                                if (cleaned && !frequentComments.includes(cleaned)) {
                                  setFrequentComments(prev => [...prev, cleaned]);
                                  showToast('टिप्पणी लाइब्रेरी में सहेज ली गई।');
                                }
                              }
                            }}
                            disabled={!customAnnotationText.trim() || frequentComments.includes(customAnnotationText.trim())}
                            className="px-2 py-1 text-[10px] bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 rounded disabled:opacity-50 flex items-center gap-1"
                            title="इस टिप्पणी को हमेशा के लिए लाइब्रेरी में सेव करें"
                          >
                            <BookmarkPlus className="w-3 h-3" />
                            लाइब्रेरी में जोड़ें
                          </button>

                          <div className="flex gap-2">
                            <button
                              onClick={() => setIsAddingAnnotation(false)}
                              className="px-3 py-1 text-slate-600 hover:text-slate-800 font-semibold"
                            >
                              रद्द करें
                            </button>
                            <button
                              onClick={() => saveCustomAnnotation()}
                              className="bg-amber-600 hover:bg-amber-700 text-slate-900 font-bold px-4 py-1 rounded"
                            >
                              सहेजें
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  </div>
                      {/* View Controls */}
                    <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm flex flex-wrap justify-between items-center gap-2 text-xs font-medium text-slate-700">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedPageNum(Math.max(1, selectedPageNum - 1))}
                          disabled={selectedPageNum === 1}
                          className="p-1.5 bg-slate-100 rounded hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-slate-100 cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="font-bold">
                          पृष्ठ {selectedPageNum} / {uploadedPages.length || 1}
                        </span>
                        <button
                          onClick={() => setSelectedPageNum(Math.min(uploadedPages.length, selectedPageNum + 1))}
                          disabled={selectedPageNum === uploadedPages.length}
                          className="p-1.5 bg-slate-100 rounded hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-slate-100 cursor-pointer"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>

                        {/* Page Type Badge */}
                        {(() => {
                          const currentPageData = evalResult.pages.find(p => p.page_number === selectedPageNum);
                          const pageType = currentPageData?.page_type;
                          if (pageType === 'cover_page' || (selectedPageNum === 1 && pageType !== 'answer_page')) {
                            return (
                              <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded border border-slate-300">
                                📋 कवर / प्रश्न पत्रक
                              </span>
                            );
                          } else if (pageType === 'blank_page') {
                            return (
                              <span className="bg-gray-100 text-gray-500 text-[10px] font-bold px-2 py-0.5 rounded border border-gray-200">
                                📄 खाली पृष्ठ
                              </span>
                            );
                          } else {
                            return (
                              <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200">
                                📝 उत्तर पृष्ठ
                              </span>
                            );
                          }
                        })()}
                      </div>

                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setZoomLevel(Math.max(50, zoomLevel - 10))}
                          className="p-1 bg-slate-100 rounded hover:bg-slate-200 cursor-pointer"
                          title="Zoom Out"
                        >
                          <ZoomOut className="w-4 h-4" />
                        </button>
                        <span className="font-bold w-12 text-center">{zoomLevel}%</span>
                        <button 
                          onClick={() => setZoomLevel(Math.min(150, zoomLevel + 10))}
                          className="p-1 bg-slate-100 rounded hover:bg-slate-200 cursor-pointer"
                          title="Zoom In"
                        >
                          <ZoomIn className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Annotation Font Quick Switcher Toggle (Owner Only) */}
                      {!isEffectiveStudentView && isOwnerAccount && (
                        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs shadow-2xs">
                          <button
                            type="button"
                            onClick={() => handleSelectAnnotationFont('kalam')}
                            className={`px-2 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                              annotationFont === 'kalam'
                                ? 'bg-white dark:bg-slate-700 text-rose-700 dark:text-rose-400 shadow-xs'
                                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                            }`}
                            title="विकल्प १: Kalam (हस्तलिखित लाल पेन शैली)"
                          >
                            <span>✍️</span>
                            <span className="hidden sm:inline">विकल्प १ (कलम)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectAnnotationFont('mukta')}
                            className={`px-2 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                              annotationFont === 'mukta'
                                ? 'bg-white dark:bg-slate-700 text-rose-700 dark:text-rose-400 shadow-xs'
                                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                            }`}
                            title="विकल्प २: Mukta (अल्ट्रा-क्लियर कॉम्पैक्ट शैली)"
                          >
                            <span>📱</span>
                            <span className="hidden sm:inline">विकल्प २ (मुक्ता)</span>
                          </button>
                        </div>
                      )}

                      {/* Global Annotated Text Size & One-Time Fix + 'Format' Dropdown (Owner Only) */}
                      {!isEffectiveStudentView && isOwnerAccount && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Global Text Size & One-Time Fix Control */}
                          <div
                            className="flex items-center bg-emerald-50 dark:bg-slate-800 p-0.5 rounded-lg border border-emerald-200 dark:border-slate-700 text-xs shadow-2xs gap-0.5"
                            title="टिप्पणी अक्षर आकार (Annotated Text Size) बदलें और एक क्लिक में स्थायी फिक्स करें"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                const nextScale = Math.max(0.65, Math.round(((evalResult.default_font_scale || defaultAnnotationFontScale || 1.0) - 0.05) * 100) / 100);
                                applyFontScaleToAllAnnotations(nextScale);
                              }}
                              className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-700 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-300 font-black text-[11px] border border-emerald-200 dark:border-slate-600 cursor-pointer active:scale-95"
                              title="सभी टिप्पणियों का अक्षर आकार छोटा करें (-5%)"
                            >
                              A-
                            </button>
                            <select
                              value={Math.round((evalResult.default_font_scale || defaultAnnotationFontScale || 1.0) * 100)}
                              onChange={(e) => applyFontScaleToAllAnnotations(Number(e.target.value) / 100)}
                              className="bg-transparent text-emerald-900 dark:text-emerald-300 font-mono font-bold text-[11px] px-1 py-0.5 cursor-pointer focus:outline-none"
                              title="अक्षर आकार चुनें (चुनते ही सभी टिप्पणियों पर स्थायी रूप से सेट हो जाएगा)"
                            >
                              {[70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 130, 140, 150].map(pct => (
                                <option key={`scale-opt-${pct}`} value={pct}>
                                  {pct}% {pct === 85 ? '(छोटा)' : pct === 100 ? '(मानक)' : pct === 115 ? '(बड़ा)' : ''}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                const nextScale = Math.min(2.0, Math.round(((evalResult.default_font_scale || defaultAnnotationFontScale || 1.0) + 0.05) * 100) / 100);
                                applyFontScaleToAllAnnotations(nextScale);
                              }}
                              className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-700 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-300 font-black text-[11px] border border-emerald-200 dark:border-slate-600 cursor-pointer active:scale-95"
                              title="सभी टिप्पणियों का अक्षर आकार बड़ा करें (+5%)"
                            >
                              A+
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const selectedAnn = selectedAnnotationId
                                  ? evalResult.pages.flatMap(p => p.annotations).find(a => a.id === selectedAnnotationId)
                                  : null;
                                const scaleToLock = selectedAnn?.font_scale || evalResult.default_font_scale || defaultAnnotationFontScale || 1.0;
                                applyFontScaleToAllAnnotations(scaleToLock);
                              }}
                              className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95"
                              title="One-Time Fix: वर्तमान अक्षर आकार को सभी पृष्ठों की टिप्पणियों पर लागू करें और हमेशा के लिए डिफ़ॉल्ट लॉक करें"
                            >
                              <Pin className="w-3 h-3" />
                              <span className="hidden sm:inline">साइज़ फिक्स</span>
                            </button>
                          </div>

                          {/* Toolbar 'Format' Dropdown (Bold / Italics / Underline) */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setOpenFormatDropdownId(prev => prev === 'top-toolbar' ? null : 'top-toolbar')}
                              className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all shadow-2xs ${
                                openFormatDropdownId === 'top-toolbar'
                                  ? 'bg-indigo-600 text-white border-indigo-500'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                              }`}
                              title="Format Dropdown: टिप्पणियों के लिए Bold, Italics, या Underline टॉगल करें"
                            >
                              <Type className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                              <span>Format</span>
                              <ChevronDown className="w-3 h-3" />
                            </button>

                            {openFormatDropdownId === 'top-toolbar' && (() => {
                              const activeAnn = selectedAnnotationId
                                ? evalResult.pages.flatMap(p => p.annotations).find(a => a.id === selectedAnnotationId)
                                : null;
                              const isBoldActive = activeAnn ? (activeAnn.is_bold ?? true) : defaultAnnotationFormat.is_bold;
                              const isItalicActive = activeAnn ? Boolean(activeAnn.is_italic) : defaultAnnotationFormat.is_italic;
                              const isUnderlineActive = activeAnn ? Boolean(activeAnn.is_underline) : defaultAnnotationFormat.is_underline;

                              const handleToggleFromToolbar = (field: 'is_bold' | 'is_italic' | 'is_underline') => {
                                if (activeAnn) {
                                  toggleAnnotationFormat(activeAnn.id, field);
                                } else {
                                  const nextFmt = {
                                    ...defaultAnnotationFormat,
                                    [field]: !defaultAnnotationFormat[field]
                                  };
                                  applyFormatToAllAnnotations(nextFmt);
                                }
                              };

                              return (
                                <div className="absolute left-0 top-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-2 z-50 min-w-[210px] flex flex-col gap-1">
                                  <div className="text-[10px] font-bold text-slate-400 uppercase px-1.5 pb-1 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                    <span>{activeAnn ? 'चयनित टिप्पणी फ़ॉर्मेट' : 'सभी टिप्पणियों का फ़ॉर्मेट'}</span>
                                    <span className="text-[9px] text-indigo-600 font-mono">
                                      {[isBoldActive ? 'B' : '', isItalicActive ? 'I' : '', isUnderlineActive ? 'U' : ''].filter(Boolean).join('+') || 'Normal'}
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleToggleFromToolbar('is_bold')}
                                    className={`w-full px-2.5 py-1.5 rounded-lg text-left text-xs flex items-center justify-between cursor-pointer transition-colors ${
                                      isBoldActive ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                                    }`}
                                  >
                                    <span className="flex items-center gap-2">
                                      <Bold className="w-3.5 h-3.5" />
                                      <span className="font-bold">Bold (बोल्ड / गहरा)</span>
                                    </span>
                                    {isBoldActive && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleToggleFromToolbar('is_italic')}
                                    className={`w-full px-2.5 py-1.5 rounded-lg text-left text-xs flex items-center justify-between cursor-pointer transition-colors ${
                                      isItalicActive ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                                    }`}
                                  >
                                    <span className="flex items-center gap-2">
                                      <Italic className="w-3.5 h-3.5" />
                                      <span className="italic">Italics (तिरछे अक्षर)</span>
                                    </span>
                                    {isItalicActive && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleToggleFromToolbar('is_underline')}
                                    className={`w-full px-2.5 py-1.5 rounded-lg text-left text-xs flex items-center justify-between cursor-pointer transition-colors ${
                                      isUnderlineActive ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                                    }`}
                                  >
                                    <span className="flex items-center gap-2">
                                      <Underline className="w-3.5 h-3.5" />
                                      <span className="underline">Underline (रेखांकित)</span>
                                    </span>
                                    {isUnderlineActive && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                                  </button>

                                  <div className="pt-1.5 mt-0.5 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        applyFormatToAllAnnotations({
                                          is_bold: isBoldActive,
                                          is_italic: isItalicActive,
                                          is_underline: isUnderlineActive
                                        });
                                        setOpenFormatDropdownId(null);
                                      }}
                                      className="w-full px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                                    >
                                      <Pin className="w-3 h-3" />
                                      <span>सभी टिप्पणियों पर स्थायी फिक्स करें</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Undo & Redo Controls (Owner Only) */}
                      {!isEffectiveStudentView && isOwnerAccount && (
                        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs shadow-2xs">
                          <button
                            type="button"
                            onClick={handleUndo}
                            disabled={undoStack.length === 0}
                            className="px-2 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:text-amber-600 dark:hover:text-amber-400"
                            title="पूर्ववत करें / Undo (Ctrl+Z)"
                          >
                            <Undo2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">अंडू</span>
                            {undoStack.length > 0 && (
                              <span className="text-[9px] px-1 py-0.2 rounded-full bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 font-mono">
                                {undoStack.length}
                              </span>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={handleRedo}
                            disabled={redoStack.length === 0}
                            className="px-2 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:text-amber-600 dark:hover:text-amber-400"
                            title="पुनः करें / Redo (Ctrl+Y या Ctrl+Shift+Z)"
                          >
                            <Redo2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">रीडू</span>
                            {redoStack.length > 0 && (
                              <span className="text-[9px] px-1 py-0.2 rounded-full bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 font-mono">
                                {redoStack.length}
                              </span>
                            )}
                          </button>
                        </div>
                      )}

                      {/* Dual-Page Split View Quick Toggle */}
                      {uploadedPages.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsDualPageView(!isDualPageView);
                            showToast(!isDualPageView ? '📖 डुअल-पेज स्प्लिट व्यू सक्रिय' : 'एकल पृष्ठ दृश्य सक्रिय');
                          }}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer border ${
                            isDualPageView
                              ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold shadow-xs'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:text-amber-600'
                          }`}
                          title="दो पृष्ठों को एक साथ आजू-बाजू (Side-by-Side Dual Page) देखें"
                        >
                          <Columns className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">{isDualPageView ? 'एकल दृश्य' : 'डुअल स्प्लिट'}</span>
                        </button>
                      )}

                      {/* Zen Focus Mode Quick Toggle */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsZenMode(!isZenMode);
                          showToast(!isZenMode ? '⚡ पूर्ण स्क्रीन (Zen Mode) सक्रिय — बाहर निकलने हेतु ESC दबाएं' : 'सामान्य दृश्य पर लौटे');
                        }}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer border ${
                          isZenMode
                            ? 'bg-purple-600 text-white border-purple-500 font-extrabold shadow-xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:text-purple-600'
                        }`}
                        title="पूर्ण स्क्रीन ज़ेन मोड में जांचें (Focus Fullscreen View - ESC to exit)"
                      >
                        {isZenMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                        <span className="hidden sm:inline">{isZenMode ? 'सामान्य' : 'पूर्ण स्क्रीन'}</span>
                      </button>

                      {/* Toggle Page Comments List (Available to both Student as Read-Only and Owner as Editable) */}
                      <button
                        type="button"
                        onClick={() => setZenShowCommentsPanel((prev) => !prev)}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer border ${
                          zenShowCommentsPanel || selectedAnnotationId
                            ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:text-indigo-600'
                        }`}
                        title="इस पृष्ठ की हाशिया टिप्पणियों की सूची दिखाएं/छुपाएं"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>
                          टिप्पणी सूची (
                          {evalResult.pages.find((p) => p.page_number === selectedPageNum)?.annotations?.length || 0}
                          )
                        </span>
                      </button>

                      {!isEffectiveStudentView && isOwnerAccount ? (
                        <>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                if (!evalResult) return;
                                pushUndoSnapshot();
                                const updatedPages = evalResult.pages.map(page => {
                                  if (page.page_number === selectedPageNum) {
                                    return { ...page, annotations: [] };
                                  }
                                  return page;
                                });
                                setEvalResult({ ...evalResult, pages: updatedPages });
                                showToast(`पृष्ठ ${selectedPageNum} की टिप्पणियां हटाई गईं`);
                              }}
                              className="px-2 py-1 bg-red-50 text-red-700 hover:bg-red-100 rounded text-xs font-bold border border-red-200 flex items-center gap-1 transition-colors cursor-pointer"
                              title="Reset Page (Clear all annotations on this page)"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>पृष्ठ रीसेट</span>
                            </button>
                          </div>

                          <div className="text-[11px] text-amber-700 font-bold bg-amber-50 px-2 py-1 rounded">
                            * हाशिये पर क्लिक करके नई टिप्पणी जोड़ें
                          </div>
                        </>
                      ) : (
                        <div className="text-[11px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>परीक्षक द्वारा जाँची गई कॉपी</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RIGHT SPLIT PANEL: COMMENTS CHECKLIST & CONTROLS (SHOWN WHEN TOGGLED OR EDITING ANNOTATION) */}
                  {(zenShowCommentsPanel || (!isEffectiveStudentView && Boolean(selectedAnnotationId))) && (
                    <div className="xl:col-span-4 flex flex-col gap-5">
                      
                      {/* Page annotations list */}
                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                      {/* Legibility Issues Banner */}
                      {(() => {
                        const targetPageForLegibility = isDualPageView && dualPageActiveCommentTab === 'secondary' ? secondaryPageNum : selectedPageNum;
                        const pageData = evalResult.pages.find((p) => p.page_number === targetPageForLegibility);
                        const legibilityIssues = pageData?.legibility_issues || [];
                        if (legibilityIssues.length > 0) {
                          return (
                            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                              <h5 className="text-xs font-bold text-amber-900 mb-2 flex items-center gap-1.5">
                                ⚠️ <span>हस्तलेखन सुपाठ्यता निदान (पृष्ठ {targetPageForLegibility})</span>
                              </h5>
                              <ul className="list-disc pl-4 space-y-1">
                                {legibilityIssues.map((issue, idx) => (
                                  <li key={`leg-issue-${idx}`} className="text-[11px] text-amber-800">
                                    {issue.issue_description} <span className="opacity-70">(Y: {issue.y_percent.toFixed(0)}%)</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {/* Dual-Page Active Comments Tab Switcher */}
                      {isDualPageView && uploadedPages.length > 1 && (
                        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg mb-3 border border-slate-200 dark:border-slate-700">
                          <button
                            type="button"
                            onClick={() => setDualPageActiveCommentTab('primary')}
                            className={`flex-1 py-1 px-1.5 rounded text-[11px] font-bold transition-all text-center cursor-pointer ${
                              dualPageActiveCommentTab === 'primary'
                                ? 'bg-amber-500 text-slate-950 shadow-xs'
                                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                            }`}
                          >
                            बायाँ (P{selectedPageNum}): {evalResult.pages.find(p => p.page_number === selectedPageNum)?.annotations.length || 0}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDualPageActiveCommentTab('secondary')}
                            className={`flex-1 py-1 px-1.5 rounded text-[11px] font-bold transition-all text-center cursor-pointer ${
                              dualPageActiveCommentTab === 'secondary'
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                            }`}
                          >
                            दायाँ (P{secondaryPageNum}): {evalResult.pages.find(p => p.page_number === secondaryPageNum)?.annotations.length || 0}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDualPageActiveCommentTab('both')}
                            className={`flex-1 py-1 px-1.5 rounded text-[11px] font-bold transition-all text-center cursor-pointer ${
                              dualPageActiveCommentTab === 'both'
                                ? 'bg-slate-800 text-white shadow-xs'
                                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                            }`}
                          >
                            दोनों पृष्ठ
                          </button>
                        </div>
                      )}

                      <div className="flex justify-between items-center pb-2 border-b border-slate-100 mb-3">
                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-amber-600" />
                          <span>
                            {isDualPageView && uploadedPages.length > 1
                              ? (dualPageActiveCommentTab === 'primary' 
                                  ? `पृष्ठ ${selectedPageNum} (बायाँ) की टिप्पणियां` 
                                  : dualPageActiveCommentTab === 'secondary' 
                                    ? `पृष्ठ ${secondaryPageNum} (दायाँ) की टिप्पणियां` 
                                    : `दोनों पृष्ठ (${selectedPageNum} व ${secondaryPageNum}) की टिप्पणियां`)
                              : `पृष्ठ ${selectedPageNum} की टिप्पणियां`}
                          </span>
                        </h4>
                        {!isEffectiveStudentView && isOwnerAccount ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={handleUndo}
                              disabled={undoStack.length === 0}
                              className="text-[10px] bg-slate-100 hover:bg-slate-200 disabled:opacity-35 disabled:cursor-not-allowed text-slate-700 px-2 py-1 rounded border border-slate-200 transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                              title="पूर्ववत करें / Undo (Ctrl+Z)"
                            >
                              <Undo2 className="w-3 h-3" />
                              <span>अंडू</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleRedo}
                              disabled={redoStack.length === 0}
                              className="text-[10px] bg-slate-100 hover:bg-slate-200 disabled:opacity-35 disabled:cursor-not-allowed text-slate-700 px-2 py-1 rounded border border-slate-200 transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                              title="पुनः करें / Redo (Ctrl+Y या Ctrl+Shift+Z)"
                            >
                              <Redo2 className="w-3 h-3" />
                              <span>रीडू</span>
                            </button>
                            {evalResult && evalResult.pages.some(p => p.annotations && p.annotations.length > 0) && (
                              <button
                                onClick={clearAllAnnotations}
                                className="text-[10px] bg-red-50 hover:bg-red-100 text-red-600 px-2 py-1 rounded border border-red-200 transition-colors flex items-center gap-1 shadow-sm cursor-pointer"
                                title="सभी पृष्ठों की सभी टिप्पणियां हटाएं"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>सभी हटाएं</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            परीक्षक टिप्पणियां
                          </span>
                        )}
                      </div>

                      {/* Map current page comments */}
                      {(() => {
                        const targetPages = isDualPageView && uploadedPages.length > 1
                          ? (dualPageActiveCommentTab === 'secondary'
                              ? [secondaryPageNum]
                              : dualPageActiveCommentTab === 'both'
                                ? [selectedPageNum, secondaryPageNum]
                                : [selectedPageNum])
                          : [selectedPageNum];

                        const comments = evalResult.pages
                          .filter((p) => targetPages.includes(p.page_number))
                          .flatMap((p) => (p.annotations || []).map((a) => ({ ...a, page_number: p.page_number })));

                        if (comments.length === 0) {
                          return (
                            <AnimatePresence mode="wait">
                              <motion.p
                                key="empty-comments"
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="text-xs text-slate-500 italic text-center py-6"
                              >
                                {!isEffectiveStudentView && isOwnerAccount
                                  ? 'इस पृष्ठ पर अभी तक कोई टिप्पणी नहीं है। बाएं हाशिये या दाएं हाशिये पर क्लिक करके लाल कलम टिप्पणी जोड़ें।'
                                  : 'इस पृष्ठ पर कोई हाशिया टिप्पणी अंकित नहीं है।'}
                              </motion.p>
                            </AnimatePresence>
                          );
                        }

                        return (
                          <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto pr-2 pb-10 scroll-smooth">
                            <AnimatePresence mode="popLayout" initial={false}>
                              {comments.map((ann) => (
                                <motion.div
                                  key={ann.id}
                                  layout
                                  initial={{ opacity: 0, y: -14, scale: 0.94 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ 
                                    opacity: 0, 
                                    scale: 0.88, 
                                    x: 28, 
                                    transition: { duration: 0.2, ease: "easeIn" } 
                                  }}
                                  transition={{ 
                                    type: "spring", 
                                    stiffness: 420, 
                                    damping: 30,
                                    opacity: { duration: 0.18 }
                                  }}
                                  onClick={() => {
                                    if (!isEffectiveStudentView && isOwnerAccount) {
                                      setSelectedAnnotationId(ann.id);
                                    }
                                  }}
                                  className={`annotation-sidebar-editor p-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 text-xs leading-relaxed flex flex-col gap-1.5 ${!isEffectiveStudentView && isOwnerAccount ? 'cursor-pointer' : 'cursor-default'} shadow-xs`}
                                >
                                  <div className="flex justify-between items-start gap-2">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {isDualPageView && dualPageActiveCommentTab === 'both' && (
                                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                                          ann.page_number === selectedPageNum 
                                            ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                                            : 'bg-blue-100 text-blue-900 border border-blue-300'
                                        }`}>
                                          P{ann.page_number} {ann.page_number === selectedPageNum ? '(बायाँ)' : '(दायाँ)'}
                                        </span>
                                      )}
                                      <span className="font-bold flex items-center gap-1">
                                        <span className={`w-2 h-2 rounded-full ${ann.x_percent < 50 ? 'bg-indigo-600' : 'bg-amber-600'}`}></span>
                                        <span>{ann.x_percent < 50 ? 'बायां हाशिया' : 'दायां हाशिया'}</span>
                                      </span>
                                    </div>
                                    {!isEffectiveStudentView && isOwnerAccount && (
                                      <div className="flex items-center gap-1 text-slate-400">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            deleteAnnotation(ann.id);
                                          }}
                                          className="hover:text-red-600 p-0.5 transition-colors hover:scale-110 active:scale-95"
                                          title="Delete"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {/* Text content edit (Owner Only) */}
                                  {selectedAnnotationId === ann.id && !isEffectiveStudentView && isOwnerAccount ? (
                                    <div className="space-y-2 mt-1">
                                      <HindiSpellCheckInput
                                        value={ann.text}
                                        onChange={(newVal) => updateAnnotationCoordinates(ann.id, { text: newVal })}
                                        placeholder="टिप्पणी संपादित करें..."
                                      />
                                      {/* Slider to adjust vertical height Y */}
                                      <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] text-slate-500 font-bold">
                                          <span>वर्टिकल ऊंचाई</span>
                                          <span>{ann.y_percent}%</span>
                                        </div>
                                        <input
                                          type="range"
                                          min="10"
                                          max="90"
                                          value={ann.y_percent}
                                          onChange={(e) => updateAnnotationCoordinates(ann.id, { y_percent: parseInt(e.target.value) })}
                                          className="w-full accent-amber-600"
                                        />
                                      </div>
                                      {/* Slider to adjust horizontal X */}
                                      <div className="space-y-1 pt-1.5 border-t border-slate-100">
                                        <div className="flex justify-between text-[10px] text-slate-500 font-bold">
                                          <span>हॉरिजॉन्टल स्थिति</span>
                                          <span>{ann.x_percent}%</span>
                                        </div>
                                        <input
                                          type="range"
                                          min="0"
                                          max="100"
                                          value={ann.x_percent}
                                          onChange={(e) => updateAnnotationCoordinates(ann.id, { x_percent: parseInt(e.target.value) })}
                                          className="w-full accent-emerald-600"
                                        />
                                        <div className="flex justify-between text-[8px] text-slate-400 font-semibold leading-normal">
                                          <span>बायां भाग</span>
                                          <span className="text-emerald-500">रिक्त स्थान</span>
                                          <span>दायां भाग</span>
                                        </div>
                                      </div>

                                      {/* Box Dimension Controls (Width, Height/Length & Font Scale) */}
                                      <div className="pt-2 border-t border-slate-200 space-y-2.5">
                                        <div className="flex justify-between items-center text-[11px] font-bold text-slate-700">
                                          <span className="flex items-center gap-1">
                                            <Maximize2 className="w-3.5 h-3.5 text-amber-600" />
                                            <span>बॉक्स का आकार (Width & Length)</span>
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => resetAnnotationDimensions(ann.id)}
                                            className="text-[9px] text-amber-700 hover:text-amber-900 underline cursor-pointer"
                                            title="डिफ़ॉल्ट आकार पर वापस लाएं"
                                          >
                                            रीसेट
                                          </button>
                                        </div>

                                        {/* Width Slider */}
                                        <div className="space-y-1">
                                          <div className="flex justify-between text-[10px] text-slate-500 font-bold">
                                            <span>चौड़ाई (Width)</span>
                                            <span className="text-amber-700 font-mono font-bold">{(ann.width_percent || 14.5).toFixed(1)}%</span>
                                          </div>
                                          <input
                                            type="range"
                                            min="8"
                                            max="45"
                                            step="0.5"
                                            value={ann.width_percent || 14.5}
                                            onChange={(e) => updateAnnotationCoordinates(ann.id, { width_percent: parseFloat(e.target.value) })}
                                            className="w-full accent-amber-600"
                                          />
                                          <div className="flex gap-1">
                                            <button
                                              type="button"
                                              onClick={() => updateAnnotationCoordinates(ann.id, { width_percent: 14.5 })}
                                              className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${(!ann.width_percent || ann.width_percent === 14.5) ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-slate-600'}`}
                                            >
                                              मानक (14.5%)
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => updateAnnotationCoordinates(ann.id, { width_percent: 22 })}
                                              className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${ann.width_percent === 22 ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-slate-600'}`}
                                            >
                                              मध्यम (22%)
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => updateAnnotationCoordinates(ann.id, { width_percent: 30 })}
                                              className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${ann.width_percent === 30 ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-slate-600'}`}
                                            >
                                              चौड़ा (30%)
                                            </button>
                                          </div>
                                        </div>

                                        {/* Height / Length Slider */}
                                        <div className="space-y-1 pt-1.5 border-t border-slate-100">
                                          <div className="flex justify-between text-[10px] text-slate-500 font-bold">
                                            <span>लम्बाई / ऊंचाई (Length)</span>
                                            <span className="text-blue-700 font-mono font-bold">{ann.min_height_px ? `${Math.round(ann.min_height_px)}px` : 'ऑटो'}</span>
                                          </div>
                                          <input
                                            type="range"
                                            min="25"
                                            max="250"
                                            step="5"
                                            value={ann.min_height_px || 40}
                                            onChange={(e) => updateAnnotationCoordinates(ann.id, { min_height_px: parseInt(e.target.value) })}
                                            className="w-full accent-blue-600"
                                          />
                                          <div className="flex gap-1">
                                            <button
                                              type="button"
                                              onClick={() => updateAnnotationCoordinates(ann.id, { min_height_px: undefined })}
                                              className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${!ann.min_height_px ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-slate-200 text-slate-600'}`}
                                            >
                                              ऑटो
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => updateAnnotationCoordinates(ann.id, { min_height_px: 60 })}
                                              className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${ann.min_height_px === 60 ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-slate-200 text-slate-600'}`}
                                            >
                                              मध्यम (60px)
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => updateAnnotationCoordinates(ann.id, { min_height_px: 110 })}
                                              className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${ann.min_height_px === 110 ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-slate-200 text-slate-600'}`}
                                            >
                                              लंबा (110px)
                                            </button>
                                          </div>
                                        </div>

                                        {/* Font Scale Slider & One-Time Global Fix + Format Controls */}
                                        <div className="space-y-1.5 pt-1.5 border-t border-slate-100">
                                          <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold">
                                            <span>फॉन्ट आकार (Font Scale)</span>
                                            <span className="text-emerald-700 font-mono font-bold">
                                              {Math.round((ann.font_scale || evalResult.default_font_scale || defaultAnnotationFontScale || 1.0) * 100)}%
                                            </span>
                                          </div>
                                          <input
                                            type="range"
                                            min="70"
                                            max="150"
                                            step="5"
                                            value={Math.round((ann.font_scale || evalResult.default_font_scale || defaultAnnotationFontScale || 1.0) * 100)}
                                            onChange={(e) => updateAnnotationCoordinates(ann.id, { font_scale: parseInt(e.target.value) / 100 })}
                                            className="w-full accent-emerald-600"
                                          />
                                          <div className="flex gap-1 flex-wrap">
                                            <button
                                              type="button"
                                              onClick={() => updateAnnotationCoordinates(ann.id, { font_scale: 0.85 })}
                                              className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border cursor-pointer ${ann.font_scale === 0.85 ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-slate-200 text-slate-600'}`}
                                            >
                                              छोटा (85%)
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => updateAnnotationCoordinates(ann.id, { font_scale: 1.0 })}
                                              className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border cursor-pointer ${(!ann.font_scale || ann.font_scale === 1.0) ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-slate-200 text-slate-600'}`}
                                            >
                                              सामान्य (100%)
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => updateAnnotationCoordinates(ann.id, { font_scale: 1.2 })}
                                              className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border cursor-pointer ${ann.font_scale === 1.2 ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-slate-200 text-slate-600'}`}
                                            >
                                              बड़ा (120%)
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => applyFontScaleToAllAnnotations(ann.font_scale || evalResult.default_font_scale || defaultAnnotationFontScale || 1.0)}
                                              className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 cursor-pointer shadow-2xs"
                                              title="One-Time Fix: यही अक्षर आकार सभी टिप्पणियों पर स्थायी रूप से सेट करें"
                                            >
                                              <Pin className="w-2.5 h-2.5" />
                                              <span>यही साइज़ सब पर फिक्स करें</span>
                                            </button>
                                          </div>

                                          {/* Side Panel Format Controls (Bold / Italics / Underline) */}
                                          <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between gap-1">
                                            <span className="text-[10px] text-slate-500 font-bold flex items-center gap-1">
                                              <Type className="w-3 h-3 text-indigo-600" />
                                              <span>Format:</span>
                                            </span>
                                            <div className="flex items-center gap-1">
                                              <button
                                                type="button"
                                                onClick={() => toggleAnnotationFormat(ann.id, 'is_bold')}
                                                className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 cursor-pointer ${
                                                  (ann.is_bold ?? true) ? 'bg-indigo-100 border-indigo-300 text-indigo-800' : 'bg-white border-slate-200 text-slate-600'
                                                }`}
                                                title="Bold (बोल्ड)"
                                              >
                                                <Bold className="w-3 h-3" />
                                                <span>B</span>
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => toggleAnnotationFormat(ann.id, 'is_italic')}
                                                className={`px-2 py-0.5 rounded text-[10px] italic border flex items-center gap-1 cursor-pointer ${
                                                  ann.is_italic ? 'bg-indigo-100 border-indigo-300 text-indigo-800 font-bold' : 'bg-white border-slate-200 text-slate-600'
                                                }`}
                                                title="Italics (तिरछा)"
                                              >
                                                <Italic className="w-3 h-3" />
                                                <span>I</span>
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => toggleAnnotationFormat(ann.id, 'is_underline')}
                                                className={`px-2 py-0.5 rounded text-[10px] underline border flex items-center gap-1 cursor-pointer ${
                                                  ann.is_underline ? 'bg-indigo-100 border-indigo-300 text-indigo-800 font-bold' : 'bg-white border-slate-200 text-slate-600'
                                                }`}
                                                title="Underline (रेखांकित)"
                                              >
                                                <Underline className="w-3 h-3" />
                                                <span>U</span>
                                              </button>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Save & Dismiss button */}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedAnnotationId(null);
                                            showToast('टिप्पणी सहेज ली गई');
                                          }}
                                          className="w-full mt-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
                                          title="एडिट पूरा करें और टूल बंद करें"
                                        >
                                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                          <span>सहेजें एवं बंद करें (Done)</span>
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col gap-2">
                                      <p className="font-semibold text-slate-800">{ann.text}</p>
                                    </div>
                                  )}
                                </motion.div>
                              ))}
                            </AnimatePresence>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  )}
                </div>
              </div>
              )}
            </div>

            <ModelAnswerDrawer
              isOpen={showModelAnswerDrawer}
              onClose={() => setShowModelAnswerDrawer(false)}
              questionText={questionText}
              modelAnswer={modelAnswer}
            />

            <EditMetadataModal
              isOpen={showEditMetadataDrawer}
              onClose={() => setShowEditMetadataDrawer(false)}
              studentName={studentName}
              setStudentName={setStudentName}
              subject={subject}
              setSubject={setSubject}
              maxMarks={maxMarks}
              setMaxMarks={setMaxMarks}
            />
          </div>
        ) : null}

        {/* MARKS DISTRIBUTION AUDIT MODAL OVERLAY */}
        <MarksDistributionModal
          isOpen={showMarksDistributionModal}
          onClose={() => setShowMarksDistributionModal(false)}
          evalResult={evalResult}
          studentName={studentName}
          evaluationId={activeCopyRecord?.id}
          isProcessingPdf={isProcessingPdf}
          pdfProcessingProgress={pdfProcessingProgress}
          onShareWhatsApp={handleShareWhatsApp}
          onExportPDF={handleExportPDF}
          onCopyAuditText={handleCopyAuditText}
        />

        {/* MODEL SETTINGS MODAL OVERLAY */}
        <ModelSettingsModal
          isOpen={showModelSettings}
          onClose={() => setShowModelSettings(false)}
          selectedModels={selectedModels}
          setSelectedModels={setSelectedModels}
          modelCategoryFilter={modelCategoryFilter}
          setModelCategoryFilter={setModelCategoryFilter}
          modelPingResults={modelPingResults}
          pingTestStatus={pingTestStatus}
          modelTemperature={modelTemperature}
          setModelTemperature={setModelTemperature}
          showFallbackAlertBanner={showFallbackAlertBanner}
          setShowFallbackAlertBanner={setShowFallbackAlertBanner}
          showDetailedModelTokens={showDetailedModelTokens}
          setShowDetailedModelTokens={setShowDetailedModelTokens}
          evaluationMaxTokens={evaluationMaxTokens}
          setEvaluationMaxTokens={setEvaluationMaxTokens}
          evaluationThinkingLevel={evaluationThinkingLevel}
          setEvaluationThinkingLevel={setEvaluationThinkingLevel}
          evalResult={evalResult}
          onOpenTokenAudit={(entry) => {
            setAuditEntryToInspect(entry);
            setShowModelAuditModal(true);
          }}
          annotationFont={annotationFont}
          onSelectAnnotationFont={handleSelectAnnotationFont}
          isPerfTrackingEnabled={isPerfTrackingEnabled}
          setIsPerfTrackingEnabled={setIsPerfTrackingEnabled}
          onApplyPreset={handleApplyPreset}
          onSelectAllFlash={handleSelectAllFlash}
          onSelectAllPro={handleSelectAllPro}
          onSelectAllModels={handleSelectAllModels}
          onMoveModelPriority={handleMoveModelPriority}
          onRunPingTest={handleRunPingTest}
          onResetModelSettings={handleResetModelSettings}
          onSaveModelSettings={handleSaveModelSettings}
          showToast={showToast}
        />

        {/* MODEL & TOKEN AUDIT MODAL */}
        <ModelTokenAuditModal
          isOpen={showModelAuditModal}
          onClose={() => setShowModelAuditModal(false)}
          evaluation={auditEntryToInspect || evalResult}
          onOpenModelSettings={() => setShowModelSettings(true)}
        />

        {/* SYSTEM PROMPT CONFIGURATION MODAL OVERLAY */}
        <SystemPromptEditorModal
          isOpen={showSystemPromptSettings}
          onClose={() => setShowSystemPromptSettings(false)}
          promptSlots={promptSlots}
          setPromptSlots={setPromptSlots}
          activeSlotId={activeSlotId}
          setActiveSlotId={setActiveSlotId}
          editingSlotId={editingSlotId}
          setEditingSlotId={setEditingSlotId}
          editingSlotName={editingSlotName}
          setEditingSlotName={setEditingSlotName}
          saveSlotName={saveSlotName}
          saveSystemPrompt={saveSystemPrompt}
          resetSystemPrompt={resetSystemPrompt}
          isSaving={isSavingSystemPrompt}
          showToast={showToast}
        />

        {/* AI LEARNING DATABASE MODAL OVERLAY */}
        <LearningDatabaseModal 
          isOpen={showLearningDatabase}
          onClose={() => setShowLearningDatabase(false)}
          logs={learningLogs}
          onClearLogs={handleClearLearningLogs}
          onDeleteLog={handleDeleteLearningLog}
        />

        {/* HISTORY MODAL OVERLAY */}
        <HistoryModal
          isOpen={showHistory}
          onClose={() => setShowHistory(false)}
          history={history}
          downloadingHistoryId={downloadingHistoryId}
          onLoadHistoryEntry={loadHistoryEntry}
          onDownloadHistoryItem={handleDownloadHistoryItem}
          onDeleteHistoryEntry={deleteHistoryEntry}
          isEffectiveStudentView={isEffectiveStudentView}
          onOpenProgressCard={() => setShowProgressCardModal(true)}
          onOpenQuotaUpgrade={() => setShowQuotaUpgradeModal(true)}
        />

        {/* STUDENT PROGRESS CARD MODAL */}
        <StudentProgressCardModal
          isOpen={showProgressCardModal}
          onClose={() => setShowProgressCardModal(false)}
          history={history}
          studentProfile={studentProfile}
          platformPolicy={platformPolicy}
          onLoadHistoryEntry={loadHistoryEntry}
          onOpenQuotaUpgrade={() => setShowQuotaUpgradeModal(true)}
          showToast={showToast}
        />

        {/* UPI / WHATSAPP QUOTA UPGRADE MODAL */}
        <QuotaUpgradeModal
          isOpen={showQuotaUpgradeModal}
          onClose={() => setShowQuotaUpgradeModal(false)}
          studentProfile={studentProfile}
          platformPolicy={platformPolicy}
          isOwnerAccount={isOwnerAccount}
          onOpenOwnerSettings={() => setShowOwnerAdminModal(true)}
          onStudentProfileUpdated={(updatedProf) => setStudentProfile(updatedProf)}
          showToast={showToast}
        />
      </main>

      {/* PWA Offline Connectivity Indicator */}
      <OfflineIndicator />

      {/* Global Performance Tracking Floating Panel */}
      {isPerfTrackingEnabled && perfLogs.length > 0 && (
        <div className="fixed bottom-4 left-4 w-80 bg-slate-900 border border-slate-700 shadow-2xl rounded-xl z-50 overflow-hidden flex flex-col max-h-96">
          <div className="bg-slate-800 px-3 py-2 flex justify-between items-center border-b border-slate-700">
            <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Performance Tracker
            </h4>
            <button 
              onClick={() => setPerfLogs([])}
              className="text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-900/50">
            {perfLogs.map(log => (
              <div key={log.id} className="bg-slate-800 p-2 rounded text-[10px] flex justify-between items-center border border-slate-700/50">
                <div className="flex flex-col">
                  <span className="font-bold text-amber-400">{log.model}</span>
                  <span className="text-slate-400 uppercase tracking-wider">{log.mode} mode • {log.timestamp.toLocaleTimeString()}</span>
                </div>
                <div className="font-mono font-bold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded">
                  {log.latencyMs}ms
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cloud Database & Multi-Device Sync Modal */}
      <CloudSyncModal
        isOpen={showCloudSyncModal}
        onClose={() => setShowCloudSyncModal(false)}
        user={cloudUser}
        isSyncing={isCloudSyncing}
        lastSyncedAt={lastCloudSyncedAt}
        syncError={cloudSyncError}
        onSignIn={handleCloudSignIn}
        onSignOut={handleCloudSignOut}
        onForcePullFromCloud={() => handleForcePullFromCloud()}
        onForcePushToCloud={() => handleForcePushToCloud()}
        stats={{
          promptSlotsCount: promptSlots.length,
          activeSlotName: promptSlots.find((s) => s.id === activeSlotId)?.name || `Slot ${activeSlotId}`,
          historyCount: history.length,
          learningLogsCount: learningLogs.length
        }}
      />

      {/* Owner Super-Admin Command Center Modal */}
      {isOwnerAccount && (
        <OwnerAdminModal
          isOpen={showOwnerAdminModal}
          onClose={() => setShowOwnerAdminModal(false)}
          ownerUid={cloudUser?.uid || 'local_owner'}
          platformPolicy={platformPolicy}
          onPolicyUpdated={(newPol) => setPlatformPolicy(newPol)}
          onStudentProfileUpdated={(updatedProf) => setStudentProfile(updatedProf)}
          onInspectStudentCopy={handleInspectStudentCopyFromAdmin}
          isStudentPreviewMode={isStudentPreviewMode}
          onToggleStudentPreviewMode={() => {
            setIsStudentPreviewMode((prev) => !prev);
            setEvaluationMode('single');
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}
