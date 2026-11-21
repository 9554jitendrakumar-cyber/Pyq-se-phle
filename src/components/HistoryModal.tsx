import React from 'react';
import {
  History,
  BookOpen,
  FileText,
  Check,
  RefreshCw,
  Download,
  Trash2,
  Award,
  TrendingUp,
  BarChart3,
} from 'lucide-react';
import type { HistoryEntry } from '../types/evaluation';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: HistoryEntry[];
  downloadingHistoryId: string | null;
  onLoadHistoryEntry: (entry: HistoryEntry) => void;
  onDownloadHistoryItem: (entry: HistoryEntry) => void;
  onDeleteHistoryEntry: (id: string, e: React.MouseEvent) => void;
  isEffectiveStudentView?: boolean;
  onOpenProgressCard?: () => void;
  onOpenQuotaUpgrade?: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  history,
  downloadingHistoryId,
  onLoadHistoryEntry,
  onDownloadHistoryItem,
  onDeleteHistoryEntry,
  isEffectiveStudentView = false,
  onOpenProgressCard,
  onOpenQuotaUpgrade,
}) => {
  if (!isOpen) return null;

  // Client-side zero-token calculation of Student Performance Summary
  const totalCopies = history.length;
  const totalPagesChecked = history.reduce(
    (sum, item) => sum + (item.uploadedPages?.length || item.evalResult?.pages?.length || 0),
    0
  );

  const percentages = history.map((item) => {
    const max = Math.max(1, Number(item.max_marks) || 10);
    const obt = Math.max(0, Number(item.obtained) || 0);
    return Math.min(100, Math.round((obt / max) * 100));
  });

  const avgPercent =
    percentages.length > 0
      ? Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length)
      : 0;

  let bestEntry: HistoryEntry | null = null;
  let bestPercent = -1;
  history.forEach((item, idx) => {
    if (percentages[idx] > bestPercent) {
      bestPercent = percentages[idx];
      bestEntry = item;
    }
  });

  const latestPercent = percentages.length > 0 ? percentages[0] : 0;
  const trendDiff = latestPercent - avgPercent;

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden border border-slate-200">
        <div className="p-5 bg-white border-b border-slate-100 flex flex-wrap justify-between items-center gap-3 sticky top-0 z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-600" />
              <span>{isEffectiveStudentView ? 'मेरी जाँची गई कॉपियाँ एवं प्रगति रिपोर्ट' : 'मूल्यांकन इतिहास एवं प्रदर्शन विश्लेषण'}</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              {isEffectiveStudentView
                ? `आपकी जाँची गई कॉपियों का रिकॉर्ड (${history.length} मूल्यांकन) • क्लिक करके चेक्ड कॉपी व विस्तृत रिपोर्ट देखें या PDF डाउनलोड करें`
                : `सभी जाँची गई कॉपियों का एकीकृत रिकॉर्ड (${history.length} मूल्यांकन) • किसी भी कॉपी की एनोटेटेड शीट खोलें, सुधारें या PDF डाउनलोड करें`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onOpenProgressCard && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenProgressCard();
                }}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>📊 पूर्ण प्रगति कार्ड व PDF</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors font-bold shadow-sm border border-slate-200/60 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-0 overflow-y-auto flex-1 bg-slate-50/50">
          {/* Student Performance Summary Strip (Zero-Token Instant Analytics) */}
          {history.length > 0 && (
            <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white border-b border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>{isEffectiveStudentView ? 'मेरी प्रगति एवं प्रदर्शन सारांश (My Progress Summary)' : 'समग्र मूल्यांकन प्रदर्शन सारांश'}</span>
                </span>
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                    avgPercent >= 50
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                      : avgPercent >= 35
                        ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                        : 'bg-rose-500/20 text-rose-300 border-rose-400/40'
                  }`}
                >
                  {avgPercent >= 50
                    ? '🏆 मुख्य परीक्षा मानक: उत्कृष्ट'
                    : avgPercent >= 35
                      ? '📈 मुख्य परीक्षा मानक: संतुलित'
                      : '🎯 मुख्य परीक्षा मानक: अभ्यास आवश्यक'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Card 1: Total Evaluated Copies */}
                <div className="bg-white/10 backdrop-blur-xs rounded-xl p-3.5 border border-white/15">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-300 font-semibold">कुल जाँची कॉपियाँ</span>
                    <FileText className="w-4 h-4 text-indigo-300" />
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-white">{totalCopies}</span>
                    <span className="text-xs text-slate-300 font-medium">कॉपियाँ ({totalPagesChecked} पृष्ठ)</span>
                  </div>
                </div>

                {/* Card 2: Average Score % */}
                <div className="bg-white/10 backdrop-blur-xs rounded-xl p-3.5 border border-white/15">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-300 font-semibold">औसत प्राप्तांक (Average)</span>
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between gap-2">
                    <span className="text-2xl font-black text-emerald-400">{avgPercent}%</span>
                    {totalCopies > 1 && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          trendDiff >= 0
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        नवीनतम: {latestPercent}% ({trendDiff >= 0 ? `+${trendDiff}%` : `${trendDiff}%`})
                      </span>
                    )}
                  </div>
                  <div className="w-full h-1.5 bg-white/15 rounded-full overflow-hidden mt-2">
                    <div
                      className="h-full bg-emerald-400 rounded-full transition-all"
                      style={{ width: `${Math.max(6, avgPercent)}%` }}
                    />
                  </div>
                </div>

                {/* Card 3: Highest Score */}
                <div className="bg-white/10 backdrop-blur-xs rounded-xl p-3.5 border border-white/15">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-300 font-semibold">सर्वोच्च स्कोर (Best Score)</span>
                    <Award className="w-4 h-4 text-amber-400" />
                  </div>
                  {bestEntry ? (
                    <div className="mt-1.5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-black text-amber-300">
                          {(bestEntry as HistoryEntry).obtained} / {(bestEntry as HistoryEntry).max_marks}
                        </span>
                        <span className="text-xs font-bold text-amber-200/90">({bestPercent}%)</span>
                      </div>
                      <p className="text-[11px] text-slate-300 truncate mt-0.5">
                        {(bestEntry as HistoryEntry).subject || (bestEntry as HistoryEntry).studentName}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 mt-2">—</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {history.length === 0 ? (
            <div className="text-center py-16 flex flex-col items-center justify-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <BookOpen className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-slate-500 font-bold text-sm">कोई पिछला मूल्यांकन नहीं मिला</p>
              <p className="text-slate-400 text-xs mt-1">जाँची गई कॉपियाँ और स्कोरकार्ड यहाँ दिखाई देंगे।</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  onClick={() => onLoadHistoryEntry(entry)}
                  className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 hover:bg-white transition-all cursor-pointer relative"
                >
                  {/* Left/Main Info */}
                  <div className="flex items-start gap-4">
                    <div className="hidden sm:flex w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 items-center justify-center shrink-0">
                      <History className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-bold text-slate-800 text-sm sm:text-base group-hover:text-indigo-600 transition-colors">
                          {entry.studentName}
                        </h3>
                        {entry.subject && (
                          <span className="bg-amber-50 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200">
                            {entry.subject}
                          </span>
                        )}
                        {!isEffectiveStudentView && entry.studentEmail && (
                          <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-200">
                            🎓 {entry.studentEmail}
                          </span>
                        )}
                        <span className="bg-slate-100 text-slate-500 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest border border-slate-200/60">
                          {new Date(entry.timestamp).toLocaleDateString('hi-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                        <span className="flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5" />
                          {entry.uploadedPages?.length || entry.evalResult?.pages?.length || 0} पृष्ठ
                        </span>
                        {entry.uploadedPages && entry.uploadedPages.length > 0 && (
                          <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                            <Check className="w-3 h-3" />
                            चेक्ड कॉपी उपलब्ध
                          </span>
                        )}
                        {entry.modelAnswer && (
                          <span className="flex items-center gap-1 text-indigo-600">
                            <Check className="w-3 h-3" />
                            मॉडल उत्तर प्रयुक्त
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right/Score & Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-5 mt-4 sm:mt-0 pl-14 sm:pl-0 flex-wrap">
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">प्राप्तांक</p>
                      <div className="flex items-baseline gap-1">
                        <span className="font-extrabold text-lg sm:text-xl text-slate-800">{entry.obtained}</span>
                        <span className="text-xs font-bold text-slate-400">/ {entry.max_marks}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDownloadHistoryItem(entry);
                        }}
                        disabled={downloadingHistoryId === entry.id}
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 hover:border-emerald-400 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer active:scale-95"
                        title={`${entry.studentName} की जांची गई कॉपी डाउनलोड करें`}
                      >
                        {downloadingHistoryId === entry.id ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                            <span>Downloading...</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Download</span>
                          </>
                        )}
                      </button>

                      {!isEffectiveStudentView && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteHistoryEntry(entry.id, e);
                          }}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
                          title="हटाएं"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <div
                        className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 group-hover:border-indigo-200 transition-colors"
                        title="समीक्षा खोलें"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
