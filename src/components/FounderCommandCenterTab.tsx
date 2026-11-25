import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Calculator,
  Database,
  Download,
  Upload,
  RefreshCw,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  FileText,
  Copy,
  Share2,
  RotateCcw,
  BookOpen,
  Server,
  TrendingUp,
  HelpCircle,
  Check,
  Zap,
  Lock,
  Users,
  ExternalLink,
} from 'lucide-react';
import localforage from 'localforage';
import {
  StudentProfileData,
  PlatformPolicyConfig,
  QuotaUpgradeRequestData,
  SUPER_ADMIN_EMAILS,
  getFirebaseSystemInfo,
  getFirestoreFirewallStats,
  resetFirestoreWriteFirewall,
  savePlatformPolicy,
  adminUpdateStudentProfile,
} from '../firebase';
import { MASTER_8_BLOCK_PROMPT } from '../defaultPrompt';
import type { HistoryEntry } from '../types/evaluation';

interface FounderCommandCenterTabProps {
  mode: 'economics' | 'ops';
  ownerUid: string;
  students: StudentProfileData[];
  quotaRequests: QuotaUpgradeRequestData[];
  platformPolicy: PlatformPolicyConfig;
  onPolicyUpdated: (newPolicy: PlatformPolicyConfig) => void;
  onRefreshData: () => void;
  showToast: (msg: string) => void;
}

export const FounderCommandCenterTab: React.FC<FounderCommandCenterTabProps> = ({
  mode,
  ownerUid,
  students,
  quotaRequests,
  platformPolicy,
  onPolicyUpdated,
  onRefreshData,
  showToast,
}) => {
  // --- UNIT ECONOMICS & PRICING SIMULATOR STATE ---
  const [simAvgPages, setSimAvgPages] = useState<number>(3);
  const [simThinkingMode, setSimThinkingMode] = useState<'low' | 'auto' | 'medium' | 'high'>('auto');
  const [simPackCopies, setSimPackCopies] = useState<number>(25);
  const [simPackPriceInr, setSimPackPriceInr] = useState<number>(199);
  const [simMonthlyPaidStudents, setSimMonthlyPaidStudents] = useState<number>(100);
  const [copiedTemplateIdx, setCopiedTemplateIdx] = useState<number | null>(null);

  // --- SYSTEM OPS & DIAGNOSTICS STATE ---
  const [firewallStats, setFirewallStats] = useState(() => getFirestoreFirewallStats());
  const [localCopiesCount, setLocalCopiesCount] = useState<number>(0);
  const [pingLoading, setPingLoading] = useState<Record<string, boolean>>({});
  const [pingResults, setPingResults] = useState<
    Record<string, { ok: boolean; latencyMs: number; message: string }>
  >({});
  const [isResettingFirewall, setIsResettingFirewall] = useState<boolean>(false);
  const [isResettingPrompt, setIsResettingPrompt] = useState<boolean>(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState<boolean>(false);
  const [activeGuideSection, setActiveGuideSection] = useState<string>('architecture');
  const [copiedSysKey, setCopiedSysKey] = useState<string | null>(null);
  const [showCollectionsMatrix, setShowCollectionsMatrix] = useState<boolean>(false);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);
  const firebaseSystemInfo = getFirebaseSystemInfo();

  const handleCopySysValue = (key: string, value: string, label: string) => {
    try {
      navigator.clipboard.writeText(value);
      setCopiedSysKey(key);
      showToast(`✓ ${label} कॉपी हो गया!`);
      setTimeout(() => setCopiedSysKey(null), 2000);
    } catch {
      showToast('कॉपी करने में समस्या आई।');
    }
  };

  const refreshSystemMetrics = async () => {
    setFirewallStats(getFirestoreFirewallStats());
    try {
      const localList = (await localforage.getItem<HistoryEntry[]>('upsc_mains_history')) || [];
      setLocalCopiesCount(Array.isArray(localList) ? localList.length : 0);
    } catch {
      setLocalCopiesCount(0);
    }
  };

  useEffect(() => {
    refreshSystemMetrics();
  }, [mode, students.length, quotaRequests.length]);

  // --- REAL REVENUE & USAGE CALCULATIONS ---
  const approvedRequests = quotaRequests.filter(
    (r) => r.status === 'approved' || r.status === 'auto_approved'
  );
  const pendingRequests = quotaRequests.filter((r) => r.status === 'pending');

  const totalApprovedRevenueInr = approvedRequests.reduce(
    (sum, r) => sum + (Number(r.amountInr) || 0),
    0
  );
  const totalPendingRevenueInr = pendingRequests.reduce(
    (sum, r) => sum + (Number(r.amountInr) || 0),
    0
  );
  const totalPaidCopiesSold = approvedRequests.reduce(
    (sum, r) => sum + (Number(r.copiesRequested) || 0),
    0
  );
  const totalEvaluationsUsed = students.reduce((acc, s) => acc + (s.usedCount || 0), 0);
  const nonOwnerStudents = students.filter((s) => s.role !== 'owner');
  const paidStudentsCount = new Set(approvedRequests.map((r) => r.ownerId)).size;

  // --- SIMULATOR MATH (REALISTIC GEMINI FLASH TOKEN ECONOMICS) ---
  const inputTokensPerCopy = 2100 + simAvgPages * 265;
  const thinkingTokensPerCopy =
    simThinkingMode === 'low'
      ? 400
      : simThinkingMode === 'medium'
        ? 1250
        : simThinkingMode === 'high'
          ? 2800
          : 1500;
  const outputTokensPerCopy = 1650 + simAvgPages * 180;
  const totalTokensPerCopy = inputTokensPerCopy + thinkingTokensPerCopy + outputTokensPerCopy;

  // Blended Flash cost in INR (~₹0.042 per 1,000 tokens including input + output + thinking at ₹86/USD)
  const aiCostPerCopyInr = Number(((totalTokensPerCopy / 1000) * 0.042).toFixed(2));
  const aiCostPerPackInr = Number((aiCostPerCopyInr * simPackCopies).toFixed(2));
  const netProfitPerPackInr = Math.max(0, Number((simPackPriceInr - aiCostPerPackInr).toFixed(2)));
  const profitMarginPct =
    simPackPriceInr > 0 ? Math.max(0, Math.round((netProfitPerPackInr / simPackPriceInr) * 100)) : 0;

  const monthlyGrossRevenueInr = simMonthlyPaidStudents * simPackPriceInr;
  const monthlyAiCostInr = Math.round(simMonthlyPaidStudents * aiCostPerPackInr);
  const monthlyNetProfitInr = monthlyGrossRevenueInr - monthlyAiCostInr;

  // Firestore daily capacity math (each evaluated copy uses ~3 writes thanks to our Write Firewall)
  const writesPerCopy = 3;
  const maxFreeCopiesPerDay = Math.floor(firewallStats.dailyFreeWriteQuota / writesPerCopy);

  const estimatedHistoricalAiCostInr = Number((totalEvaluationsUsed * aiCostPerCopyInr).toFixed(2));

  // Public portal URL
  const publicPortalUrl =
    typeof window !== 'undefined'
      ? window.location.origin.replace('https://ais-dev-', 'https://ais-pre-')
      : 'https://ais-pre-e6kge55l7f2bssaukqplpe-151979150920.asia-southeast1.run.app';

  const instituteName =
    platformPolicy.instituteName?.trim() || 'UPSC मुख्य परीक्षा मूल्यांकन पोर्टल';
  const freeQuota = platformPolicy.defaultStudentQuota ?? 2;
  const upiId = platformPolicy.ownerUpiId?.trim() || '9554jitendrakumar@upi';

  // --- EXPORT PAYMENT LEDGER TO CSV ---
  const handleExportPaymentsCSV = () => {
    if (quotaRequests.length === 0) {
      showToast('एक्सपोर्ट करने के लिए कोई पेमेंट / UTR रिकॉर्ड नहीं है।');
      return;
    }
    const escapeCsv = (val: string | number) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const headers = [
      'क्रमांक (S.No.)',
      'अभ्यर्थी का नाम (Student Name)',
      'ईमेल (Email)',
      '12-अंकीय UTR नंबर',
      'माँगी गई कॉपियाँ (Copies)',
      'राशि (Amount INR)',
      'स्थिति (Status)',
      'तिथि व समय (Date & Time)',
    ];
    const rows = quotaRequests.map((r, i) =>
      [
        i + 1,
        r.studentName,
        r.studentEmail,
        r.utrNumber,
        r.copiesRequested,
        r.amountInr,
        r.status,
        new Date(r.createdAt).toLocaleString('hi-IN'),
      ]
        .map(escapeCsv)
        .join(',')
    );
    const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `UPSC_Portal_UTR_Revenue_Ledger_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast(`📥 ${quotaRequests.length} ट्रांजेक्शन का पेमेंट लेजर (CSV/Excel) डाउनलोड हो गया!`);
  };

  // --- 1-CLICK LIVE AI PING TEST ---
  const handlePingModel = async (modelId: string) => {
    setPingLoading((prev) => ({ ...prev, [modelId]: true }));
    try {
      const resp = await fetch('/api/models/test-ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setPingResults((prev) => ({
          ...prev,
          [modelId]: {
            ok: true,
            latencyMs: data.latencyMs || 0,
            message: `सक्रिय (${data.latencyMs} ms)`,
          },
        }));
        showToast(`✓ ${modelId} पूरी तरह सक्रिय है (${data.latencyMs} ms)!`);
      } else {
        setPingResults((prev) => ({
          ...prev,
          [modelId]: {
            ok: false,
            latencyMs: 0,
            message: data.error || 'कनेक्शन विफल',
          },
        }));
      }
    } catch (err: any) {
      setPingResults((prev) => ({
        ...prev,
        [modelId]: {
          ok: false,
          latencyMs: 0,
          message: err?.message || 'नेटवर्क त्रुटि',
        },
      }));
    } finally {
      setPingLoading((prev) => ({ ...prev, [modelId]: false }));
    }
  };

  // --- 1-CLICK RESET FIRESTORE WRITE FIREWALL ---
  const handleResetFirewall = async () => {
    setIsResettingFirewall(true);
    try {
      await resetFirestoreWriteFirewall();
      setFirewallStats(getFirestoreFirewallStats());
      onRefreshData();
      showToast('✓ क्लाउड राइट फ़ायरवॉल रीसेट हो गया और Firestore नेटवर्क पुनः सक्रिय कर दिया गया!');
    } catch {
      showToast('फ़ायरवॉल रीसेट करने में आंशिक समस्या आई, कृपया पेज रिफ्रेश करें।');
    } finally {
      setIsResettingFirewall(false);
    }
  };

  // --- 1-CLICK FACTORY RESET SLOT 2 TOPPER BENCHMARK PROMPT ---
  const handleFactoryResetSlot2Prompt = async () => {
    setIsResettingPrompt(true);
    try {
      const cleanSlot2State = [
        { id: 1, name: 'Slot 1 (खाली स्लॉट 1)', content: '' },
        { id: 2, name: 'Slot 2 (टॉपर बेंचमार्क)', content: MASTER_8_BLOCK_PROMPT },
        { id: 3, name: 'Slot 3 (खाली स्लॉट 3)', content: '' },
        { id: 4, name: 'Slot 4 (खाली स्लॉट 4)', content: '' },
        { id: 5, name: 'Slot 5 (खाली स्लॉट 5)', content: '' },
      ];
      localStorage.setItem('upsc_prompt_slots', JSON.stringify(cleanSlot2State));
      localStorage.setItem('upsc_active_slot_id', '2');
      await fetch('/api/system-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: MASTER_8_BLOCK_PROMPT,
          slotId: 2,
          slotName: 'Slot 2 (टॉपर बेंचमार्क)',
        }),
      });
      showToast('✓ Slot 2 (टॉपर बेंचमार्क) मास्टर प्रॉम्प्ट मूल 7-स्टेज रूप में रीसेट हो गया!');
    } catch {
      showToast('प्रॉम्प्ट रीसेट में त्रुटि आई।');
    } finally {
      setIsResettingPrompt(false);
    }
  };

  // --- 1-CLICK FULL SYSTEM JSON BACKUP ---
  const handleDownloadFullSystemBackup = async () => {
    try {
      const savedSlotsRaw = localStorage.getItem('upsc_prompt_slots');
      const promptSlots = savedSlotsRaw ? JSON.parse(savedSlotsRaw) : [];
      const backupPayload = {
        backupVersion: '2.0',
        exportedAt: new Date().toISOString(),
        instituteName: platformPolicy.instituteName,
        platformPolicy,
        studentsCount: students.length,
        students,
        quotaRequestsCount: quotaRequests.length,
        quotaRequests,
        promptSlots,
      };
      const blob = new Blob([JSON.stringify(backupPayload, null, 2)], {
        type: 'application/json;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.setAttribute('download', `UPSC_Portal_Master_Backup_${dateStr}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      showToast(
        `📦 मास्टर सिस्टम बैकअप (${students.length} छात्र + ${quotaRequests.length} पेमेंट + सेटिंग्स) डाउनलोड हो गया!`
      );
    } catch (err) {
      console.error('Backup export failed:', err);
      showToast('बैकअप फाइल बनाने में त्रुटि आई।');
    }
  };

  // --- 1-CLICK RESTORE FROM JSON BACKUP ---
  const handleImportSystemBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsRestoringBackup(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('अमान्य बैकअप फाइल');
      }

      // 1. Restore Platform Policy if present
      if (parsed.platformPolicy && typeof parsed.platformPolicy === 'object') {
        await savePlatformPolicy(ownerUid, parsed.platformPolicy);
        onPolicyUpdated(parsed.platformPolicy);
      }

      // 2. Restore Prompt Slots if present
      if (Array.isArray(parsed.promptSlots) && parsed.promptSlots.length > 0) {
        localStorage.setItem('upsc_prompt_slots', JSON.stringify(parsed.promptSlots));
      }

      // 3. Restore Student Profiles if present
      let restoredStudents = 0;
      if (Array.isArray(parsed.students)) {
        for (const st of parsed.students) {
          if (st && st.ownerId && st.email) {
            await adminUpdateStudentProfile(st, {
              displayName: st.displayName,
              role: st.role,
              status: st.status,
              quotaLimit: st.quotaLimit,
              usedCount: st.usedCount,
            });
            restoredStudents++;
          }
        }
      }

      onRefreshData();
      showToast(
        `✅ बैकअप सफलतापूर्वक रीस्टोर हो गया (${restoredStudents} छात्र प्रोफाइल व प्लेटफॉर्म नियम अपडेट किए गए)!`
      );
    } catch (err) {
      console.error('Backup restore failed:', err);
      showToast('⚠️ बैकअप फाइल पढ़ने में त्रुटि आई। कृपया वैध .json बैकअप फाइल चुनें।');
    } finally {
      setIsRestoringBackup(false);
      if (backupFileInputRef.current) {
        backupFileInputRef.current.value = '';
      }
    }
  };

  // --- PROMOTIONAL TEMPLATES FOR WHATSAPP / TELEGRAM ---
  const marketingTemplates = [
    {
      title: '1. फ्री ट्रायल आमंत्रण संदेश (WhatsApp / Telegram ग्रुप के लिए)',
      badge: 'New Student Acquisition',
      text: `🎯 *${instituteName} — UPSC मुख्य परीक्षा उत्तर-पुस्तिका मूल्यांकन पोर्टल*\n\nअपनी हस्तलिखित (Handwritten) उत्तर-पुस्तिका अपलोड करें और कुछ ही सेकंड में पाएं:\n✅ कॉपी के हर पन्ने पर लाल-पेन से सटीक मार्जिन टिप्पणियाँ\n✅ 4-स्तंभीय अंक विभाजन (भूमिका + 70:30 मुख्य भाग + प्रस्तुतीकरण/फ्लोचार्ट + निष्कर्ष)\n✅ आदर्श शुरुआत, आदर्श निष्कर्ष और रेडीमेड रिवीजन कीवर्ड्स के साथ चेक्ड PDF कॉपी\n\n🎁 *प्रारंभिक कोटा:* नए अभ्यर्थियों के लिए पहली *${freeQuota} कॉपियाँ निःशुल्क* उपलब्ध हैं!\n\n🔗 *अभी अपनी कॉपी जाँचें:* ${publicPortalUrl}`,
    },
    {
      title: '2. कोटा अपग्रेड एवं मेन्स टेस्ट पैक संदेश (पेड बैच के लिए)',
      badge: 'Quota Pack Conversion',
      text: `📢 *${instituteName} — मुख्य परीक्षा उत्तर-लेखन कोटा पैक*\n\nनियमित उत्तर-लेखन अभ्यास के लिए अपना कॉपी कोटा तुरंत रिचार्ज करें:\n💳 *UPI ID:* ${upiId}\n⚡ *तुरंत एक्टिवेशन:* पोर्टल के अंदर QR स्कैन करके 12-अंकीय UTR नंबर डालते ही आपका कोटा अपने-आप जुड़ जाएगा!\n\n🔗 *पोर्टल लिंक:* ${publicPortalUrl}`,
    },
    {
      title: '3. मोबाइल होम-स्क्रीन ऐप इंस्टॉलेशन निर्देश (छात्रों की सुविधा के लिए)',
      badge: 'Student Onboarding Guide',
      text: `📱 *${instituteName} को अपने फोन में ऐप की तरह सेव करें:*\n\n1. अपने फोन के Chrome या Safari ब्राउज़र में यह लिंक खोलें:\n${publicPortalUrl}\n2. ऊपर दाएँ कोने में 3 बिंदुओं (⋮) पर क्लिक करके *"Add to Home screen"* या *"Install App"* चुनें।\n3. अब आप एक क्लिक में अपनी उत्तर-पुस्तिका की फोटो खींचकर या PDF बनाकर सीधे मूल्यांकन कर सकते हैं!`,
    },
  ];

  if (mode === 'economics') {
    return (
      <div className="space-y-5 font-sans">
        {/* 1. Real Revenue & Platform Financial Ledger Strip */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 pb-3">
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span>लाइव प्लेटफॉर्म रेवेन्यू, AI खर्च एवं शुद्ध बचत लेजर (Real Financial Overview)</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                आपके पोर्टल पर अब तक हुए वास्तविक UPI ट्रांजेक्शन और जाँची गई कॉपियों का वित्तीय सारांश
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportPaymentsCSV}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>पेमेंट लेजर CSV डाउनलोड</span>
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70">
              <div className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
                कुल प्राप्त राजस्व (Approved Revenue)
              </div>
              <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 font-mono tabular-nums mt-1">
                ₹{totalApprovedRevenueInr.toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 font-mono tabular-nums">
                {approvedRequests.length} सफल पैक · +{totalPaidCopiesSold} कॉपियाँ बिकीं
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70">
              <div className="text-xs font-bold text-amber-900 dark:text-amber-300">
                लंबित सत्यापन राशि (Pending UTR)
              </div>
              <div className="text-2xl font-black text-amber-700 dark:text-amber-400 font-mono tabular-nums mt-1">
                ₹{totalPendingRevenueInr.toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 font-mono tabular-nums">
                {pendingRequests.length} रिक्वेस्ट अप्रूवल की प्रतीक्षा में
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/70">
              <div className="text-xs font-bold text-indigo-900 dark:text-indigo-300">
                कुल जाँची कॉपियाँ व अनुमानित AI खर्च
              </div>
              <div className="text-2xl font-black text-indigo-700 dark:text-indigo-400 font-mono tabular-nums mt-1">
                {totalEvaluationsUsed} कॉपियाँ
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 font-mono tabular-nums">
                अनुमानित कुल AI लागत: ~₹{estimatedHistoricalAiCostInr}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                पंजीकृत छात्र बनाम पेड छात्र
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums mt-1">
                {paidStudentsCount} / {nonOwnerStudents.length}
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                कन्वर्ज़न दर:{' '}
                <span className="font-mono font-bold tabular-nums">
                  {nonOwnerStudents.length > 0
                    ? Math.round((paidStudentsCount / nonOwnerStudents.length) * 100)
                    : 0}
                  %
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Interactive AI Cost & Profit Margin Simulator */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5 space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-700 pb-3">
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Calculator className="w-4 h-4 text-amber-500" />
              <span>इंटरैक्टिव प्राइसिंग, टोकन लागत एवं मासिक मुनाफा कैलकुलेटर (Unit Economics Simulator)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              बिना किसी कोडिंग के यहाँ अपने पैक की कीमत और कॉपियों की संख्या बदलकर देखें कि प्रति कॉपी आपका कितना AI खर्च आता है और आपको कितना शुद्ध लाभ (Net Margin) बचता है।
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Left Controls */}
            <div className="lg:col-span-7 space-y-3.5 bg-slate-50 dark:bg-slate-900/70 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    औसत पृष्ठ प्रति कॉपी (10M=3, 15M=4)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={simAvgPages}
                    onChange={(e) => setSimAvgPages(Math.max(1, Math.min(10, Number(e.target.value) || 3)))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    AI थिंकिंग स्तर (Thinking Mode)
                  </label>
                  <select
                    value={simThinkingMode}
                    onChange={(e) =>
                      setSimThinkingMode(e.target.value as 'low' | 'auto' | 'medium' | 'high')
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <option value="low">Low (सबसे कम टोकन / तेज़)</option>
                    <option value="auto">Auto (संतुलित डिफ़ॉल्ट)</option>
                    <option value="medium">Medium (गहन विश्लेषण)</option>
                    <option value="high">High (अधिकतम टॉपर ऑडिट)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    पैक में कॉपियों की संख्या (Copies in Pack)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={simPackCopies}
                    onChange={(e) =>
                      setSimPackCopies(Math.max(1, Math.min(1000, Number(e.target.value) || 10)))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white"
                  />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {[
                      { c: 10, p: 99 },
                      { c: 25, p: 199 },
                      { c: 60, p: 399 },
                      { c: 150, p: 799 },
                    ].map((preset) => (
                      <button
                        key={preset.c}
                        type="button"
                        onClick={() => {
                          setSimPackCopies(preset.c);
                          setSimPackPriceInr(preset.p);
                        }}
                        className="px-2 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:border-amber-500 cursor-pointer whitespace-nowrap"
                      >
                        {preset.c} कॉपी @ ₹{preset.p}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    पैक का विक्रय मूल्य (Pack Price in ₹)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={50000}
                    value={simPackPriceInr}
                    onChange={(e) =>
                      setSimPackPriceInr(Math.max(1, Math.min(50000, Number(e.target.value) || 99)))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span>लक्षित मासिक पेड छात्र (Target Paid Students / Month):</span>
                  <span className="font-mono text-sm font-black text-indigo-600 dark:text-amber-400 tabular-nums">
                    {simMonthlyPaidStudents} छात्र / माह
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={1000}
                  step={10}
                  value={simMonthlyPaidStudents}
                  onChange={(e) => setSimMonthlyPaidStudents(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono tabular-nums mt-1">
                  <span>10 छात्र</span>
                  <span>100 छात्र</span>
                  <span>250 छात्र</span>
                  <span>500 छात्र</span>
                  <span>1,000 छात्र</span>
                </div>
              </div>
            </div>

            {/* Right Results Breakdown */}
            <div className="lg:col-span-5 bg-slate-900 text-white rounded-xl p-4 flex flex-col justify-between space-y-3 border border-slate-800">
              <div className="space-y-2.5">
                <div className="text-xs font-bold text-amber-400 border-b border-slate-800 pb-2">
                  📊 प्रति कॉपी व प्रति पैक शुद्ध गणित (Unit Economics)
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300">अनुमानित टोकन प्रति कॉपी:</span>
                  <span className="font-mono font-bold text-white tabular-nums">
                    ~{totalTokensPerCopy.toLocaleString('en-IN')} tokens
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300">AI लागत प्रति कॉपी (Gemini Flash):</span>
                  <span className="font-mono font-bold text-amber-300 tabular-nums">
                    ~₹{aiCostPerCopyInr} / कॉपी
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300">
                    {simPackCopies} कॉपियों के पूरे पैक पर AI खर्च:
                  </span>
                  <span className="font-mono font-bold text-rose-300 tabular-nums">
                    - ₹{aiCostPerPackInr}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-800">
                  <span className="text-emerald-300 font-bold">प्रति पैक शुद्ध बचत (Net Profit):</span>
                  <span className="font-mono text-sm font-black text-emerald-400 tabular-nums">
                    ₹{netProfitPerPackInr} ({profitMarginPct}% मार्जिन)
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-800/90 border border-slate-700 space-y-1.5">
                <div className="text-[11px] font-bold text-slate-300">
                  🚀 {simMonthlyPaidStudents} पेड छात्रों पर मासिक प्रोजेक्शन:
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">कुल मासिक शुल्क संग्रह:</span>
                  <span className="font-mono font-bold text-white tabular-nums">
                    ₹{monthlyGrossRevenueInr.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">कुल मासिक AI टोकन खर्च:</span>
                  <span className="font-mono font-bold text-rose-300 tabular-nums">
                    - ₹{monthlyAiCostInr.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-black pt-1 border-t border-slate-700">
                  <span className="text-amber-400">शुद्ध मासिक आय (Net Income):</span>
                  <span className="font-mono text-emerald-400 tabular-nums">
                    ₹{monthlyNetProfitInr.toLocaleString('en-IN')} / माह
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-slate-300 bg-indigo-950/60 border border-indigo-800/70 rounded-lg p-2.5 leading-relaxed">
                💡 <strong>निःशुल्क क्लाउड क्षमता:</strong> हमारी राइट-फ़ायरवॉल के कारण 1 कॉपी जाँचने में केवल ~3 क्लाउड राइट्स लगते हैं। यानी 20,000 दैनिक मुफ्त राइट्स में आप <strong>प्रतिदिन ~{maxFreeCopiesPerDay.toLocaleString('en-IN')} कॉपियाँ</strong> बिना किसी डेटाबेस खर्च के जाँच सकते हैं!
              </div>
            </div>
          </div>
        </div>

        {/* 3. 1-Click WhatsApp & Telegram Broadcast Generator */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5 space-y-3.5">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Share2 className="w-4 h-4 text-emerald-600" />
              <span>रेडीमेड WhatsApp एवं Telegram प्रचार संदेश जनरेटर (1-Click Viral Marketing)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              इन संदेशों में आपके संस्थान का नाम (<strong>{instituteName}</strong>), पब्लिक लिंक और UPI पैक स्वतः जुड़े हुए हैं—सीधे कॉपी करके अपने टेलीग्राम/व्हाट्सएप ग्रुप में भेजें।
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {marketingTemplates.map((tpl, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                      {tpl.title}
                    </span>
                  </div>
                  <pre className="text-[11px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 max-h-44 overflow-y-auto leading-relaxed">
                    {tpl.text}
                  </pre>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(tpl.text);
                      setCopiedTemplateIdx(idx);
                      showToast('✓ प्रचार संदेश क्लिपबोर्ड पर कॉपी हो गया!');
                      setTimeout(() => setCopiedTemplateIdx(null), 2000);
                    }}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {copiedTemplateIdx === idx ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>कॉपी हो गया</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-amber-400" />
                        <span>संदेश कॉपी करें</span>
                      </>
                    )}
                  </button>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(tpl.text)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <span>WhatsApp ↗</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MODE === 'ops': NO-CODE SYSTEM DOCTOR, BACKUP/RESTORE & FOUNDER HANDBOOK
  // ============================================================================
  return (
    <div className="space-y-5 font-sans">
      {/* 1. Live System Health & 1-Click Self-Healing Doctor */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 pb-3">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600" />
              <span>1-Click सिस्टम डॉक्टर एवं सेल्फ-हीलिंग कंसोल (Zero-Code Diagnostics & Auto-Fix)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              बिना कोडिंग छुए यहाँ से अपने AI इंजन, क्लाउड फ़ायरवॉल और मास्टर प्रॉम्प्ट की जाँच व मरम्मत एक क्लिक में करें
            </p>
          </div>
          <button
            type="button"
            onClick={refreshSystemMetrics}
            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>स्टेटस रिफ्रेश करें</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: AI Cascade Live Ping Test */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Server className="w-4 h-4 text-indigo-600" />
                  <span>1. AI मॉडल कैस्केड स्वास्थ्य</span>
                </span>
                <span className="text-[11px] font-mono font-bold text-emerald-600">2-Model Lock</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                प्राथमिक मॉडल (<strong>gemini-4-hydrogen</strong>) और बैकअप मॉडल (<strong>gemini-3.8-flash</strong>) की लाइव स्पीड जाँचें:
              </p>

              <div className="space-y-1.5 pt-1">
                {['gemini-4-hydrogen', 'gemini-3.8-flash'].map((mId) => {
                  const res = pingResults[mId];
                  const loading = pingLoading[mId];
                  return (
                    <div
                      key={mId}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                    >
                      <div>
                        <div className="font-mono font-bold text-slate-900 dark:text-white">
                          {mId}
                        </div>
                        {res && (
                          <div
                            className={`text-[10px] font-bold ${
                              res.ok ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            {res.message}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handlePingModel(mId)}
                        className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        {loading ? 'जाँच...' : 'Ping टेस्ट'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Card 2: Firestore Write Firewall & Quota Monitor */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  <span>2. क्लाउड राइट फ़ायरवॉल (20k Guard)</span>
                </span>
                <span
                  className={`text-[11px] font-bold ${
                    firewallStats.circuitBreakerActive ? 'text-amber-600' : 'text-emerald-600'
                  }`}
                >
                  {firewallStats.circuitBreakerActive ? '⏸ कूलडाउन मोड' : '✔ सामान्य (सक्रिय)'}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                यह सुरक्षा कवच अनंत लूप और डुप्लीकेट राइट्स को रोकता है ताकि आपका 20,000 दैनिक कोटा कभी खत्म न हो:
              </p>

              <div className="space-y-1 text-xs bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 font-mono tabular-nums">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">इस सेशन में राइट्स:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {firewallStats.sessionWritesUsed} / {firewallStats.maxSessionWrites}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">पिछले 1 मिनट में राइट्स:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {firewallStats.writesLastMinute} / {firewallStats.maxWritesPerMinute}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">रोके गए डुप्लीकेट सिग्नेचर:</span>
                  <span className="font-bold text-emerald-600">
                    {firewallStats.cachedSignaturesCount} सेव्ड
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={isResettingFirewall}
              onClick={handleResetFirewall}
              className="w-full px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>1-Click फ़ायरवॉल रीसेट व क्लाउड री-कनेक्ट</span>
            </button>
          </div>

          {/* Card 3: Master Prompt & Local Cache Self-Heal */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <span>3. प्रॉम्प्ट व लोकल स्टोरेज रिपेयर</span>
                </span>
                <span className="text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300">
                  {localCopiesCount} लोकल कॉपी
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                यदि कभी प्रॉम्प्ट में बदलाव के बाद मूल्यांकन अजीब लगे, तो 1-Click में प्रमाणित <strong>Slot 2 (7-Stage टॉपर बेंचमार्क)</strong> बहाल करें:
              </p>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                disabled={isResettingPrompt}
                onClick={handleFactoryResetSlot2Prompt}
                className="w-full px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Slot 2 टॉपर प्रॉम्प्ट रीसेट करें (Factory Default)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  try {
                    sessionStorage.clear();
                    showToast('✓ अस्थायी सेशन कैश साफ कर दिया गया!');
                    refreshSystemMetrics();
                  } catch {
                    // ignore
                  }
                }}
                className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer"
              >
                अस्थायी सेशन कैश (Session Cache) साफ करें
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Complete 1-Click Disaster Recovery Backup & Restore (.JSON) */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-600" />
            <span>मास्टर डेटाबेस बैकअप एवं रीस्टोर (1-Click Full Platform Backup & Restore)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            अपने सभी पंजीकृत छात्रों ({students.length}), पेमेंट रिकॉर्ड्स ({quotaRequests.length}), संस्थान ब्रांडिंग और प्रॉम्प्ट स्लॉट्स की मास्टर कॉपी (`.json`) अपने फोन/लैपटॉप में सुरक्षित रखें।
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleDownloadFullSystemBackup}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>पूरा बैकअप डाउनलोड (.json)</span>
          </button>

          <input
            ref={backupFileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportSystemBackup}
            className="hidden"
          />
          <button
            type="button"
            disabled={isRestoringBackup}
            onClick={() => backupFileInputRef.current?.click()}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-700 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <Upload className="w-4 h-4" />
            <span>{isRestoringBackup ? 'रीस्टोर हो रहा है...' : 'बैकअप फाइल से रीस्टोर करें'}</span>
          </button>
        </div>
      </div>

      {/* 2B. Co-Owner Security Governance & Firebase Infrastructure Registry */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-600" />
              <span>को-ओनर सुरक्षा अधिकार एवं Firebase सिस्टम जानकारी (Owner Governance Center)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              दोनों अधिकृत ओनर्स के समान अधिकार, क्लाउड डेटाबेस पहचान और जरूरी संचालन नियम एक स्थान पर
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold">
            ✓ 2 Co-Owners • 100% समान अधिकार
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: Authorized Co-Owners & Active Session */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Users className="w-4 h-4 text-amber-500" />
                <span>अधिकृत सुपर-एडमिन / को-ओनर ईमेल (firestore.rules लॉक्ड)</span>
              </span>
            </div>

            <div className="space-y-2">
              {firebaseSystemInfo.superAdminEmails.map((email) => {
                const isCurrentSession =
                  firebaseSystemInfo.currentUserEmail?.toLowerCase().trim() === email.toLowerCase();
                return (
                  <div
                    key={email}
                    className={`p-2.5 rounded-lg border flex flex-wrap items-center justify-between gap-2 ${
                      isCurrentSession
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white break-all">
                        {email}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Role: Owner (10,000 Quota) • Verified Google Auth Required
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isCurrentSession ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-extrabold">
                          ● आपका सक्रिय सत्र
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 text-[10px] font-bold">
                          👑 को-ओनर
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-2.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 text-[11px] text-amber-950 dark:text-amber-200 leading-relaxed">
              <strong>लाइव सिंक नियम:</strong> दोनों ओनर एक ही लाइव Firestore डेटाबेस से जुड़े हैं। किसी एक ओनर द्वारा छात्र कोटा बदलना, पेमेंट अप्रूव करना या ब्रांडिंग/नियम अपडेट करना तुरंत दूसरे ओनर व सभी छात्रों के लिए लागू हो जाता है।
            </div>
          </div>

          {/* Right: Firebase Cloud & Payment Config Snapshot */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Server className="w-4 h-4 text-indigo-500" />
                <span>Firebase क्लाउड एवं इंजन कॉन्फ़िगरेशन</span>
              </span>
              <a
                href={firebaseSystemInfo.firebaseConsoleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                <span>Firebase Console</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2 bg-white dark:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="text-slate-500">Project ID:</span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <code className="font-mono font-bold text-slate-900 dark:text-white text-[11px] truncate">
                    {firebaseSystemInfo.projectId}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopySysValue('projectId', firebaseSystemInfo.projectId, 'Project ID')}
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 cursor-pointer"
                    title="Project ID कॉपी करें"
                  >
                    {copiedSysKey === 'projectId' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 bg-white dark:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 shrink-0">Firestore DB:</span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <code className="font-mono font-bold text-slate-900 dark:text-white text-[11px] truncate" title={firebaseSystemInfo.firestoreDatabaseId}>
                    {firebaseSystemInfo.firestoreDatabaseId}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopySysValue('dbId', firebaseSystemInfo.firestoreDatabaseId, 'Firestore Database ID')}
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 cursor-pointer shrink-0"
                    title="Database ID कॉपी करें"
                  >
                    {copiedSysKey === 'dbId' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 bg-white dark:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="text-slate-500">AI मॉडल कैस्केड:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white text-[11px]">
                  gemini-4-hydrogen → gemini-3.8-flash
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 bg-white dark:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="text-slate-500">सक्रिय UPI व अप्रूवल:</span>
                <span className="font-bold text-slate-900 dark:text-white text-[11px] truncate">
                  {platformPolicy.ownerUpiId || '9554jitendrakumar@upi'} •{' '}
                  {platformPolicy.paymentApprovalMode === 'manual' ? 'Manual 1-Click' : 'Auto UTR'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Collapsible Firestore Collections & Security Access Matrix */}
        <div className="border-t border-slate-100 dark:border-slate-700 pt-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
              डेटाबेस कलेक्शन एवं सुरक्षा अधिकार मैट्रिक्स ({firebaseSystemInfo.collections.length} कलेक्शन)
            </div>
            <button
              type="button"
              onClick={() => setShowCollectionsMatrix((prev) => !prev)}
              className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              {showCollectionsMatrix ? 'मैट्रिक्स छिपाएँ ▲' : 'पूरी सुरक्षा मैट्रिक्स देखें ▼'}
            </button>
          </div>

          {showCollectionsMatrix && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300">
                  <tr>
                    <th className="px-3 py-2 font-extrabold">Firestore Path</th>
                    <th className="px-3 py-2 font-extrabold">क्या सेव होता है</th>
                    <th className="px-3 py-2 font-extrabold">दोनों को-ओनर अधिकार</th>
                    <th className="px-3 py-2 font-extrabold">छात्र अधिकार</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                  {firebaseSystemInfo.collections.map((col) => (
                    <tr key={col.path}>
                      <td className="px-3 py-2 font-mono text-[11px] font-bold text-indigo-700 dark:text-indigo-300 whitespace-nowrap">
                        {col.path}
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{col.purpose}</td>
                      <td className="px-3 py-2 font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                        {col.ownerAccess}
                      </td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {col.studentAccess}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Essential Owner Operations Checklist */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-[11px]">
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
              <strong className="text-slate-900 dark:text-white block mb-0.5">1. शेयर लिंक नियम:</strong>
              छात्रों को हमेशा <code>ais-pre-...</code> लिंक भेजें, कभी भी <code>ais-dev-...</code> डेवलपमेंट लिंक न भेजें।
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
              <strong className="text-slate-900 dark:text-white block mb-0.5">2. साप्ताहिक बैकअप:</strong>
              हर सप्ताह ऊपर दिए बटन से <code>.json</code> मास्टर बैकअप डाउनलोड करके Google Drive में रखें।
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
              <strong className="text-slate-900 dark:text-white block mb-0.5">3. फ्री टियर सीमा:</strong>
              20,000 राइट्स/दिन (~3,000+ कॉपियाँ/दिन) फ्री हैं; इससे अधिक ट्रैफ़िक पर Firebase Console से Blaze Plan ऑन करें।
            </div>
          </div>
        </div>
      </div>

      {/* 3. Non-Coder Founder's Master Handbook & Scaling Playbook */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-500" />
              <span>नॉन-कोडर फाउंडर हैंडबुक एवं इंजीनियर-मुक्त संचालन गाइड (Founder Master Playbook)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              आपका सिस्टम कैसे काम करता है, किसी भी समस्या को 1 मिनट में कैसे सुलझाएं, और भविष्य में कब क्या कदम उठाएं
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
            {[
              { id: 'architecture', label: '1. सिस्टम कैसे काम करता है?' },
              { id: 'troubleshooting', label: '2. समस्या एवं तुरंत समाधान' },
              { id: 'roadmap', label: '3. भविष्य व स्केलिंग रोडमैप' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveGuideSection(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  activeGuideSection === tab.id
                    ? 'bg-slate-900 text-amber-400 dark:bg-amber-500 dark:text-slate-950'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeGuideSection === 'architecture' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs leading-relaxed">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1.5">
              <div className="font-extrabold text-slate-900 dark:text-white text-sm">
                1. स्मार्ट 2-मॉडल AI कैस्केड (Zero Downtime)
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                आपका ऐप सबसे पहले <strong>gemini-4-hydrogen</strong> पर कॉपी भेजता है। यदि कभी सर्वर पर लोड हो, तो यह अपने-आप 1 सेकंड में <strong>gemini-3.8-flash</strong> पर स्विच हो जाता है। इसलिए किसी भी छात्र का मूल्यांकन कभी फेल नहीं होता।
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1.5">
              <div className="font-extrabold text-slate-900 dark:text-white text-sm">
                2. हाइब्रिड ड्यूल-स्टोरेज (Cloud + Local IndexedDB)
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                क्लाउड स्टोरेज और राइट कोटा बचाने के लिए छात्र की HD कॉपी इमेज उसके फोन/ब्राउज़र के <strong>IndexedDB</strong> में सेव होती है, जबकि अंक, 4-पिलर रिपोर्ट, लाल-पेन टिप्पणियाँ और कोटा <strong>Firebase Cloud</strong> पर सेव होते हैं।
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1.5">
              <div className="font-extrabold text-slate-900 dark:text-white text-sm">
                3. 7-स्टेज JSON-अलाइन्ड प्रॉम्प्ट इंजन (Slot 2)
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                <strong>Slot 2 (टॉपर बेंचमार्क)</strong> के साथ विषय-विशिष्ट नियम (GS-1/2/3/4 या Essay) अपने-आप जुड़कर जाते हैं। इसके बाद सर्वर का <code>reconcileMarksV2</code> इंजन अंकों का गणित (10 या 15 अंक) और टैग्स की सफाई 100% सटीक करता है।
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1.5">
              <div className="font-extrabold text-slate-900 dark:text-white text-sm">
                4. ओनर मास्टर अधिकार (Co-Owner Super Admin Rights)
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                दोनों ओनर ईमेल (<strong>{SUPER_ADMIN_EMAILS.join(' और ')}</strong>) सिस्टम के सुरक्षा नियमों (<code>firestore.rules</code>) में सुपर-एडमिन के रूप में लॉक हैं। केवल ये दोनों ही कोटा बदल सकते हैं, पेमेंट अप्रूव कर सकते हैं, सभी कॉपियाँ देख सकते हैं और ब्रांडिंग नियम बदल सकते हैं।
              </p>
            </div>
          </div>
        )}

        {activeGuideSection === 'troubleshooting' && (
          <div className="space-y-3 text-xs leading-relaxed">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1">
              <div className="font-extrabold text-slate-900 dark:text-white">
                ❓ समस्या 1: छात्र के फोन पर "Could not open app" या लॉगिन एरर दिखे तो क्या करें?
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                <strong>समाधान:</strong> कभी भी <code>ais-dev-...</code> वाला लिंक छात्रों को न भेजें। हमेशा इस ओनर पैनल के <strong>"संस्थान ब्रांडिंग व नियम"</strong> टैब में दिया गया <strong><code>ais-pre-...</code> (Public Link)</strong> ही कॉपी करके भेजें और उसी को फोन की होम-स्क्रीन पर सेव करवाएं।
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1">
              <div className="font-extrabold text-slate-900 dark:text-white">
                ❓ समस्या 2: "Daily Write Quota Exceeded" या क्लाउड सिंक रुकने पर क्या करें?
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                <strong>समाधान:</strong> अब सिस्टम में <strong>Write Firewall</strong> लगा है जो प्रति कॉपी केवल 3 राइट्स खर्च करता है। फिर भी यदि कभी अस्थायी रुकावट आए, तो ऊपर दिए गए <strong>"1-Click फ़ायरवॉल रीसेट व क्लाउड री-कनेक्ट"</strong> बटन को दबाएँ। (लोकल मोड में कॉपी चेकिंग और PDF डाउनलोड बिना रुके चलते रहते हैं)।
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1">
              <div className="font-extrabold text-slate-900 dark:text-white">
                ❓ समस्या 3: किसी छात्र ने पेमेंट कर दिया पर UTR नहीं डाला या कोटा तुरंत बढ़ाना है?
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                <strong>समाधान:</strong> <strong>"पंजीकृत अभ्यर्थी एवं कोटा"</strong> टैब में उस छात्र के नाम के आगे सीधे नई कॉपी संख्या टाइप करके <strong>"सेट करें"</strong> दबाएँ या <strong>"+10 / +50"</strong> बटन दबाएँ—कोटा 1 सेकंड में लाइव बढ़ जाएगा।
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1">
              <div className="font-extrabold text-slate-900 dark:text-white">
                ❓ समस्या 4: किसी कॉपी में AI के दिए गए अंकों या टिप्पणी को खुद बदलना हो तो?
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                <strong>समाधान:</strong> मुख्य स्क्रीन पर आप किसी भी लाल-पेन टिप्पणी पर क्लिक करके उसे एडिट/डिलीट या ड्रैग कर सकते हैं, पन्ने के हाशिए पर क्लिक करके नई टिप्पणी जोड़ सकते हैं, और मुख्य भाग के उप-भागों के अंक घटा-बढ़ाकर <strong>"क्लाउड पर सेव करें"</strong> दबा सकते हैं।
              </p>
            </div>
          </div>
        )}

        {activeGuideSection === 'roadmap' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs leading-relaxed">
            <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 space-y-2">
              <div className="text-xs font-black text-emerald-900 dark:text-emerald-300">
                चरण 1: 0 से 500 सक्रिय छात्र / माह (वर्तमान चरण)
              </div>
              <div className="text-lg font-black text-emerald-700 dark:text-emerald-400">
                इंजीनियर की आवश्यकता: 0%
              </div>
              <p className="text-slate-700 dark:text-slate-300">
                इस स्तर तक आपका वर्तमान सिस्टम 100% पर्याप्त है। आप अकेले इस ओनर पैनल से छात्र कोटा, QR/UTR ऑटो-अप्रूवल, ब्रांडेड PDF और बैकअप बिना किसी तकनीकी मदद के संभाल सकते हैं।
              </p>
            </div>

            <div className="p-4 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/70 space-y-2">
              <div className="text-xs font-black text-indigo-900 dark:text-indigo-300">
                चरण 2: 500 से 3,000 छात्र / माह (विस्तार चरण)
              </div>
              <div className="text-lg font-black text-indigo-700 dark:text-indigo-400">
                इंजीनियर की आवश्यकता: 0%
              </div>
              <p className="text-slate-700 dark:text-slate-300">
                जब रोज़ाना 3,000+ कॉपियाँ जाँची जाने लगें, तब भी कोड बदलने की जरूरत नहीं है—केवल Firebase Console में <strong>Blaze Plan (Pay-as-you-go)</strong> ऑन करना होगा, जिसका खर्च मासिक आय का मात्र 1%–2% होता है।
              </p>
            </div>

            <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 space-y-2">
              <div className="text-xs font-black text-amber-950 dark:text-amber-300">
                चरण 3: 5,000+ छात्र या ₹2 लाख+ मासिक आय
              </div>
              <div className="text-lg font-black text-amber-700 dark:text-amber-400">
                केवल कस्टम विस्तार हेतु
              </div>
              <p className="text-slate-700 dark:text-slate-300">
                केवल तब जब आपके पास पर्याप्त फंड हो और आप अपना अलग <code>.in / .com</code> डोमेन, Razorpay ऑटो-वेबहुक या Google Play Store ऐप बनवाना चाहें, तभी कुछ घंटों के लिए किसी डेवलपर की सेवा लें।
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
