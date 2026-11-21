import React from 'react';
import {
  Cloud,
  CheckCircle2,
  RefreshCw,
  LogOut,
  ShieldCheck,
  Database,
  Sliders,
  FileText,
  Brain,
  X,
  AlertCircle,
} from 'lucide-react';
import type { User } from '../firebase';

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  syncError: string | null;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onForcePullFromCloud: () => Promise<void>;
  onForcePushToCloud: () => Promise<void>;
  stats: {
    promptSlotsCount: number;
    activeSlotName: string;
    historyCount: number;
    learningLogsCount: number;
  };
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({
  isOpen,
  onClose,
  user,
  isSyncing,
  lastSyncedAt,
  syncError,
  onSignIn,
  onSignOut,
  onForcePullFromCloud,
  onForcePushToCloud,
  stats,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">
              <Cloud className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-white tracking-tight">
                  क्लाउड डेटाबेस एवं मल्टी-डिवाइस सिंक
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-400/30">
                  Auto-Sync Active
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                प्रॉम्प्ट स्लॉट्स, चेक्ड कॉपियाँ व सेटिंग्स सभी डिवाइस पर रियल-टाइम सिंक
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {syncError && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 flex items-start gap-2.5 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <div className="flex-1">
                <p className="font-bold">क्लाउड सिंक सूचना:</p>
                <p className="mt-0.5 break-words">{syncError}</p>
              </div>
            </div>
          )}

          {!user ? (
            <div className="text-center py-6 px-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-700">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-1">
                अकाउंट क्लाउड सिंक सक्रिय करें
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-5 leading-relaxed">
                Google से लॉगिन करने पर आपके प्रॉम्प्ट स्लॉट्स, मॉडल सेटिंग्स, चेक्ड उत्तर-पुस्तिकाएँ और स्कोरकार्ड स्वतः क्लाउड डेटाबेस पर सुरक्षित हो जाएंगे।
              </p>
              <button
                onClick={onSignIn}
                disabled={isSyncing}
                className="inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-sm shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                <Cloud className="w-4 h-4" />
                <span>{isSyncing ? 'कनेक्ट हो रहा है...' : 'Google अकाउंट से कनेक्ट करें'}</span>
              </button>
            </div>
          ) : (
            <>
              {/* Account Card */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
                <div className="flex items-center gap-3 min-w-0">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'User'}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full border-2 border-emerald-400 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0">
                      {(user.displayName || user.email || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {user.displayName || 'UPSC Evaluator'}
                      </p>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
                    {lastSyncedAt && (
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold mt-0.5">
                        ✓ अंतिम क्लाउड सिंक: {lastSyncedAt}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={onSignOut}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 border border-red-200 dark:border-red-800/50 transition-colors cursor-pointer shrink-0"
                  title="लॉगआउट करें"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>लॉगआउट</span>
                </button>
              </div>

              {/* Synced Items Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex items-start gap-2.5">
                  <Sliders className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      प्रॉम्प्ट स्लॉट्स ({stats.promptSlotsCount})
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-[160px]">
                      सक्रिय: {stats.activeSlotName}
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex items-start gap-2.5">
                  <FileText className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      चेक्ड कॉपियाँ ({stats.historyCount})
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      उत्तर-पुस्तिका पृष्ठ व स्कोरकार्ड
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex items-start gap-2.5">
                  <Brain className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      AI लर्निंग मेमोरी ({stats.learningLogsCount})
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      ओनर अंक व टिप्पणी सुधार लॉग्स
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex items-start gap-2.5">
                  <Database className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      स्मार्ट क्लाउड स्टोरेज
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      कम्प्रेस्ड कॉपी + लोकल हाई-रेज़ कैश
                    </p>
                  </div>
                </div>
              </div>

              {/* Manual Sync Actions */}
              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <button
                  onClick={onForcePushToCloud}
                  disabled={isSyncing}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'सिंक हो रहा है...' : 'क्लाउड पर अभी बैकअप करें'}</span>
                </button>
                <button
                  onClick={onForcePullFromCloud}
                  disabled={isSyncing}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                  <span>क्लाउड से लेटेस्ट डेटा सिंक करें</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
