import React from 'react';
import {
  Cpu,
  X,
  Zap,
  Info,
  ChevronUp,
  ChevronDown,
  Sliders,
  Coins,
  Type,
  RotateCcw,
  Check,
} from 'lucide-react';
import {
  ALL_GEMINI_MODELS,
  THINKING_LEVEL_OPTIONS,
  getThinkingLevelInfo,
  type EvaluationThinkingLevel,
} from '../modelConfig';
import type { EvaluationResult } from '../types/evaluation';

interface ModelSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedModels: string[];
  setSelectedModels: React.Dispatch<React.SetStateAction<string[]>>;
  modelCategoryFilter: 'all' | 'flash' | 'pro';
  setModelCategoryFilter: React.Dispatch<React.SetStateAction<'all' | 'flash' | 'pro'>>;
  modelPingResults: Record<string, { loading: boolean; latencyMs?: number; success?: boolean; error?: string }>;
  pingTestStatus: { loading: boolean; result?: { latencyMs: number; model: string; success: boolean; error?: string } };
  modelTemperature: number;
  setModelTemperature: React.Dispatch<React.SetStateAction<number>>;
  showFallbackAlertBanner: boolean;
  setShowFallbackAlertBanner: React.Dispatch<React.SetStateAction<boolean>>;
  showDetailedModelTokens: boolean;
  setShowDetailedModelTokens: React.Dispatch<React.SetStateAction<boolean>>;
  evaluationMaxTokens: number;
  setEvaluationMaxTokens: React.Dispatch<React.SetStateAction<number>>;
  evaluationThinkingLevel: EvaluationThinkingLevel;
  setEvaluationThinkingLevel: React.Dispatch<React.SetStateAction<EvaluationThinkingLevel>>;
  evalResult: EvaluationResult | null;
  onOpenTokenAudit: (entry: EvaluationResult) => void;
  annotationFont: 'kalam' | 'mukta';
  onSelectAnnotationFont: (font: 'kalam' | 'mukta') => void;
  isPerfTrackingEnabled: boolean;
  setIsPerfTrackingEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  onApplyPreset: (presetType: 'fast' | 'balanced' | 'pro') => void;
  onSelectAllFlash: () => void;
  onSelectAllPro: () => void;
  onSelectAllModels: () => void;
  onMoveModelPriority: (modelId: string, direction: 'up' | 'down') => void;
  onRunPingTest: (modelToTest?: string) => void;
  onResetModelSettings: () => void;
  onSaveModelSettings: () => void;
  showToast: (msg: string) => void;
}

export const ModelSettingsModal: React.FC<ModelSettingsModalProps> = ({
  isOpen,
  onClose,
  selectedModels,
  setSelectedModels,
  modelCategoryFilter,
  setModelCategoryFilter,
  modelPingResults,
  pingTestStatus,
  modelTemperature,
  setModelTemperature,
  showFallbackAlertBanner,
  setShowFallbackAlertBanner,
  showDetailedModelTokens,
  setShowDetailedModelTokens,
  evaluationMaxTokens,
  setEvaluationMaxTokens,
  evaluationThinkingLevel,
  setEvaluationThinkingLevel,
  evalResult,
  onOpenTokenAudit,
  annotationFont,
  onSelectAnnotationFont,
  isPerfTrackingEnabled,
  setIsPerfTrackingEnabled,
  onApplyPreset,
  onSelectAllFlash,
  onSelectAllPro,
  onSelectAllModels,
  onMoveModelPriority,
  onRunPingTest,
  onResetModelSettings,
  onSaveModelSettings,
  showToast,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700 max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-50 to-orange-50/50 dark:from-slate-800 dark:to-slate-800 border-b border-amber-100 dark:border-slate-700 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-600 text-white rounded-xl shadow-sm">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-100">
                AI मॉडल सेटिंग्स
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                मॉडल कैस्केड, फॉलबैक अनुक्रम, लेटेंसी टेस्ट एवं तापमान कस्टमाइज़ करें
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 text-slate-800 dark:text-slate-200 text-sm">
          {/* 1. Quick Presets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" /> त्वरित अनुशंसित प्रीसेट्स
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => onApplyPreset('fast')}
                className="p-3 text-left rounded-xl border border-slate-200 dark:border-slate-700 hover:border-amber-400 dark:hover:border-amber-500 bg-slate-50/60 dark:bg-slate-800/60 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 transition-all group"
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800 dark:text-slate-200 group-hover:text-amber-700 dark:group-hover:text-amber-400">
                  <span>⚡ स्पीड मोड</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                  Flash-Lite मॉडल, द्रुत मूल्यांकन व उच्च थ्रूपुट
                </p>
              </button>

              <button
                type="button"
                onClick={() => onApplyPreset('balanced')}
                className="p-3 text-left rounded-xl border-2 border-amber-500/80 bg-amber-50/40 dark:bg-amber-950/30 transition-all group shadow-sm"
              >
                <div className="flex items-center justify-between font-bold text-xs text-amber-900 dark:text-amber-300">
                  <span>⚖️ संतुलित</span>
                  <span className="text-[9px] bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 px-1.5 py-0.5 rounded-full font-extrabold">डिफ़ॉल्ट</span>
                </div>
                <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-1 leading-tight">
                  Gemini 3.8 Flash, संतुलित व यथार्थवादी विश्लेषण
                </p>
              </button>

              <button
                type="button"
                onClick={() => onApplyPreset('pro')}
                className="p-3 text-left rounded-xl border border-slate-200 dark:border-slate-700 hover:border-amber-400 dark:hover:border-amber-500 bg-slate-50/60 dark:bg-slate-800/60 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 transition-all group"
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800 dark:text-slate-200 group-hover:text-amber-700 dark:group-hover:text-amber-400">
                  <span>🏆 प्रो इंटेलिजेंस</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                  Gemini Pro मॉडल, गहन बौद्धिक विश्लेषण
                </p>
              </button>
            </div>
          </div>

          {/* 2. Model Cascade Selection */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-indigo-500" />
                  <span>AI मॉडल कैस्केड एवं फॉलबैक अनुक्रम</span>
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  प्राथमिक मॉडल अनुपलब्ध/कोटा-सीमित होने पर सिस्टम स्वतः अगले फॉलबैक मॉडल पर सुरक्षित रूप से जाता है।
                </p>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={onSelectAllModels}
                  className="px-2.5 py-1 text-[10px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900 border border-emerald-200 dark:border-emerald-800 rounded-md transition-all cursor-pointer"
                >
                  + दोनों मॉडल्स चुनें ({ALL_GEMINI_MODELS.length})
                </button>
              </div>
            </div>

            {/* Active Cascade Info Banner */}
            <div className="mb-3 p-2.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 flex items-start gap-2">
              <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <div className="text-[11px] text-indigo-900 dark:text-indigo-200 leading-relaxed">
                <span className="font-bold">सक्रिय मॉडल कैस्केड जानकारी: </span>
                मूल्यांकन हेतु <strong>Gemini 3.8 Flash</strong> (प्राथमिक) और <strong>Gemini 3.6 Flash</strong> (फॉलबैक) कॉन्फ़िगर किए गए हैं। आप अपनी आवश्यकतानुसार किसी भी मॉडल को प्राथमिक (#1) रख सकते हैं।
              </div>
            </div>

            {/* Models List */}
            <div className="space-y-2 mt-2">
              {ALL_GEMINI_MODELS.map((m) => {
                const isSelected = selectedModels.includes(m.id);
                const priorityIndex = selectedModels.indexOf(m.id);
                const pingInfo = modelPingResults[m.id];
                const isPrimary = priorityIndex === 0;

                return (
                  <div
                    key={m.id}
                    className={`p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-white dark:bg-slate-800/90 border-indigo-400 dark:border-indigo-500 shadow-xs ring-1 ring-indigo-400/20'
                        : 'bg-slate-100/50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div
                        onClick={() => {
                          if (isSelected) {
                            if (selectedModels.length > 1) {
                              setSelectedModels(selectedModels.filter((id) => id !== m.id));
                            } else {
                              showToast('कम से कम एक मॉडल चयनित होना आवश्यक है!');
                            }
                          } else {
                            setSelectedModels([...selectedModels, m.id]);
                          }
                        }}
                        className="flex items-start gap-3 cursor-pointer flex-1"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="w-4 h-4 mt-0.5 text-indigo-600 rounded border-slate-300 dark:border-slate-600 focus:ring-indigo-500 pointer-events-none"
                        />
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1">
                              {m.category === 'pro' ? '🏆' : '⚡'}
                              <span>{m.label}</span>
                            </span>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${m.tagColor}`}>
                              {m.tag}
                            </span>
                            <span
                              className={`text-[9px] font-semibold px-2 py-0.5 rounded-md ${
                                m.tier === 'free'
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                  : 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                              }`}
                            >
                              {m.tierLabel}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{m.desc}</p>
                          <div className="flex items-center gap-3 text-[10px] text-slate-400 dark:text-slate-500 pt-0.5">
                            <span>गति: {m.speedRating}</span>
                            <span>•</span>
                            <span>तर्कशक्ति: {m.reasoningRating}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        {isSelected && (
                          <div className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800">
                            <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                              {isPrimary ? '★ प्राथमिक' : `#${priorityIndex + 1} फॉलबैक`}
                            </span>
                            <div className="flex items-center ml-1">
                              <button
                                type="button"
                                disabled={isPrimary}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onMoveModelPriority(m.id, 'up');
                                }}
                                className="p-0.5 text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={priorityIndex === selectedModels.length - 1}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onMoveModelPriority(m.id, 'down');
                                }}
                                className="p-0.5 text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          disabled={pingInfo?.loading}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRunPingTest(m.id);
                          }}
                          className="px-2.5 py-1 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-md border border-slate-300 dark:border-slate-600 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <Zap className={`w-3 h-3 text-amber-500 ${pingInfo?.loading ? 'animate-spin' : ''}`} />
                          <span>{pingInfo?.loading ? 'जाँच जारी...' : 'टेस्ट करें'}</span>
                        </button>
                      </div>
                    </div>

                    {pingInfo && !pingInfo.loading && (
                      <div
                        className={`mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/60 text-[11px] font-semibold flex items-center justify-between gap-2 ${
                          pingInfo.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span>{pingInfo.success ? '🟢' : '🔴'}</span>
                          <span className="truncate">
                            {pingInfo.success ? `सक्रिय एवं उत्तरदायी (${pingInfo.latencyMs} ms)` : `${pingInfo.error}`}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0 font-normal">
                          {pingInfo.success ? 'Ready to evaluate' : 'Check quota / key'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Overall Latency Test Bar */}
            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pingTestStatus.loading}
                  onClick={() => onRunPingTest()}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Zap className={`w-3.5 h-3.5 ${pingTestStatus.loading ? 'animate-spin' : ''}`} />
                  <span>{pingTestStatus.loading ? 'टेस्टिंग जारी है...' : `प्राथमिक मॉडल टेस्ट करें (${selectedModels[0] || 'मॉडल'})`}</span>
                </button>
              </div>

              {pingTestStatus.result && (
                <div
                  className={`text-xs font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5 ${
                    pingTestStatus.result.success
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300'
                  }`}
                >
                  <span>{pingTestStatus.result.success ? '🟢' : '🔴'}</span>
                  <span>
                    {pingTestStatus.result.success
                      ? `${pingTestStatus.result.model}: ${pingTestStatus.result.latencyMs} ms (सक्रिय एवं उत्तरदायी)`
                      : `विफल: ${pingTestStatus.result.error}`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Temperature Slider */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-amber-500" />
                <span>मॉडल तापमान: {modelTemperature}</span>
              </span>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {modelTemperature <= 0.05 ? 'पूर्णतः रूब्रिक-बद्ध' : modelTemperature <= 0.15 ? 'संतुलित यूपीएससी मानक' : 'अधिक व्याख्यात्मक'}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="0.4"
              step="0.05"
              value={modelTemperature}
              onChange={(e) => setModelTemperature(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-600"
            />
            <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mt-1">
              <span>0.0 (शून्य विचलन)</span>
              <span>0.1 (अनुशंसित मानक)</span>
              <span>0.4 (विविध उदाहरण)</span>
            </div>
          </div>

          {/* 5. Evaluation Telemetry & Token Settings */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-amber-500" />
                <span>प्रत्येक मूल्यांकन में मॉडल, फॉलबैक व टोकन ट्रैकिंग</span>
              </span>
              <span className="text-[10px] bg-cyan-100 dark:bg-cyan-900/60 text-cyan-800 dark:text-cyan-200 px-2 py-0.5 rounded-full font-bold">
                सक्रिय
              </span>
            </div>

            <div className="space-y-2.5 pt-1">
              <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-amber-600 rounded border-slate-300 dark:border-slate-600 focus:ring-amber-500 dark:bg-slate-700 cursor-pointer"
                  checked={showFallbackAlertBanner}
                  onChange={(e) => setShowFallbackAlertBanner(e.target.checked)}
                />
                <span className="font-semibold">फॉलबैक सक्रिय होने पर रिव्यू बार में प्रमुख सूचना बैनर दिखाएं</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-amber-600 rounded border-slate-300 dark:border-slate-600 focus:ring-amber-500 dark:bg-slate-700 cursor-pointer"
                  checked={showDetailedModelTokens}
                  onChange={(e) => setShowDetailedModelTokens(e.target.checked)}
                />
                <span className="font-semibold">रिव्यू बार में इनपुट/आउटपुट टोकन ब्रेकडाउन हमेशा प्रदर्शित करें</span>
              </label>

              {/* Max Output Tokens Configuration */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">अधिकतम आउटपुट टोकन सीमा:</span>
                  <span className="text-[10px] font-mono font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 px-2 py-0.5 rounded-md">
                    {evaluationMaxTokens.toLocaleString()} टोकन
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2 leading-relaxed">
                  UPSC उत्तर-पुस्तिका मूल्यांकन में गहरी मार्जिन टिप्पणियां, केस-स्टडीज और संपूर्ण मॉडल उत्तर के लिए <strong>8,192 टोकन (सर्वोच्च गुणवत्ता)</strong> अनुशंसित है।
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { tokens: 3000, label: '3,000 टोकन', sub: 'त्वरित व टोकन सेवर' },
                    { tokens: 6000, label: '6,000 टोकन', sub: 'संतुलित यूपीएससी' },
                    { tokens: 8192, label: '8,192 टोकन', sub: 'सर्वोच्च गुणवत्ता (अनुशंसित)' },
                  ].map((opt) => (
                    <button
                      key={opt.tokens}
                      type="button"
                      onClick={() => {
                        setEvaluationMaxTokens(opt.tokens);
                        localStorage.setItem('upsc_evaluation_max_tokens', String(opt.tokens));
                        showToast(`✓ आउटपुट गुणवत्ता स्तर: ${opt.label} (${opt.sub}) सक्रिय!`);
                      }}
                      className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                        evaluationMaxTokens === opt.tokens
                          ? 'border-amber-500 bg-amber-50/80 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 ring-2 ring-amber-500/30 font-bold shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800'
                      }`}
                    >
                      <div className="text-xs font-mono font-bold flex items-center justify-between">
                        <span>{opt.label}</span>
                        {evaluationMaxTokens === opt.tokens && <span className="text-[10px] text-amber-600">✓</span>}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{opt.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* AI Thinking Budget / Token Saver Control */}
              <div className="pt-2.5 border-t border-slate-200 dark:border-slate-700/80">
                <div className="flex items-center justify-between text-xs mb-1.5 flex-wrap gap-1.5">
                  <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <span>🧠 AI मॉडल थिंकिंग स्तर (Thinking Levels — Minimal / Low / Medium / High / XHigh / Auto):</span>
                  </span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2.5 py-0.5 rounded border border-amber-200 dark:border-amber-800 text-[10px]">
                    सक्रिय: {getThinkingLevelInfo(evaluationThinkingLevel).badgeText}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2.5 leading-relaxed">
                  यहाँ सभी थिंकिंग लेवल्स सक्रिय हैं: <strong>Minimal / Low</strong> तेज़ मूल्यांकन व टोकन बचत करते हैं, <strong>Medium</strong> संतुलित तर्क देता है, और <strong>High / XHigh / Auto</strong> गहन टॉपर-स्तरीय रूब्रिक विश्लेषण देते हैं।
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {THINKING_LEVEL_OPTIONS.map((opt) => (
                    <button
                      key={opt.level}
                      type="button"
                      onClick={() => {
                        setEvaluationThinkingLevel(opt.level);
                        localStorage.setItem('upsc_evaluation_thinking_level', opt.level);
                        showToast(`✓ AI थिंकिंग स्तर '${opt.label}' सक्रिय किया गया!`);
                      }}
                      className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                        evaluationThinkingLevel === opt.level
                          ? 'border-amber-500 bg-amber-50/80 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 ring-2 ring-amber-500/30 font-bold shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800'
                      }`}
                    >
                      <div className="text-xs font-bold flex items-center justify-between gap-1">
                        <span>{opt.label}</span>
                        {evaluationThinkingLevel === opt.level && (
                          <span className="text-[10px] bg-amber-500 text-slate-950 px-1.5 py-0.2 rounded font-black">सक्रिय ✓</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{opt.sub}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Most Recent Evaluation Telemetry Live Preview */}
            {evalResult && (
              <div className="mt-3 p-3 bg-white dark:bg-slate-900/70 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <Cpu className="w-3.5 h-3.5 text-indigo-500" />
                    हालिया मूल्यांकन एवं कैशिंग स्थिति:
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenTokenAudit(evalResult)}
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                  >
                    पूर्ण टोकन व कैशिंग ऑडिट खोलें ➔
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block text-[10px]">प्रयुक्त मॉडल:</span>
                    <span className="font-mono font-bold text-purple-700 dark:text-purple-300">{evalResult.model_used || 'gemini-4-hydrogen'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block text-[10px]">इनपुट / आउटपुट:</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                      In: {evalResult.token_usage?.prompt_tokens?.toLocaleString() || 0} / Out: {evalResult.token_usage?.completion_tokens?.toLocaleString() || 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block text-[10px]">⚡ कैश्ड (Cached):</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {(evalResult.token_usage?.cached_tokens ?? 0).toLocaleString()}
                      {(evalResult.token_usage?.cached_tokens ?? 0) > 0 && evalResult.token_usage?.prompt_tokens
                        ? ` (${Math.round(((evalResult.token_usage.cached_tokens || 0) / evalResult.token_usage.prompt_tokens) * 100)}%)`
                        : ' (पहली कॉपी)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block text-[10px]">🧠 थिंकिंग (Think):</span>
                    <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                      {(
                        evalResult.token_usage?.thinking_tokens !== undefined
                          ? evalResult.token_usage.thinking_tokens
                          : Math.max(
                              0,
                              (evalResult.token_usage?.total_tokens || 0) -
                                ((evalResult.token_usage?.prompt_tokens || 0) + (evalResult.token_usage?.completion_tokens || 0))
                            )
                      ).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block text-[10px]">कुल टोकन:</span>
                    <span className="font-mono font-bold text-cyan-700 dark:text-cyan-300">
                      {evalResult.token_usage?.total_tokens?.toLocaleString() || '0'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 6. Margin Annotation Font Settings */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5 text-rose-500" />
                <span>मार्जिन टिप्पणी फॉन्ट शैली</span>
              </span>
              <span className="text-[10px] bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded-full font-bold">
                {annotationFont === 'kalam' ? 'विकल्प १: Kalam' : 'विकल्प २: Mukta'}
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400">
              छात्र की उत्तर-पुस्तिका के संकीर्ण मार्जिन में दी जाने वाली लाल स्याही टिप्पणियों के लिए अपनी पसंदीदा शैली चुनें:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => onSelectAnnotationFont('kalam')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  annotationFont === 'kalam'
                    ? 'border-rose-500 bg-rose-50/80 dark:bg-rose-950/40 ring-2 ring-rose-500/20 shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100/60'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>✍️ विकल्प १: Kalam</span>
                  </span>
                  {annotationFont === 'kalam' && <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse"></span>}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">हस्तलिखित लाल पेन शैली — असली शिक्षक मूल्यांकन अहसास</p>
              </button>

              <button
                type="button"
                onClick={() => onSelectAnnotationFont('mukta')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  annotationFont === 'mukta'
                    ? 'border-rose-500 bg-rose-50/80 dark:bg-rose-950/40 ring-2 ring-rose-500/20 shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100/60'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>📱 विकल्प २: Mukta</span>
                  </span>
                  {annotationFont === 'mukta' && <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse"></span>}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">अल्ट्रा-क्लियर कॉम्पैक्ट — संकीर्ण मार्जिन में सुस्पष्ट</p>
              </button>
            </div>

            {/* Live Annotation Preview Box */}
            <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-rose-200 dark:border-rose-900/60 shadow-inner">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                <span>लाइव प्रीव्यू ({annotationFont === 'kalam' ? 'कलम' : 'मुक्ता'}):</span>
                <span className="text-rose-600">लाल स्याही</span>
              </div>
              <div
                className="text-red-700 dark:text-red-400 leading-snug font-bold"
                style={{
                  fontFamily:
                    annotationFont === 'mukta'
                      ? "'Mukta', 'Noto Sans Devanagari', sans-serif"
                      : "'Kalam', 'Noto Sans Devanagari', cursive, sans-serif",
                  fontSize: annotationFont === 'mukta' ? '14px' : '15px',
                }}
              >
                "भूमिका में अनुच्छेद 21 व पुट्टस्वामी वाद का संदर्भ जोड़ें। 360-डिग्री दृष्टिकोण आवश्यक।"
              </div>
            </div>
          </div>

          {/* 7. Performance Tracking */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
            <label className="flex items-center gap-3 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 text-amber-600 rounded border-slate-300 dark:border-slate-600 focus:ring-amber-500 dark:bg-slate-700 cursor-pointer"
                checked={isPerfTrackingEnabled}
                onChange={(e) => setIsPerfTrackingEnabled(e.target.checked)}
              />
              <span className="font-semibold">ग्लोबल परफॉर्मेंस ट्रैकिंग एवं लेटेंसी लॉग्स सक्रिय करें</span>
            </label>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex flex-wrap justify-between items-center gap-3">
          <button
            type="button"
            onClick={onResetModelSettings}
            className="px-3.5 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>डिफ़ॉल्ट रीसेट करें</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              रद्द करें
            </button>
            <button
              type="button"
              onClick={onSaveModelSettings}
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>सेटिंग्स लागू करें एवं सहेजें</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
