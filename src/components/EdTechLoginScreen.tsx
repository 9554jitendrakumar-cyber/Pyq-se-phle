import React from 'react';
import {
  BookOpen,
  CheckCircle2,
  GraduationCap,
  FileCheck,
  Sparkles,
  LogIn,
  ExternalLink,
  AlertCircle,
  Layers,
  Award
} from 'lucide-react';
import { PlatformPolicyConfig } from '../firebase';

interface EdTechLoginScreenProps {
  onGoogleLogin: () => Promise<void>;
  onContinueOffline?: () => void;
  isSigningIn: boolean;
  errorMessage: string | null;
  platformPolicy: PlatformPolicyConfig;
}

export const EdTechLoginScreen: React.FC<EdTechLoginScreenProps> = ({
  onGoogleLogin,
  isSigningIn,
  errorMessage,
  platformPolicy
}) => {
  const maxPages = platformPolicy.maxPages10Marker || 4;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white flex flex-col justify-between p-4 sm:p-6 md:p-10 select-none">
      {/* Top Bar */}
      <div className="max-w-6xl w-full mx-auto flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/20 font-black">
            <BookOpen className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black tracking-tight text-white">
                {platformPolicy.instituteName || 'UPSC मुख्य परीक्षा AI मूल्यांकन पोर्टल'}
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-400/30">
                <Sparkles className="w-3 h-3" /> EdTech Portal
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {platformPolicy.instituteTagline || 'GS-1 • GS-2 • GS-3 • GS-4 मानक उत्तर-पुस्तिका जाँच एवं विस्तृत स्कोरकार्ड प्रणाली'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={window.location.href.replace('https://ais-dev-', 'https://ais-pre-')}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-bold text-slate-300 flex items-center gap-1.5 transition-all"
            title="पब्लिक स्टूडेंट पोर्टल लिंक को नए ब्राउज़र टैब में खोलें"
          >
            <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
            <span>नए टैब में खोलें</span>
          </a>
        </div>
      </div>

      {/* Center Hero + Login Card Grid */}
      <div className="max-w-6xl w-full mx-auto my-auto py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left Column: EdTech Aspirant Portal Value Proposition */}
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-xs font-bold">
            <GraduationCap className="w-4 h-4 text-amber-400" />
            <span>UPSC सिविल सेवा मुख्य परीक्षा उत्तर-पुस्तिका मूल्यांकन पोर्टल</span>
          </div>

          <h2 className="text-2xl sm:text-4xl font-black leading-tight text-white">
            अपनी हस्तलिखित उत्तर-पुस्तिका अपलोड करें और पाएं{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-emerald-300">
              UPSC मानक लाल-पेन मूल्यांकन
            </span>
          </h2>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
            {platformPolicy.platformBanner ||
              'प्रत्येक अभ्यर्थी का व्यक्तिगत डैशबोर्ड, मूल्यांकित उत्तर-पुस्तिकाएं, 4-पिलर रूब्रिक स्कोरकार्ड और मॉडल उत्तर क्लाउड पर सुरक्षित रहते हैं।'}
          </p>

          {/* 4 Key EdTech Features */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/30 shrink-0">
                <FileCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">पृष्ठ-दर-पृष्ठ लाल पेन रिमार्क्स</h3>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  आपकी हस्तलिखित कॉपी के मार्जिन में सटीक सुधार बिंदु, डेटा और संवैधानिक अनुच्छेदों के सुझाव।
                </p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-start gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 shrink-0">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">4-पिलर UPSC रूब्रिक स्कोरकार्ड</h3>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  भूमिका, मुख्य भाग, प्रस्तुतीकरण और निष्कर्ष का अलग-अलग अंक विभाजन व मॉडल उत्तर।
                </p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-start gap-3">
              <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">व्यक्तिगत कॉपी इतिहास (My Copies)</h3>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  आपकी सभी जाँची गई कॉपियाँ आपके Gmail अकाउंट से जुड़ी रहती हैं—कभी भी देखें या PDF डाउनलोड करें।
                </p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-start gap-3">
              <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-400/30 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  मानक पृष्ठ सीमा एवं प्रारंभिक कोटा ({platformPolicy.defaultStudentQuota} कॉपियाँ)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  प्रति उत्तर-पुस्तिका अधिकतम {maxPages} पृष्ठ अनुमत • पूर्णांक व विषय की स्वतः पहचान।
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Clean Single-Button Login Gateway Card */}
        <div className="lg:col-span-5">
          <div className="bg-white text-slate-900 rounded-3xl shadow-2xl border border-slate-200 p-6 sm:p-8 flex flex-col gap-5">
            <div className="text-center space-y-1.5">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto shadow-xs">
                <GraduationCap className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-slate-900">पोर्टल में लॉगिन करें</h3>
              <p className="text-xs text-slate-500">
                उत्तर-पुस्तिका अपलोड करने एवं अपना स्कोरकार्ड देखने के लिए Google (Gmail) से लॉगिन करें
              </p>
            </div>

            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">लॉगिन में समस्या:</p>
                  <p>{errorMessage}</p>
                  <p className="text-[11px] text-rose-600">
                    सुझाव: यदि आप प्रीव्यू विंडो में हैं, तो ऊपर दाईं ओर <strong>"नए टैब में खोलें"</strong> पर क्लिक करके लॉगिन करें।
                  </p>
                </div>
              </div>
            )}

            {/* Single Unified Google Login Button */}
            <button
              type="button"
              onClick={onGoogleLogin}
              disabled={isSigningIn}
              className="w-full py-4 px-5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-extrabold text-sm shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-3 transition-all cursor-pointer disabled:opacity-50"
            >
              <LogIn className="w-5 h-5" />
              <span>
                {isSigningIn
                  ? 'Google अकाउंट से जोड़ा जा रहा है...'
                  : 'Google (Gmail) से लॉगिन करें'}
              </span>
            </button>

            {/* Student Instructions Box */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-[11px] text-slate-600">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>उत्तर-पुस्तिका अपलोड निर्देश:</span>
              </div>
              <p className="leading-relaxed">
                • <strong>अधिकतम पृष्ठ सीमा:</strong> प्रति उत्तर-पुस्तिका अधिकतम <strong>{maxPages} पृष्ठ</strong>।
              </p>
              <p className="leading-relaxed">
                • <strong>स्वतः पहचान:</strong> प्रश्न का विषय (GS-1/2/3/4) और पूर्णांक (10/15 अंक) कॉपी से स्वतः पहचाने जाते हैं।
              </p>
              <p className="leading-relaxed">
                • मूल्यांकन के बाद आप अपनी लाल-पेन से जाँची गई कॉपी और स्कोरकार्ड <strong>PDF</strong> में डाउनलोड कर सकते हैं।
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="max-w-6xl w-full mx-auto pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>© {platformPolicy.instituteName || 'UPSC मुख्य परीक्षा AI मूल्यांकन पोर्टल'} • क्लाउड सिंक एवं डेटा सुरक्षा सक्रिय</span>
        <span>डेटा प्रतिधारण नीति: {platformPolicy.retentionDays} दिन</span>
      </div>
    </div>
  );
};
