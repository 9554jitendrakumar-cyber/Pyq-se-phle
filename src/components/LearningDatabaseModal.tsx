import React, { useState } from 'react';
import { Database, Brain, Trash2, X, Download, FileText, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

export interface LearningLog {
  id: string;
  timestamp: string;
  studentName: string;
  originalEval: any;
  correctedEval: any;
}

interface LearningDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: LearningLog[];
  onClearLogs: () => void;
  onDeleteLog: (id: string) => void;
}

export const LearningDatabaseModal: React.FC<LearningDatabaseModalProps> = ({
  isOpen,
  onClose,
  logs,
  onClearLogs,
  onDeleteLog
}) => {
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAnalyzePatterns = async () => {
    if (logs.length === 0) return;
    setIsAnalyzing(true);
    setAnalysisResult(null);
    try {
      // Create a summary payload of all changes
      const diffPayload = logs.map(log => ({
        student: log.studentName,
        ai_marks: log.originalEval.total_marks.obtained,
        human_marks: log.correctedEval.total_marks.obtained,
        ai_comment: log.originalEval.word_count?.comment || '',
        human_comment: log.correctedEval.word_count?.comment || ''
      }));

      const response = await fetch('/api/analyze-learning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diffData: diffPayload })
      });
      
      const data = await response.json();
      if (data.analysis) {
        setAnalysisResult(data.analysis);
      } else {
        setAnalysisResult('विश्लेषण विफल रहा।');
      }
    } catch (error) {
      console.error(error);
      setAnalysisResult('सर्वर से संपर्क करने में त्रुटि।');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = 'ai_learning_dataset.json';
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col border border-slate-200 dark:border-slate-800">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/50 rounded-xl flex items-center justify-center border border-indigo-200 dark:border-indigo-800/50">
              <Brain className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">AI लर्निंग डेटाबेस</h2>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                आपके द्वारा किए गए संशोधनों का रिकॉर्ड • AI को प्रशिक्षित करने हेतु
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-full transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Bar */}
        <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
              कुल रिकॉर्ड: {logs.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleExportJson}
              disabled={logs.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-lg transition-colors border border-indigo-200 dark:border-indigo-800 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" /> <span>Dataset Export</span>
            </button>
            <button 
              onClick={handleAnalyzePatterns}
              disabled={logs.length === 0 || isAnalyzing}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 rounded-lg transition-all shadow-sm border border-indigo-700 disabled:opacity-50"
            >
              {isAnalyzing ? <span className="animate-pulse">विश्लेषण हो रहा है...</span> : <><Sparkles className="w-3.5 h-3.5" /> <span>पैटर्न विश्लेषण करें</span></>}
            </button>
            <button 
              onClick={() => { if(window.confirm('क्या आप सभी लर्निंग लॉग्स हटाना चाहते हैं?')) onClearLogs(); }}
              disabled={logs.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg transition-colors border border-red-200 dark:border-red-800/50 disabled:opacity-50 ml-2"
            >
              <Trash2 className="w-3.5 h-3.5" /> <span>क्लियर डेटा</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 dark:bg-slate-900/30">
          
          {analysisResult && (
            <div className="mb-6 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-5 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> AI पैटर्न विश्लेषण रिपोर्ट
                </h3>
                <button onClick={() => setAnalysisResult(null)} className="text-indigo-400 hover:text-indigo-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-medium whitespace-pre-line bg-white dark:bg-slate-900 p-4 rounded-lg border border-indigo-100 dark:border-indigo-800/50">
                {analysisResult}
              </div>
              <div className="mt-3 text-xs text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-100 dark:bg-indigo-900/50 inline-block px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800">
                💡 सुझाव: इन नियमों को कॉपी करके अपनी 'AI मॉडल सेटिंग्स' के मास्टर प्रॉम्प्ट में जोड़ें।
              </div>
            </div>
          )}

          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 opacity-50">
              <Database className="w-16 h-16 text-slate-300 mb-4" />
              <p className="text-slate-500 font-bold">कोई लर्निंग लॉग्स उपलब्ध नहीं हैं।</p>
              <p className="text-xs text-slate-400 mt-2 text-center max-w-sm">
                जब आप किसी जांची गई कॉपी में बदलाव (नंबर या टिप्पणी) करके 'AI लर्निंग में सुरक्षित करें' बटन दबाएंगे, तो वह डेटा यहाँ सेव हो जाएगा।
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => {
                const isExpanded = expandedLogId === log.id;
                const date = new Date(log.timestamp).toLocaleString('hi-IN', {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                });

                const aiMarks = log.originalEval.total_marks.obtained;
                const myMarks = log.correctedEval.total_marks.obtained;
                const markDiff = myMarks - aiMarks;

                return (
                  <div key={log.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm transition-all hover:shadow-md">
                    {/* Log Header */}
                    <div 
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center border border-slate-200 dark:border-slate-600">
                          <FileText className="w-4 h-4 text-slate-500" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">{log.studentName}</h4>
                          <span className="text-[10px] text-slate-500 font-medium bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full mt-1 inline-block">
                            {date}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">AI</p>
                            <p className="font-mono font-bold text-sm text-slate-700 dark:text-slate-300">{aiMarks}</p>
                          </div>
                          <div className="text-slate-300">→</div>
                          <div className="text-left">
                            <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wide">Human</p>
                            <p className="font-mono font-bold text-sm text-indigo-700 dark:text-indigo-400 flex items-center gap-1">
                              {myMarks}
                              {markDiff !== 0 && (
                                <span className={`text-[9px] px-1 rounded-sm ${markDiff > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                  {markDiff > 0 ? '+' : ''}{markDiff}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 border-l border-slate-200 dark:border-slate-700 pl-4">
                          <button 
                            onClick={(e) => { e.stopPropagation(); onDeleteLog(log.id); }}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="लॉग हटाएं"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Content (Diff View) */}
                    {isExpanded && (
                      <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700 grid grid-cols-2 gap-4">
                        {/* Original (AI) */}
                        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 opacity-80">
                          <h5 className="text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Brain className="w-3.5 h-3.5" /> AI द्वारा मूल मूल्यांकन
                          </h5>
                          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                            {log.originalEval.word_count?.comment || 'कोई टिप्पणी नहीं'}
                          </p>
                        </div>

                        {/* Corrected (Human) */}
                        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-indigo-200 dark:border-indigo-800/50 shadow-sm relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                          <h5 className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" /> आपका संशोधित मूल्यांकन
                          </h5>
                          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                            {log.correctedEval.word_count?.comment || 'कोई टिप्पणी नहीं'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default LearningDatabaseModal;
