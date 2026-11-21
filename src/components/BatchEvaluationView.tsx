import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  Download,
  Play,
  Pause,
  CheckCircle2,
  AlertCircle,
  Clock,
  Search,
  Eye,
  Trash2,
  Award,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Plus,
  Check,
  ArrowRight,
  ArrowLeft,
  Edit3
} from 'lucide-react';
import localforage from 'localforage';
import { sanitizeAnnotationText } from '../utils/annotationSanitizer';

export interface BatchItem {
  id: string;
  fileName: string;
  studentName: string;
  file?: File;
  pages: { id: string; name: string; dataUrl: string }[];
  status: 'pending' | 'converting' | 'evaluating' | 'completed' | 'failed';
  evalResult?: any;
  error?: string;
  progressText?: string;
  evaluatedAt?: string;
  presetTitle?: string;
  itemMaxMarks?: number;
  itemModelAnswer?: string;
  itemRubricRules?: string;
  detectedMarks?: number;
  marksSource?: 'self_detected' | 'settings_fallback';
  marksEvidence?: string;
}

export interface BatchEvaluationSettings {
  evaluationStrictness?: 'liberal' | 'standard' | 'strict';
  feedbackDetailLevel?: 'standard' | 'comprehensive' | 'actionable';
  valueAdditionFocus?: boolean;
  ocrSensitivity?: 'standard' | 'high_precision';
  temperature?: number;
  feedbackLanguage?: 'bilingual' | 'pure_hindi' | 'english';
}

interface BatchEvaluationViewProps {
  onReviewCopy: (item: BatchItem) => void;
  onBackToSingle: () => void;
  sharedModelAnswer: string;
  setSharedModelAnswer: (val: string) => void;
  sharedMaxMarks: number;
  setSharedMaxMarks: (val: number) => void;
  sharedRubricRules: string;
  setSharedRubricRules: (val: string) => void;
  isDarkMode: boolean;
  showToast: (msg: string) => void;
  onLogPerformance?: (model: string, timeMs: number) => void;
  activeSystemPrompt?: string;
  activeSlotId?: number;
  activeSlotName?: string;
  selectedModels: string[];
  evaluationSettings?: BatchEvaluationSettings;
}

export type BatchStep = 'step1_setup' | 'step2_upload' | 'step3_evaluate';

export const BatchEvaluationView: React.FC<BatchEvaluationViewProps> = ({
  onReviewCopy,
  onBackToSingle,
  sharedModelAnswer,
  setSharedModelAnswer,
  sharedMaxMarks,
  setSharedMaxMarks,
  sharedRubricRules,
  setSharedRubricRules,
  isDarkMode,
  showToast,
  onLogPerformance,
  activeSystemPrompt,
  activeSlotId,
  activeSlotName,
  selectedModels,
  evaluationSettings
}) => {
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [activeStep, setActiveStep] = useState<BatchStep>('step1_setup');
  const [showRubrics, setShowRubrics] = useState<boolean>(Boolean(sharedRubricRules && sharedRubricRules.trim()));
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState<string>('');

  const handleSaveStudentName = (itemId: string) => {
    if (editingNameValue.trim()) {
      handleUpdateBatchItem(itemId, { studentName: editingNameValue.trim() });
    }
    setEditingStudentId(null);
  };
  const [isProcessingBatch, setIsProcessingBatch] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'pending' | 'failed'>('all');
  const [sortOrder, setSortOrder] = useState<'upload_time' | 'status' | 'alphabetical'>('upload_time');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [isGeneratingZip, setIsGeneratingZip] = useState<boolean>(false);
  const [zipProgress, setZipProgress] = useState<number>(0);
  const [showConfigPanel, setShowConfigPanel] = useState<boolean>(true);

  interface ModelAnswerPreset {
    id: string;
    title: string;
    modelAnswer: string;
    maxMarks: number;
    rubricRules: string;
  }
  const [presets, setPresets] = useState<ModelAnswerPreset[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('upsc_model_answer_presets') || '[]');
    } catch {
      return [];
    }
  });
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [presetTitleInput, setPresetTitleInput] = useState<string>('');

  const [isExtractingText, setIsExtractingText] = useState(false);
  const modelAnswerInputRef = useRef<HTMLInputElement>(null);

  const handleModelAnswerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsExtractingText(true);
    showToast(`⏳ '${file.name}' से टेक्स्ट निकाला जा रहा है...`);
    
    try {
      let fileDataUrl = '';
      if (file.type === 'text/plain') {
        const text = await file.text();
        setSharedModelAnswer(text);
        showToast('✅ टेक्स्ट सफलतापूर्वक लोड किया गया!');
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

      const response = await fetch('/api/extract-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileDataUrl, mimeType: file.type })
      });
      
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Extract failed');
      
      setSharedModelAnswer(result.text);
      showToast('✅ फाइल से टेक्स्ट सफलतापूर्वक निकाला गया!');
    } catch (err: any) {
      console.error(err);
      showToast(`❌ टेक्स्ट निकालने में विफल: ${err.message}`);
    } finally {
      setIsExtractingText(false);
      if (modelAnswerInputRef.current) modelAnswerInputRef.current.value = '';
    }
  };

  const saveCurrentAsPreset = () => {
    if (!presetTitleInput.trim()) {
      showToast('⚠️ कृपया टेस्ट सीरीज़/मॉडल उत्तर का नाम दर्ज करें।');
      return;
    }
    const newPreset: ModelAnswerPreset = {
      id: `preset-${Date.now()}`,
      title: presetTitleInput.trim(),
      modelAnswer: sharedModelAnswer,
      maxMarks: sharedMaxMarks,
      rubricRules: sharedRubricRules
    };
    const updated = [...presets, newPreset];
    setPresets(updated);
    localStorage.setItem('upsc_model_answer_presets', JSON.stringify(updated));
    setSelectedPresetId(newPreset.id);
    showToast(`✅ ${newPreset.title} सेव कर लिया गया है।`);
  };

  const loadPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (!presetId) return;
    const preset = presets.find(p => p.id === presetId);
    if (preset) {
      setSharedModelAnswer(preset.modelAnswer);
      setSharedMaxMarks(preset.maxMarks);
      setSharedRubricRules(preset.rubricRules);
      setPresetTitleInput(preset.title);
      showToast(`📂 ${preset.title} लोड कर लिया गया है।`);
    }
  };

  const deletePreset = (presetId: string) => {
    const updated = presets.filter(p => p.id !== presetId);
    setPresets(updated);
    localStorage.setItem('upsc_model_answer_presets', JSON.stringify(updated));
    if (selectedPresetId === presetId) setSelectedPresetId('');
    showToast(`🗑️ टेस्ट सीरीज़/मॉडल उत्तर हटा दिया गया।`);
  };

  const clearModelAnswer = () => {
    setSharedModelAnswer('');
    showToast('🧹 मॉडल उत्तर खाली कर दिया गया है।');
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemFileInputRef = useRef<HTMLInputElement>(null);
  const [reuploadTargetItemId, setReuploadTargetItemId] = useState<string | null>(null);
  const isRunningRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);

  // Handle re-uploading file for a specific failed/empty item
  const handleItemFileReupload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !reuploadTargetItemId) return;

    showToast(`⏳ ${file.name} को प्रोसेस किया जा रहा है...`);

    let pages: { id: string; name: string; dataUrl: string }[] = [];
    try {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        pages = await convertPdfToPages(file);
      } else if (file.type.startsWith('image/')) {
        const dataUrl = await compressImageFile(file);
        pages = [{
          id: `img-${Date.now()}`,
          name: file.name,
          dataUrl
        }];
      }
    } catch (convErr: any) {
      console.error(`Failed to convert re-uploaded file ${file.name}:`, convErr);
    }

    const updated = batchItems.map(item => {
      if (item.id === reuploadTargetItemId) {
        return {
          ...item,
          fileName: file.name,
          studentName: item.studentName || file.name.replace(/\.[^/.]+$/, ''),
          pages: pages,
          status: pages.length > 0 ? ('pending' as const) : ('failed' as const),
          error: pages.length === 0 ? 'PDF पढ़ने में असमर्थ। कृपया वैध PDF अपलोड करें।' : undefined,
          file: file
        };
      }
      return item;
    });

    setBatchItems(updated);
    saveBatchToStorage(updated);
    if (pages.length > 0) {
      showToast(`✅ ${file.name} (${pages.length} पृष्ठ) सफलतापूर्वक लोड हुआ! अब आप मूल्यांकन शुरू कर सकते हैं।`);
    } else {
      showToast(`❌ ${file.name} से कोई पृष्ठ प्राप्त नहीं हो सका।`);
    }

    setReuploadTargetItemId(null);
    if (itemFileInputRef.current) itemFileInputRef.current.value = '';
  };

  const triggerReuploadForBatchItem = (itemId: string) => {
    setReuploadTargetItemId(itemId);
    if (itemFileInputRef.current) {
      itemFileInputRef.current.click();
    }
  };

  // Sync refs with state
  useEffect(() => {
    isRunningRef.current = isProcessingBatch;
    isPausedRef.current = isPaused;
    if (isProcessingBatch) {
      setActiveStep('step3_evaluate');
    }
  }, [isProcessingBatch, isPaused]);

  // Load saved batch from IndexedDB on mount
  useEffect(() => {
    localforage.getItem('upsc_mains_batch_vault').then((savedBatch: any) => {
      if (savedBatch && Array.isArray(savedBatch) && savedBatch.length > 0) {
        // Sanitize existing items: if an item has no pages and is not completed, flag it cleanly as needing upload
        const sanitized = savedBatch.map((item: BatchItem) => {
          if ((!item.pages || item.pages.length === 0) && item.status !== 'completed') {
            return {
              ...item,
              status: 'failed' as const,
              error: 'कोई पृष्ठ उपलब्ध नहीं है। कृपया सामने दिए "अपलोड" बटन से PDF चुनें।'
            };
          }
          return item;
        });
        setBatchItems(sanitized);
        if (sanitized.some(i => i.status === 'completed')) {
          setActiveStep('step3_evaluate');
        } else {
          setActiveStep('step1_setup');
        }
      } else {
        setActiveStep('step1_setup');
      }
    }).catch(e => console.error('Failed to load batch from storage', e));
  }, []);

  // Save batch updates to IndexedDB
  const saveBatchToStorage = (items: BatchItem[]) => {
    // Avoid saving huge raw File objects to indexedDB
    const persistable = items.map(item => ({
      ...item,
      file: undefined
    }));
    localforage.setItem('upsc_mains_batch_vault', persistable).catch(e => console.error(e));
  };

  // Convert PDF to images using window.pdfjsLib
  const compressImageFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1600;
          let width = img.width;
          let height = img.height;
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
            const compressed = canvas.toDataURL('image/jpeg', 0.80);
            canvas.width = 0; canvas.height = 0; // free memory
            resolve(compressed);
          } else {
            resolve(reader.result as string);
          }
        };
        img.onerror = reject;
        img.src = reader.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const convertPdfToPages = async (file: File): Promise<{ id: string; name: string; dataUrl: string }[]> => {
    // Wait for pdfjsLib if not ready yet
    let retries = 0;
    // @ts-ignore
    while (!window.pdfjsLib && retries < 20) {
      await new Promise(r => setTimeout(r, 200));
      retries++;
    }
    // @ts-ignore
    if (!window.pdfjsLib) {
      throw new Error('PDF.js library is not available');
    }
    const arrayBuffer = await file.arrayBuffer();
    const typedarray = new Uint8Array(arrayBuffer);
    // @ts-ignore
    const pdf = await window.pdfjsLib.getDocument(typedarray).promise;
    const totalPages = pdf.numPages;
    const pagesArray: { id: string; name: string; dataUrl: string }[] = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      if (context) {
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.80);
        pagesArray.push({
          id: `batch-page-${pageNum}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          name: `${file.name}_Page_${pageNum}.jpg`,
          dataUrl
        });
        
        // Aggressively free memory
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    return pagesArray;
  };

  // Handle uploading multiple files with immediate pre-processing of PDF / Images
  const processBatchFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    showToast(`⏳ ${files.length} कॉपियां प्रोसेस की जा रही हैं...`);

    const newItems: BatchItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const rawName = file.name.replace(/\.[^/.]+$/, '');
      let pages: { id: string; name: string; dataUrl: string }[] = [];

      try {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          pages = await convertPdfToPages(file);
        } else if (file.type.startsWith('image/')) {
          const dataUrl = await compressImageFile(file);
          pages = [{
            id: `img-${Date.now()}-${i}`,
            name: file.name,
            dataUrl
          }];
        }
      } catch (convErr: any) {
        console.error(`Failed to pre-convert ${file.name}:`, convErr);
      }

      newItems.push({
        id: `batch-item-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 5)}`,
        fileName: file.name,
        studentName: rawName,
        pages: pages,
        status: pages.length > 0 ? 'pending' : 'failed',
        error: pages.length === 0 ? 'कोई पृष्ठ प्राप्त नहीं हुआ या PDF पढ़ने में असमर्थ।' : undefined
      });
    }

    const updatedList = [...batchItems, ...newItems];
    setBatchItems(updatedList);
    saveBatchToStorage(updatedList);
    showToast(`✅ ${newItems.length} कॉपियां कतार में जोड़ी गईं!`);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleBatchFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processBatchFiles(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await processBatchFiles(files);
    }
  };

  // Helper to evaluate a single batch item
  const evaluateSingleItem = async (item: BatchItem): Promise<{ evalResult: any; pages: any[] }> => {
    let pages = item.pages;
    if ((!pages || pages.length === 0) && item.file) {
      if (item.file.type === 'application/pdf' || item.file.name.toLowerCase().endsWith('.pdf')) {
        pages = await convertPdfToPages(item.file);
      } else if (item.file.type.startsWith('image/')) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(item.file!);
        });
        pages = [{
          id: `img-${Date.now()}`,
          name: item.fileName,
          dataUrl
        }];
      }
    }

    if (!pages || pages.length === 0) {
      throw new Error('कोई पृष्ठ प्राप्त नहीं हुआ या PDF खाली है। कृपया इस फाइल को दोबारा अपलोड करें।');
    }

    const imagesPayload = pages.map(p => p.dataUrl);

    const perfStart = performance.now();
    const requestBodyStr = JSON.stringify({
      images: imagesPayload,
      requestedModels: selectedModels,
      subject: '',
      question: '',
      maxMarks: item.itemMaxMarks !== undefined ? item.itemMaxMarks : sharedMaxMarks,
      modelAnswer: item.itemModelAnswer !== undefined ? item.itemModelAnswer : sharedModelAnswer,
      rubricRules: item.itemRubricRules !== undefined ? item.itemRubricRules : sharedRubricRules,
      slotId: activeSlotId,
      slotName: activeSlotName,
      systemPrompt: activeSystemPrompt,
      evaluationStrictness: evaluationSettings?.evaluationStrictness,
      feedbackDetailLevel: evaluationSettings?.feedbackDetailLevel,
      valueAdditionFocus: evaluationSettings?.valueAdditionFocus,
      ocrSensitivity: evaluationSettings?.ocrSensitivity,
      temperature: evaluationSettings?.temperature,
      feedbackLanguage: evaluationSettings?.feedbackLanguage,
      maxOutputTokens: typeof window !== 'undefined' ? (Number(localStorage.getItem('upsc_evaluation_max_tokens')) || 8192) : 8192,
      thinkingLevel: typeof window !== 'undefined' ? (localStorage.getItem('upsc_evaluation_thinking_level') || 'auto') : 'auto'
    });

    let response: Response | null = null;
    let responseText = '';
    let result: any = null;
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
          const healthUrl = initialAuthSearch
            ? `/api/health${initialAuthSearch}`
            : '/api/health?__storage_access_granted=true';
          await fetch(healthUrl, { credentials: 'include', cache: 'no-store' }).catch(() => {});
          await new Promise((r) => setTimeout(r, 2200 * attempt));
          continue;
        }
        if (isHtmlResponse) {
          throw new Error('सर्वर वार्मअप या सत्र रीफ़्रेश की आवश्यकता है। कृपया पेज रीलोड करके पुनः प्रयास करें।');
        }
        throw new Error(`सर्वर से अमान्य उत्तर: ${responseText.substring(0, 100)}`);
      }
    }

    const perfEnd = performance.now();
    const latencyMs = Math.round(perfEnd - perfStart);

    if (!response || !result) {
      throw new Error('सर्वर से कोई उत्तर प्राप्त नहीं हुआ।');
    }

    if (!response.ok) {
      throw new Error(result?.error || `सर्वर त्रुटि: ${response.status}`);
    }
    
    if (onLogPerformance) {
      onLogPerformance(result.model_used || 'unknown-model', latencyMs);
    }

    // Sanitize annotations and pages
    const validatedPages = (result.pages || []).map((p: any, pIndex: number) => {
      const pageNum = pIndex + 1;
      const rawAnnotations = p.page_type === 'blank_page' ? [] : (p.annotations || []);
      const sanitizedAnns = rawAnnotations.map((ann: any, aIndex: number) => {
        const isStamp = ['✔', '❌', '◯', '➔', '→', '←', '•', '⭐'].includes(ann.text);
        const isLeft = ann.x_percent < 50;
        let clampedX = ann.x_percent;
        let clampedY = ann.y_percent;

        if (!isStamp) {
          clampedX = isLeft
            ? Math.max(3, Math.min(5.5, ann.x_percent))
            : Math.max(86.5, Math.min(89, ann.x_percent));
          if (isLeft && ann.y_percent < 18) {
            clampedY = 19.5;
          } else {
            clampedY = Math.max(12, Math.min(88, ann.y_percent));
          }
        } else {
          clampedY = Math.max(5, Math.min(95, ann.y_percent));
        }

        let cleanText = ann.text;
        if (!isStamp && typeof cleanText === 'string') {
          cleanText = sanitizeAnnotationText(cleanText);
        }

        return {
          ...ann,
          id: ann.id || `ann-${pageNum}-${aIndex}-${Date.now()}`,
          text: cleanText,
          x_percent: clampedX,
          y_percent: clampedY
        };
      });

      return {
        ...p,
        page_number: pageNum,
        page_type: p.page_type || (pageNum === 1 ? 'cover_page' : 'answer_page'),
        annotations: sanitizedAnns
      };
    });

    return {
      evalResult: {
        ...result,
        pages: validatedPages
      },
      pages
    };
  };

  // Main Queue Processor Loop
  const startBatchProcessing = async () => {
    if (isProcessingBatch && !isPaused) return;

    if (isPaused) {
      setIsPaused(false);
      isPausedRef.current = false;
      return;
    }

    setIsProcessingBatch(true);
    setIsPaused(false);
    isRunningRef.current = true;
    isPausedRef.current = false;
    setActiveStep('step3_evaluate');

    const currentItems = [...batchItems];

    for (let i = 0; i < currentItems.length; i++) {
      if (!isRunningRef.current) break;

      // While paused, wait
      while (isPausedRef.current) {
        await new Promise(r => setTimeout(r, 500));
        if (!isRunningRef.current) break;
      }
      if (!isRunningRef.current) break;

      const item = currentItems[i];
      if (item.status === 'completed') continue;

      // If pages are missing and file object is not available, mark cleanly as failed and continue queue
      if ((!item.pages || item.pages.length === 0) && !item.file) {
        currentItems[i] = {
          ...item,
          status: 'failed',
          error: 'कोई पृष्ठ उपलब्ध नहीं है। कृपया सामने दिए "अपलोड" बटन से PDF चुनें।'
        };
        setBatchItems([...currentItems]);
        saveBatchToStorage(currentItems);
        continue;
      }

      setActiveItemId(item.id);

      // Update status to evaluating
      currentItems[i] = {
        ...item,
        status: 'evaluating',
        progressText: 'मूल्यांकन प्रक्रियाधीन है...',
        error: undefined
      };
      setBatchItems([...currentItems]);

      try {
        const { evalResult, pages } = await evaluateSingleItem(currentItems[i]);

        const detectedM = evalResult?.total_marks?.detected_marks;
        const sourceM = evalResult?.total_marks?.marks_detection_source || 'settings_fallback';
        const evidenceM = evalResult?.total_marks?.marks_detection_evidence;

        currentItems[i] = {
          ...currentItems[i],
          status: 'completed',
          evalResult,
          pages,
          detectedMarks: detectedM,
          marksSource: sourceM,
          marksEvidence: evidenceM,
          progressText: `सफलतापूर्वक जांची गई (${evalResult.total_marks.obtained}/${evalResult.total_marks.max_marks})`,
          evaluatedAt: new Date().toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' }),
          presetTitle: presetTitleInput.trim() || 'General Evaluation'
        };
        setBatchItems([...currentItems]);
        saveBatchToStorage(currentItems);

        // Safe auto-pacing cooldown between copies to prevent 429 quota errors
        if (i < currentItems.length - 1) {
          await new Promise(r => setTimeout(r, 2500));
        }
      } catch (err: any) {
        console.error(`Batch Item ${item.id} failed:`, err);
        currentItems[i] = {
          ...currentItems[i],
          status: 'failed',
          error: err.message || 'मूल्यांकन विफल रहा'
        };
        setBatchItems([...currentItems]);
        saveBatchToStorage(currentItems);

        // Brief cooldown on error
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    setIsProcessingBatch(false);
    setIsPaused(false);
    setActiveItemId(null);
    isRunningRef.current = false;
    showToast('🎉 बंच मूल्यांकन पूरा हुआ!');
  };

  const pauseBatchProcessing = () => {
    setIsPaused(true);
    isPausedRef.current = true;
    showToast('⏸️ बंच मूल्यांकन रोक दिया गया है।');
  };

  const stopBatchProcessing = () => {
    setIsProcessingBatch(false);
    setIsPaused(false);
    isRunningRef.current = false;
    isPausedRef.current = false;
    setActiveItemId(null);
    showToast('⏹️ बंच मूल्यांकन बंद किया गया।');
  };

  const handleStartBatchFromSetup = () => {
    if (batchItems.length === 0) {
      showToast('⚠️ कृपया पहले कम से कम एक छात्र उत्तर पुस्तिका अपलोड करें।');
      return;
    }
    setActiveStep('step3_evaluate');
    startBatchProcessing();
  };

  const retryFailedItem = async (itemId: string) => {
    const itemIndex = batchItems.findIndex(b => b.id === itemId);
    if (itemIndex === -1) return;

    // If pages are missing, automatically open the re-upload dialog
    if ((!batchItems[itemIndex].pages || batchItems[itemIndex].pages.length === 0) && !batchItems[itemIndex].file) {
      showToast('⚠️ इस कॉपी के पेज उपलब्ध नहीं हैं। कृपया PDF चुनें।');
      triggerReuploadForBatchItem(itemId);
      return;
    }

    const updated = [...batchItems];
    updated[itemIndex].status = 'evaluating';
    updated[itemIndex].error = undefined;
    setBatchItems(updated);
    setActiveItemId(itemId);

    try {
      const { evalResult, pages } = await evaluateSingleItem(updated[itemIndex]);
      const detectedM = evalResult?.total_marks?.detected_marks;
      const sourceM = evalResult?.total_marks?.marks_detection_source || 'settings_fallback';
      const evidenceM = evalResult?.total_marks?.marks_detection_evidence;

      updated[itemIndex] = {
        ...updated[itemIndex],
        status: 'completed',
        evalResult,
        pages,
        detectedMarks: detectedM,
        marksSource: sourceM,
        marksEvidence: evidenceM,
        progressText: `सफलतापूर्वक जांची गई (${evalResult.total_marks.obtained}/${evalResult.total_marks.max_marks})`,
        evaluatedAt: new Date().toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' })
      };
      setBatchItems([...updated]);
      saveBatchToStorage(updated);
      showToast(`✅ ${updated[itemIndex].studentName} की कॉपी सफलतापूर्वक जांची गई!`);
    } catch (e: any) {
      updated[itemIndex].status = 'failed';
      updated[itemIndex].error = e.message || 'पुनः प्रयास विफल रहा';
      setBatchItems([...updated]);
      saveBatchToStorage(updated);
    }
    setActiveItemId(null);
  };

  const removeFailedBatchItems = () => {
    const updated = batchItems.filter(b => b.status !== 'failed');
    const removedCount = batchItems.length - updated.length;
    setBatchItems(updated);
    saveBatchToStorage(updated);
    showToast(`🗑️ ${removedCount} असफल/अमान्य कॉपियां हटा दी गईं।`);
  };

  const deleteBatchItem = (itemId: string) => {
    const updated = batchItems.filter(b => b.id !== itemId);
    setBatchItems(updated);
    saveBatchToStorage(updated);
    showToast('कॉपी सूची से हटा दी गई।');
  };

  const handleUpdateBatchItem = (itemId: string, updates: Partial<BatchItem>) => {
    const updated = batchItems.map(item => {
      if (item.id === itemId) {
        return { ...item, ...updates };
      }
      return item;
    });
    setBatchItems(updated);
    saveBatchToStorage(updated);
  };

  const [isConfirmingClear, setIsConfirmingClear] = useState<boolean>(false);

  const clearEntireBatch = () => {
    if (!isConfirmingClear) {
      setIsConfirmingClear(true);
      setTimeout(() => setIsConfirmingClear(false), 3000);
      return;
    }
    stopBatchProcessing();
    setBatchItems([]);
    localforage.removeItem('upsc_mains_batch_vault');
    setSelectedItemIds(new Set());
    setIsConfirmingClear(false);
    showToast('पूरा बंच खाली कर दिया गया है।');
  };

  const handleToggleSelectItem = (id: string) => {
    setSelectedItemIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const handleToggleSelectAll = (filteredIds: string[]) => {
    if (selectedItemIds.size === filteredIds.length && filteredIds.length > 0) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(filteredIds));
    }
  };

  const [isConfirmingBulkDelete, setIsConfirmingBulkDelete] = useState(false);

  const handleBulkDeleteSelected = () => {
    if (!isConfirmingBulkDelete) {
      setIsConfirmingBulkDelete(true);
      setTimeout(() => setIsConfirmingBulkDelete(false), 3000);
      return;
    }
    
    const updated = batchItems.filter(item => !selectedItemIds.has(item.id));
    setBatchItems(updated);
    saveBatchToStorage(updated);
    setSelectedItemIds(new Set());
    setIsConfirmingBulkDelete(false);
    showToast(`${selectedItemIds.size} कॉपियां हटा दी गईं।`);
  };

  // Helper to generate a PDF Blob for a batch item
  const generatePdfBlobForItem = async (item: BatchItem): Promise<Blob | null> => {
    if (!item.evalResult || !item.pages || item.pages.length === 0) return null;

    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const totalPages = item.pages.length;

    for (let i = 0; i < totalPages; i++) {
      const upPage = item.pages[i];
      const pageNum = i + 1;
      const pageResult = item.evalResult.pages?.find((p: any) => p.page_number === pageNum);
      const annotations = pageResult ? pageResult.annotations : [];

      const img = new Image();
      img.src = upPage.dataUrl;
      await new Promise(resolve => {
        if (img.complete) resolve(true);
        else {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(true);
        }
      });

      // Full-page A4 dimensions (1200 x 1697 px, standard 1:1.414 ratio)
      const A4_WIDTH = 1200;
      const A4_HEIGHT = 1697;
      const isLandscape = (img.width || 0) > (img.height || 0);
      const imgWidth = isLandscape ? A4_HEIGHT : A4_WIDTH;
      const imgHeight = isLandscape ? A4_WIDTH : A4_HEIGHT;

      const canvas = document.createElement('canvas');
      canvas.width = imgWidth;
      canvas.height = imgHeight;
      const ctx = canvas.getContext('2d', { alpha: false });

      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, imgWidth, imgHeight);
        ctx.drawImage(img, 0, 0, imgWidth, imgHeight);

        // Draw Total Marks Circle on Page 1
        if (pageNum === 1) {
          const marksStr = `${item.evalResult.total_marks.obtained} / ${item.evalResult.total_marks.max_marks}`;
          const circleRadius = Math.max(35, imgWidth * 0.06);
          const circleX = imgWidth - circleRadius - (imgWidth * 0.02);
          const circleY = circleRadius + (imgWidth * 0.02);

          ctx.beginPath();
          ctx.arc(circleX, circleY, circleRadius, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
          ctx.fill();
          ctx.lineWidth = Math.max(2.5, imgWidth * 0.005);
          ctx.strokeStyle = '#dc2626';
          ctx.stroke();

          const fontSize = Math.max(18, Math.floor(circleRadius * 0.5));
          ctx.font = `900 ${fontSize}px sans-serif`;
          ctx.fillStyle = '#dc2626';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(marksStr, circleX, circleY);
          ctx.textAlign = 'left';
        }

        // Draw Red Margin Annotations
        const fontSize = Math.max(15, Math.floor(imgWidth * 0.0175));
        const savedFont = typeof window !== 'undefined' && localStorage.getItem('upsc_annotation_font') === 'mukta' ? 'mukta' : 'kalam';
        if (typeof document !== 'undefined' && document.fonts?.load) {
          try {
            await document.fonts.load(`bold ${fontSize}px "Kalam"`);
            if (savedFont === 'mukta') {
              await document.fonts.load(`bold ${fontSize}px "Mukta"`);
            }
          } catch (fontErr) {
            console.warn('Font load fallback:', fontErr);
          }
        }

        annotations.forEach((ann: any) => {
          const isStamp = ['✔', '❌', '◯', '➔', '→', '←', '•', '⭐'].includes(ann.text);
          const isLeft = ann.x_percent < 50;
          const yPos = (ann.y_percent / 100) * imgHeight;
          const xPos = isStamp
            ? (ann.x_percent / 100) * imgWidth
            : isLeft
              ? Math.max(imgWidth * 0.018, Math.min(imgWidth * 0.032, (ann.x_percent / 100) * imgWidth))
              : Math.max(imgWidth * 0.855, Math.min(imgWidth * 0.872, (ann.x_percent / 100) * imgWidth));

          if (isStamp) {
            const stampFontSize = Math.max(26, Math.floor(imgWidth * 0.04));
            ctx.font = `900 ${stampFontSize}px sans-serif`;
            ctx.fillStyle = '#4338ca';
            ctx.textBaseline = 'middle';
            ctx.fillText(ann.text, xPos, yPos);
          } else {
            const fontName = savedFont === 'mukta' ? '"Mukta", "Noto Sans Devanagari", sans-serif' : '"Kalam", "Noto Sans Devanagari", cursive, sans-serif';
            ctx.font = `bold ${fontSize}px ${fontName}`;
            ctx.fillStyle = '#b91c1c';
            ctx.textBaseline = 'middle';

            const maxWidth = imgWidth * 0.145;
            const words = ann.text.split(' ');
            let line = '';
            let currentY = yPos;
            const lineHeight = fontSize * 1.32;

            for (let n = 0; n < words.length; n++) {
              const testLine = line + words[n] + ' ';
              const metrics = ctx.measureText(testLine);
              if (metrics.width > maxWidth && n > 0) {
                ctx.fillText(line, xPos, currentY);
                line = words[n] + ' ';
                currentY += lineHeight;
              } else {
                line = testLine;
              }
            }
            ctx.fillText(line, xPos, currentY);
          }
        });
      }

      const renderedImgData = canvas.toDataURL('image/jpeg', 0.80);
      if (i === 0) {
        doc.addPage([imgWidth, imgHeight], imgWidth > imgHeight ? 'landscape' : 'portrait');
        doc.deletePage(1);
      } else {
        doc.addPage([imgWidth, imgHeight], imgWidth > imgHeight ? 'landscape' : 'portrait');
      }
      doc.addImage(renderedImgData, 'JPEG', 0, 0, imgWidth, imgHeight, undefined, 'FAST');
    }

    return doc.output('blob');
  };

  // Download Single Item PDF
  const handleDownloadSingleItemPdf = async (item: BatchItem) => {
    showToast(`⏳ ${item.studentName} की PDF तैयार हो रही है...`);
    const blob = await generatePdfBlobForItem(item);
    if (!blob) {
      showToast('⚠️ PDF बनाने में असमर्थ।');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `${item.studentName.replace(/\s+/g, '_')}_Evaluated.pdf`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    try {
      a.click();
    } catch (e) {
      window.open(url, '_blank');
    }
    
    // Cleanup with delay to allow mobile download managers to fetch the blob
    setTimeout(() => {
      if (document.body.contains(a)) {
        document.body.removeChild(a);
      }
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }, 3000);
    
    showToast(`✅ ${item.studentName} की PDF डाउनलोड हो गई!`);
  };

  // Download CSV / Excel Merit List
  const handleExportCSV = () => {
    const completed = batchItems.filter(b => b.status === 'completed');
    if (completed.length === 0) {
      showToast('⚠️ कोई जांची हुई कॉपी उपलब्ध नहीं है।');
      return;
    }

    let csvContent = 'क्र.सं.,छात्र / रोल नंबर,प्राप्तांक,अधिकतम अंक,प्रतिशत (%),भूमिका अंक,मुख्य भाग अंक,प्रस्तुतीकरण अंक,निष्कर्ष अंक,प्रमुख टिप्पणी\n';

    completed.forEach((item, idx) => {
      const ob = item.evalResult.total_marks.obtained;
      const max = item.evalResult.total_marks.max_marks;
      const pct = ((ob / max) * 100).toFixed(1);
      const intro = item.evalResult.rubric_breakdown?.introduction?.score ?? '-';
      const body = item.evalResult.rubric_breakdown?.main_body?.score ?? '-';
      const pres = item.evalResult.rubric_breakdown?.presentation?.score ?? '-';
      const concl = item.evalResult.rubric_breakdown?.conclusion?.score ?? '-';
      
      const summary = (item.evalResult.pages?.[0]?.detected_content_summary || 'मूल्यांकन संपन्न')
        .replace(/"/g, '""')
        .replace(/\n/g, ' ');

      csvContent += `${idx + 1},"${item.studentName}",${ob},${max},${pct}%,${intro},${body},${pres},${concl},"${summary}"\n`;
    });

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `UPSC_Batch_Merit_List_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('📊 मेरिट सूची सफलतापूर्वक डाउनलोड हो गई!');
  };

  // Download All Completed Copies as ZIP
  const handleExportAllZip = async () => {
    const completed = batchItems.filter(b => b.status === 'completed');
    if (completed.length === 0) {
      showToast('⚠️ कोई जांची हुई कॉपी उपलब्ध नहीं है।');
      return;
    }

    setIsGeneratingZip(true);
    setZipProgress(5);
    showToast('📦 सभी PDFs की ZIP फाइल तैयार की जा रही है...');

    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const folder = zip.folder('Evaluated_UPSC_Copies');

      for (let i = 0; i < completed.length; i++) {
        const item = completed[i];
        const pdfBlob = await generatePdfBlobForItem(item);
        if (pdfBlob && folder) {
          folder.file(`${item.studentName.replace(/\s+/g, '_')}_Evaluated.pdf`, pdfBlob);
        }
        setZipProgress(Math.round(((i + 1) / completed.length) * 90));
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `UPSC_Batch_${completed.length}_Evaluated_Copies.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setZipProgress(100);
      showToast(`🎉 ${completed.length} कॉपियों की ZIP डाउनलोड हो गई!`);
    } catch (err: any) {
      console.error('ZIP generation failed:', err);
      showToast('❌ ZIP फाइल बनाने में त्रुटि आई।');
    }
    setIsGeneratingZip(false);
  };

  // Statistics
  const totalCount = batchItems.length;
  const completedCount = batchItems.filter(b => b.status === 'completed').length;
  const pendingCount = batchItems.filter(b => b.status === 'pending' || b.status === 'converting').length;
  const failedCount = batchItems.filter(b => b.status === 'failed').length;
  const evaluatingCount = batchItems.filter(b => b.status === 'evaluating').length;
  const totalPagesAcrossAll = batchItems.reduce((acc, item) => acc + (item.pages?.length || 0), 0);
  const activeItem = batchItems.find(b => b.id === activeItemId);

  const completedMarks = batchItems.filter(b => b.status === 'completed').map(b => b.evalResult.total_marks.obtained);
  const avgMarks = completedMarks.length > 0
    ? (completedMarks.reduce((a, b) => a + b, 0) / completedMarks.length).toFixed(1)
    : '0.0';
  const topMarks = completedMarks.length > 0 ? Math.max(...completedMarks) : 0;

  const filteredItems = batchItems.filter(item => {
    const matchesSearch = item.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.fileName.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (statusFilter === 'completed') return item.status === 'completed';
    if (statusFilter === 'pending') return item.status === 'pending' || item.status === 'evaluating';
    if (statusFilter === 'failed') return item.status === 'failed';
    return true;
  }).sort((a, b) => {
    if (sortOrder === 'alphabetical') {
      return a.studentName.localeCompare(b.studentName);
    } else if (sortOrder === 'status') {
      // Sort priority: completed > evaluating > pending > failed
      const statusWeight: Record<string, number> = {
        'completed': 4,
        'evaluating': 3,
        'pending': 2,
        'failed': 1
      };
      const weightA = statusWeight[a.status] || 0;
      const weightB = statusWeight[b.status] || 0;
      if (weightA !== weightB) return weightB - weightA;
      // If same status, fallback to alphabet
      return a.studentName.localeCompare(b.studentName);
    }
    // Default to upload_time (original array order/ID based as proxy)
    return 0;
  });

  return (
    <div className="BatchEvaluationView w-full max-w-7xl mx-auto flex flex-col gap-6 animate-fade-in">
      {/* HIDDEN FILE INPUTS */}
      <input
        type="file"
        multiple
        accept="application/pdf,image/png,image/jpeg"
        ref={fileInputRef}
        onChange={handleBatchFileUpload}
        className="hidden"
      />
      <input
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        ref={itemFileInputRef}
        onChange={handleItemFileReupload}
        className="hidden"
      />

      {/* 1. TOP HEADER & QUICK ACTIONS BAR */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shadow-sm shrink-0">
            <Layers className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg md:text-xl font-black text-slate-900 dark:text-white">
                📚 बंच (थोक) उत्तर पुस्तिका मूल्यांकन
              </h2>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={clearEntireBatch}
            disabled={totalCount === 0 || isProcessingBatch}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50 ${
              isConfirmingClear
                ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:text-red-600 hover:border-red-200 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20'
            }`}
            title="Clear entire evaluation queue"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isConfirmingClear ? 'क्या आप सुनिश्चित हैं?' : 'पूरी कतार हटाएं'}</span>
          </button>

          <button
            onClick={onBackToSingle}
            className="px-3.5 py-2 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>एकल मोड में लौटें</span>
          </button>

          {/* Quick Export when completed copies exist - REMOVED */}
        </div>
      </div>

      {/* 2. TWO-STEP PIPELINE STEPPER TABS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Step 1 Tab Button: Merged Setup & Copies */}
        <button
          onClick={() => setActiveStep('step1_setup')}
          className={`p-3.5 rounded-2xl border text-left transition-all flex items-center gap-3 cursor-pointer relative overflow-hidden ${
            activeStep !== 'step3_evaluate'
              ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/20 shadow-sm'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 hover:bg-slate-50/50 shadow-sm'
          }`}
        >
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 transition-transform ${
            activeStep !== 'step3_evaluate'
              ? 'bg-amber-600 text-white shadow-sm scale-105'
              : totalCount > 0
                ? 'bg-emerald-100 text-emerald-700 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400'
          }`}>
            {totalCount > 0 ? (
              <span className="font-bold text-sm">{totalCount}</span>
            ) : (
              <Layers className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                1: मॉडल उत्तर व कॉपियां जोड़ें
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  sharedModelAnswer.trim()
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  {sharedModelAnswer.trim() ? '✓ मॉडल उत्तर' : 'मानक UPSC'}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  totalCount > 0
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                }`}>
                  {totalCount > 0 ? `${totalCount} कॉपियां` : 'कॉपियां जोड़ें'}
                </span>
              </div>
            </div>
          </div>
        </button>

        {/* Step 2 Tab Button: Evaluation & Results */}
        <button
          onClick={() => setActiveStep('step3_evaluate')}
          className={`p-3.5 rounded-2xl border text-left transition-all flex items-center gap-3 cursor-pointer relative overflow-hidden ${
            activeStep === 'step3_evaluate'
              ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/20 shadow-sm'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 hover:bg-slate-50/50 shadow-sm'
          }`}
        >
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 transition-transform ${
            activeStep === 'step3_evaluate'
              ? 'bg-amber-600 text-white shadow-sm scale-105'
              : isProcessingBatch
                ? 'bg-amber-100 text-amber-700 animate-pulse'
                : completedCount > 0
                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400'
          }`}>
            {isProcessingBatch ? (
              <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
            ) : completedCount > 0 ? (
              <span className="font-bold text-sm">{completedCount}</span>
            ) : (
              <Award className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                2: मूल्यांकन एवं परिणाम
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                isProcessingBatch
                  ? 'bg-amber-100 text-amber-800 animate-pulse dark:bg-amber-950 dark:text-amber-300'
                  : completedCount > 0
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              }`}>
                {isProcessingBatch ? '⚡ चालू' : completedCount > 0 ? `${completedCount}/${totalCount} पूर्ण` : 'परिणाम'}
              </span>
            </div>
          </div>
        </button>
      </div>

      {/* 3. MERGED SETUP & COPIES UPLOAD WORKFLOW */}
      {activeStep !== 'step3_evaluate' && (
        <div className="flex flex-col gap-5 animate-fade-in">
          {/* Card 1: Question, Model Answer & Marks */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
            {/* Header with Title, Marks Quick Selector, and Presets */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-slate-900 dark:text-white">
                  📝 1. प्रश्न, मॉडल उत्तर एवं अंक
                </span>
                <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 hidden sm:inline">
                  (वैकल्पिक - रिक्त छोड़ने पर मानक UPSC मानदंड लागू होंगे)
                </span>
              </div>

              {/* Fixed Marks Pills Selector */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded flex items-center gap-1" title="चयनित पूर्णांक सभी कॉपियों के लिए अंतिम एवं लॉक रहेगा (कॉपी पर लिखे अंकों से स्वतः परिवर्तन बंद है)">
                  🔒 निश्चित पूर्णांक लॉक (Fixed Marks)
                </span>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    पूर्णांक चुनें:
                  </span>
                  {[
                    { m: 10, label: '10' },
                    { m: 15, label: '15' },
                    { m: 20, label: '20' },
                    { m: 50, label: '50' },
                    { m: 125, label: '125' },
                    { m: 250, label: '250' }
                  ].map(({ m, label }) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSharedMaxMarks(m)}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                        sharedMaxMarks === m
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <span className="text-xs font-black text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-800 ml-1">
                    {sharedMaxMarks} अंक (डिफ़ॉल्ट)
                  </span>
                </div>
              </div>
            </div>

            {/* Presets Row (Compact, if presets exist) */}
            {presets.length > 0 && (
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className="text-slate-500 dark:text-slate-400 font-semibold shrink-0">📂 सहेजा गया मॉडल उत्तर:</span>
                <select
                  value={selectedPresetId}
                  onChange={(e) => loadPreset(e.target.value)}
                  className="text-xs py-1 px-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium max-w-xs focus:ring-1 focus:ring-amber-500"
                >
                  <option value="">-- मॉडल उत्तर चुनें (वैकल्पिक) --</option>
                  {presets.map(p => (
                    <option key={p.id} value={p.id}>{p.title} ({p.maxMarks} अंक)</option>
                  ))}
                </select>
                {selectedPresetId && (
                  <button
                    type="button"
                    onClick={() => deletePreset(selectedPresetId)}
                    className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded border border-red-200 dark:border-red-900/50"
                    title="हटाएं"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Textarea Box with file upload and clear actions */}
            <div className="relative border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-800/80 focus-within:ring-2 focus-within:ring-amber-500">
              <textarea
                value={sharedModelAnswer}
                onChange={(e) => setSharedModelAnswer(e.target.value)}
                rows={5}
                placeholder="प्रश्न संख्या व मॉडल उत्तर / मूल्यांकन बिंदु यहाँ लिखें या फाइल अपलोड करें...
(उदा. प्रश्न: 1857 के विद्रोह के प्रमुख कारणों एवं परिणामों की विवेचना कीजिए।
मुख्य बिंदु: राजनीतिक, आर्थिक, सामाजिक-धार्मिक कारण, कंपनी शासन का अंत, 1858 की उद्घोषणा...)"
                className="w-full p-3.5 bg-transparent text-xs leading-relaxed font-sans text-slate-800 dark:text-slate-200 outline-none resize-y min-h-[90px]"
              />

              {/* Toolbar at bottom of textarea */}
              <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={modelAnswerInputRef}
                    onChange={handleModelAnswerUpload}
                    accept="image/*,application/pdf,text/plain"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => modelAnswerInputRef.current?.click()}
                    disabled={isExtractingText}
                    className="text-[11px] font-bold bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-700 flex items-center gap-1.5 transition-colors px-2.5 py-1.5 rounded-lg border border-amber-200 cursor-pointer disabled:opacity-50"
                  >
                    {isExtractingText ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Upload className="w-3 h-3" />
                    )}
                    <span>{isExtractingText ? 'निकाल रहा...' : 'फाइल से टेक्स्ट निकालें'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowRubrics(!showRubrics)}
                    className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-amber-600 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    {showRubrics ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    <span>{showRubrics ? 'विशेष निर्देश छुपाएं' : '+ विशेष निर्देश / रुब्रिक्स'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {sharedModelAnswer.trim() && (
                    <>
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={presetTitleInput}
                          onChange={(e) => setPresetTitleInput(e.target.value)}
                          placeholder="मॉडल उत्तर नाम..."
                          className="text-[11px] px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 w-32 sm:w-40"
                        />
                        <button
                          type="button"
                          onClick={saveCurrentAsPreset}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-bold rounded-lg shadow-sm cursor-pointer"
                        >
                          सेव
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={clearModelAnswer}
                        className="text-[11px] font-bold text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors px-2 py-1 rounded-lg hover:bg-red-50 cursor-pointer"
                        title="मॉडल उत्तर हटाएं"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>हटाएं</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Optional Rubrics Expandable Box */}
            {showRubrics && (
              <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50">
                <label className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center justify-between">
                  <span>विशेष परीक्षक निर्देश:</span>
                  <span className="text-[10px] text-amber-700 font-normal">वैकल्पिक</span>
                </label>
                <textarea
                  value={sharedRubricRules}
                  onChange={(e) => setSharedRubricRules(e.target.value)}
                  rows={2}
                  placeholder="उदा. भूमिका 25 शब्दों से अधिक न हो, सुप्रीम कोर्ट के केस लॉ आवश्यक हैं, निष्कर्ष भविष्योन्मुखी होना चाहिए..."
                  className="w-full p-2.5 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/80 rounded-lg text-xs leading-relaxed text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            )}
          </div>

          {/* Card 2: Copies Upload & Queue Management */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
            {/* Header with Title and Start Evaluation CTA */}
            <div className="flex flex-wrap justify-between items-center gap-3">
              <div className="flex items-center gap-2.5">
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  📄 2. छात्र उत्तर पुस्तिकाएं
                </h3>
                <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold ${
                  totalCount > 0
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  {totalCount > 0 ? `${totalCount} कॉपियां • ${totalPagesAcrossAll} कुल पृष्ठ` : 'खाली'}
                </span>
              </div>

              {/* Start Batch Evaluation CTA (Always accessible when copies exist) */}
              <div className="flex items-center gap-2 flex-wrap">
                {totalCount > 0 && (
                  <button
                    onClick={handleStartBatchFromSetup}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md flex items-center gap-2 cursor-pointer transition-all transform active:scale-95"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>बैच मूल्यांकन शुरू करें ({totalCount} कॉपियां)</span>
                  </button>
                )}
              </div>
            </div>

            {/* Sleek Drag & Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-6 md:p-8 rounded-2xl border-2 border-dashed transition-all text-center flex flex-col items-center justify-center gap-2.5 cursor-pointer relative overflow-hidden ${
                isDragOver
                  ? 'border-amber-500 bg-amber-500/10 scale-[1.005] shadow-md'
                  : 'border-slate-300 dark:border-slate-700 hover:border-amber-500 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-amber-50/20'
              }`}
            >
              <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-sm">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  छात्र उत्तर पुस्तिकाएं यहाँ ड्रैग करें या क्लिक करके अपलोड करें
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  एक साथ कई कॉपियां (PDF या तस्वीरें) चुन सकते हैं। प्रत्येक छात्र का नाम फाइल के नाम से स्वतः पहचान लिया जाएगा।
                </p>
              </div>
            </div>

            {/* Copies Table (if totalCount > 0) */}
            {totalCount > 0 ? (
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col mt-1">
                {/* Table action bar */}
                <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap justify-between items-center gap-2 bg-slate-50/80 dark:bg-slate-800/50">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    कतार में लगी कॉपियां ({totalCount})
                  </span>

                  <div className="flex items-center gap-2">
                    {selectedItemIds.size > 0 && (
                      <button
                        onClick={handleBulkDeleteSelected}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 cursor-pointer ${
                          isConfirmingBulkDelete
                            ? 'bg-red-600 text-white'
                            : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                        }`}
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>{isConfirmingBulkDelete ? 'कन्फर्म?' : `हटाएं (${selectedItemIds.size})`}</span>
                      </button>
                    )}

                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 font-bold text-xs rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>और जोड़ें</span>
                    </button>

                    <button
                      onClick={clearEntireBatch}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 cursor-pointer ${
                        isConfirmingClear
                          ? 'bg-red-600 text-white'
                          : 'text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40'
                      }`}
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>{isConfirmingClear ? 'कन्फर्म?' : 'सभी हटाएं'}</span>
                    </button>
                  </div>
                </div>

                {/* Copies List */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                        <th className="py-2.5 pl-3 pr-2 w-8 text-center">
                          <input 
                            type="checkbox" 
                            className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                            checked={batchItems.length > 0 && selectedItemIds.size === batchItems.length}
                            onChange={() => handleToggleSelectAll(batchItems.map(i => i.id))}
                            title="सभी चुनें"
                          />
                        </th>
                        <th className="py-2.5 px-2 w-10 text-center">#</th>
                        <th className="py-2.5 px-3">छात्र का नाम</th>
                        <th className="py-2.5 px-3">फाइल व पृष्ठ</th>
                        <th className="py-2.5 px-3">मॉडल उत्तर (असाइनमेंट)</th>
                        <th className="py-2.5 px-3 text-center">अधिकतम अंक</th>
                        <th className="py-2.5 px-3 text-right">हटाएं</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {batchItems.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="py-2.5 pl-3 pr-2 text-center">
                            <input 
                              type="checkbox" 
                              className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                              checked={selectedItemIds.has(item.id)}
                              onChange={() => handleToggleSelectItem(item.id)}
                            />
                          </td>
                          <td className="py-2.5 px-2 text-center text-slate-400 font-mono">
                            {idx + 1}
                          </td>

                          {/* Student Name with Inline Edit */}
                          <td className="py-2.5 px-3">
                            {editingStudentId === item.id ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  autoFocus
                                  value={editingNameValue}
                                  onChange={(e) => setEditingNameValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveStudentName(item.id);
                                    if (e.key === 'Escape') setEditingStudentId(null);
                                  }}
                                  className="px-2 py-1 bg-white dark:bg-slate-800 border border-amber-500 rounded-lg text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                                />
                                <button
                                  onClick={() => handleSaveStudentName(item.id)}
                                  className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-500"
                                  title="सहेजें"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 group">
                                <span className="font-bold text-slate-900 dark:text-white">
                                  {item.studentName}
                                </span>
                                <button
                                  onClick={() => {
                                    setEditingStudentId(item.id);
                                    setEditingNameValue(item.studentName);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-amber-600 transition-opacity p-0.5"
                                  title="नाम बदलें"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>

                          {/* File Name & Pages */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                              <span className="truncate max-w-[180px]" title={item.fileName}>
                                {item.fileName}
                              </span>
                              <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-bold">
                                {item.pages?.length || 0} पृष्ठ
                              </span>
                            </div>
                          </td>

                          {/* Preset/Model Answer selection */}
                          <td className="py-2.5 px-3">
                            <select
                              value={presets.find(p => p.modelAnswer === item.itemModelAnswer && p.maxMarks === item.itemMaxMarks)?.id || (item.itemModelAnswer ? 'custom' : '')}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (!val) {
                                  handleUpdateBatchItem(item.id, {
                                    itemModelAnswer: undefined,
                                    itemRubricRules: undefined,
                                    presetTitle: undefined,
                                    itemMaxMarks: undefined
                                  });
                                } else if (val !== 'custom') {
                                  const preset = presets.find(p => p.id === val);
                                  if (preset) {
                                    handleUpdateBatchItem(item.id, {
                                      itemModelAnswer: preset.modelAnswer,
                                      itemRubricRules: preset.rubricRules,
                                      itemMaxMarks: preset.maxMarks,
                                      presetTitle: preset.title
                                    });
                                  }
                                }
                              }}
                              className="w-full text-xs p-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-amber-500"
                            >
                              <option value="">ग्लोबल मॉडल उत्तर (डिफ़ॉल्ट)</option>
                              {presets.map(p => (
                                <option key={p.id} value={p.id}>{p.title} ({p.maxMarks} अंक)</option>
                              ))}
                            </select>
                          </td>

                          {/* Max Marks */}
                          <td className="py-2.5 px-3 text-center font-bold text-slate-800 dark:text-slate-200">
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded" title="कॉपी से स्वतः पहचान को प्राथमिकता">
                                🎯 स्वतः पहचान
                              </span>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                                (फॉलबैक: {item.itemMaxMarks !== undefined ? item.itemMaxMarks : sharedMaxMarks}M)
                              </span>
                            </div>
                          </td>

                          {/* Delete Button */}
                          <td className="py-2.5 px-3 text-right">
                            <button
                              onClick={() => deleteBatchItem(item.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
                              title="इस कॉपी को हटाएं"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Bottom CTA bar inside table */}
                <div className="p-4 bg-slate-50/90 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-bold text-slate-900 dark:text-white">{totalCount} कॉपियां</span> तैयार हैं • प्रति कॉपी <span className="font-bold">{sharedMaxMarks} अंक</span>
                  </div>

                  <button
                    onClick={handleStartBatchFromSetup}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md flex items-center gap-2 cursor-pointer transition-all transform active:scale-95"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>बैच मूल्यांकन शुरू करें ({totalCount} कॉपियां)</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* 5. STEP 3 CONTENT: BATCH EVALUATION, METRICS & RESULTS REVIEW */}
      {activeStep === 'step3_evaluate' && (
        <div className="flex flex-col gap-6 animate-fade-in">
          {/* Active processing banner */}
          {isProcessingBatch && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <RefreshCw className="w-5 h-5 text-amber-600 dark:text-amber-400 animate-spin shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-slate-900 dark:text-white">
                        {activeItem ? '⚡ वर्तमान में जांची जा रही प्रति:' : '⏳ बैच प्रोसेसिंग प्रारंभ हो रही है...'}
                      </span>
                      {activeItem && (
                        <span className="text-sm font-black text-amber-700 dark:text-amber-300">
                          {activeItem.studentName} ({activeItem.fileName})
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                      {activeItem?.progressText || 'AI परीक्षक कतार को प्रोसेस कर रहा है...'}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-black text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950 px-3 py-1.5 rounded-xl border border-amber-200 dark:border-amber-900/50">
                  {completedCount} / {totalCount} जांची गईं
                </span>
              </div>
              
              {/* Visual Progress Bar */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  <span>प्रगति</span>
                  <span>{Math.round((completedCount / (totalCount || 1)) * 100)}%</span>
                </div>
                <div className="w-full bg-amber-100 dark:bg-amber-950/50 rounded-full h-2.5 overflow-hidden">
                  <div 
                    className="bg-amber-500 h-2.5 rounded-full transition-all duration-500 ease-out" 
                    style={{ width: `${(completedCount / (totalCount || 1)) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          )}

          {/* OVERALL BATCH PROGRESS BAR */}
          {totalCount > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
              <div className="flex justify-between items-end mb-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <span>📊 समग्र बैच प्रगति</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {totalCount} में से {completedCount} कॉपियां जांची जा चुकी हैं ({pendingCount} शेष)
                  </p>
                </div>
                <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                  {Math.round((completedCount / totalCount) * 100)}%
                </span>
              </div>
              
              <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-500 ease-out relative"
                  style={{ width: `${(completedCount / totalCount) * 100}%` }}
                >
                  {completedCount > 0 && completedCount < totalCount && (
                    <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]" />
                  )}
                </div>
                {evaluatingCount > 0 && (
                   <div 
                     className="h-full bg-amber-400 animate-pulse transition-all duration-500 ease-out"
                     style={{ width: `${(evaluatingCount / totalCount) * 100}%` }}
                     title="जांची जा रही हैं"
                   />
                )}
                {failedCount > 0 && (
                   <div 
                     className="h-full bg-red-500 transition-all duration-500 ease-out"
                     style={{ width: `${(failedCount / totalCount) * 100}%` }}
                     title="विफल"
                   />
                )}
              </div>
            </div>
          )}

          {/* METRICS & QUEUE ACTIONS BAR */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase">कुल कॉपियां</p>
            <p className="text-xl font-black text-slate-900">{totalCount}</p>
          </div>
          <Layers className="w-7 h-7 text-slate-300" />
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-emerald-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-emerald-700 uppercase">जांची गईं</p>
            <p className="text-xl font-black text-emerald-600">{completedCount}</p>
          </div>
          <CheckCircle2 className="w-7 h-7 text-emerald-400" />
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-amber-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-amber-700 uppercase">कतार में</p>
            <p className="text-xl font-black text-amber-600">{pendingCount + evaluatingCount}</p>
          </div>
          <Clock className="w-7 h-7 text-amber-400" />
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-blue-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-blue-700 uppercase">औसत प्राप्तांक</p>
            <p className="text-xl font-black text-blue-600">{avgMarks} <span className="text-xs text-slate-400">/ {sharedMaxMarks}</span></p>
          </div>
          <Award className="w-7 h-7 text-blue-400" />
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-purple-200 shadow-sm flex items-center justify-between col-span-2 md:col-span-1">
          <div>
            <p className="text-[11px] font-bold text-purple-700 uppercase">उच्चतम अंक</p>
            <p className="text-xl font-black text-purple-600">{topMarks} <span className="text-xs text-slate-400">/ {sharedMaxMarks}</span></p>
          </div>
          <Sparkles className="w-7 h-7 text-purple-400" />
        </div>
      </div>

      {/* BATCH PROGRESS & CONTROL BUTTONS */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap justify-between items-center gap-4">
        {/* Play / Pause / Clear */}
        <div className="flex items-center gap-2 flex-wrap">
          {!isProcessingBatch ? (
            <button
              onClick={startBatchProcessing}
              disabled={totalCount === 0 || completedCount === totalCount}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs rounded-lg shadow-md flex items-center gap-2 cursor-pointer transition-all transform active:scale-95"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>▶️ बैच मूल्यांकन शुरू करें</span>
            </button>
          ) : isPaused ? (
            <button
              onClick={startBatchProcessing}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-lg shadow-md flex items-center gap-2 cursor-pointer transition-all"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>▶️ पुनः शुरू करें</span>
            </button>
          ) : (
            <button
              onClick={pauseBatchProcessing}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-xs rounded-lg shadow-md flex items-center gap-2 cursor-pointer transition-all"
            >
              <Pause className="w-4 h-4" />
              <span>⏸️ रोकें</span>
            </button>
          )}

          {isProcessingBatch && (
            <button
              onClick={stopBatchProcessing}
              className="px-3.5 py-2.5 bg-red-100 hover:bg-red-200 text-red-700 font-bold text-xs rounded-lg transition-colors cursor-pointer"
            >
              ⏹️ बंद करें
            </button>
          )}

          {failedCount > 0 && !isProcessingBatch && (
            <button
              onClick={removeFailedBatchItems}
              className="px-3 py-2.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
              title="सभी असफल/अमान्य कॉपियां सूची से हटाएं"
            >
              <Trash2 className="w-3.5 h-3.5 text-amber-600" />
              <span>अमान्य हटाएं ({failedCount})</span>
            </button>
          )}

          <button
            onClick={clearEntireBatch}
            disabled={totalCount === 0 || isProcessingBatch}
            className={`px-3 py-2.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-30 ${
              isConfirmingClear 
                ? 'bg-red-600 text-white hover:bg-red-700' 
                : 'text-slate-500 hover:text-red-600 hover:bg-red-50'
            }`}
            title="पूरी सूची खाली करें"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isConfirmingClear ? 'कन्फर्म?' : 'खाली करें'}</span>
          </button>
        </div>

        {/* Global Export Options - REMOVED */}
      </div>

      {/* LIVE PROGRESS BAR */}
      {totalCount > 0 && (
        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden shadow-inner">
          <div
            className="bg-gradient-to-r from-amber-500 to-emerald-500 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${Math.round((completedCount / totalCount) * 100)}%` }}
          ></div>
        </div>
      )}

      {/* SEARCH, FILTER & BATCH TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* Table Filter Header */}
        <div className="p-4 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3 bg-slate-50/50">
          <div className="flex flex-wrap items-center gap-4 flex-1">
            <div className="relative min-w-[200px] max-w-sm flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="छात्र का नाम या फाइल खोजें..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
              />
            </div>
            
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className="relative">
                <input 
                  type="checkbox" 
                  className="sr-only" 
                  checked={statusFilter === 'pending'}
                  onChange={(e) => setStatusFilter(e.target.checked ? 'pending' : 'all')}
                />
                <div className={`block w-8 h-4.5 rounded-full transition-colors ${statusFilter === 'pending' ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'}`}></div>
                <div className={`absolute left-0.5 top-0.5 bg-white w-3.5 h-3.5 rounded-full transition-transform ${statusFilter === 'pending' ? 'translate-x-3.5' : ''}`}></div>
              </div>
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 select-none group-hover:text-slate-900 transition-colors">
                जांची गई कॉपियां छिपाएं
              </span>
            </label>

            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as any)}
              className="text-[11px] py-1.5 px-3 bg-white border border-slate-200 shadow-sm rounded-lg text-slate-600 font-bold focus:outline-none focus:border-amber-400 cursor-pointer"
            >
              <option value="upload_time">अपलोड समय</option>
              <option value="alphabetical">छात्र का नाम</option>
              <option value="status">स्थिति</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-[11px] hidden sm:flex">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 rounded-md font-bold transition-colors ${
                  statusFilter === 'all' ? 'bg-white text-slate-800 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                सभी ({totalCount})
              </button>
              <button
                onClick={() => setStatusFilter('completed')}
                className={`px-3 py-1 rounded-md font-bold transition-colors ${
                  statusFilter === 'completed' ? 'bg-white text-emerald-700 shadow-sm border border-emerald-200' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                जांची गई ({completedCount})
              </button>
              <button
                onClick={() => setStatusFilter('pending')}
                className={`px-3 py-1 rounded-md font-bold transition-colors ${
                  statusFilter === 'pending' ? 'bg-white text-amber-700 shadow-sm border border-amber-200' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                कतार ({pendingCount + evaluatingCount})
              </button>
              {failedCount > 0 && (
                <button
                  onClick={() => setStatusFilter('failed')}
                  className={`px-3 py-1 rounded-md font-bold transition-colors ${
                    statusFilter === 'failed' ? 'bg-white text-red-700 shadow-sm border border-red-200' : 'text-slate-500 hover:text-red-600'
                  }`}
                >
                  त्रुटि ({failedCount})
                </button>
              )}
            </div>
            
            {selectedItemIds.size > 0 && (
              <button
                onClick={handleBulkDeleteSelected}
                disabled={isProcessingBatch}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-30 border ${
                  isConfirmingBulkDelete 
                    ? 'bg-red-600 text-white hover:bg-red-700 border-red-600' 
                    : 'bg-red-50 text-red-700 hover:bg-red-100 border-red-200'
                }`}
                title="चयनित कॉपियां हटाएं"
              >
                <Trash2 className="w-3 h-3" />
                <span className="hidden sm:inline">{isConfirmingBulkDelete ? 'कन्फर्म?' : `चयनित हटाएं (${selectedItemIds.size})`}</span>
                <span className="sm:hidden">{isConfirmingBulkDelete ? 'कन्फर्म' : `हटाएं (${selectedItemIds.size})`}</span>
              </button>
            )}
            
            <button
              onClick={clearEntireBatch}
              disabled={totalCount === 0 || isProcessingBatch}
              className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-30 border ${
                isConfirmingClear 
                  ? 'bg-red-600 text-white hover:bg-red-700 border-red-600' 
                  : 'bg-white text-slate-600 hover:text-red-600 hover:bg-red-50 border-slate-200 hover:border-red-200'
              }`}
              title="पूरी कतार खाली करें"
            >
              <Trash2 className="w-3 h-3" />
              <span className="hidden sm:inline">{isConfirmingClear ? 'कन्फर्म?' : 'पूरी कतार हटाएं'}</span>
              <span className="sm:hidden">{isConfirmingClear ? 'कन्फर्म' : 'खाली करें'}</span>
            </button>
          </div>
        </div>

        {/* Copies Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 pl-4 pr-2 w-8 text-center">
                  <input 
                    type="checkbox" 
                    className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                    checked={filteredItems.length > 0 && selectedItemIds.size === filteredItems.length}
                    onChange={() => handleToggleSelectAll(filteredItems.map(i => i.id))}
                    title="सभी चुनें"
                  />
                </th>
                <th className="py-3 px-2 w-10 text-center">#</th>
                <th className="py-3 px-4">छात्र / रोल नंबर</th>
                <th className="py-3 px-4 text-center">स्थिति व समय</th>
                <th className="py-3 px-4 text-center">प्राप्तांक</th>
                <th className="py-3 px-4 text-right">कार्यवाही</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400 text-xs">
                    कोई कॉपी उपलब्ध नहीं है
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => {
                  const isCompleted = item.status === 'completed';
                  const isEvaluating = item.status === 'evaluating';
                  const isFailed = item.status === 'failed';

                  return (
                    <React.Fragment key={item.id}>
                    <tr
                      className={`hover:bg-slate-50/80 transition-colors ${
                        activeItemId === item.id ? 'bg-amber-50/60 font-semibold' : ''
                      }`}
                    >
                      <td className="py-3 pl-4 pr-2 text-center">
                        <input 
                          type="checkbox" 
                          className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                          checked={selectedItemIds.has(item.id)}
                          onChange={() => handleToggleSelectItem(item.id)}
                        />
                      </td>
                      <td className="py-3 px-2 text-center text-slate-400 font-mono">
                        {idx + 1}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 text-xs">
                          {item.studentName}
                        </div>
                        {item.presetTitle && (
                          <div className="inline-flex mt-1 items-center px-1.5 py-0.5 rounded bg-blue-50 border border-blue-100 text-[9px] font-semibold text-blue-700">
                            {item.presetTitle}
                          </div>
                        )}
                        {item.error && (
                          <p className="text-[10px] text-red-600 mt-0.5">{item.error}</p>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          {isCompleted && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>जांची गई</span>
                            </span>
                          )}
                          {isEvaluating && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                              <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
                              <span>प्रक्रियाधीन...</span>
                            </span>
                          )}
                          {item.status === 'pending' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>कतार में</span>
                            </span>
                          )}
                          {isFailed && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
                              <AlertCircle className="w-3 h-3 text-red-600" />
                              <span>त्रुटि</span>
                            </span>
                          )}
                          {item.evaluatedAt && (
                            <span className="text-slate-400 text-[9px] font-medium tracking-wide">
                              {item.evaluatedAt}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        {isCompleted && item.evalResult?.total_marks ? (
                          <div className="flex flex-col items-center gap-1">
                            <span className="font-serif font-black text-sm text-slate-900 dark:text-white bg-amber-100/80 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 px-2 py-0.5 rounded">
                              {item.evalResult.total_marks.obtained}{' '}
                              <span className="text-[10px] text-slate-500 font-sans">
                                / {item.evalResult.total_marks.max_marks}
                              </span>
                            </span>
                            <span 
                              className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded cursor-help ${
                                item.marksSource === 'self_detected'
                                  ? 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800'
                                  : 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800'
                              }`}
                              title={item.evalResult.total_marks.marks_detection_evidence || 'पूर्णांक स्रोत'}
                            >
                              <span>{item.marksSource === 'self_detected' ? '✨ स्वतः पहचाना' : '⚙️ डिफ़ॉल्ट पूर्णांक'}</span>
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-300 font-mono">-</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isCompleted && (
                            <>
                              <button
                                onClick={() => onReviewCopy(item)}
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] rounded shadow-xs flex items-center gap-1 cursor-pointer transition-colors"
                                title="कैनवस पर लाल पेन टिप्पणियों की समीक्षा व संपादन करें"
                              >
                                <Eye className="w-3 h-3" />
                                <span>समीक्षा</span>
                              </button>

                              <button
                                onClick={() => handleDownloadSingleItemPdf(item)}
                                className="p-1 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors cursor-pointer"
                                title="इस छात्र की PDF डाउनलोड करें"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {isFailed && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => triggerReuploadForBatchItem(item.id)}
                                className="px-2 py-1 bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300 rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                title="इस छात्र के लिए सही PDF/फोटो दोबारा अपलोड करें"
                              >
                                <Upload className="w-3 h-3 text-amber-700" />
                                <span>अपलोड</span>
                              </button>
                              <button
                                onClick={() => retryFailedItem(item.id)}
                                className="px-2 py-1 bg-red-50 text-red-700 hover:bg-red-100 rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>री-ट्राई</span>
                              </button>
                            </div>
                          )}

                          {!isEvaluating && (
                            <button
                              onClick={() => deleteBatchItem(item.id)}
                              className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                              title="हटाएं"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    
                    {(item.status === 'pending' || item.status === 'failed') && (
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <td colSpan={8} className="px-4 py-2">
                          <div className="flex flex-wrap items-center gap-3 text-xs">
                            <div className="flex items-center gap-1.5">
                              <label className="font-semibold text-slate-600">अधिकतम अंक:</label>
                              <select
                                value={item.itemMaxMarks !== undefined ? item.itemMaxMarks : ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  handleUpdateBatchItem(item.id, { 
                                    itemMaxMarks: val ? parseFloat(val) : undefined 
                                  });
                                }}
                                className="border border-slate-300 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                              >
                                <option value="">ग्लोबल ({sharedMaxMarks} अंक)</option>
                                <option value="10">10 अंक</option>
                                <option value="15">15 अंक</option>
                                <option value="20">20 अंक</option>
                                <option value="50">50 अंक (निबंध)</option>
                                <option value="125">125 अंक (निबंध)</option>
                                <option value="250">250 अंक (निबंध)</option>
                              </select>
                            </div>

                            <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                              <label className="font-semibold text-slate-600">मॉडल उत्तर:</label>
                              <select
                                value={presets.find(p => p.modelAnswer === item.itemModelAnswer && p.maxMarks === item.itemMaxMarks)?.id || (item.itemModelAnswer ? "custom" : "")}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (!val) {
                                    handleUpdateBatchItem(item.id, { 
                                      itemModelAnswer: undefined,
                                      itemRubricRules: undefined,
                                      presetTitle: undefined,
                                      itemMaxMarks: undefined
                                    });
                                  } else if (val !== "custom") {
                                    const preset = presets.find(p => p.id === val);
                                    if (preset) {
                                      handleUpdateBatchItem(item.id, {
                                        itemModelAnswer: preset.modelAnswer,
                                        itemRubricRules: preset.rubricRules,
                                        itemMaxMarks: preset.maxMarks,
                                        presetTitle: preset.title
                                      });
                                    }
                                  }
                                }}
                                className="border border-slate-300 rounded px-1.5 py-1 bg-white flex-1 focus:outline-none focus:ring-1 focus:ring-amber-500 truncate"
                              >
                                <option value="">Use Global Model Answer / Rubric</option>
                                {presets.map(p => (
                                  <option key={p.id} value={p.id}>{p.title} ({p.maxMarks} Marks)</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })
              )}
              </tbody>
            </table>
          </div>
      </div>

      {/* Step 3 Bottom Navigation */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
        <button
          onClick={() => setActiveStep('step1_setup')}
          className="px-4 py-2.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>← मॉडल उत्तर एवं कॉपियां बदलें / और जोड़ें</span>
        </button>
      </div>
    </div>
  )}
</div>
  );
};
