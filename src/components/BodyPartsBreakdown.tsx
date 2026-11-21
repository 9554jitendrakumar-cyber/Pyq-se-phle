import React from 'react';
import {
  cleanSubpartTitle,
  parseDeductionReason,
  type EvalTagTone,
  type ParsedDeductionReason
} from '../utils/scorecardExport';

export interface RubricPart {
  kind?: 'question_part' | 'presentation' | string;
  part_name: string;
  score?: number;
  max_score?: number;
  content_score?: number;
  content_max?: number;
  evidence_score?: number;
  evidence_max?: number;
  coverage_status?: string;
  coverage_and_balance?: string;
  deduction_reason?: number | string;
  parsedDeduction?: ParsedDeductionReason;
  feedback?: string;
}

interface Props {
  parts: RubricPart[];
  onChange?: (index: number, newScore: number) => void;
  directiveWord?: string;
  coreDemandMet?: boolean;
  coreDemandNote?: string;
  missingPoints?: string[];
  matchedPoints?: string[];
  notes?: string[];
  variant?: 'compact' | 'report';
}

const getTagBadgeStyle = (tone?: EvalTagTone, isDarkCompact = false) => {
  if (tone === 'green') {
    return isDarkCompact
      ? 'bg-emerald-950/90 text-emerald-300 border-emerald-600/80'
      : 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-200 dark:border-emerald-700';
  }
  if (tone === 'amber') {
    return isDarkCompact
      ? 'bg-amber-950/90 text-amber-300 border-amber-600/80'
      : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-700';
  }
  return isDarkCompact
    ? 'bg-rose-950/90 text-rose-300 border-rose-600/80'
    : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/70 dark:text-rose-200 dark:border-rose-700';
};

const getCoverageBadgeStyle = (status?: string, isDarkCompact = false) => {
  const s = status || 'आंशिक कवरेज';
  if (/व्यापक|पूर्ण/.test(s)) {
    return {
      borderLeft: 'border-l-4 border-l-emerald-500',
      badge: isDarkCompact
        ? 'bg-emerald-950/90 text-emerald-300 border-emerald-600/80'
        : 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-700'
    };
  }
  if (/संतुलित/.test(s)) {
    return {
      borderLeft: 'border-l-4 border-l-blue-500',
      badge: isDarkCompact
        ? 'bg-blue-950/90 text-blue-300 border-blue-600/80'
        : 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/80 dark:text-blue-200 dark:border-blue-700'
    };
  }
  if (/सतही|छूटा/.test(s)) {
    return {
      borderLeft: 'border-l-4 border-l-rose-500',
      badge: isDarkCompact
        ? 'bg-rose-950/90 text-rose-300 border-rose-600/80'
        : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-700'
    };
  }
  return {
    borderLeft: 'border-l-4 border-l-amber-500',
    badge: isDarkCompact
      ? 'bg-amber-950/90 text-amber-300 border-amber-600/80'
      : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-700'
  };
};

export default function BodyPartsBreakdown({
  parts,
  directiveWord,
  coreDemandMet,
  coreDemandNote,
  missingPoints,
  matchedPoints,
  variant = 'compact',
}: Props) {
  if (!parts || parts.length === 0) return null;

  const dirTrimmed = directiveWord?.trim();
  const noteTrimmed = coreDemandNote?.trim();
  const isReportMode = variant === 'report';

  return (
    <div className="space-y-3">
      {/* Directive Word & Core Demand Banner Box */}
      {(dirTrimmed || noteTrimmed || coreDemandMet !== undefined) && (
        <div
          className={
            isReportMode
              ? 'p-3.5 rounded-xl bg-purple-50/90 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/80 space-y-2'
              : 'p-3 rounded-xl bg-purple-950/40 border border-purple-800/70 space-y-2'
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            {dirTrimmed && (
              <span
                className={
                  isReportMode
                    ? 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs sm:text-sm font-extrabold bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-900/70 dark:text-purple-100 dark:border-purple-700'
                    : 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs sm:text-sm font-extrabold bg-purple-900/80 text-purple-100 border border-purple-700'
                }
              >
                <span>📌 निर्देशात्मक शब्द:</span>
                <span className="underline decoration-purple-400/60">{dirTrimmed}</span>
              </span>
            )}
            {coreDemandMet !== undefined && (
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs sm:text-sm font-bold border ${
                  coreDemandMet
                    ? isReportMode
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-700'
                      : 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80'
                    : isReportMode
                      ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-700'
                      : 'bg-rose-950/80 text-rose-300 border-rose-700/80'
                }`}
              >
                {coreDemandMet ? '✓ मूल माँग: पूर्ण' : '⚠️ मूल माँग: भटकाव'}
              </span>
            )}
          </div>

          {noteTrimmed && (
            <div
              className={
                isReportMode
                  ? 'text-sm sm:text-base font-medium text-slate-800 dark:text-slate-200 leading-relaxed'
                  : 'text-sm sm:text-[15px] font-medium text-slate-200 leading-relaxed'
              }
            >
              <span className={isReportMode ? 'font-bold text-purple-900 dark:text-purple-300' : 'font-bold text-purple-300'}>
                पालन टिप्पणी:{' '}
              </span>
              {noteTrimmed}
            </div>
          )}
        </div>
      )}

      {/* Question Sub-Parts Boxed Cards */}
      <div className="space-y-3">
        {parts.map((p, i) => {
          const displayPartName = cleanSubpartTitle(p.part_name) || p.part_name;
          const rawReason = p.deduction_reason ? String(p.deduction_reason) : (p.feedback || '');
          const pd = p.parsedDeduction || parseDeductionReason(rawReason);
          const bodyText = pd.text || rawReason;
          const covStatus = p.coverage_status || 'आंशिक कवरेज';
          const covStyle = getCoverageBadgeStyle(covStatus, !isReportMode);

          return (
            <div
              key={i}
              className={
                isReportMode
                  ? `bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 ${covStyle.borderLeft} rounded-xl p-3.5 sm:p-4 shadow-2xs space-y-2.5`
                  : `bg-slate-950/90 border border-slate-800 ${covStyle.borderLeft} rounded-xl p-3 sm:p-3.5 space-y-2.5`
              }
            >
              {/* Part Header: Part Name + Coverage Status Badge */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                  className={
                    isReportMode
                      ? 'text-sm sm:text-base font-extrabold text-slate-900 dark:text-white leading-snug'
                      : 'text-sm sm:text-base font-extrabold text-white leading-snug'
                  }
                >
                  📌 भाग {i + 1}: {displayPartName}
                </div>
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs sm:text-sm font-extrabold border shrink-0 ${covStyle.badge}`}
                >
                  {covStatus}
                </span>
              </div>

              {/* Inner Sub-Box for Deduction & Improvement */}
              {(pd.tag || pd.gapType || bodyText) && (
                <div
                  className={
                    isReportMode
                      ? 'p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/90 dark:border-slate-700/80 space-y-1.5'
                      : 'p-3 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1.5'
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={
                        isReportMode
                          ? 'text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300'
                          : 'text-xs sm:text-sm font-bold text-slate-400'
                      }
                    >
                      📉 मूल्यांकन एवं सुधार:
                    </span>
                    {pd.tag && (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs sm:text-sm font-extrabold border ${getTagBadgeStyle(
                          pd.tagTone,
                          !isReportMode
                        )}`}
                      >
                        {pd.tag}
                      </span>
                    )}
                    {pd.gapType && (
                      <span
                        className={
                          isReportMode
                            ? 'inline-flex items-center px-2 py-0.5 rounded-md text-xs sm:text-sm font-bold bg-slate-200/80 text-slate-800 border border-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600'
                            : 'inline-flex items-center px-2 py-0.5 rounded-md text-xs sm:text-sm font-bold bg-slate-800 text-slate-200 border border-slate-700'
                        }
                      >
                        कमी: {pd.gapType}
                      </span>
                    )}
                  </div>
                  {bodyText && (
                    <p
                      className={
                        isReportMode
                          ? 'text-sm sm:text-base text-slate-900 dark:text-slate-100 leading-relaxed font-medium'
                          : 'text-sm sm:text-[15px] text-slate-100 leading-relaxed font-medium'
                      }
                    >
                      {bodyText}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Priority Improvements Block (अंक बढ़ाने हेतु प्रमुख सुधार) */}
      {missingPoints && missingPoints.length > 0 && (
        <div
          className={
            isReportMode
              ? 'p-3.5 sm:p-4 rounded-xl bg-amber-50/90 dark:bg-amber-950/30 border-2 border-amber-300 dark:border-amber-800/80 space-y-2.5'
              : 'p-3.5 rounded-xl bg-amber-950/35 border border-amber-700/80 space-y-2.5'
          }
        >
          <div
            className={
              isReportMode
                ? 'text-sm sm:text-base font-extrabold text-amber-950 dark:text-amber-200 flex items-center gap-1.5'
                : 'text-sm sm:text-base font-extrabold text-amber-300 flex items-center gap-1.5'
            }
          >
            <span>🎯 अंक बढ़ाने हेतु प्रमुख सुधार (प्राथमिकता क्रम):</span>
          </div>
          <div className="space-y-2">
            {missingPoints.slice(0, 3).map((mp, idx) => (
              <div
                key={idx}
                className={
                  idx === 0
                    ? isReportMode
                      ? 'p-3 rounded-lg bg-white dark:bg-slate-900 border-2 border-amber-400 dark:border-amber-600 shadow-2xs space-y-1'
                      : 'p-3 rounded-lg bg-amber-950/60 border-2 border-amber-500/80 space-y-1'
                    : isReportMode
                      ? 'p-2.5 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-amber-200 dark:border-amber-800/60 space-y-1'
                      : 'p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1'
                }
              >
                <div className="flex items-center gap-2">
                  <span
                    className={
                      idx === 0
                        ? isReportMode
                          ? 'px-2 py-0.5 rounded text-xs sm:text-sm font-extrabold bg-amber-200 text-amber-950 dark:bg-amber-800 dark:text-amber-100'
                          : 'px-2 py-0.5 rounded text-xs sm:text-sm font-extrabold bg-amber-500/30 text-amber-200 border border-amber-500/50'
                        : isReportMode
                          ? 'text-xs sm:text-sm font-extrabold text-amber-900 dark:text-amber-300'
                          : 'text-xs sm:text-sm font-extrabold text-amber-300'
                    }
                  >
                    {idx === 0 ? '🎯 1. अगली कॉपी का एक फोकस:' : `➕ ${idx + 1}. प्रमुख सुधार:`}
                  </span>
                </div>
                <p
                  className={
                    isReportMode
                      ? 'text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 leading-relaxed'
                      : 'text-sm sm:text-[15px] font-medium text-slate-100 leading-relaxed'
                  }
                >
                  {mp}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verified Strong Points Block (सत्यापित सबल बिंदु — shown when returned by model) */}
      {matchedPoints && matchedPoints.length > 0 && (
        <div
          className={
            isReportMode
              ? 'p-3.5 rounded-xl bg-emerald-50/90 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800/80 space-y-2'
              : 'p-3 rounded-xl bg-emerald-950/35 border border-emerald-800/80 space-y-2'
          }
        >
          <div
            className={
              isReportMode
                ? 'text-sm sm:text-base font-extrabold text-emerald-950 dark:text-emerald-200'
                : 'text-sm sm:text-base font-extrabold text-emerald-300'
            }
          >
            ✅ सत्यापित सबल बिंदु (Verified Strong Points):
          </div>
          <div className="space-y-1.5">
            {matchedPoints.map((pt, idx) => (
              <div
                key={idx}
                className={
                  isReportMode
                    ? 'p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/60 text-sm sm:text-base font-medium text-slate-900 dark:text-slate-100 leading-relaxed'
                    : 'p-2.5 rounded-lg bg-slate-900/85 border border-emerald-900/60 text-sm sm:text-[15px] font-medium text-slate-100 leading-relaxed'
                }
              >
                ✓ {pt}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
