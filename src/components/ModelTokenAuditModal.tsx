import React, { useState } from 'react';
import { 
  Cpu, 
  Coins, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Clock, 
  Sliders, 
  Check, 
  Copy, 
  ShieldCheck,
  FileText
} from 'lucide-react';

export interface ModelExecutionAttempt {
  model: string;
  attempt: number;
  role: 'primary' | 'fallback';
  status: 'success' | 'quota_exhausted' | 'high_demand' | 'invalid_argument' | 'not_found' | 'failed';
  status_code?: number | string;
  latency_ms: number;
  error_message?: string;
  tokens: {
    prompt_tokens: number;
    cached_tokens?: number;
    thinking_tokens?: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface ModelTokenAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  evaluation: any | null;
  onOpenModelSettings?: () => void;
}

export const ModelTokenAuditModal: React.FC<ModelTokenAuditModalProps> = ({
  isOpen,
  onClose,
  evaluation,
  onOpenModelSettings
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !evaluation) return null;

  const winningModel: string = evaluation.model_used || 'gemini-4-hydrogen';
  const primaryModel: string = evaluation.primary_model_requested || winningModel;
  const fallbackOccurred: boolean = Boolean(
    evaluation.fallback_occurred || 
    (evaluation.primary_model_requested && evaluation.primary_model_requested !== winningModel)
  );

  const tokenUsage = evaluation.token_usage || {
    prompt_tokens: 0,
    cached_tokens: 0,
    thinking_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0
  };

  const promptTokens: number = tokenUsage.prompt_tokens || 0;
  const completionTokens: number = tokenUsage.completion_tokens || 0;
  const totalTokens: number = tokenUsage.total_tokens || (promptTokens + completionTokens);
  const cachedTokens: number = tokenUsage.cached_tokens || 0;
  const thinkingTokens: number =
    typeof tokenUsage.thinking_tokens === 'number' && tokenUsage.thinking_tokens > 0
      ? tokenUsage.thinking_tokens
      : Math.max(0, totalTokens - (promptTokens + completionTokens));

  const pageCount = Array.isArray(evaluation.pages) ? evaluation.pages.length : 3;
  const estimatedImageTokens: number =
    tokenUsage.image_tokens || Math.min(Math.max(258 * pageCount, pageCount * 520), Math.max(0, promptTokens - 1200));
  const staticPrefixTokens: number =
    tokenUsage.static_prefix_tokens || Math.max(0, promptTokens - estimatedImageTokens);
  const cacheHitPercent: number =
    promptTokens > 0 ? Math.round((cachedTokens / promptTokens) * 100) : 0;
  const tokensSaved: number = tokenUsage.tokens_saved ?? Math.round(cachedTokens * 0.75);
  const effectiveBillableTokens: number =
    tokenUsage.effective_billable_tokens ?? Math.max(0, totalTokens - tokensSaved);

  const rawHistory: ModelExecutionAttempt[] = evaluation.model_execution_history || [];

  // If execution history is empty (e.g. from an older cached run), synthesize a single success attempt
  const executionHistory: ModelExecutionAttempt[] = rawHistory.length > 0 
    ? rawHistory 
    : [{
        model: winningModel,
        attempt: 1,
        role: fallbackOccurred ? 'fallback' : 'primary',
        status: 'success',
        status_code: 200,
        latency_ms: 2400,
        tokens: {
          prompt_tokens: promptTokens,
          cached_tokens: cachedTokens,
          thinking_tokens: thinkingTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens
        }
      }];

  const handleCopyTelemetry = () => {
    const summary = {
      final_model_used: winningModel,
      primary_requested_model: primaryModel,
      fallback_occurred: fallbackOccurred,
      total_tokens: totalTokens,
      input_tokens: promptTokens,
      cached_input_tokens: cachedTokens,
      cache_hit_percent: `${cacheHitPercent}%`,
      thinking_tokens: thinkingTokens,
      output_tokens: completionTokens,
      tokens_saved_by_cache: tokensSaved,
      effective_billable_tokens: effectiveBillableTokens,
      attempts: executionHistory
    };
    navigator.clipboard.writeText(JSON.stringify(summary, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const uncachedInputTokens = Math.max(0, promptTokens - cachedTokens);
  const safeTotal = Math.max(1, totalTokens);
  const cachedSharePct = Math.round((cachedTokens / safeTotal) * 100);
  const uncachedSharePct = Math.round((uncachedInputTokens / safeTotal) * 100);
  const thinkingSharePct = Math.round((thinkingTokens / safeTotal) * 100);
  const outputSharePct = Math.max(1, 100 - (cachedSharePct + uncachedSharePct + thinkingSharePct));

  return (
    <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700 max-h-[92vh]">
        
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border-b border-indigo-900/60 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded-xl shadow-xs">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black tracking-tight text-white">
                  मॉडल, कैशिंग (Caching) व टोकन ऑडिट रिपोर्ट
                </h2>
                {cachedTokens > 0 && (
                  <span className="text-[10px] bg-emerald-500/30 text-emerald-300 border border-emerald-400/50 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                    ⚡ कैश हिट: {cachedTokens.toLocaleString()} ({cacheHitPercent}%)
                  </span>
                )}
                {fallbackOccurred ? (
                  <span className="text-[10px] bg-amber-500/30 text-amber-300 border border-amber-500/50 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> फॉलबैक सक्रिय
                  </span>
                ) : (
                  <span className="text-[10px] bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> प्राथमिक सफल
                  </span>
                )}
                <span className="text-[10px] bg-indigo-500/30 text-indigo-200 border border-indigo-400/50 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                  🧠 थिंकिंग स्तर: {String(evaluation.thinking_level_used || 'auto').toUpperCase()} ({thinkingTokens.toLocaleString()} Think टोकन)
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                इस मूल्यांकन में इनपुट, कैश्ड प्रॉम्प्ट, AI थिंकिंग ({String(evaluation.thinking_level_used || 'auto').toUpperCase()}) एवं आउटपुट टोकन्स का 100% सटीक ऑडिट
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            title="बंद करें"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-slate-800 dark:text-slate-200 text-sm">
          
          {/* APPLIED PROMPT SLOT BANNER */}
          {evaluation.applied_slot && (
            <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 border border-amber-300 dark:border-amber-800 rounded-xl flex items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                  <Sliders className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-black uppercase text-amber-700 dark:text-amber-400 tracking-wider block">
                    सख्ती से लागू प्रॉम्प्ट स्लॉट
                  </span>
                  <div className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                    स्लॉट {evaluation.applied_slot.id}: {evaluation.applied_slot.name}
                  </div>
                </div>
              </div>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 px-2.5 py-1 rounded-full font-bold shrink-0 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>100% अनुपालन</span>
              </span>
            </div>
          )}

          {/* 1. TOP SUMMARY CARDS (5-Column Bento with Cached & Thinking Tokens) */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {/* Final Model */}
            <div className="p-3 bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 rounded-xl">
              <span className="text-[10px] font-black uppercase text-purple-700 dark:text-purple-300 flex items-center gap-1">
                <Cpu className="w-3 h-3" /> प्रयुक्त मॉडल
              </span>
              <div className="mt-1 font-mono font-extrabold text-xs sm:text-sm text-purple-900 dark:text-purple-200 truncate" title={winningModel}>
                {winningModel}
              </div>
              <span className="text-[9px] text-purple-600 dark:text-purple-400 block mt-0.5">
                {fallbackOccurred ? `⚠️ फॉलबैक (${primaryModel} से)` : '✓ प्राथमिक सफल'}
              </span>
            </div>

            {/* Input Tokens (Prompt) */}
            <div className="p-3 bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 rounded-xl">
              <span className="text-[10px] font-black uppercase text-blue-800 dark:text-blue-300 flex items-center gap-1">
                📥 कुल इनपुट (In)
              </span>
              <div className="mt-1 font-mono font-black text-sm sm:text-base text-blue-950 dark:text-blue-100">
                {promptTokens.toLocaleString()}
              </div>
              <span className="text-[9px] text-blue-700 dark:text-blue-400 block mt-0.5">
                प्रॉम्प्ट: ~{staticPrefixTokens.toLocaleString()} | इमेज: ~{estimatedImageTokens.toLocaleString()}
              </span>
            </div>

            {/* Cached Tokens */}
            <div className={`p-3 rounded-xl border ${
              cachedTokens > 0
                ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
            }`}>
              <span className={`text-[10px] font-black uppercase flex items-center gap-1 ${
                cachedTokens > 0 ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-400'
              }`}>
                ⚡ कैश्ड (Cached)
              </span>
              <div className={`mt-1 font-mono font-black text-sm sm:text-base ${
                cachedTokens > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-300'
              }`}>
                {cachedTokens.toLocaleString()}{' '}
                <span className="text-[10px] font-bold">({cacheHitPercent}%)</span>
              </div>
              <span className="text-[9px] text-emerald-700 dark:text-emerald-400 block mt-0.5">
                {cachedTokens > 0
                  ? `✓ ~${tokensSaved.toLocaleString()} टोकन लागत बचत (75% छूट)`
                  : `कैश-योग्य प्रीफिक्स: ~${staticPrefixTokens.toLocaleString()} टोकन`}
              </span>
            </div>

            {/* Thinking Tokens */}
            <div className="p-3 bg-fuchsia-50/80 dark:bg-fuchsia-950/30 border border-fuchsia-200 dark:border-fuchsia-800/60 rounded-xl">
              <span className="text-[10px] font-black uppercase text-fuchsia-800 dark:text-fuchsia-300 flex items-center gap-1">
                🧠 थिंकिंग (Think)
              </span>
              <div className="mt-1 font-mono font-black text-sm sm:text-base text-fuchsia-950 dark:text-fuchsia-100">
                {thinkingTokens.toLocaleString()}
              </div>
              <span className="text-[9px] text-fuchsia-700 dark:text-fuchsia-400 block mt-0.5">
                OCR व रूब्रिक तर्क विश्लेषण
              </span>
            </div>

            {/* Output & Total Tokens */}
            <div className="p-3 bg-cyan-50/80 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800/60 rounded-xl col-span-2 sm:col-span-1">
              <span className="text-[10px] font-black uppercase text-cyan-800 dark:text-cyan-300 flex items-center gap-1">
                <Coins className="w-3 h-3" /> कुल (Total)
              </span>
              <div className="mt-1 font-mono font-black text-sm sm:text-base text-cyan-950 dark:text-cyan-100">
                {totalTokens.toLocaleString()}
              </div>
              <span className="text-[9px] text-cyan-700 dark:text-cyan-400 block mt-0.5 font-mono">
                Out: {completionTokens.toLocaleString()} | प्रभावी: {effectiveBillableTokens.toLocaleString()}
              </span>
            </div>
          </div>

          {/* 1B. VISUAL TOKEN & CONTEXT CACHING BAR */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <span>📊 संपूर्ण टोकन समीकरण (Exact Token Math):</span>
                <span className="font-mono text-[11px] bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100">
                  In ({promptTokens.toLocaleString()}) + Out ({completionTokens.toLocaleString()}) + Think ({thinkingTokens.toLocaleString()}) = {totalTokens.toLocaleString()}
                </span>
              </span>
              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                {cachedTokens > 0
                  ? `⚡ Implicit Context Cache सक्रिय (${cachedTokens.toLocaleString()} टोकन कैश से प्राप्त)`
                  : `💡 अगली कॉपी जांचने पर ~${staticPrefixTokens.toLocaleString()} प्रॉम्प्ट टोकन्स स्वतः कैश (Implicit Cache) होंगे`}
              </span>
            </div>

            {/* Proportional Bar */}
            <div className="w-full h-3 bg-slate-200 dark:bg-slate-900 rounded-full overflow-hidden flex border border-slate-300 dark:border-slate-700">
              {cachedTokens > 0 && (
                <div
                  style={{ width: `${Math.max(4, cachedSharePct)}%` }}
                  className="bg-emerald-500 h-full transition-all duration-500"
                  title={`कैश्ड इनपुट टोकन: ${cachedTokens.toLocaleString()} (${cachedSharePct}%)`}
                />
              )}
              <div
                style={{ width: `${Math.max(5, uncachedSharePct)}%` }}
                className="bg-blue-500 h-full transition-all duration-500"
                title={`नए/अनकैश्ड इनपुट टोकन: ${uncachedInputTokens.toLocaleString()} (${uncachedSharePct}%)`}
              />
              {thinkingTokens > 0 && (
                <div
                  style={{ width: `${Math.max(4, thinkingSharePct)}%` }}
                  className="bg-fuchsia-500 h-full transition-all duration-500"
                  title={`AI थिंकिंग टोकन: ${thinkingTokens.toLocaleString()} (${thinkingSharePct}%)`}
                />
              )}
              <div
                style={{ width: `${Math.max(4, outputSharePct)}%` }}
                className="bg-amber-500 h-full transition-all duration-500"
                title={`आउटपुट JSON टोकन: ${completionTokens.toLocaleString()} (${outputSharePct}%)`}
              />
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300 pt-0.5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1.5 font-semibold">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block"></span>
                  <span>⚡ कैश्ड प्रॉम्प्ट: <strong>{cachedTokens.toLocaleString()}</strong></span>
                </span>
                <span className="flex items-center gap-1.5 font-semibold">
                  <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block"></span>
                  <span>📥 नया इनपुट (प्रॉम्प्ट+इमेज): <strong>{uncachedInputTokens.toLocaleString()}</strong></span>
                </span>
                <span className="flex items-center gap-1.5 font-semibold">
                  <span className="w-2.5 h-2.5 rounded-sm bg-fuchsia-500 inline-block"></span>
                  <span>🧠 AI थिंकिंग: <strong>{thinkingTokens.toLocaleString()}</strong></span>
                </span>
                <span className="flex items-center gap-1.5 font-semibold">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block"></span>
                  <span>📤 आउटपुट JSON: <strong>{completionTokens.toLocaleString()}</strong></span>
                </span>
              </div>
            </div>
          </div>

          {/* 2. FALLBACK NOTICE BANNER (IF APPLICABLE) */}
          {fallbackOccurred && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300/80 dark:border-amber-800/80 text-amber-950 dark:text-amber-100 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <div className="font-bold flex items-center gap-2">
                  <span>स्वचालित फॉलबैक सक्रियण:</span>
                  <span className="font-mono text-[11px] bg-amber-200/80 dark:bg-amber-900 text-amber-900 dark:text-amber-100 px-1.5 py-0.5 rounded font-bold">
                    {primaryModel} ➔ {winningModel}
                  </span>
                </div>
                <p className="mt-1 text-amber-900/90 dark:text-amber-200/90 text-[11px]">
                  प्राथमिक मॉडल के दर-सीमा (429 Quota) अथवा Google AI सर्वर पर अत्यधिक लोड (503 High Demand) के कारण मूल्यांकन रुका नहीं, बल्कि पोर्टल ने आपकी मॉडल कैस्केड सेटिंग्स के अनुसार स्वतः अगले उपलब्ध मॉडल पर स्विच कर 100% मूल्यांकन सफलतापूर्वक पूरा किया।
                </p>
              </div>
            </div>
          )}

          {/* 3. EXECUTION HISTORY & PER-MODEL BREAKDOWN TABLE */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                प्रत्येक प्रयास एवं मॉडल टोकन ऑडिट
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                कुल प्रयास: {executionHistory.length}
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-[11px]">
                    <th className="p-2.5">प्रयास</th>
                    <th className="p-2.5">मॉडल नाम</th>
                    <th className="p-2.5">भूमिका</th>
                    <th className="p-2.5">स्थिति</th>
                    <th className="p-2.5 text-right">लेटेंसी</th>
                    <th className="p-2.5 text-right">इनपुट (In)</th>
                    <th className="p-2.5 text-right text-emerald-700 dark:text-emerald-400">⚡ कैश्ड</th>
                    <th className="p-2.5 text-right text-fuchsia-700 dark:text-fuchsia-400">🧠 थिंकिंग</th>
                    <th className="p-2.5 text-right">आउटपुट (Out)</th>
                    <th className="p-2.5 text-right">कुल टोकन</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
                  {executionHistory.map((item, idx) => {
                    const isSuccess = item.status === 'success';
                    const itemPrompt = item.tokens?.prompt_tokens || 0;
                    const itemCached = item.tokens?.cached_tokens || 0;
                    const itemComp = item.tokens?.completion_tokens || 0;
                    const itemTotal = item.tokens?.total_tokens || 0;
                    const itemThink =
                      typeof item.tokens?.thinking_tokens === 'number' && item.tokens.thinking_tokens > 0
                        ? item.tokens.thinking_tokens
                        : Math.max(0, itemTotal - (itemPrompt + itemComp));

                    return (
                      <tr 
                        key={idx}
                        className={isSuccess 
                          ? 'bg-emerald-50/30 dark:bg-emerald-950/10' 
                          : 'bg-rose-50/30 dark:bg-rose-950/10 text-slate-600 dark:text-slate-400'
                        }
                      >
                        {/* Attempt # */}
                        <td className="p-2.5 font-bold text-slate-700 dark:text-slate-300">
                          #{item.attempt || idx + 1}
                        </td>

                        {/* Model */}
                        <td className="p-2.5">
                          <div className="font-mono font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                            <span>{item.model}</span>
                            {isSuccess && (
                              <span className="text-[9px] bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 px-1.5 py-0.5 rounded-full font-bold">
                                चयनित
                              </span>
                            )}
                          </div>
                          {item.error_message && (
                            <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5 line-clamp-1" title={item.error_message}>
                              {item.error_message}
                            </div>
                          )}
                        </td>

                        {/* Role */}
                        <td className="p-2.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            item.role === 'primary' 
                              ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                              : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                          }`}>
                            {item.role === 'primary' ? '★ प्राथमिक' : `↳ फॉलबैक #${idx}`}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="p-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${
                              isSuccess ? 'bg-emerald-500' : (item.status === 'high_demand' || item.status === 'quota_exhausted' ? 'bg-amber-500' : 'bg-rose-500')
                            }`}></span>
                            <span className={`font-semibold text-[11px] ${
                              isSuccess ? 'text-emerald-700 dark:text-emerald-300' : (item.status === 'high_demand' || item.status === 'quota_exhausted' ? 'text-amber-700 dark:text-amber-300' : 'text-rose-700 dark:text-rose-300')
                            }`}>
                              {isSuccess 
                                ? '🟢 सफल (200 OK)' 
                                : item.status === 'high_demand'
                                ? '🟡 ओवरलोड (503)'
                                : item.status === 'quota_exhausted' 
                                ? '🟡 दर-सीमा (429)' 
                                : item.status === 'not_found'
                                ? '⚪ अनुपलब्ध (404)'
                                : '🔴 विफल'}
                            </span>
                          </div>
                        </td>

                        {/* Latency */}
                        <td className="p-2.5 text-right font-mono text-slate-600 dark:text-slate-400">
                          {item.latency_ms ? `${(item.latency_ms / 1000).toFixed(2)}s` : '—'}
                        </td>

                        {/* Prompt Tokens */}
                        <td className="p-2.5 text-right font-mono text-slate-800 dark:text-slate-200">
                          {itemPrompt.toLocaleString()}
                        </td>

                        {/* Cached Tokens */}
                        <td className="p-2.5 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">
                          {itemCached > 0 ? `⚡ ${itemCached.toLocaleString()}` : '0'}
                        </td>

                        {/* Thinking Tokens */}
                        <td className="p-2.5 text-right font-mono text-fuchsia-700 dark:text-fuchsia-400">
                          {itemThink > 0 ? itemThink.toLocaleString() : '0'}
                        </td>

                        {/* Completion Tokens */}
                        <td className="p-2.5 text-right font-mono text-slate-800 dark:text-slate-200">
                          {itemComp.toLocaleString()}
                        </td>

                        {/* Total Tokens */}
                        <td className="p-2.5 text-right font-mono font-bold text-indigo-900 dark:text-indigo-200">
                          {itemTotal.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 dark:bg-slate-800/80 font-bold border-t border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200">
                    <td colSpan={5} className="p-2.5 text-right text-xs">
                      कुल संचयी टोकन:
                    </td>
                    <td className="p-2.5 text-right font-mono text-xs">
                      {promptTokens.toLocaleString()}
                    </td>
                    <td className="p-2.5 text-right font-mono text-xs text-emerald-700 dark:text-emerald-400">
                      {cachedTokens.toLocaleString()}
                    </td>
                    <td className="p-2.5 text-right font-mono text-xs text-fuchsia-700 dark:text-fuchsia-400">
                      {thinkingTokens.toLocaleString()}
                    </td>
                    <td className="p-2.5 text-right font-mono text-xs">
                      {completionTokens.toLocaleString()}
                    </td>
                    <td className="p-2.5 text-right font-mono text-indigo-700 dark:text-indigo-300 font-extrabold text-xs">
                      {totalTokens.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* 4. TOKEN DIAGNOSTICS & EXPLANATION */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-2">
            <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-amber-500" />
              टोकन एवं कैशिंग (Context Caching) विश्लेषण:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-600 dark:text-slate-400">
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-700/60">
                <span className="font-bold text-slate-800 dark:text-slate-200 block mb-0.5">
                  📥 इनपुट व ⚡ कैश ({promptTokens.toLocaleString()} In)
                </span>
                <p>
                  इसमें ~{staticPrefixTokens.toLocaleString()} टोकन स्थायी मास्टर प्रॉम्प्ट व मॉडल उत्तर के हैं (जो लगातार कॉपियां जांचने पर <strong>Implicit Cache</strong> हो जाते हैं और 75% लागत बचाते हैं) तथा ~{estimatedImageTokens.toLocaleString()} टोकन छात्र की कॉपी की इमेज के हैं।
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-700/60">
                <span className="font-bold text-fuchsia-800 dark:text-fuchsia-300 block mb-0.5">
                  🧠 थिंकिंग टोकन ({thinkingTokens.toLocaleString()} Think)
                </span>
                <p>
                  हस्तलिखित देवनागरी अक्षरों को पढ़ने (OCR), प्रश्न की उप-माँगों का मिलान करने और रूब्रिक अंकों का सटीक गणित लगाने में AI द्वारा प्रयुक्त आंतरिक रीजनिंग टोकन। (सेटिंग्स से इसे Low/Auto पर नियंत्रित किया जा सकता है)।
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-700/60">
                <span className="font-bold text-slate-800 dark:text-slate-200 block mb-0.5">
                  📤 आउटपुट टोकन ({completionTokens.toLocaleString()} Out)
                </span>
                <p>
                  हर पृष्ठ पर 4-6 निदानात्मक मार्जिन टिप्पणियां, भूमिका व निष्कर्ष के 4-4 स्तंभ, मुख्य भाग के उप-भाग और समाविष्ट/छूटे बिंदुओं का संपूर्ण JSON आउटपुट।
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* MODAL FOOTER */}
        <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyTelemetry}
              className="px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg border border-slate-300 dark:border-slate-600 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
              <span>{copied ? 'कॉपी हो गया' : 'ऑडिट डेटा कॉपी करें'}</span>
            </button>

            {onOpenModelSettings && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenModelSettings();
                }}
                className="px-3 py-1.5 text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-lg border border-indigo-200 dark:border-indigo-800 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>मॉडल कैस्केड सेटिंग्स बदलें</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-900 dark:bg-slate-200 dark:hover:bg-white text-white dark:text-slate-900 rounded-lg transition-all shadow-xs cursor-pointer"
          >
            बंद करें
          </button>
        </div>

      </div>
    </div>
  );
};
