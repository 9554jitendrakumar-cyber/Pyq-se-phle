import React, { useState, useMemo, useEffect } from 'react';
import {
  Sparkles,
  CheckCircle2,
  Copy,
  Check,
  MessageCircle,
  CreditCard,
  Shield,
  X,
  ExternalLink,
  Award,
  Zap,
  QrCode,
  Clock,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import {
  submitQuotaUpgradeRequest,
  loadStudentQuotaRequests,
  validateSmartUtrNumber,
  type PlatformPolicyConfig,
  type StudentProfileData,
  type QuotaUpgradeRequestData,
} from '../firebase';

interface QuotaUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentProfile: StudentProfileData | null;
  platformPolicy: PlatformPolicyConfig;
  isOwnerAccount?: boolean;
  onOpenOwnerSettings?: () => void;
  onStudentProfileUpdated?: (updated: StudentProfileData) => void;
  showToast?: (msg: string) => void;
}

export interface QuotaPlanItem {
  id: string;
  copies: number;
  price: number;
  title: string;
  subtitle: string;
  badge?: string;
}

export function parseQuotaPlans(summary?: string): QuotaPlanItem[] {
  const defaults = [
    { copies: 10, price: 99 },
    { copies: 25, price: 199 },
    { copies: 60, price: 399 },
  ];

  const rawParts = (summary || '10:99,25:199,60:399')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const parsed = rawParts
    .map((part) => {
      const [cStr, pStr] = part.split(':').map((x) => x.trim());
      const copies = Math.max(1, parseInt(cStr, 10) || 0);
      const price = Math.max(1, parseInt(pStr, 10) || 0);
      return copies > 0 && price > 0 ? { copies, price } : null;
    })
    .filter(Boolean) as { copies: number; price: number }[];

  const finalPairs = parsed.length >= 1 ? parsed.slice(0, 3) : defaults;

  const meta = [
    {
      title: 'प्रारंभिक अभ्यास पैक (Starter)',
      subtitle: 'दैनिक उत्तर-लेखन एवं मूल्यांकन अभ्यास हेतु',
    },
    {
      title: 'मेन्स टेस्ट सीरीज़ पैक (Popular)',
      subtitle: 'GS-1 से GS-4 संपूर्ण उत्तर-पुस्तिका जाँच हेतु',
      badge: 'सर्वाधिक लोकप्रिय',
    },
    {
      title: 'गहन मेंटॉरशिप पैक (Pro Batch)',
      subtitle: 'मुख्य परीक्षा मैराथन एवं निरंतर सुधार हेतु',
      badge: 'सर्वोत्तम मूल्य',
    },
  ];

  return finalPairs.map((pair, idx) => ({
    id: `plan_${idx}_${pair.copies}`,
    copies: pair.copies,
    price: pair.price,
    title: meta[idx]?.title || `प्लान ${idx + 1}`,
    subtitle: meta[idx]?.subtitle || 'अतिरिक्त उत्तर-पुस्तिका मूल्यांकन कोटा',
    badge: meta[idx]?.badge,
  }));
}

export const QuotaUpgradeModal: React.FC<QuotaUpgradeModalProps> = ({
  isOpen,
  onClose,
  studentProfile,
  platformPolicy,
  isOwnerAccount = false,
  onOpenOwnerSettings,
  onStudentProfileUpdated,
  showToast,
}) => {
  const plans = useMemo(
    () => parseQuotaPlans(platformPolicy.quotaPlanSummary),
    [platformPolicy.quotaPlanSummary]
  );

  const [selectedPlanIdx, setSelectedPlanIdx] = useState<number>(plans.length > 1 ? 1 : 0);
  const [utrReference, setUtrReference] = useState<string>('');
  const [copiedUpi, setCopiedUpi] = useState<boolean>(false);
  const [copiedMsg, setCopiedMsg] = useState<boolean>(false);
  const [qrLoadError, setQrLoadError] = useState<boolean>(false);

  const [isSubmittingUtr, setIsSubmittingUtr] = useState<boolean>(false);
  const [utrError, setUtrError] = useState<string | null>(null);
  const [utrSuccessMsg, setUtrSuccessMsg] = useState<string | null>(null);
  const [recentRequests, setRecentRequests] = useState<QuotaUpgradeRequestData[]>([]);

  const approvalMode: 'auto' | 'manual' =
    platformPolicy.paymentApprovalMode === 'manual' ? 'manual' : 'auto';

  useEffect(() => {
    if (isOpen && studentProfile?.ownerId) {
      setUtrError(null);
      setUtrSuccessMsg(null);
      loadStudentQuotaRequests(studentProfile.ownerId)
        .then((list) => setRecentRequests(list))
        .catch(() => {});
    }
  }, [isOpen, studentProfile?.ownerId]);

  useEffect(() => {
    setQrLoadError(false);
  }, [selectedPlanIdx, platformPolicy.ownerUpiId]);

  if (!isOpen) return null;

  const activePlan = plans[selectedPlanIdx] || plans[0];
  const upiId = (platformPolicy.ownerUpiId || '9554jitendrakumar@upi').trim();
  const instituteName = (platformPolicy.instituteName || 'UPSC Mains Evaluation Portal').trim();
  const rawWhatsapp = (platformPolicy.ownerWhatsappNumber || '').replace(/[^0-9]/g, '');
  const cleanWhatsapp =
    rawWhatsapp.length === 10 ? `91${rawWhatsapp}` : rawWhatsapp.length > 10 ? rawWhatsapp : '';

  const studentName = studentProfile?.displayName || 'UPSC अभ्यर्थी';
  const studentEmail = studentProfile?.email || 'पंजीकृत ईमेल';
  const usedCount = studentProfile?.usedCount ?? 0;
  const quotaLimit = studentProfile?.quotaLimit ?? platformPolicy.defaultStudentQuota;

  const upiDeepLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
    instituteName
  )}&am=${activePlan.price}&cu=INR&tn=${encodeURIComponent(
    `UPSC Quota +${activePlan.copies} Copies (${studentEmail})`
  )}`;

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(
    upiDeepLink
  )}`;

  const utrValidation = validateSmartUtrNumber(utrReference);

  const whatsappMessage = [
    `🙏 *नमस्ते सर (${instituteName})*`,
    ``,
    `मैंने अपने पोर्टल अकाउंट पर *अतिरिक्त कॉपी मूल्यांकन कोटा (Quota Upgrade)* के लिए UPI भुगतान किया है:`,
    `• *अभ्यर्थी का नाम:* ${studentName}`,
    `• *पंजीकृत Gmail:* ${studentEmail}`,
    `• *वर्तमान कोटा स्थिति:* ${usedCount} / ${quotaLimit} कॉपियाँ`,
    `• *चयनित अपग्रेड प्लान:* +${activePlan.copies} कॉपियाँ (₹${activePlan.price})`,
    utrValidation.cleanUtr
      ? `• *12-अंकीय UPI UTR नं.:* ${utrValidation.cleanUtr}`
      : `• *भुगतान माध्यम:* UPI (${upiId})`,
    ``,
    `कृपया मेरे Gmail अकाउंट (${studentEmail}) की कॉपी लिमिट को कन्फर्म करने की कृपा करें। धन्यवाद!`,
  ].join('\n');

  const whatsappHref = cleanWhatsapp
    ? `https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(whatsappMessage)}`
    : `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;

  const handleCopyUpi = async () => {
    try {
      await navigator.clipboard.writeText(upiId);
      setCopiedUpi(true);
      showToast?.(`✓ UPI ID (${upiId}) क्लिपबोर्ड पर कॉपी हो गई!`);
      setTimeout(() => setCopiedUpi(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(whatsappMessage);
      setCopiedMsg(true);
      showToast?.('✓ कोटा अपग्रेड संदेश कॉपी हो गया! अब WhatsApp पर पेस्ट करें।');
      setTimeout(() => setCopiedMsg(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleVerifyAndSubmitUtr = async () => {
    setUtrError(null);
    setUtrSuccessMsg(null);

    if (!utrValidation.isValid) {
      setUtrError(utrValidation.reason || 'कृपया वैध 12-अंकीय UPI UTR नंबर दर्ज करें।');
      return;
    }

    const baseProfile: StudentProfileData = studentProfile || {
      ownerId: 'local_student',
      displayName: studentName,
      email: studentEmail,
      role: 'student',
      status: 'active',
      quotaLimit,
      usedCount,
      joinedAt: new Date().toISOString(),
    };

    setIsSubmittingUtr(true);
    try {
      const result = await submitQuotaUpgradeRequest({
        profile: baseProfile,
        planTitle: activePlan.title,
        copiesRequested: activePlan.copies,
        amountInr: activePlan.price,
        utrNumber: utrValidation.cleanUtr,
        approvalMode,
      });

      setRecentRequests((prev) => [result.request, ...prev.filter((r) => r.requestId !== result.request.requestId)]);
      setUtrReference('');

      if (approvalMode === 'auto') {
        onStudentProfileUpdated?.(result.updatedProfile);
        const msg = `✅ स्मार्ट ऑटो-वेरिफिकेशन सफल! आपके अकाउंट में +${activePlan.copies} कॉपियाँ तुरंत जोड़ दी गई हैं (नया कोटा: ${result.updatedProfile.quotaLimit} कॉपियाँ)।`;
        setUtrSuccessMsg(msg);
        showToast?.(msg);
      } else {
        const msg = `🛡️ आपका 12-अंकीय UTR (${result.request.utrNumber}) सबमिट हो गया है! ओनर के 1-Click अप्रूवल के तुरंत बाद +${activePlan.copies} कॉपियाँ जुड़ जाएंगी।`;
        setUtrSuccessMsg(msg);
        showToast?.(msg);
      }
    } catch (err: any) {
      setUtrError(err?.message || 'UTR सबमिट करने में त्रुटि हुई। कृपया पुनः प्रयास करें।');
    } finally {
      setIsSubmittingUtr(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[92vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden text-left">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white">
                  कॉपी मूल्यांकन कोटा अपग्रेड (Direct UPI QR + Smart Auto-Verify)
                </h2>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border font-extrabold ${
                    approvalMode === 'auto'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-400/30'
                  }`}
                >
                  {approvalMode === 'auto' ? '⚡ Auto-Approve: तुरंत कोटा' : '🛡️ Owner 1-Click Verify'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {instituteName} • वर्तमान कोटा: <strong>{usedCount}/{quotaLimit} कॉपियाँ</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 bg-slate-50/50 dark:bg-slate-900">
          {/* Owner Shortcut Banner */}
          {isOwnerAccount && onOpenOwnerSettings && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  ओनर नियंत्रण: अभी <strong>{approvalMode === 'auto' ? 'Auto-Approve (तुरंत कोटा)' : 'Manual 1-Click Approve'}</strong> मोड चालू है।
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenOwnerSettings();
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-400 text-xs font-extrabold cursor-pointer shrink-0"
              >
                ओनर पेमेंट पैनल व स्विच खोलें
              </button>
            </div>
          )}

          {/* Step 1: Choose Plan */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-2.5">
              1. अपना मूल्यांकन कोटा पैक चुनें (Select Copy Pack)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {plans.map((plan, idx) => {
                const isSelected = idx === selectedPlanIdx;
                const perCopyCost = Math.max(1, Math.round(plan.price / plan.copies));
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlanIdx(idx)}
                    className={`relative p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/50 border-indigo-600 dark:border-amber-400 shadow-md'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-300'
                    }`}
                  >
                    {plan.badge && (
                      <span className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black shadow-2xs">
                        {plan.badge}
                      </span>
                    )}
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-extrabold text-indigo-700 dark:text-indigo-300">
                          +{plan.copies} कॉपियाँ
                        </span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-amber-400" />}
                      </div>
                      <div className="mt-1.5 flex items-baseline gap-1">
                        <span className="text-2xl font-black text-slate-900 dark:text-white">₹{plan.price}</span>
                        <span className="text-[11px] font-bold text-slate-500">(~₹{perCopyCost}/कॉपी)</span>
                      </div>
                      <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mt-1.5">
                        {plan.title}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                        {plan.subtitle}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Direct UPI QR Code + App Deep Link */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-indigo-600 dark:text-amber-400" />
                <h3 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                  2. Direct UPI QR स्कैन करें या UPI ऐप से ₹{activePlan.price} पेमेंट करें
                </h3>
              </div>
              <span className="text-xs font-black text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800">
                देय राशि: ₹{activePlan.price} (+{activePlan.copies} कॉपियाँ)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
              {/* Scannable UPI QR Card */}
              <div className="sm:col-span-5 flex flex-col items-center justify-center p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                {!qrLoadError ? (
                  <img
                    src={qrImageUrl}
                    alt={`UPI QR for ₹${activePlan.price}`}
                    onError={() => setQrLoadError(true)}
                    className="w-40 h-40 rounded-xl bg-white p-2 border border-slate-200 shadow-xs object-contain"
                  />
                ) : (
                  <div className="w-40 h-40 rounded-xl bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-center gap-1.5">
                    <QrCode className="w-12 h-12 text-indigo-600 dark:text-amber-400" />
                    <span className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200">
                      ₹{activePlan.price} UPI पेमेंट
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 break-all">{upiId}</span>
                  </div>
                )}
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-2 text-center">
                  GPay • PhonePe • Paytm • BHIM QR
                </span>
              </div>

              {/* UPI ID & Direct Action Controls */}
              <div className="sm:col-span-7 space-y-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">
                    आधिकारिक मर्चेंट / संस्थान UPI ID:
                  </span>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-mono font-black text-slate-900 dark:text-white select-all break-all">
                      {upiId}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyUpi}
                      className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600 text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      {copiedUpi ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>कॉपी हुआ</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                          <span>कॉपी करें</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <a
                  href={upiDeepLink}
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-sm transition-all"
                  title="मोबाइल पर सीधे UPI ऐप (GPay/PhonePe/Paytm) खोलें"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>मोबाइल में सीधे UPI ऐप खोलें (₹{activePlan.price})</span>
                </a>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  • QR स्कैन करने पर राशि <strong>₹{activePlan.price}</strong> स्वतः भर जाएगी। पेमेंट पूरा होने के बाद नीचे <strong>12-अंकीय UTR / Ref नंबर</strong> दर्ज करें।
                </p>
              </div>
            </div>
          </div>

          {/* Step 3: Smart Auto-Verification (12-Digit UTR Input) */}
          <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border-2 border-indigo-200 dark:border-indigo-800/80 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-amber-400 shrink-0" />
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                    3. स्मार्ट UTR वेरिफिकेशन ({approvalMode === 'auto' ? 'तुरंत कोटा प्राप्त करें' : '1-Click अप्रूवल हेतु भेजें'})
                  </h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    पेमेंट ऐप (GPay / PhonePe / Paytm) की रसीद से <strong>12-अंकीय UPI Transaction / UTR नंबर</strong> यहाँ लिखें:
                  </p>
                </div>
              </div>
              <span
                className={`text-[11px] font-mono font-extrabold px-2 py-0.5 rounded-lg border ${
                  utrValidation.cleanUtr.length === 12
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                }`}
              >
                {utrValidation.cleanUtr.length} / 12 अंक
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <input
                type="text"
                inputMode="numeric"
                maxLength={16}
                value={utrReference}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 12);
                  setUtrReference(digits);
                  setUtrError(null);
                }}
                placeholder="12-अंकीय UTR नंबर लिखें (उदा: 412589632147)"
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-indigo-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono font-extrabold tracking-wider text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />

              <button
                type="button"
                onClick={handleVerifyAndSubmitUtr}
                disabled={isSubmittingUtr || utrValidation.cleanUtr.length !== 12}
                className="py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50 shrink-0"
              >
                <Zap className="w-4 h-4" />
                <span>
                  {isSubmittingUtr
                    ? 'वेरिफाई हो रहा है...'
                    : approvalMode === 'auto'
                      ? `UTR वेरिफाई करें (+${activePlan.copies} कोटा तुरंत पाएं)`
                      : `UTR सबमिट करें (+${activePlan.copies} कोटा रिक्वेस्ट)`}
                </span>
              </button>
            </div>

            {utrError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{utrError}</span>
              </div>
            )}

            {utrSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-xs font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{utrSuccessMsg}</span>
              </div>
            )}
          </div>

          {/* Student's Recent Payment / UTR History */}
          {recentRequests.length > 0 && (
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2.5">
              <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                <span>आपके कोटा अपग्रेड ट्रांजेक्शन रिकॉर्ड ({recentRequests.length})</span>
              </h4>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {recentRequests.map((req) => (
                  <div
                    key={req.requestId}
                    className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-extrabold text-slate-900 dark:text-white">
                        +{req.copiesRequested} कॉपियाँ (₹{req.amountInr})
                      </span>
                      <span className="text-slate-500 ml-2 font-mono text-[11px]">
                        UTR: {req.utrNumber}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">
                        {new Date(req.createdAt).toLocaleDateString('hi-IN')}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${
                          req.status === 'auto_approved' || req.status === 'approved'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : req.status === 'rejected'
                              ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300'
                              : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300'
                        }`}
                      >
                        {req.status === 'auto_approved'
                          ? '✅ Auto-Approved (कोटा जुड़ गया)'
                          : req.status === 'approved'
                            ? '✅ Approved (कोटा जुड़ गया)'
                            : req.status === 'rejected'
                              ? '🚫 अस्वीकृत (Rejected)'
                              : '⏳ सत्यापन लंबित (Pending)'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Optional WhatsApp Support / Notification */}
          <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <MessageCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-xs font-bold text-emerald-950 dark:text-emerald-200">
                भुगतान की सूचना या सहायता हेतु सीधे WhatsApp पर भी भेज सकते हैं:
              </span>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-2xs transition-all"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp पर भेजें</span>
                <ExternalLink className="w-3 h-3 opacity-80" />
              </a>

              <button
                type="button"
                onClick={handleCopyMessage}
                className="py-2 px-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-emerald-300 dark:border-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                {copiedMsg ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedMsg ? 'कॉपी हुआ' : 'संदेश कॉपी'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <Award className="w-3.5 h-3.5 text-amber-500" />
            <span>
              {approvalMode === 'auto'
                ? 'स्मार्ट ऑटो-वेरिफिकेशन सक्रिय: 12-अंकीय UTR डालते ही कोटा तुरंत जुड़ जाता है।'
                : 'मैनुअल वेरिफिकेशन सक्रिय: ओनर द्वारा 1-Click अप्रूव होते ही कोटा जुड़ जाएगा।'}
            </span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
          >
            बंद करें
          </button>
        </div>
      </div>
    </div>
  );
};
