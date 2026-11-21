import React, { useMemo } from 'react';
import { CheckCircle2, AlertTriangle, Wand2, ArrowRight } from 'lucide-react';
import {
  validateHindiOrthography,
  applyHindiSpellingCorrection,
  HindiOrthographicIssue
} from '../utils/hindiSpellChecker';

interface HindiSpellCheckInputProps {
  value: string;
  onChange: (newValue: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  compact?: boolean;
}

export const HindiSpellCheckInput: React.FC<HindiSpellCheckInputProps> = ({
  value,
  onChange,
  placeholder = 'मूल्यांकन टिप्पणी लिखें...',
  className = '',
  inputClassName = '',
  autoFocus = false,
  onKeyDown,
  compact = false
}) => {
  // Validate text in real-time
  const spellCheck = useMemo(() => {
    return validateHindiOrthography(value);
  }, [value]);

  const handleFixSingle = (issue: HindiOrthographicIssue) => {
    const corrected = applyHindiSpellingCorrection(value, issue);
    onChange(corrected);
  };

  const handleFixAll = () => {
    if (spellCheck.fixedText) {
      onChange(spellCheck.fixedText);
    }
  };

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="relative flex items-center">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onKeyDown={onKeyDown}
          className={`w-full px-3 py-1.5 bg-white dark:bg-slate-900 border rounded text-xs font-semibold focus:outline-none focus:ring-1 transition-colors ${
            spellCheck.hasErrors
              ? 'border-amber-400 dark:border-amber-600 focus:ring-amber-500 pr-8'
              : 'border-slate-300 dark:border-slate-700 focus:ring-amber-500 pr-8 dark:text-white'
          } ${inputClassName}`}
        />

        {/* Status indicator icon inside the right edge of input */}
        <div className="absolute right-2 flex items-center pointer-events-none">
          {value.trim().length > 0 && (
            spellCheck.hasErrors ? (
              <span title={`${spellCheck.issues.length} वर्तनी अशुद्धियां पाई गईं`}>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
              </span>
            ) : (
              <span title="शुद्ध हिंदी वर्तनी">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 opacity-80" />
              </span>
            )
          )}
        </div>
      </div>

      {/* Orthographic issues suggestions bar */}
      {spellCheck.hasErrors && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 rounded-md p-2 flex flex-col gap-1.5 shadow-sm text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              <span>वर्तनी सुझाव:</span>
            </span>
            {spellCheck.issues.length > 1 && (
              <button
                type="button"
                onClick={handleFixAll}
                className="text-[10px] font-bold px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded flex items-center gap-1 transition-colors shadow-xs"
                title="सभी वर्तनी त्रुटियों को एक साथ ठीक करें"
              >
                <Wand2 className="w-2.5 h-2.5" />
                सभी सुधारें
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {spellCheck.issues.map((issue) => (
              <button
                key={issue.id}
                type="button"
                onClick={() => handleFixSingle(issue)}
                className="group flex items-center gap-1 text-[10px] bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 border border-amber-300 dark:border-amber-700/70 hover:border-emerald-500 dark:hover:border-emerald-500 px-2 py-1 rounded shadow-xs transition-all text-left"
                title={`${issue.reason} — क्लिक करके सुधारें`}
              >
                <span className="text-red-600 dark:text-red-400 line-through font-medium">
                  {issue.word}
                </span>
                <ArrowRight className="w-2.5 h-2.5 text-slate-400 group-hover:text-emerald-600" />
                <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                  {issue.suggestion}
                </span>
                <span className="text-[9px] text-slate-500 dark:text-slate-400 hidden sm:inline border-l border-slate-200 dark:border-slate-800 pl-1 ml-0.5">
                  {issue.reason}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
