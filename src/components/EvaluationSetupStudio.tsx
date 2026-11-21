import React from 'react';
import {
  FileText,
  Sliders,
  AlertTriangle,
  Upload,
  CloudUpload,
  Trash2,
  ClipboardPaste,
  RefreshCw,
  Layers,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  CheckCircle2,
  Bell,
  Cpu,
  Brain,
} from 'lucide-react';
import {
  THINKING_LEVEL_OPTIONS,
  getThinkingLevelInfo,
  type EvaluationThinkingLevel,
} from '../modelConfig';
import type { User as FirebaseUser, StudentProfileData } from '../firebase';
import type { UploadedPage } from '../types/evaluation';

interface EvaluationSetupStudioProps {
  isEffectiveStudentView: boolean;
  isOwnerAccount: boolean;
  activeSlotId: number;
  promptSlots: { id: number; name: string; content: string }[];
  onSelectSlot: (slotId: number) => void;
  onOpenSystemPromptSettings: () => void;
  studentProfile: StudentProfileData | null;
  onOpenHistory: () => void;
  studentName: string;
  setStudentName: React.Dispatch<React.SetStateAction<string>>;
  cloudUser: FirebaseUser | null;
  maxMarks: number;
  setMaxMarks: React.Dispatch<React.SetStateAction<number>>;
  subject: string;
  setSubject: React.Dispatch<React.SetStateAction<string>>;
  modelAnswer: string;
  setModelAnswer: React.Dispatch<React.SetStateAction<string>>;
  modelAnswerFileInputRef: React.RefObject<HTMLInputElement | null>;
  onModelAnswerFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isExtractingText: boolean;
  uploadedPages: UploadedPage[];
  onClearUploadedFiles: () => void;
  onTriggerFileInput: () => void;
  onClipboardPaste: (e: React.MouseEvent) => void;
  showTextAnswerInput: boolean;
  setShowTextAnswerInput: React.Dispatch<React.SetStateAction<boolean>>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  textAnswerInput: string;
  setTextAnswerInput: React.Dispatch<React.SetStateAction<string>>;
  onProcessTextAsPages: (text: string, label: string) => void;
  isProcessingPdf: boolean;
  pdfProcessingProgress: number;
  draggedThumbnailIndex: number | null;
  setDraggedThumbnailIndex: React.Dispatch<React.SetStateAction<number | null>>;
  dragOverThumbnailIndex: number | null;
  setDragOverThumbnailIndex: React.Dispatch<React.SetStateAction<number | null>>;
  onThumbnailDrop: (dragIdx: number, dropIdx: number) => void;
  onMoveUploadedPage: (fromIndex: number, toIndex: number) => void;
  onRotateUploadedPage: (id: string, degrees?: number) => void;
  onDeleteUploadedPage: (id: string) => void;
  onStartEvaluation: () => void;
  evaluationState: 'idle' | 'evaluating' | 'completed';
  maxAllowedPages?: number;
  allowStudentUploads?: boolean;
  platformBanner?: string;
  instituteName?: string;
  onOpenQuotaUpgrade?: () => void;
  onOpenProgressCard?: () => void;
  evaluationThinkingLevel?: EvaluationThinkingLevel;
  onSelectThinkingLevel?: (level: EvaluationThinkingLevel) => void;
  selectedModels?: string[];
  onOpenModelSettings?: () => void;
}

export const EvaluationSetupStudio: React.FC<EvaluationSetupStudioProps> = ({
  isEffectiveStudentView,
  isOwnerAccount,
  activeSlotId,
  promptSlots,
  onSelectSlot,
  onOpenSystemPromptSettings,
  studentProfile,
  onOpenHistory,
  modelAnswer,
  setModelAnswer,
  modelAnswerFileInputRef,
  onModelAnswerFileUpload,
  isExtractingText,
  uploadedPages,
  onClearUploadedFiles,
  onTriggerFileInput,
  onClipboardPaste,
  showTextAnswerInput,
  setShowTextAnswerInput,
  fileInputRef,
  onFileChange,
  textAnswerInput,
  setTextAnswerInput,
  onProcessTextAsPages,
  isProcessingPdf,
  pdfProcessingProgress,
  draggedThumbnailIndex,
  setDraggedThumbnailIndex,
  dragOverThumbnailIndex,
  setDragOverThumbnailIndex,
  onThumbnailDrop,
  onMoveUploadedPage,
  onRotateUploadedPage,
  onDeleteUploadedPage,
  onStartEvaluation,
  evaluationState,
  maxAllowedPages = 4,
  allowStudentUploads = true,
  platformBanner,
  onOpenQuotaUpgrade,
  onOpenProgressCard,
  evaluationThinkingLevel = 'auto',
  onSelectThinkingLevel,
  selectedModels,
  onOpenModelSettings,
}) => {
  const [showOwnerReferenceBox, setShowOwnerReferenceBox] = React.useState<boolean>(
    Boolean(modelAnswer?.trim())
  );

  const isOverStudentPageLimit = isEffectiveStudentView && uploadedPages.length > maxAllowedPages;
  const isStudentBlockedOrPaused =
    isEffectiveStudentView &&
    (!allowStudentUploads ||
      studentProfile?.status === 'blocked' ||
      Boolean(
        studentProfile &&
          studentProfile.role === 'student' &&
          studentProfile.usedCount >= studentProfile.quotaLimit
      ));

  return (
    <div className="w-full max-w-4xl mx-auto space-y-3.5 sm:space-y-4">
      {/* Optional Institute Notice Banner */}
      {isEffectiveStudentView && platformBanner && platformBanner.trim() && (
        <div className="px-4 py-2.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50 flex items-center gap-2.5 text-xs text-slate-700 dark:text-amber-200">
          <Bell className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="font-medium leading-relaxed">{platformBanner}</span>
        </div>
      )}

      {/* Student Uploads Paused Alert */}
      {isEffectiveStudentView && !allowStudentUploads && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-rose-800 dark:text-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>संस्थान द्वारा नई कॉपी अपलोड अस्थायी रूप से रोकी गई है।</span>
          </div>
          <button
            type="button"
            onClick={onOpenHistory}
            className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold shrink-0 cursor-pointer"
          >
            मेरी कॉपियाँ
          </button>
        </div>
      )}

      {/* Student Quota Exhausted Alert */}
      {isEffectiveStudentView &&
        studentProfile &&
        studentProfile.role === 'student' &&
        studentProfile.usedCount >= studentProfile.quotaLimit && (
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-black text-amber-950 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                कोटा पूर्ण ({studentProfile.usedCount}/{studentProfile.quotaLimit}) • आगे मूल्यांकन हेतु टॉप-अप करें
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {onOpenQuotaUpgrade && (
                <button
                  type="button"
                  onClick={onOpenQuotaUpgrade}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer shadow-xs"
                >
                  ⚡ कोटा टॉप-अप
                </button>
              )}
              {onOpenProgressCard && (
                <button
                  type="button"
                  onClick={onOpenProgressCard}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold cursor-pointer"
                >
                  प्रगति कार्ड
                </button>
              )}
            </div>
          </div>
        )}

      {/* Compact Owner Toolbar (Visible ONLY in Owner View): Prompt Slot + Active Thinking Levels + Model Settings */}
      {!isEffectiveStudentView && isOwnerAccount && (
        <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <select
                value={activeSlotId}
                onChange={(e) => onSelectSlot(Number(e.target.value))}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold rounded-lg px-2 py-1 outline-none cursor-pointer max-w-[190px] truncate"
              >
                {promptSlots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onOpenSystemPromptSettings}
                className="p-1.5 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-slate-800 rounded-lg border border-amber-200/80 dark:border-amber-700/50 cursor-pointer"
                title="प्रॉम्प्ट स्लॉट संपादित करें"
              >
                <Sliders className="w-3.5 h-3.5" />
              </button>

              {onOpenModelSettings && (
                <button
                  type="button"
                  onClick={onOpenModelSettings}
                  className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 text-[11px] font-bold text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1.5 cursor-pointer"
                  title="AI मॉडल एवं थिंकिंग सेटिंग्स खोलें"
                >
                  <Cpu className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>{selectedModels?.[0]?.replace('gemini-', '') || '4-hydrogen'}</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setShowOwnerReferenceBox((prev) => !prev)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-[11px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {showOwnerReferenceBox ? 'प्रश्न छुपाएं' : '+ संदर्भ प्रश्न'}
              </button>
            </div>
          </div>

          {/* Direct Model Thinking Level Bar (Minimal / Low / Medium / High / XHigh / Auto) */}
          {onSelectThinkingLevel && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-slate-700 dark:text-slate-200">
                <Brain className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Thinking Level:</span>
                <span className="text-[10px] font-mono text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded">
                  {getThinkingLevelInfo(evaluationThinkingLevel).sub}
                </span>
              </div>

              <div className="flex items-center gap-1 flex-wrap">
                {THINKING_LEVEL_OPTIONS.map((opt) => {
                  const isActive = evaluationThinkingLevel === opt.level;
                  return (
                    <button
                      key={opt.level}
                      type="button"
                      onClick={() => onSelectThinkingLevel(opt.level)}
                      title={`${opt.label} — ${opt.sub}`}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer border ${
                        isActive
                          ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-2xs ring-2 ring-amber-400/40'
                          : 'bg-slate-50 dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {opt.shortLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Owner Collapsible Reference Question Box */}
      {!isEffectiveStudentView && isOwnerAccount && showOwnerReferenceBox && (
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
              संदर्भ प्रश्न / मॉडल उत्तर कुंजी (वैकल्पिक)
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="file"
                accept=".txt,application/pdf,image/png,image/jpeg,image/jpg"
                ref={modelAnswerFileInputRef}
                onChange={onModelAnswerFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => modelAnswerFileInputRef.current?.click()}
                disabled={isExtractingText}
                className="text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
              >
                <Upload className="w-3 h-3" />
                <span>{isExtractingText ? 'पढ़ा जा रहा है...' : 'PDF/फोटो से जोड़ें'}</span>
              </button>
              {modelAnswer && (
                <button
                  type="button"
                  onClick={() => {
                    setModelAnswer('');
                    localStorage.setItem('upsc_saved_model_answer', '');
                    if (modelAnswerFileInputRef.current) {
                      modelAnswerFileInputRef.current.value = '';
                    }
                  }}
                  className="text-[11px] font-bold bg-rose-50 text-rose-600 border border-rose-200 px-2 py-1 rounded-lg cursor-pointer"
                >
                  साफ करें
                </button>
              )}
            </div>
          </div>
          <textarea
            value={modelAnswer}
            onChange={(e) => setModelAnswer(e.target.value)}
            rows={2}
            placeholder="मुख्य परीक्षा का प्रश्न या मॉडल उत्तर कुंजी पेस्ट करें..."
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      )}

      {/* Answer Sheet Upload Card */}
      <div className="w-full bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3.5">
        {isOverStudentPageLimit && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              अधिकतम {maxAllowedPages} पृष्ठ अनुमत हैं (अभी {uploadedPages.length} पृष्ठ हैं)। कृपया अतिरिक्त पृष्ठ हटाएं।
            </span>
          </div>
        )}

        <div
          onClick={onTriggerFileInput}
          className="w-full border-2 border-dashed border-indigo-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-amber-500 rounded-2xl py-9 sm:py-12 px-4 sm:px-6 text-center cursor-pointer transition-all bg-slate-50/70 dark:bg-slate-800/40 hover:bg-indigo-50/30 flex flex-col items-center justify-center gap-2"
        >
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-slate-800 border border-indigo-200/80 dark:border-slate-700 flex items-center justify-center mb-1">
            <CloudUpload className="w-7 h-7 text-indigo-600 dark:text-amber-400" />
          </div>
          <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
            उत्तर-पुस्तिका अपलोड करें
          </h3>
          <p className="text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400">
            PDF / फोटो चुनें • अधिकतम {maxAllowedPages} पृष्ठ प्रति कॉपी
          </p>

          {/* Owner Secondary Quick Actions (Paste / Text) */}
          {!isEffectiveStudentView && isOwnerAccount && (
            <div className="flex flex-wrap items-center justify-center gap-2 mt-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
              <button
                type="button"
                onClick={onClipboardPaste}
                className="inline-flex items-center gap-1 text-[11px] bg-white dark:bg-slate-800 hover:bg-emerald-50 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-lg text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
              >
                <ClipboardPaste className="w-3.5 h-3.5 text-emerald-600" />
                <span>पेस्ट करें</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTextAnswerInput(!showTextAnswerInput);
                }}
                className="inline-flex items-center gap-1 text-[11px] bg-white dark:bg-slate-800 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-lg text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-amber-600" />
                <span>{showTextAnswerInput ? 'टेक्स्ट बंद करें' : 'टेक्स्ट टाइप करें'}</span>
              </button>
            </div>
          )}

          <input
            type="file"
            ref={fileInputRef}
            onChange={onFileChange}
            accept="image/*,application/pdf,.txt"
            multiple
            className="hidden"
          />
        </div>

        {/* Optional Typed Answer Drawer (Owner) */}
        {showTextAnswerInput && (
          <div className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex flex-col gap-2">
            <textarea
              value={textAnswerInput}
              onChange={(e) => setTextAnswerInput(e.target.value)}
              rows={3}
              placeholder="उत्तर यहाँ सीधे टाइप या पेस्ट करें..."
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-100"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (textAnswerInput.trim()) {
                    onProcessTextAsPages(textAnswerInput, 'Pasted_Text_Answer');
                    setTextAnswerInput('');
                    setShowTextAnswerInput(false);
                  }
                }}
                disabled={!textAnswerInput.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3.5 py-1.5 rounded-lg font-bold disabled:opacity-50 cursor-pointer"
              >
                पृष्ठ जोड़ें
              </button>
            </div>
          </div>
        )}

        {/* PDF Processing Progress Indicator */}
        {isProcessingPdf && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl">
            <div className="flex justify-between items-center mb-1.5 text-xs font-bold text-amber-900 dark:text-amber-200">
              <span className="flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600" />
                <span>पृष्ठ तैयार किए जा रहे हैं...</span>
              </span>
              <span>{pdfProcessingProgress}%</span>
            </div>
            <div className="w-full bg-amber-200/60 rounded-full h-1.5">
              <div
                className="bg-amber-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${pdfProcessingProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Uploaded Pages Thumbnail Grid */}
        {uploadedPages.length > 0 && (
          <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-600" />
                <span>
                  अपलोड पृष्ठ ({uploadedPages.length}/{maxAllowedPages})
                </span>
              </span>

              <button
                type="button"
                onClick={onClearUploadedFiles}
                className="text-[11px] font-bold bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800 px-2.5 py-1 rounded-lg hover:bg-rose-100 flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>सभी हटाएं</span>
              </button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
              {uploadedPages.map((page, idx) => {
                const isDragging = draggedThumbnailIndex === idx;
                const isDragOver = dragOverThumbnailIndex === idx;

                return (
                  <div
                    key={page.id}
                    draggable
                    onDragStart={(e) => {
                      setDraggedThumbnailIndex(idx);
                      e.dataTransfer.setData('text/plain', idx.toString());
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverThumbnailIndex !== idx) {
                        setDragOverThumbnailIndex(idx);
                      }
                    }}
                    onDragLeave={(e) => {
                      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                      if (dragOverThumbnailIndex === idx) {
                        setDragOverThumbnailIndex(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const dragIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                      onThumbnailDrop(dragIdx, idx);
                    }}
                    onDragEnd={() => {
                      setDraggedThumbnailIndex(null);
                      setDragOverThumbnailIndex(null);
                    }}
                    className={`group relative bg-white dark:bg-slate-900 rounded-lg border p-1.5 transition-all flex flex-col justify-between select-none cursor-grab active:cursor-grabbing ${
                      isDragging
                        ? 'opacity-40 scale-95 border-amber-500 border-dashed'
                        : isDragOver
                          ? 'border-amber-500 ring-2 ring-amber-400/40 scale-[1.02]'
                          : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-900 text-white font-mono">
                        #{idx + 1}
                      </span>
                      <GripVertical className="w-3 h-3 text-slate-400" />
                    </div>

                    <div className="relative w-full aspect-[1/1.414] bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center">
                      <img
                        src={
                          page.dataUrl.startsWith('MOCK_')
                            ? 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="141"><rect width="100" height="141" fill="%23f1f5f9"/><text x="50" y="70" font-family="sans-serif" font-size="12" fill="%2394a3b8" text-anchor="middle">MOCK</text></svg>'
                            : page.dataUrl
                        }
                        alt={`पृष्ठ ${idx + 1}`}
                        draggable={false}
                        className="w-full h-full object-contain pointer-events-none select-none bg-white"
                      />
                    </div>

                    <div className="flex items-center justify-between mt-1.5 pt-1 border-t border-slate-100 dark:border-slate-800 text-[10px]">
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onMoveUploadedPage(idx, idx - 1);
                          }}
                          disabled={idx === 0}
                          className="w-4.5 h-4.5 rounded flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-25"
                        >
                          <ChevronLeft className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onMoveUploadedPage(idx, idx + 1);
                          }}
                          disabled={idx === uploadedPages.length - 1}
                          className="w-4.5 h-4.5 rounded flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-25"
                        >
                          <ChevronRight className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRotateUploadedPage(page.id, 90);
                          }}
                          className="w-4.5 h-4.5 rounded flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-amber-600"
                        >
                          <RotateCw className="w-2.5 h-2.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteUploadedPage(page.id);
                        }}
                        className="text-rose-500 hover:text-rose-700 p-0.5 rounded"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Primary Evaluation CTA Button */}
      <button
        type="button"
        onClick={onStartEvaluation}
        disabled={
          uploadedPages.length === 0 ||
          evaluationState === 'evaluating' ||
          isOverStudentPageLimit ||
          isStudentBlockedOrPaused
        }
        className={`w-full py-4 px-6 rounded-2xl font-black tracking-wide transition-all text-base flex items-center justify-center gap-2.5 shadow-sm ${
          uploadedPages.length === 0 ||
          evaluationState === 'evaluating' ||
          isOverStudentPageLimit ||
          isStudentBlockedOrPaused
            ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
            : 'bg-indigo-600 hover:bg-indigo-700 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-slate-950 cursor-pointer'
        }`}
      >
        {evaluationState === 'evaluating' ? (
          <>
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>मूल्यांकन चल रहा है...</span>
          </>
        ) : isOverStudentPageLimit ? (
          <>
            <AlertTriangle className="w-5 h-5" />
            <span>अधिकतम {maxAllowedPages} पृष्ठ अनुमत हैं</span>
          </>
        ) : (
          <>
            <CheckCircle2 className="w-5 h-5" />
            <span>
              मूल्यांकन शुरू करें
              {uploadedPages.length > 0 ? ` (${uploadedPages.length} पृष्ठ)` : ''}
            </span>
          </>
        )}
      </button>
    </div>
  );
};
