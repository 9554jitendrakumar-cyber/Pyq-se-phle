import React from 'react';
import { PieChart, Download, ClipboardPaste, X } from 'lucide-react';
import { motion } from 'motion/react';
import type { EvaluationResult } from '../types/evaluation';
import {
  getMarksDistribution,
  formatQuarterMark,
  type EvalTagTone
} from '../utils/scorecardExport';
import BodyPartsBreakdown from './BodyPartsBreakdown';

interface MarksDistributionModalProps {
  isOpen: boolean;
  onClose: () => void;
  evalResult: EvaluationResult | null;
  studentName: string;
  evaluationId?: string;
  isProcessingPdf: boolean;
  pdfProcessingProgress: number;
  onShareWhatsApp: () => void;
  onExportPDF: () => void;
  onCopyAuditText: () => void;
}

const getTagBadgeClass = (tone?: EvalTagTone) => {
  if (tone === 'green') {
    return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-700';
  }
  if (tone === 'amber') {
    return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-700';
  }
  return 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-700';
};

export const MarksDistributionModal: React.FC<MarksDistributionModalProps> = ({
  isOpen,
  onClose,
  evalResult,
  isProcessingPdf,
  pdfProcessingProgress,
  onShareWhatsApp,
  onExportPDF,
  onCopyAuditText,
}) => {
  if (!isOpen || !evalResult) return null;
  const marksDist = getMarksDistribution(evalResult);
  if (!marksDist) return null;

  const total = evalResult.total_marks;
  const detectedSubject = evalResult.question_analysis?.detected_subject?.trim();
  const detectedQuestion = evalResult.question_analysis?.question_detected?.trim();

  return (
    <div className="fixed inset-0 bg-slate-950/85 z-50 flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="bg-slate-100 dark:bg-slate-950 rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden border-2 border-amber-500/80 max-h-[95vh] my-auto"
      >
        {/* Official Dark-Slate & Gold Header */}
        <div className="px-4 py-3.5 sm:px-6 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white border-b-2 border-amber-500/70 flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500 text-slate-950 rounded-xl shadow-md shrink-0">
              <PieChart className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-amber-400 tracking-tight leading-snug">
                संघ लोक सेवा आयोग (UPSC) मुख्य परीक्षा मूल्यांकन रिपोर्ट
              </h3>
              <p className="text-xs sm:text-sm font-semibold text-slate-300">
                आधिकारिक 4-स्तंभीय रूब्रिक एवं विस्तृत स्कोरकार्ड (4-Pillar Rubric Audit)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onShareWhatsApp}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs sm:text-sm font-extrabold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              title="WhatsApp पर शेयर करें"
            >
              <span>📲</span>
              <span>WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={onExportPDF}
              disabled={isProcessingPdf}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-extrabold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              title="PDF डाउनलोड करें"
            >
              <Download className="w-4 h-4" />
              <span>{isProcessingPdf ? `${pdfProcessingProgress}%` : 'PDF'}</span>
            </button>
            <button
              type="button"
              onClick={onCopyAuditText}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-xl text-xs sm:text-sm font-bold hidden md:flex items-center gap-1.5 transition-all cursor-pointer"
              title="टेक्स्ट कॉपी करें"
            >
              <ClipboardPaste className="w-4 h-4 text-amber-400" />
              <span>कॉपी</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="बंद करें"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Report Body */}
        <div className="p-3.5 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 font-sans">
          {/* Subject & Question Banner (if detected by model) */}
          {(detectedSubject || detectedQuestion) && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-l-4 border-l-amber-500 rounded-xl p-3.5 sm:p-4 shadow-2xs space-y-1.5">
              {detectedSubject && (
                <div className="text-xs sm:text-sm font-extrabold text-blue-700 dark:text-blue-300">
                  📚 विषय / पाठ्यक्रम: {detectedSubject}
                </div>
              )}
              {detectedQuestion && (
                <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 leading-relaxed">
                  ❓ प्रश्न: {detectedQuestion}
                </div>
              )}
            </div>
          )}

          {/* 1. 5-Box Executive Score Strip (with % Badges & Progress Bars) */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {/* Total Box */}
            <div className="bg-gradient-to-br from-amber-50 to-amber-100/80 dark:from-amber-950/60 dark:to-slate-900 border-2 border-amber-500 rounded-xl p-3.5 text-center col-span-2 sm:col-span-1 flex flex-col justify-between shadow-sm">
              <div className="text-xs sm:text-sm font-extrabold text-amber-950 dark:text-amber-200">
                🏆 कुल प्राप्तांक
              </div>
              <div className="text-2xl sm:text-3xl font-black text-amber-700 dark:text-amber-400 my-1 font-mono">
                {formatQuarterMark(total.obtained)} <span className="text-base sm:text-lg font-bold">/ {formatQuarterMark(total.max_marks)}</span>
              </div>
              <div className="inline-flex self-center px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-200/90 text-amber-950 dark:bg-amber-900/80 dark:text-amber-100">
                {marksDist.totalPercent}% अंक
              </div>
            </div>

            {/* Pillar 1: भूमिका */}
            <div className="bg-white dark:bg-slate-900 border-2 border-blue-200 dark:border-blue-800/80 rounded-xl p-3 text-center flex flex-col justify-between shadow-2xs">
              <div className="text-xs sm:text-sm font-extrabold text-blue-900 dark:text-blue-200">
                🎯 1. भूमिका
              </div>
              <div className="text-xl sm:text-2xl font-black text-blue-700 dark:text-blue-300 my-1 font-mono">
                {formatQuarterMark(marksDist.intro.score)} <span className="text-sm font-bold">/ {formatQuarterMark(marksDist.intro.max)}</span>
              </div>
              <div className="space-y-1">
                <div className="w-full h-1.5 bg-blue-100 dark:bg-blue-950 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min(100, marksDist.intro.percent)}%` }} />
                </div>
                <span className="inline-block text-xs font-extrabold text-blue-800 dark:text-blue-300">
                  {marksDist.intro.percent}%
                </span>
              </div>
            </div>

            {/* Pillar 2: मुख्य भाग */}
            <div className="bg-white dark:bg-slate-900 border-2 border-purple-200 dark:border-purple-800/80 rounded-xl p-3 text-center flex flex-col justify-between shadow-2xs">
              <div className="text-xs sm:text-sm font-extrabold text-purple-900 dark:text-purple-200">
                📐 2. मुख्य भाग
              </div>
              <div className="text-xl sm:text-2xl font-black text-purple-700 dark:text-purple-300 my-1 font-mono">
                {formatQuarterMark(marksDist.body.score)} <span className="text-sm font-bold">/ {formatQuarterMark(marksDist.body.max)}</span>
              </div>
              <div className="space-y-1">
                <div className="w-full h-1.5 bg-purple-100 dark:bg-purple-950 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-600 rounded-full" style={{ width: `${Math.min(100, marksDist.body.percent)}%` }} />
                </div>
                <span className="inline-block text-xs font-extrabold text-purple-800 dark:text-purple-300">
                  {marksDist.body.percent}%
                </span>
              </div>
            </div>

            {/* Pillar 3: प्रस्तुतीकरण */}
            <div className="bg-white dark:bg-slate-900 border-2 border-orange-200 dark:border-orange-800/80 rounded-xl p-3 text-center flex flex-col justify-between shadow-2xs">
              <div className="text-xs sm:text-sm font-extrabold text-orange-900 dark:text-orange-200">
                📊 3. प्रस्तुतीकरण
              </div>
              <div className="text-xl sm:text-2xl font-black text-orange-700 dark:text-orange-300 my-1 font-mono">
                {formatQuarterMark(marksDist.presentation.score)} <span className="text-sm font-bold">/ {formatQuarterMark(marksDist.presentation.max)}</span>
              </div>
              <div className="space-y-1">
                <div className="w-full h-1.5 bg-orange-100 dark:bg-orange-950 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full" style={{ width: `${Math.min(100, marksDist.presentation.percent)}%` }} />
                </div>
                <span className="inline-block text-xs font-extrabold text-orange-800 dark:text-orange-300">
                  {marksDist.presentation.percent}%
                </span>
              </div>
            </div>

            {/* Pillar 4: निष्कर्ष */}
            <div className="bg-white dark:bg-slate-900 border-2 border-emerald-200 dark:border-emerald-800/80 rounded-xl p-3 text-center flex flex-col justify-between shadow-2xs">
              <div className="text-xs sm:text-sm font-extrabold text-emerald-900 dark:text-emerald-200">
                ✨ 4. निष्कर्ष
              </div>
              <div className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-300 my-1 font-mono">
                {formatQuarterMark(marksDist.conclusion.score)} <span className="text-sm font-bold">/ {formatQuarterMark(marksDist.conclusion.max)}</span>
              </div>
              <div className="space-y-1">
                <div className="w-full h-1.5 bg-emerald-100 dark:bg-emerald-950 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${Math.min(100, marksDist.conclusion.percent)}%` }} />
                </div>
                <span className="inline-block text-xs font-extrabold text-emerald-800 dark:text-emerald-300">
                  {marksDist.conclusion.percent}%
                </span>
              </div>
            </div>
          </div>

          {/* 2. Side-by-Side 2-Column Grid for भूमिका (Intro) & निष्कर्ष (Conclusion) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* PILLAR 1: भूमिका (INTRODUCTION AUDIT) */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-blue-200 dark:border-blue-900/80 overflow-hidden shadow-sm flex flex-col">
              <div className="px-4 py-3 bg-gradient-to-r from-blue-100/90 to-blue-50 dark:from-blue-950/70 dark:to-slate-900 border-b border-blue-200 dark:border-blue-800/80 flex items-center justify-between">
                <h4 className="font-extrabold text-blue-950 dark:text-blue-200 text-base sm:text-lg flex items-center gap-2">
                  <span>🎯 1. भूमिका मूल्यांकन (Introduction)</span>
                </h4>
                <span className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-mono font-extrabold text-xs sm:text-sm shadow-2xs">
                  {formatQuarterMark(marksDist.intro.score)} / {formatQuarterMark(marksDist.intro.max)} ({marksDist.intro.percent}%)
                </span>
              </div>

              <div className="p-3.5 sm:p-4 space-y-3 flex-1">
                {/* Sub-Box 1: प्रभावी पक्ष */}
                {marksDist.intro.strengths && (
                  <div className="p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 border-l-4 border-l-emerald-500 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs sm:text-sm font-extrabold text-emerald-900 dark:text-emerald-300">
                        ✓ प्रभावी पक्ष:
                      </span>
                      {marksDist.intro.strengthsTag && (
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs sm:text-sm font-extrabold border ${getTagBadgeClass(
                            marksDist.intro.strengthsTone
                          )}`}
                        >
                          {marksDist.intro.strengthsTag}
                        </span>
                      )}
                    </div>
                    <p className="text-sm sm:text-base font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                      {marksDist.intro.strengths}
                    </p>
                  </div>
                )}

                {/* Sub-Box 2: सुधार के क्षेत्र */}
                {marksDist.intro.improvements && (
                  <div className="p-3 rounded-xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/70 border-l-4 border-l-rose-500 space-y-1">
                    <div className="text-xs sm:text-sm font-extrabold text-rose-900 dark:text-rose-300">
                      ⚠️ सुधार के क्षेत्र:
                    </div>
                    <p className="text-sm sm:text-base font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                      {marksDist.intro.improvements}
                    </p>
                  </div>
                )}

                {/* Sub-Box 3: आदर्श दृष्टिकोण */}
                {marksDist.intro.idealApproach && (
                  <div className="p-3 rounded-xl bg-purple-50/90 dark:bg-purple-950/35 border border-purple-200 dark:border-purple-800/70 border-l-4 border-l-purple-500 space-y-1">
                    <div className="text-xs sm:text-sm font-extrabold text-purple-900 dark:text-purple-300">
                      💡 आदर्श दृष्टिकोण:
                    </div>
                    <p className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">
                      {marksDist.intro.idealApproach}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* PILLAR 4: निष्कर्ष (CONCLUSION AUDIT) */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-emerald-200 dark:border-emerald-900/80 overflow-hidden shadow-sm flex flex-col">
              <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/90 to-emerald-50 dark:from-emerald-950/70 dark:to-slate-900 border-b border-emerald-200 dark:border-emerald-800/80 flex items-center justify-between">
                <h4 className="font-extrabold text-emerald-950 dark:text-emerald-200 text-base sm:text-lg flex items-center gap-2">
                  <span>✨ 4. निष्कर्ष एवं आगे की राह (Conclusion)</span>
                </h4>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-mono font-extrabold text-xs sm:text-sm shadow-2xs">
                  {formatQuarterMark(marksDist.conclusion.score)} / {formatQuarterMark(marksDist.conclusion.max)} ({marksDist.conclusion.percent}%)
                </span>
              </div>

              <div className="p-3.5 sm:p-4 space-y-3 flex-1">
                {/* Sub-Box 1: प्रभावी पक्ष */}
                {marksDist.conclusion.strengths && (
                  <div className="p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 border-l-4 border-l-emerald-500 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs sm:text-sm font-extrabold text-emerald-900 dark:text-emerald-300">
                        ✓ प्रभावी पक्ष:
                      </span>
                      {marksDist.conclusion.strengthsTag && (
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs sm:text-sm font-extrabold border ${getTagBadgeClass(
                            marksDist.conclusion.strengthsTone
                          )}`}
                        >
                          {marksDist.conclusion.strengthsTag}
                        </span>
                      )}
                    </div>
                    <p className="text-sm sm:text-base font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                      {marksDist.conclusion.strengths}
                    </p>
                  </div>
                )}

                {/* Sub-Box 2: सुधार के क्षेत्र */}
                {marksDist.conclusion.improvements && (
                  <div className="p-3 rounded-xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/70 border-l-4 border-l-rose-500 space-y-1">
                    <div className="text-xs sm:text-sm font-extrabold text-rose-900 dark:text-rose-300">
                      ⚠️ सुधार के क्षेत्र:
                    </div>
                    <p className="text-sm sm:text-base font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                      {marksDist.conclusion.improvements}
                    </p>
                  </div>
                )}

                {/* Sub-Box 3: आदर्श दृष्टिकोण */}
                {marksDist.conclusion.idealApproach && (
                  <div className="p-3 rounded-xl bg-purple-50/90 dark:bg-purple-950/35 border border-purple-200 dark:border-purple-800/70 border-l-4 border-l-purple-500 space-y-1">
                    <div className="text-xs sm:text-sm font-extrabold text-purple-900 dark:text-purple-300">
                      💡 आदर्श दृष्टिकोण:
                    </div>
                    <p className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">
                      {marksDist.conclusion.idealApproach}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 3. PILLAR 2: मुख्य भाग (MAIN BODY AUDIT) */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-purple-200 dark:border-purple-900/80 overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-gradient-to-r from-purple-100/90 to-purple-50 dark:from-purple-950/70 dark:to-slate-900 border-b border-purple-200 dark:border-purple-800/80 flex items-center justify-between">
              <h4 className="font-extrabold text-purple-950 dark:text-purple-200 text-base sm:text-lg">
                📐 2. मुख्य भाग — प्रश्न की मांग एवं उप-भाग विश्लेषण (Main Body Audit)
              </h4>
              <span className="px-2.5 py-1 rounded-lg bg-purple-600 text-white font-mono font-extrabold text-xs sm:text-sm shadow-2xs shrink-0">
                {formatQuarterMark(marksDist.body.score)} / {formatQuarterMark(marksDist.body.max)} ({marksDist.body.percent}%)
              </span>
            </div>

            <div className="p-3.5 sm:p-4">
              <BodyPartsBreakdown
                parts={marksDist.body.parts}
                directiveWord={evalResult.question_analysis?.directive_word}
                coreDemandMet={evalResult.question_analysis?.core_demand_met}
                coreDemandNote={evalResult.question_analysis?.core_demand_note}
                missingPoints={marksDist.body.missingPoints}
                matchedPoints={marksDist.body.matchedPoints}
                variant="report"
              />
            </div>
          </div>

          {/* 4. PILLAR 3: प्रस्तुतीकरण एवं संरचना (PRESENTATION & STRUCTURE) */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-orange-200 dark:border-orange-900/80 overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-gradient-to-r from-orange-100/90 to-orange-50 dark:from-orange-950/70 dark:to-slate-900 border-b border-orange-200 dark:border-orange-800/80 flex items-center justify-between">
              <h4 className="font-extrabold text-orange-950 dark:text-orange-200 text-base sm:text-lg">
                📊 3. प्रस्तुतीकरण एवं संरचना (Presentation & Visuals)
              </h4>
              <span className="px-2.5 py-1 rounded-lg bg-orange-600 text-white font-mono font-extrabold text-xs sm:text-sm shadow-2xs shrink-0">
                {formatQuarterMark(marksDist.presentation.score)} / {formatQuarterMark(marksDist.presentation.max)} ({marksDist.presentation.percent}%)
              </span>
            </div>

            <div className="p-3.5 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {marksDist.presentation.formatAndFlow && (
                <div className="p-3 rounded-xl bg-orange-50/80 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/70 border-l-4 border-l-orange-500 space-y-1">
                  <div className="text-xs sm:text-sm font-extrabold text-orange-900 dark:text-orange-300">
                    📐 प्रारूप, उप-शीर्षक एवं प्रवाह (Format & Flow):
                  </div>
                  <p className="text-sm sm:text-base font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                    {marksDist.presentation.formatAndFlow}
                  </p>
                </div>
              )}

              {marksDist.presentation.legibilityAndSpacing && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 border-l-4 border-l-slate-500 space-y-1">
                  <div className="text-xs sm:text-sm font-extrabold text-slate-800 dark:text-slate-200">
                    ✍️ पठनीयता एवं प्रस्तुति अनुशासन (Legibility):
                  </div>
                  <p className="text-sm sm:text-base font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                    {marksDist.presentation.legibilityAndSpacing}
                  </p>
                </div>
              )}

              {marksDist.presentation.diagramScope && (
                <div className="p-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/70 border-l-4 border-l-blue-500 space-y-1 md:col-span-2">
                  <div className="text-xs sm:text-sm font-extrabold text-blue-900 dark:text-blue-300">
                    🗺️ आरेख / फ्लोचार्ट / मानचित्र गुंजाइश (Diagram Scope):
                  </div>
                  <p className="text-sm sm:text-base font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                    {marksDist.presentation.diagramScope}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
