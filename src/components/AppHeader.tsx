import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  FileText,
  Layers,
  RotateCcw,
  FolderOpen,
  Cpu,
  Brain,
  Cloud,
  Sun,
  Moon,
  RefreshCw,
  LogOut,
  LogIn,
  Check,
  X,
  Lock,
  Unlock,
  Users,
  BarChart3,
  Zap,
  User,
} from 'lucide-react';
import {
  adminUpdateStudentProfile,
  savePlatformPolicy,
  type User as FirebaseUser,
  type StudentProfileData,
  type PlatformPolicyConfig,
} from '../firebase';
import type { EvaluationResult } from '../types/evaluation';

interface AppHeaderProps {
  isEffectiveStudentView: boolean;
  isOwnerAccount: boolean;
  evaluationMode: 'single' | 'batch';
  setEvaluationMode: React.Dispatch<React.SetStateAction<'single' | 'batch'>>;
  onOpenSingleEvaluation: () => void;
  evalResult: EvaluationResult | null;
  historyCount: number;
  showHistory: boolean;
  setShowHistory: React.Dispatch<React.SetStateAction<boolean>>;
  selectedModels: string[];
  setShowModelSettings: React.Dispatch<React.SetStateAction<boolean>>;
  setShowLearningDatabase: React.Dispatch<React.SetStateAction<boolean>>;
  setShowOwnerAdminModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowCloudSyncModal: React.Dispatch<React.SetStateAction<boolean>>;
  cloudUser: FirebaseUser | null;
  isCloudSyncing: boolean;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  studentProfile: StudentProfileData | null;
  platformPolicy: PlatformPolicyConfig;
  onSwitchGoogleAccount: () => void;
  onCloudSignOut: () => void;
  setShowEdTechLoginScreen: React.Dispatch<React.SetStateAction<boolean>>;
  onStudentProfileUpdated?: (updated: StudentProfileData) => void;
  onPolicyUpdated?: (updated: PlatformPolicyConfig) => void;
  isStudentPreviewMode?: boolean;
  onToggleStudentPreviewMode?: () => void;
  onOpenProgressCard?: () => void;
  onOpenQuotaUpgrade?: () => void;
  showToast?: (msg: string) => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  isEffectiveStudentView,
  isOwnerAccount,
  evaluationMode,
  setEvaluationMode,
  onOpenSingleEvaluation,
  evalResult,
  historyCount,
  showHistory,
  setShowHistory,
  selectedModels,
  setShowModelSettings,
  setShowLearningDatabase,
  setShowOwnerAdminModal,
  setShowCloudSyncModal,
  cloudUser,
  isCloudSyncing,
  isDarkMode,
  onToggleTheme,
  studentProfile,
  platformPolicy,
  onSwitchGoogleAccount,
  onCloudSignOut,
  setShowEdTechLoginScreen,
  onStudentProfileUpdated,
  onPolicyUpdated,
  isStudentPreviewMode,
  onToggleStudentPreviewMode,
  onOpenProgressCard,
  onOpenQuotaUpgrade,
  showToast,
}) => {
  const [showQuickQuotaPopover, setShowQuickQuotaPopover] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement | null>(null);

  const currentQuotaLimit = studentProfile?.quotaLimit ?? platformPolicy.defaultStudentQuota;
  const currentUsedCount = studentProfile?.usedCount ?? 0;

  const [draftQuotaLimit, setDraftQuotaLimit] = useState<string>(String(currentQuotaLimit));
  const [draftUsedCount, setDraftUsedCount] = useState<string>(String(currentUsedCount));
  const [draftDefaultQuota, setDraftDefaultQuota] = useState<string>(
    String(platformPolicy.defaultStudentQuota)
  );
  const [isSavingQuickQuota, setIsSavingQuickQuota] = useState(false);

  useEffect(() => {
    setDraftQuotaLimit(String(studentProfile?.quotaLimit ?? platformPolicy.defaultStudentQuota));
    setDraftUsedCount(String(studentProfile?.usedCount ?? 0));
  }, [studentProfile?.quotaLimit, studentProfile?.usedCount, platformPolicy.defaultStudentQuota]);

  useEffect(() => {
    setDraftDefaultQuota(String(platformPolicy.defaultStudentQuota));
  }, [platformPolicy.defaultStudentQuota]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
        setShowQuickQuotaPopover(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleApplyQuickProfileQuota = async (customLimit?: number, customUsed?: number) => {
    if (!isOwnerAccount) return;
    setIsSavingQuickQuota(true);
    try {
      const nextLimit = Math.max(
        0,
        Math.min(10000, Math.round(customLimit !== undefined ? customLimit : Number(draftQuotaLimit) || 0))
      );
      const nextUsed = Math.max(
        0,
        Math.min(100000, Math.round(customUsed !== undefined ? customUsed : Number(draftUsedCount) || 0))
      );

      if (studentProfile) {
        const updated = await adminUpdateStudentProfile(studentProfile, {
          quotaLimit: nextLimit,
          usedCount: nextUsed,
        });
        onStudentProfileUpdated?.(updated);
      }

      setDraftQuotaLimit(String(nextLimit));
      setDraftUsedCount(String(nextUsed));
      showToast?.(`✓ कॉपी मूल्यांकन कोटा अपडेट हो गया: ${nextUsed}/${nextLimit}`);
    } catch (err) {
      console.error('Quick quota update failed:', err);
    } finally {
      setIsSavingQuickQuota(false);
    }
  };

  const handleApplyDefaultStudentQuota = async (customDefault?: number) => {
    if (!isOwnerAccount) return;
    setIsSavingQuickQuota(true);
    try {
      const nextDefault = Math.max(
        0,
        Math.min(10000, Math.round(customDefault !== undefined ? customDefault : Number(draftDefaultQuota) || 0))
      );
      const updatedPolicy: PlatformPolicyConfig = {
        ...platformPolicy,
        defaultStudentQuota: nextDefault,
      };
      await savePlatformPolicy(cloudUser?.uid || 'local_owner', updatedPolicy);
      onPolicyUpdated?.(updatedPolicy);
      setDraftDefaultQuota(String(nextDefault));
      showToast?.(`✓ नए छात्रों का डिफ़ॉल्ट कॉपी कोटा ${nextDefault} सेट किया गया!`);
    } catch (err) {
      console.error('Default quota update failed:', err);
    } finally {
      setIsSavingQuickQuota(false);
    }
  };

  const handleToggleStudentUploadsQuick = async () => {
    if (!isOwnerAccount) return;
    setIsSavingQuickQuota(true);
    try {
      const updatedPolicy: PlatformPolicyConfig = {
        ...platformPolicy,
        allowStudentUploads: !platformPolicy.allowStudentUploads,
      };
      await savePlatformPolicy(cloudUser?.uid || 'local_owner', updatedPolicy);
      onPolicyUpdated?.(updatedPolicy);
      showToast?.(
        updatedPolicy.allowStudentUploads
          ? '✅ छात्रों के लिए कॉपी मूल्यांकन अनुमति चालू की गई!'
          : '🔒 छात्रों के लिए नई कॉपी अपलोड अस्थायी रूप से रोका गया!'
      );
    } catch (err) {
      console.error('Toggle uploads failed:', err);
    } finally {
      setIsSavingQuickQuota(false);
    }
  };

  const brandName = platformPolicy?.instituteName?.trim() || 'UPSC मुख्य परीक्षा मूल्यांकन पोर्टल';

  return (
    <header className="w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-2xs sticky top-0 z-50">
      <div className="w-full max-w-5xl mx-auto px-3.5 py-2.5 sm:px-6 lg:px-8 flex justify-between items-center gap-2">
        {/* Left: Clean Brand Logo + Single-Line Title */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="bg-amber-50 dark:bg-amber-500/15 p-2 rounded-xl border border-amber-200 dark:border-amber-500/30 shadow-2xs flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <span className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden sm:inline-block shrink-0" />
          <h1 className="text-sm sm:text-base font-black text-slate-900 dark:text-white tracking-tight truncate">
            {brandName}
          </h1>
        </div>

        {/* Right: Minimalist Action Bar (History + Quota Pill + Profile Avatar Menu) */}
        <div ref={headerMenuRef} className="relative flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Quick New Evaluation button when viewing a scorecard */}
          {evalResult && (
            <button
              type="button"
              onClick={onOpenSingleEvaluation}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-extrabold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-full border border-amber-400 shadow-2xs transition-all cursor-pointer"
              title="नया मूल्यांकन शुरू करें"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">नया मूल्यांकन</span>
            </button>
          )}

          {/* Compact History / My Evaluated Copies Pill */}
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full border bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 shadow-2xs transition-all cursor-pointer"
            title="मेरी जाँची गई कॉपियाँ और स्कोरकार्ड देखें"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="hidden sm:inline">मेरी कॉपियाँ</span>
            <span className="font-extrabold">({historyCount})</span>
          </button>

          {/* Quota Pill (⚡ 0 / 5) */}
          {cloudUser && (isEffectiveStudentView || isOwnerAccount) && (
            <button
              type="button"
              onClick={() => {
                setShowProfileMenu(false);
                if (isOwnerAccount && !isStudentPreviewMode) {
                  setShowQuickQuotaPopover((prev) => !prev);
                } else {
                  onOpenQuotaUpgrade?.();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 border border-slate-700 dark:border-slate-600 text-white text-xs font-extrabold shadow-2xs transition-all cursor-pointer"
              title={
                isOwnerAccount && !isStudentPreviewMode
                  ? 'ओनर कोटा एवं अधिकार नियंत्रण (क्लिक करें)'
                  : 'कॉपी मूल्यांकन कोटा • टॉप-अप के लिए क्लिक करें'
              }
            >
              <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
              <span className="tracking-tight">
                {currentUsedCount} / {currentQuotaLimit}
              </span>
            </button>
          )}

          {/* Profile Avatar / Menu Button */}
          {cloudUser ? (
            <button
              type="button"
              onClick={() => {
                setShowQuickQuotaPopover(false);
                setShowProfileMenu((prev) => !prev);
              }}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white border-2 border-indigo-400/40 shadow-2xs flex items-center justify-center transition-all cursor-pointer shrink-0"
              title={`${cloudUser.displayName || 'प्रोफाइल'} (${cloudUser.email || ''})`}
            >
              <User className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowEdTechLoginScreen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-2xs transition-all cursor-pointer"
              title="विद्यार्थी या एडमिन के रूप में Google से लॉगिन करें"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>लॉगिन</span>
            </button>
          )}

          {/* Owner Quick Quota & Rights Popover */}
          {isOwnerAccount && showQuickQuotaPopover && cloudUser && (
            <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4 z-50 space-y-3.5 text-left">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30">
                    <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-900 dark:text-white">
                      ओनर कोटा एवं अधिकार नियंत्रण
                    </h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      जितनी चाहें उतनी लिमिट सेट या एडिट करें
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQuickQuotaPopover(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 1. Current Profile Custom Quota Limit & Used Count */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                    वर्तमान अकाउंट कोटा ({cloudUser.displayName || 'प्रोफाइल'})
                  </span>
                  <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400">
                    {currentUsedCount} / {currentQuotaLimit}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      कुल कॉपी लिमिट (Quota Limit)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      value={draftQuotaLimit}
                      onChange={(e) => setDraftQuotaLimit(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-extrabold text-slate-900 dark:text-white"
                      placeholder="उदा: 10, 50, 500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      जाँची गई (Used Count)
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={100000}
                        value={draftUsedCount}
                        onChange={(e) => setDraftUsedCount(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-extrabold text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleApplyQuickProfileQuota(undefined, 0)}
                        disabled={isSavingQuickQuota}
                        className="px-2 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-[10px] font-bold text-slate-700 dark:text-slate-200 shrink-0 cursor-pointer"
                        title="Used Count 0 पर रीसेट करें"
                      >
                        0 करें
                      </button>
                    </div>
                  </div>
                </div>

                {/* Quick Preset Limit Chips */}
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] font-bold text-slate-400 mr-1">तुरंत चुनें:</span>
                  {[2, 5, 10, 25, 50, 100, 500, 10000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleApplyQuickProfileQuota(preset, undefined)}
                      disabled={isSavingQuickQuota}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                        Number(draftQuotaLimit) === preset
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-400'
                      }`}
                    >
                      {preset === 10000 ? '∞ (10000)' : preset}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleApplyQuickProfileQuota()}
                  disabled={isSavingQuickQuota}
                  className="w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>यह कोटा लिमिट लागू करें</span>
                </button>
              </div>

              {/* 2. Default Quota for New Students */}
              <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 space-y-2">
                <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200">
                  नए जुड़ने वाले छात्रों का डिफ़ॉल्ट कोटा (0–10000)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    value={draftDefaultQuota}
                    onChange={(e) => setDraftDefaultQuota(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-xs font-extrabold text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => handleApplyDefaultStudentQuota()}
                    disabled={isSavingQuickQuota}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold cursor-pointer shrink-0"
                  >
                    सेव करें
                  </button>
                </div>
              </div>

              {/* 3. Quick Owner Rights & Controls */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleToggleStudentUploadsQuick}
                    disabled={isSavingQuickQuota}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 border cursor-pointer ${
                      platformPolicy.allowStudentUploads
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                        : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800'
                    }`}
                  >
                    {platformPolicy.allowStudentUploads ? (
                      <>
                        <Unlock className="w-3.5 h-3.5" />
                        <span>छात्र अपलोड: चालू</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5" />
                        <span>छात्र अपलोड: बंद</span>
                      </>
                    )}
                  </button>

                  {onToggleStudentPreviewMode && (
                    <button
                      type="button"
                      onClick={() => {
                        onToggleStudentPreviewMode();
                        setShowQuickQuotaPopover(false);
                      }}
                      className="py-1.5 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 text-[11px] font-bold border border-slate-200 dark:border-slate-700 cursor-pointer"
                    >
                      {isStudentPreviewMode ? '👑 Owner मोड' : '👁️ Student मोड'}
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowQuickQuotaPopover(false);
                    setShowOwnerAdminModal(true);
                  }}
                  className="w-full py-2 rounded-xl bg-slate-900 dark:bg-amber-500 hover:bg-slate-800 text-amber-400 dark:text-slate-950 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>सभी छात्रों का कोटा व अधिकार प्रबंधित करें</span>
                </button>
              </div>
            </div>
          )}

          {/* Profile & Studio Dropdown Menu */}
          {showProfileMenu && cloudUser && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-3 z-50 space-y-2.5 text-left">
              {/* User Identity Header */}
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                      {cloudUser.displayName || cloudUser.email?.split('@')[0] || 'अभ्यर्थी'}
                    </p>
                  </div>
                  {cloudUser.email && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate pl-3.5">
                      {cloudUser.email}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowProfileMenu(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Primary Student / User Actions */}
              <div className="space-y-1">
                {onOpenProgressCard && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowProfileMenu(false);
                      onOpenProgressCard();
                    }}
                    className="w-full px-3 py-2 rounded-xl hover:bg-amber-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span>प्रगति कार्ड (Progress Card)</span>
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onToggleTheme();
                  }}
                  className="w-full px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    {isDarkMode ? (
                      <Sun className="w-4 h-4 text-amber-400" />
                    ) : (
                      <Moon className="w-4 h-4 text-indigo-600" />
                    )}
                    <span>{isDarkMode ? 'लाइट थीम (Light Mode)' : 'डार्क थीम (Dark Mode)'}</span>
                  </span>
                </button>
              </div>

              {/* Owner Studio Controls (Cleanly Tucked Inside Profile Menu) */}
              {isOwnerAccount && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                  <div className="px-2 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      👑 ओनर स्टूडियो कंट्रोल
                    </span>
                    {onToggleStudentPreviewMode && (
                      <button
                        type="button"
                        onClick={() => {
                          onToggleStudentPreviewMode();
                          setShowProfileMenu(false);
                        }}
                        className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 cursor-pointer"
                      >
                        {isStudentPreviewMode ? 'Owner मोड में लौटें' : 'Student View देखें'}
                      </button>
                    )}
                  </div>

                  {/* Single vs Batch Evaluation Mode Switcher */}
                  <div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => {
                        onOpenSingleEvaluation();
                        setShowProfileMenu(false);
                      }}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer ${
                        evaluationMode === 'single'
                          ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>एकल मोड</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEvaluationMode('batch');
                        setShowProfileMenu(false);
                      }}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer ${
                        evaluationMode === 'batch'
                          ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>बंच मोड</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowProfileMenu(false);
                      setShowOwnerAdminModal(true);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 dark:bg-amber-500 text-amber-400 dark:text-slate-950 text-xs font-extrabold flex items-center gap-2 cursor-pointer"
                  >
                    <Shield className="w-4 h-4" />
                    <span>ओनर कंट्रोल एवं एडटेक कमांड सेंटर</span>
                  </button>

                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        setShowModelSettings(true);
                      }}
                      className="px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-[11px] font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex flex-col items-center gap-0.5 cursor-pointer"
                    >
                      <Cpu className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="truncate max-w-full">
                        {selectedModels?.[0]?.replace('gemini-', '') || 'AI मॉडल'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        setShowLearningDatabase(true);
                      }}
                      className="px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-[11px] font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex flex-col items-center gap-0.5 cursor-pointer"
                    >
                      <Brain className="w-3.5 h-3.5 text-purple-500" />
                      <span>AI लर्निंग</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        setShowCloudSyncModal(true);
                      }}
                      className="px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-[11px] font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex flex-col items-center gap-0.5 cursor-pointer"
                    >
                      <Cloud className={`w-3.5 h-3.5 text-emerald-500 ${isCloudSyncing ? 'animate-pulse' : ''}`} />
                      <span>क्लाउड सिंक</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Account Switch & Logout Footer */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileMenu(false);
                    onSwitchGoogleAccount();
                  }}
                  className="flex-1 py-2 px-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>अकाउंट बदलें</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileMenu(false);
                    onCloudSignOut();
                  }}
                  className="py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>लॉगआउट</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
