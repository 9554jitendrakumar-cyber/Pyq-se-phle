import React, { useState, useMemo } from 'react';
import {
  Award,
  BarChart3,
  TrendingUp,
  FileText,
  Download,
  Share2,
  CheckCircle2,
  Target,
  Sparkles,
  X,
  Zap,
  BookOpen,
  Layers,
  Copy,
  Check,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import type { HistoryEntry } from '../types/evaluation';
import type { PlatformPolicyConfig, StudentProfileData } from '../firebase';

interface StudentProgressCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: HistoryEntry[];
  studentProfile: StudentProfileData | null;
  platformPolicy: PlatformPolicyConfig;
  onLoadHistoryEntry?: (entry: HistoryEntry) => void;
  onOpenQuotaUpgrade?: () => void;
  showToast?: (msg: string) => void;
}

export const StudentProgressCardModal: React.FC<StudentProgressCardModalProps> = ({
  isOpen,
  onClose,
  history,
  studentProfile,
  platformPolicy,
  onLoadHistoryEntry,
  onOpenQuotaUpgrade,
  showToast,
}) => {
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);

  const stats = useMemo(() => {
    const totalCopies = history.length;
    const totalPages = history.reduce(
      (sum, item) => sum + (item.uploadedPages?.length || item.evalResult?.pages?.length || 0),
      0
    );

    const chronological = [...history].reverse(); // oldest -> newest
    const itemsWithPct = chronological.map((item) => {
      const max = Math.max(1, Number(item.max_marks) || 10);
      const obt = Math.max(0, Number(item.obtained) || 0);
      const pct = Math.min(100, Math.round((obt / max) * 100));
      return { item, max, obt, pct };
    });

    const avgPercent =
      itemsWithPct.length > 0
        ? Math.round(itemsWithPct.reduce((a, b) => a + b.pct, 0) / itemsWithPct.length)
        : 0;

    let bestRecord: { item: HistoryEntry; pct: number } | null = null;
    for (const rec of itemsWithPct) {
      if (!bestRecord || rec.pct > bestRecord.pct) {
        bestRecord = { item: rec.item, pct: rec.pct };
      }
    }

    const latestPercent = itemsWithPct.length > 0 ? itemsWithPct[itemsWithPct.length - 1].pct : 0;
    const firstPercent = itemsWithPct.length > 0 ? itemsWithPct[0].pct : 0;
    const trendDiff = latestPercent - avgPercent;
    const overallGrowth = latestPercent - firstPercent;

    // Subject-wise aggregation
    const subjectBuckets: Record<string, { label: string; count: number; totalPct: number }> = {
      'GS-1': { label: 'GS-1: इतिहास, भूगोल व समाज', count: 0, totalPct: 0 },
      'GS-2': { label: 'GS-2: राजव्यवस्था व शासन', count: 0, totalPct: 0 },
      'GS-3': { label: 'GS-3: अर्थव्यवस्था व सुरक्षा', count: 0, totalPct: 0 },
      'GS-4': { label: 'GS-4: नीतिशास्त्र (Ethics)', count: 0, totalPct: 0 },
      Other: { label: 'अन्य / सामान्य अध्ययन', count: 0, totalPct: 0 },
    };

    for (const rec of itemsWithPct) {
      const rawSub = (rec.item.subject || '').toUpperCase();
      const key = rawSub.includes('GS-1')
        ? 'GS-1'
        : rawSub.includes('GS-2')
          ? 'GS-2'
          : rawSub.includes('GS-3')
            ? 'GS-3'
            : rawSub.includes('GS-4')
              ? 'GS-4'
              : 'Other';
      subjectBuckets[key].count += 1;
      subjectBuckets[key].totalPct += rec.pct;
    }

    const subjectStats = Object.entries(subjectBuckets)
      .filter(([key, val]) => val.count > 0 || key !== 'Other')
      .map(([key, val]) => ({
        key,
        label: val.label,
        count: val.count,
        avgPct: val.count > 0 ? Math.round(val.totalPct / val.count) : 0,
      }));

    const activeSubjects = subjectStats.filter((s) => s.count > 0);
    const strongestSubject =
      activeSubjects.length > 0
        ? [...activeSubjects].sort((a, b) => b.avgPct - a.avgPct)[0]
        : null;
    const weakestSubject =
      activeSubjects.length > 1
        ? [...activeSubjects].sort((a, b) => a.avgPct - b.avgPct)[0]
        : null;

    // 4-Pillar Rubric Aggregation
    let introTotal = 0,
      introMax = 0;
    let bodyTotal = 0,
      bodyMax = 0;
    let structTotal = 0,
      structMax = 0;
    let conclTotal = 0,
      conclMax = 0;

    for (const rec of itemsWithPct) {
      const rb = rec.item.evalResult?.rubric_breakdown;
      if (rb) {
        if (rb.introduction_understanding) {
          introTotal += Number(rb.introduction_understanding.awarded) || 0;
          introMax += Number(rb.introduction_understanding.max) || 2;
        }
        if (rb.body_content_depth) {
          bodyTotal += Number(rb.body_content_depth.awarded) || 0;
          bodyMax += Number(rb.body_content_depth.max) || 5;
        }
        if (rb.structure_presentation) {
          structTotal += Number(rb.structure_presentation.awarded) || 0;
          structMax += Number(rb.structure_presentation.max) || 1.5;
        }
        if (rb.conclusion_way_forward) {
          conclTotal += Number(rb.conclusion_way_forward.awarded) || 0;
          conclMax += Number(rb.conclusion_way_forward.max) || 1.5;
        }
      }
    }

    const rubricPillars = [
      {
        id: 'intro',
        label: '1. भूमिका एवं प्रश्न की समझ (Introduction)',
        pct: introMax > 0 ? Math.min(100, Math.round((introTotal / introMax) * 100)) : avgPercent,
      },
      {
        id: 'body',
        label: '2. मुख्य भाग एवं विषय-वस्तु (Body Depth)',
        pct: bodyMax > 0 ? Math.min(100, Math.round((bodyTotal / bodyMax) * 100)) : avgPercent,
      },
      {
        id: 'struct',
        label: '3. संरचना, डायग्राम एवं प्रस्तुतीकरण (Presentation)',
        pct: structMax > 0 ? Math.min(100, Math.round((structTotal / structMax) * 100)) : avgPercent,
      },
      {
        id: 'concl',
        label: '4. निष्कर्ष एवं आगे की राह (Way Forward)',
        pct: conclMax > 0 ? Math.min(100, Math.round((conclTotal / conclMax) * 100)) : avgPercent,
      },
    ];

    const recent10 = itemsWithPct.slice(-10);

    return {
      totalCopies,
      totalPages,
      avgPercent,
      bestRecord,
      latestPercent,
      trendDiff,
      overallGrowth,
      subjectStats,
      strongestSubject,
      weakestSubject,
      rubricPillars,
      recent10,
    };
  }, [history]);

  if (!isOpen) return null;

  const candidateName =
    studentProfile?.displayName ||
    history[0]?.studentName ||
    'UPSC मुख्य परीक्षा अभ्यर्थी';
  const candidateEmail = studentProfile?.email || '';
  const instituteName = platformPolicy.instituteName || 'UPSC मुख्य परीक्षा मूल्यांकन पोर्टल';
  const instituteTagline =
    platformPolicy.instituteTagline || 'आधिकारिक 4-स्तंभीय उत्तर-पुस्तिका जाँच एवं स्कोरकार्ड प्रणाली';

  const gradeBadge =
    stats.avgPercent >= 50
      ? {
          label: '🏆 उत्कृष्ट (Topper Track • 50%+)',
          color: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
        }
      : stats.avgPercent >= 38
        ? {
            label: '📈 संतुलित (Mains Competitive • 38%+)',
            color: 'bg-amber-500/20 text-amber-300 border-amber-400/40',
          }
        : {
            label: '🎯 सुधारोन्मुख (नियमित उत्तर-लेखन आवश्यक)',
            color: 'bg-rose-500/20 text-rose-300 border-rose-400/40',
          };

  const shareText = [
    `📊 *अभ्यर्थी प्रगति रिपोर्ट कार्ड (Student Progress Card)*`,
    `🏛️ *${instituteName}*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📝 *कुल जाँची गई कॉपियाँ:* ${stats.totalCopies} (${stats.totalPages} पृष्ठ)`,
    `🎯 *औसत प्राप्तांक:* ${stats.avgPercent}% (~${((stats.avgPercent / 100) * 10).toFixed(1)}/10 अंक)`,
    stats.bestRecord
      ? `🏆 *सर्वोच्च स्कोर:* ${stats.bestRecord.item.obtained}/${stats.bestRecord.item.max_marks} (${stats.bestRecord.pct}%)`
      : '',
    stats.strongestSubject
      ? `💪 *मजबूत विषय:* ${stats.strongestSubject.key} (औसत ${stats.strongestSubject.avgPct}%)`
      : '',
    ``,
    `📌 *4-स्तंभीय रूब्रिक दक्षता:*`,
    ...stats.rubricPillars.map((p) => `• ${p.label}: *${p.pct}%*`),
    `━━━━━━━━━━━━━━━━━━━━`,
    `✨ _${instituteTagline}_`,
  ]
    .filter(Boolean)
    .join('\n');

  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  const handleCopyProgressText = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedReport(true);
      showToast?.('✓ प्रगति कार्ड रिपोर्ट कॉपी हो गई! अब कहीं भी शेयर करें।');
      setTimeout(() => setCopiedReport(false), 2500);
    } catch {
      // ignore
    }
  };

  const handleDownloadProgressCardPDF = async () => {
    setIsExportingPdf(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1240;
      canvas.height = 1754; // A4 Portrait at 150 DPI
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Background
      ctx.fillStyle = '#fcfbfa';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Outer Executive Border
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 6;
      ctx.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);

      // Header Banner
      const grad = ctx.createLinearGradient(40, 40, canvas.width - 40, 260);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = grad;
      ctx.fillRect(40, 40, canvas.width - 80, 210);

      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 34px "Noto Sans Devanagari", sans-serif';
      ctx.fillText(instituteName, 80, 108);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '20px "Noto Sans Devanagari", sans-serif';
      ctx.fillText(instituteTagline, 80, 148);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px "Noto Sans Devanagari", sans-serif';
      ctx.fillText(`अभ्यर्थी प्रगति रिपोर्ट कार्ड (STUDENT PROGRESS CARD)`, 80, 205);

      // Report Info Strip
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(60, 280, canvas.width - 120, 110);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.strokeRect(60, 280, canvas.width - 120, 110);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 24px "Noto Sans Devanagari", sans-serif';
      ctx.fillText(`📋 मुख्य परीक्षा उत्तर-लेखन समग्र प्रगति विश्लेषण`, 90, 328);

      ctx.fillStyle = '#475569';
      ctx.font = '20px "Noto Sans Devanagari", sans-serif';
      ctx.fillText(
        `मूल्यांकन मानक: 4-स्तंभीय UPSC रूब्रिक   |   दिनांक: ${new Date().toLocaleDateString('hi-IN')}`,
        90,
        366
      );

      // 4 KPI Boxes
      const kpis = [
        { title: 'कुल जाँची कॉपियाँ', value: `${stats.totalCopies} (${stats.totalPages} पृष्ठ)`, color: '#4f46e5' },
        { title: 'औसत प्राप्तांक', value: `${stats.avgPercent}%`, color: '#059669' },
        {
          title: 'सर्वोच्च स्कोर',
          value: stats.bestRecord
            ? `${stats.bestRecord.item.obtained}/${stats.bestRecord.item.max_marks} (${stats.bestRecord.pct}%)`
            : '—',
          color: '#d97706',
        },
        {
          title: 'नवीनतम स्कोर',
          value: `${stats.latestPercent}% (${stats.trendDiff >= 0 ? `+${stats.trendDiff}%` : `${stats.trendDiff}%`})`,
          color: '#0284c7',
        },
      ];

      const boxW = (canvas.width - 160) / 4;
      kpis.forEach((k, idx) => {
        const bx = 60 + idx * (boxW + 13);
        const by = 420;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(bx, by, boxW, 140);
        ctx.strokeStyle = k.color;
        ctx.lineWidth = 3;
        ctx.strokeRect(bx, by, boxW, 140);

        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 18px "Noto Sans Devanagari", sans-serif';
        ctx.fillText(k.title, bx + 20, by + 45);

        ctx.fillStyle = k.color;
        ctx.font = 'bold 32px "Noto Sans Devanagari", sans-serif';
        ctx.fillText(k.value, bx + 20, by + 102);
      });

      // Section: 4-Pillar Rubric Mastery
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 26px "Noto Sans Devanagari", sans-serif';
      ctx.fillText('1. 4-स्तंभीय UPSC रूब्रिक दक्षता (4-Pillar Rubric Mastery)', 60, 620);

      stats.rubricPillars.forEach((p, idx) => {
        const py = 650 + idx * 82;
        ctx.fillStyle = '#334155';
        ctx.font = 'bold 20px "Noto Sans Devanagari", sans-serif';
        ctx.fillText(`${p.label}`, 70, py + 24);
        ctx.fillText(`${p.pct}%`, canvas.width - 130, py + 24);

        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(70, py + 38, canvas.width - 140, 22);

        ctx.fillStyle = p.pct >= 50 ? '#10b981' : p.pct >= 38 ? '#f59e0b' : '#f43f5e';
        ctx.fillRect(70, py + 38, Math.max(20, ((canvas.width - 140) * p.pct) / 100), 22);
      });

      // Section: Subject-Wise Performance
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 26px "Noto Sans Devanagari", sans-serif';
      ctx.fillText('2. विषयवार प्रदर्शन विश्लेषण (GS Paper Performance)', 60, 1030);

      stats.subjectStats.slice(0, 5).forEach((s, idx) => {
        const sy = 1065 + idx * 78;
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 20px "Noto Sans Devanagari", sans-serif';
        ctx.fillText(`${s.label} (${s.count} कॉपियाँ)`, 70, sy + 24);
        ctx.fillText(`${s.avgPct}%`, canvas.width - 130, sy + 24);

        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(70, sy + 36, canvas.width - 140, 20);

        ctx.fillStyle = '#6366f1';
        ctx.fillRect(70, sy + 36, Math.max(12, ((canvas.width - 140) * s.avgPct) / 100), 20);
      });

      // Footer
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(40, canvas.height - 120, canvas.width - 80, 80);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 20px "Noto Sans Devanagari", sans-serif';
      ctx.fillText(
        `© ${instituteName} • आधिकारिक AI एवं मेंटॉर मूल्यांकन प्रगति कार्ड`,
        80,
        canvas.height - 72
      );

      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      pdf.save(`UPSC_Progress_Card_Report.pdf`);
      showToast?.('📥 आपका आधिकारिक प्रगति कार्ड (PDF) सफलतापूर्वक डाउनलोड हो गया!');
    } catch (err) {
      console.error('Progress Card PDF export failed:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden text-left">
        {/* Top Executive Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center shrink-0">
              <BarChart3 className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white">
                  अभ्यर्थी प्रगति एवं प्रदर्शन कार्ड (Student Progress Card)
                </h2>
                <span className={`text-[10px] px-2.5 py-0.5 rounded-full border font-extrabold ${gradeBadge.color}`}>
                  {gradeBadge.label}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                🏛️ {instituteName} • 4-स्तंभीय उत्तर-लेखन प्रदर्शन विश्लेषण
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Scrollable Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5 bg-slate-50/50 dark:bg-slate-900">
          {stats.totalCopies === 0 ? (
            <div className="py-16 text-center bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
                <BookOpen className="w-7 h-7" />
              </div>
              <h3 className="text-base font-black text-slate-800 dark:text-white">
                आपका प्रगति कार्ड पहली कॉपी जाँचे जाने के बाद स्वतः तैयार हो जाएगा
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                अपनी पहली हस्तलिखित उत्तर-पुस्तिका अपलोड करें। जैसे-जैसे आप उत्तर लिखेंगे, यहाँ विषयवार (GS 1-4) ग्राफ और 4-पिलर रूब्रिक विश्लेषण जुड़ता जाएगा।
              </p>
            </div>
          ) : (
            <>
              {/* 4 Key KPI Metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                    <span>कुल जाँची कॉपियाँ</span>
                    <FileText className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-slate-900 dark:text-white">
                      {stats.totalCopies}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      ({stats.totalPages} पृष्ठ)
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                    <span>औसत प्राप्तांक (Avg)</span>
                    <Target className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                      {stats.avgPercent}%
                    </span>
                    <span className="text-[11px] font-bold text-slate-500">
                      (~{((stats.avgPercent / 100) * 10).toFixed(1)}/10)
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                    <span>सर्वोच्च स्कोर (Best)</span>
                    <Award className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="mt-2">
                    {stats.bestRecord ? (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
                          {stats.bestRecord.item.obtained}/{stats.bestRecord.item.max_marks}
                        </span>
                        <span className="text-xs font-bold text-slate-500">
                          ({stats.bestRecord.pct}%)
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400">—</span>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                    <span>नवीनतम गति (Trend)</span>
                    <TrendingUp className="w-4 h-4 text-sky-500" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-sky-600 dark:text-sky-400">
                      {stats.latestPercent}%
                    </span>
                    <span
                      className={`text-[11px] font-extrabold px-1.5 py-0.5 rounded ${
                        stats.trendDiff >= 0
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                      }`}
                    >
                      {stats.trendDiff >= 0 ? `+${stats.trendDiff}%` : `${stats.trendDiff}%`}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2-Column Grid: 4-Pillar Rubric Mastery + Subject-Wise Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left: 4-Pillar UPSC Rubric Mastery */}
                <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs space-y-3.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Layers className="w-4 h-4 text-amber-500" />
                      <span>4-स्तंभीय उत्तर-लेखन दक्षता (Rubric Mastery)</span>
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                      UPSC मानक
                    </span>
                  </div>

                  <div className="space-y-3">
                    {stats.rubricPillars.map((pillar) => (
                      <div key={pillar.id} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-slate-700 dark:text-slate-200">{pillar.label}</span>
                          <span
                            className={`font-black ${
                              pillar.pct >= 50
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : pillar.pct >= 38
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {pillar.pct}%
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              pillar.pct >= 50
                                ? 'bg-emerald-500'
                                : pillar.pct >= 38
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                            }`}
                            style={{ width: `${Math.max(6, pillar.pct)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: Subject-Wise GS Paper Performance */}
                <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs space-y-3.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-500" />
                      <span>विषयवार प्रदर्शन (GS Paper Breakdown)</span>
                    </h3>
                    {stats.strongestSubject && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        मजबूत पक्ष: {stats.strongestSubject.key} ({stats.strongestSubject.avgPct}%)
                      </span>
                    )}
                  </div>

                  <div className="space-y-3">
                    {stats.subjectStats.map((sub) => (
                      <div key={sub.key} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-slate-700 dark:text-slate-200 truncate">
                            {sub.label}{' '}
                            <span className="text-[11px] font-normal text-slate-400">
                              ({sub.count} कॉपियाँ)
                            </span>
                          </span>
                          <span className="font-black text-indigo-600 dark:text-indigo-400">
                            {sub.count > 0 ? `${sub.avgPct}%` : '—'}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full transition-all"
                            style={{ width: `${sub.count > 0 ? Math.max(6, sub.avgPct) : 0}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Chronological Score Progression Bar Chart (Last 10 Evaluated Copies) */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                      📈 क्रमिक उत्तर-लेखन प्रगति ग्राफ (Copy-by-Copy Score Progression)
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      किसी भी बार (Bar) पर क्लिक करके उस कॉपी की लाल-पेन समीक्षा और स्कोरकार्ड खोलें
                    </p>
                  </div>
                  <span className="text-[11px] font-bold text-slate-500">
                    नवीनतम {stats.recent10.length} कॉपियाँ
                  </span>
                </div>

                <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 pt-3 items-end h-36 px-2 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800 p-3">
                  {stats.recent10.map((rec, idx) => {
                    const barHeight = Math.max(16, Math.round((rec.pct / 100) * 90));
                    return (
                      <button
                        key={rec.item.id || idx}
                        type="button"
                        onClick={() => {
                          if (onLoadHistoryEntry) {
                            onLoadHistoryEntry(rec.item);
                            onClose();
                          }
                        }}
                        className="flex flex-col items-center justify-end h-full group cursor-pointer"
                        title={`${rec.item.subject || 'GS'}: ${rec.obt}/${rec.max} (${rec.pct}%) — खोलने के लिए क्लिक करें`}
                      >
                        <span className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300 mb-1 group-hover:text-indigo-600">
                          {rec.obt}/{rec.max}
                        </span>
                        <div
                          className={`w-full max-w-[28px] rounded-t-lg transition-all group-hover:scale-105 ${
                            rec.pct >= 50
                              ? 'bg-emerald-500'
                              : rec.pct >= 38
                                ? 'bg-amber-500'
                                : 'bg-indigo-500'
                          }`}
                          style={{ height: `${barHeight}px` }}
                        />
                        <span className="text-[9px] font-bold text-slate-400 mt-1 truncate max-w-full">
                          #{idx + 1}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions: Download PDF Progress Card + Share on WhatsApp */}
        <div className="px-5 py-3.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadProgressCardPDF}
              disabled={isExportingPdf || stats.totalCopies === 0}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExportingPdf ? 'PDF तैयार हो रहा है...' : 'प्रगति कार्ड (PDF) डाउनलोड करें'}</span>
            </button>

            <a
              href={whatsappShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs ${
                stats.totalCopies === 0 ? 'pointer-events-none opacity-50' : ''
              }`}
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>WhatsApp पर शेयर करें</span>
            </a>

            <button
              type="button"
              onClick={handleCopyProgressText}
              disabled={stats.totalCopies === 0}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {copiedReport ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>रिपोर्ट कॉपी हुई</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>टेक्स्ट कॉपी करें</span>
                </>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
          >
            बंद करें
          </button>
        </div>
      </div>
    </div>
  );
};
