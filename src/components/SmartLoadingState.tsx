import React, { useState, useEffect } from 'react';
import { Layers, Check, BookOpen, Clock } from 'lucide-react';

interface SmartLoadingStateProps {
  instituteName?: string;
}

export function SmartLoadingState({ instituteName }: SmartLoadingStateProps) {
  const [step, setStep] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);

  const steps = [
    {
      label: 'हस्तलिखित उत्तर-पुस्तिका के पृष्ठ पढ़े जा रहे हैं...',
      detail: 'प्रश्न की पहचान एवं हस्तलिखित पंक्तियों का विश्लेषण',
    },
    {
      label: '4-स्तंभीय UPSC रूब्रिक लागू किया जा रहा है...',
      detail: 'भूमिका, मुख्य भाग, साक्ष्य और निष्कर्ष के संतुलन की जाँच',
    },
    {
      label: 'पृष्ठ-दर-पृष्ठ लाल पेन मार्जिन टिप्पणियाँ अंकित हो रही हैं...',
      detail: 'सुधारात्मक सुझाव, डेटा और संवैधानिक संदर्भ जोड़े जा रहे हैं',
    },
    {
      label: 'अंतिम स्कोरकार्ड एवं आदर्श मॉडल उत्तर तैयार हो रहा है...',
      detail: 'बस कुछ सेकंड और — आपकी चेक्ड कॉपी तैयार हो रही है',
    },
  ];

  useEffect(() => {
    const stepTimer = setInterval(() => {
      setStep((s) => (s < steps.length - 1 ? s + 1 : s));
    }, 6500);
    const secTimer = setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => {
      clearInterval(stepTimer);
      clearInterval(secTimer);
    };
  }, [steps.length]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xs p-8 sm:p-10 flex flex-col items-center justify-center min-h-[420px] text-center">
      {instituteName && (
        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 mb-5">
          <BookOpen className="w-3.5 h-3.5 text-amber-500" />
          <span>{instituteName} · मुख्य परीक्षा मूल्यांकन कक्ष</span>
        </div>
      )}

      <div className="relative flex items-center justify-center mb-6">
        <div className="w-20 h-20 border-4 border-slate-100 rounded-full dark:border-slate-800"></div>
        <div className="w-20 h-20 border-4 border-transparent border-t-amber-500 border-r-amber-500 rounded-full animate-spin absolute"></div>
        <div className="absolute flex items-center justify-center bg-amber-50 dark:bg-amber-950/50 rounded-full w-12 h-12 border border-amber-200/70 dark:border-amber-800/60">
          <Layers className="w-6 h-6 text-amber-600 dark:text-amber-400 animate-pulse" />
        </div>
      </div>

      <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mb-1.5">
        {steps[step].label}
      </h3>
      <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md">
        {steps[step].detail}
      </p>

      <div className="w-full max-w-md bg-slate-100 dark:bg-slate-800 rounded-full h-2 mb-6 overflow-hidden">
        <div
          className="bg-amber-500 h-2 rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${((step + 1) / steps.length) * 100}%` }}
        ></div>
      </div>

      <div className="grid grid-cols-4 gap-3 w-full max-w-md mb-6">
        {steps.map((_s, i) => (
          <div
            key={i}
            className={`flex flex-col items-center gap-1.5 transition-opacity duration-500 ${
              i <= step ? 'opacity-100' : 'opacity-40'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold transition-colors duration-500 ${
                i < step
                  ? 'bg-emerald-600 text-white'
                  : i === step
                    ? 'bg-amber-500 text-slate-950 animate-pulse'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {i < step ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
              चरण {i + 1}
            </span>
          </div>
        ))}
      </div>

      <div className="inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 font-medium">
        <Clock className="w-3.5 h-3.5" />
        <span>मूल्यांकन समय: {elapsedSec} सेकंड · कृपया पृष्ठ को बंद या रिफ्रेश न करें</span>
      </div>
    </div>
  );
}
