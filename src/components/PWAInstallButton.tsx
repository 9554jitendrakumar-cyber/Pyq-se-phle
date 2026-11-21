import React, { useState } from 'react';
import { Download, Smartphone, ExternalLink, CheckCircle2, X, Share2, WifiOff } from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'login';
  instituteName?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header',
  instituteName = 'UPSC मुख्य परीक्षा मूल्यांकन पोर्टल',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Hide automatically when already running as an installed standalone PWA
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setShowGuideModal(true);
      }
      return;
    }
    setShowGuideModal(true);
  };

  const buttonClasses =
    variant === 'login'
      ? 'px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-xs font-extrabold text-emerald-200 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs'
      : 'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-extrabold rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800 shadow-2xs transition-all cursor-pointer';

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className={buttonClasses}
        title="मोबाइल या डेस्कटॉप पर ऐप के रूप में इंस्टॉल करें (Install Mobile App)"
      >
        <Smartphone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span className="hidden sm:inline">ऐप इंस्टॉल करें</span>
        <span className="sm:hidden">App</span>
      </button>

      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden text-left">
            <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">मोबाइल / डेस्कटॉप ऐप इंस्टॉल करें</h3>
                  <p className="text-[11px] text-slate-300 truncate max-w-[230px]">{instituteName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-slate-800 dark:text-slate-200">
              {isInstallable && (
                <button
                  type="button"
                  onClick={async () => {
                    await install();
                    setShowGuideModal(false);
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>1-Click में अभी ऐप इंस्टॉल करें (Install Now)</span>
                </button>
              )}

              {/* Step 1: Android Chrome Full-Screen PWA */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Android मोबाइल (100% Full-Screen बिना URL बार के):</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pl-5">
                  1. ऊपर दाईं ओर <strong>⋮ (तीन डॉट्स)</strong> मेन्यू पर टैप करें।<br />
                  2. <strong>"Install app" (ऐप इंस्टॉल करें)</strong> या <strong>"Add to Home screen"</strong> चुनें।<br />
                  3. यदि आपने पहले पुराना शॉर्टकट बनाया था (जिसमें ऊपर <code>.run.app</code> दिखता है), तो उसे होम-स्क्रीन से हटाकर (Remove) दोबारा इंस्टॉल करें — अब यह <strong>Full-Screen Native App</strong> की तरह खुलेगा!
                </p>
              </div>

              {/* Step 2: iOS Safari */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-1.5">
                <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Share2 className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>iPhone / iPad (Safari ब्राउज़र){isIOS ? ' — अनुशंसित' : ''}:</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pl-5">
                  1. Safari में नीचे <strong>Share (शेयर आइकन)</strong> पर टैप करें।<br />
                  2. नीचे स्क्रॉल करें और <strong>"Add to Home Screen"</strong> पर टैप करें।
                </p>
              </div>

              {/* Full Tab helper if inside preview iframe */}
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-center justify-between gap-3">
                <p className="text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
                  सीधे इंस्टॉल पॉपअप के लिए पोर्टल को नए ब्राउज़र टैब में खोलें:
                </p>
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold flex items-center gap-1 shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>नए टैब में खोलें</span>
                </a>
              </div>

              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                बंद करें
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-xl border border-amber-400">
      <WifiOff className="w-4 h-4 animate-pulse shrink-0" />
      <span>ऑफ़लाइन मोड — पूर्व-सहेजी गई कॉपियाँ और स्कोरकार्ड उपलब्ध हैं।</span>
    </div>
  );
};
