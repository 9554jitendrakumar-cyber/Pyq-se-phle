import React, { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  Settings,
  Search,
  Ban,
  Plus,
  RotateCcw,
  Eye,
  Trash2,
  RefreshCw,
  Clock,
  Lock,
  Unlock,
  X,
  FileText,
  Sparkles,
  Database,
  CheckCircle2,
  Download,
  Award,
  Edit3,
  Check,
  CreditCard,
  Zap,
  Calculator,
  Activity,
} from 'lucide-react';
import localforage from 'localforage';
import { FounderCommandCenterTab } from './FounderCommandCenterTab';
import {
  auth,
  isSuperAdminUser,
  signInWithGoogle,
  StudentProfileData,
  PlatformPolicyConfig,
  DEFAULT_PLATFORM_POLICY,
  QuotaUpgradeRequestData,
  loadAllStudentProfiles,
  adminUpdateStudentProfile,
  adminDeleteStudentProfile,
  loadAllQuotaRequestsForAdmin,
  adminProcessQuotaRequest,
  adminDeleteQuotaRequest,
  loadEvaluationsFromCloud,
  deleteEvaluationFromCloud,
  savePlatformPolicy,
} from '../firebase';
import type { HistoryEntry } from '../types/evaluation';

interface OwnerAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  ownerUid: string;
  platformPolicy: PlatformPolicyConfig;
  onPolicyUpdated: (newPolicy: PlatformPolicyConfig) => void;
  onStudentProfileUpdated?: (updatedProfile: StudentProfileData) => void;
  onInspectStudentCopy: (studentProfile: StudentProfileData, evalRecord: any) => void;
  isStudentPreviewMode: boolean;
  onToggleStudentPreviewMode: () => void;
  showToast: (msg: string) => void;
}

export const OwnerAdminModal: React.FC<OwnerAdminModalProps> = ({
  isOpen,
  onClose,
  ownerUid,
  platformPolicy,
  onPolicyUpdated,
  onStudentProfileUpdated,
  onInspectStudentCopy,
  isStudentPreviewMode,
  onToggleStudentPreviewMode,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'students' | 'payments' | 'policy' | 'economics' | 'ops'>('students');
  const [students, setStudents] = useState<StudentProfileData[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [studentFilter, setStudentFilter] = useState<'all' | 'active' | 'quota_full' | 'blocked'>('all');
  const [updatingStudentId, setUpdatingStudentId] = useState<string | null>(null);
  const [isBulkUpdating, setIsBulkUpdating] = useState<boolean>(false);
  const [bulkCustomQuota, setBulkCustomQuota] = useState<string>('20');

  // UPI / UTR Payment Requests state
  const [quotaRequests, setQuotaRequests] = useState<QuotaUpgradeRequestData[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState<boolean>(false);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);

  // Per-row custom quota limit, usedCount, and displayName drafts
  const [rowQuotaDrafts, setRowQuotaDrafts] = useState<Record<string, string>>({});
  const [rowUsedDrafts, setRowUsedDrafts] = useState<Record<string, string>>({});
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [draftNameValue, setDraftNameValue] = useState<string>('');

  // Drilldown for viewing a specific student's evaluated copies
  const [selectedStudentForCopies, setSelectedStudentForCopies] = useState<StudentProfileData | null>(null);
  const [studentCopies, setStudentCopies] = useState<any[]>([]);
  const [isLoadingCopies, setIsLoadingCopies] = useState<boolean>(false);

  // Editable policy state
  const [draftPolicy, setDraftPolicy] = useState<PlatformPolicyConfig>(platformPolicy);
  const [isSavingPolicy, setIsSavingPolicy] = useState<boolean>(false);

  useEffect(() => {
    setDraftPolicy(platformPolicy);
  }, [platformPolicy]);

  const syncRowDrafts = (list: StudentProfileData[]) => {
    const qMap: Record<string, string> = {};
    const uMap: Record<string, string> = {};
    for (const s of list) {
      qMap[s.ownerId] = String(s.quotaLimit ?? 0);
      uMap[s.ownerId] = String(s.usedCount ?? 0);
    }
    setRowQuotaDrafts(qMap);
    setRowUsedDrafts(uMap);
  };

  const fetchStudentsList = async () => {
    setIsLoadingStudents(true);
    try {
      const list = await loadAllStudentProfiles();
      setStudents(list);
      syncRowDrafts(list);
    } catch (err) {
      console.error('Failed to load student profiles:', err);
    } finally {
      setIsLoadingStudents(false);
    }
  };

  const fetchQuotaRequestsList = async () => {
    setIsLoadingRequests(true);
    try {
      const reqs = await loadAllQuotaRequestsForAdmin();
      setQuotaRequests(reqs);
    } catch (err) {
      console.error('Failed to load quota requests:', err);
    } finally {
      setIsLoadingRequests(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStudentsList();
      fetchQuotaRequestsList();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const applyProfileUpdate = async (
    student: StudentProfileData,
    updates: Partial<Pick<StudentProfileData, 'displayName' | 'role' | 'status' | 'quotaLimit' | 'usedCount'>>,
    toastMessage: string
  ) => {
    setUpdatingStudentId(student.ownerId);
    try {
      const updated = await adminUpdateStudentProfile(student, updates);
      setStudents((prev) => prev.map((s) => (s.ownerId === student.ownerId ? updated : s)));
      setRowQuotaDrafts((prev) => ({ ...prev, [student.ownerId]: String(updated.quotaLimit) }));
      setRowUsedDrafts((prev) => ({ ...prev, [student.ownerId]: String(updated.usedCount) }));
      if (updated.ownerId === ownerUid || updated.ownerId === auth.currentUser?.uid) {
        onStudentProfileUpdated?.(updated);
      }
      showToast(toastMessage);
    } catch (err) {
      console.error('Student update error:', err);
    } finally {
      setUpdatingStudentId(null);
    }
  };

  const handleAdjustQuota = async (student: StudentProfileData, delta: number, exactReset = false) => {
    const nextLimit = Math.max(0, Math.min(10000, student.quotaLimit + delta));
    const updates = exactReset ? { usedCount: 0 } : { quotaLimit: nextLimit };
    await applyProfileUpdate(
      student,
      updates,
      exactReset
        ? `✓ ${student.displayName} का उपयोग काउंटर (Used Count) 0 पर रीसेट किया गया!`
        : `✓ ${student.displayName} की कॉपी लिमिट अपडेट होकर ${nextLimit} हो गई!`
    );
  };

  const handleSetExactQuotaAndUsed = async (
    student: StudentProfileData,
    exactLimit?: number,
    exactUsed?: number
  ) => {
    const parsedLimit = Math.max(
      0,
      Math.min(
        10000,
        Math.round(
          exactLimit !== undefined ? exactLimit : Number(rowQuotaDrafts[student.ownerId] ?? student.quotaLimit) || 0
        )
      )
    );
    const parsedUsed = Math.max(
      0,
      Math.min(
        100000,
        Math.round(
          exactUsed !== undefined ? exactUsed : Number(rowUsedDrafts[student.ownerId] ?? student.usedCount) || 0
        )
      )
    );
    await applyProfileUpdate(
      student,
      { quotaLimit: parsedLimit, usedCount: parsedUsed },
      `✓ ${student.displayName} का कोटा सेट किया गया: ${parsedUsed} / ${parsedLimit} कॉपियाँ`
    );
  };

  const handleSaveStudentName = async (student: StudentProfileData) => {
    const cleanName = draftNameValue.trim();
    if (!cleanName) {
      setEditingNameId(null);
      return;
    }
    await applyProfileUpdate(
      student,
      { displayName: cleanName },
      `✓ नाम अपडेट होकर '${cleanName}' हो गया!`
    );
    setEditingNameId(null);
  };

  const handleDeleteStudent = async (student: StudentProfileData) => {
    if (student.role === 'owner') return;
    setUpdatingStudentId(student.ownerId);
    try {
      await adminDeleteStudentProfile(student.ownerId);
      setStudents((prev) => prev.filter((s) => s.ownerId !== student.ownerId));
      showToast(`🗑️ ${student.displayName} (${student.email}) का प्रोफाइल हटा दिया गया।`);
    } catch (err) {
      console.error('Delete student profile error:', err);
    } finally {
      setUpdatingStudentId(null);
    }
  };

  const handleBulkAddQuotaToActiveStudents = async (bonusQuota: number) => {
    const targets = students.filter((s) => s.role !== 'owner' && s.status === 'active');
    if (targets.length === 0) return;
    setIsBulkUpdating(true);
    try {
      const updatedMap = new Map<string, StudentProfileData>();
      for (const st of targets) {
        const updated = await adminUpdateStudentProfile(st, {
          quotaLimit: Math.max(0, Math.min(10000, (st.quotaLimit || 0) + bonusQuota)),
        });
        updatedMap.set(st.ownerId, updated);
      }
      const nextList = students.map((s) => updatedMap.get(s.ownerId) || s);
      setStudents(nextList);
      syncRowDrafts(nextList);
      showToast(`✓ सभी ${targets.length} सक्रिय अभ्यर्थियों को +${bonusQuota} कॉपी कोटा दिया गया!`);
    } catch (err) {
      console.error('Bulk quota update failed:', err);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleBulkSetExactQuotaForAllStudents = async (exactLimit: number) => {
    const cleanLimit = Math.max(0, Math.min(10000, Math.round(exactLimit || 0)));
    const targets = students.filter((s) => s.role !== 'owner');
    if (targets.length === 0) return;
    setIsBulkUpdating(true);
    try {
      const updatedMap = new Map<string, StudentProfileData>();
      for (const st of targets) {
        const updated = await adminUpdateStudentProfile(st, {
          quotaLimit: cleanLimit,
        });
        updatedMap.set(st.ownerId, updated);
      }
      const nextList = students.map((s) => updatedMap.get(s.ownerId) || s);
      setStudents(nextList);
      syncRowDrafts(nextList);
      showToast(`✓ सभी ${targets.length} अभ्यर्थियों की कुल कॉपी लिमिट ${cleanLimit} सेट की गई!`);
    } catch (err) {
      console.error('Bulk set exact quota failed:', err);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleBulkResetAllUsedCounts = async () => {
    const targets = students.filter((s) => s.usedCount > 0);
    if (targets.length === 0) {
      showToast('सभी अभ्यर्थियों का उपयोग काउंटर पहले से 0 है।');
      return;
    }
    setIsBulkUpdating(true);
    try {
      const updatedMap = new Map<string, StudentProfileData>();
      for (const st of targets) {
        const updated = await adminUpdateStudentProfile(st, { usedCount: 0 });
        updatedMap.set(st.ownerId, updated);
        if (updated.ownerId === ownerUid || updated.ownerId === auth.currentUser?.uid) {
          onStudentProfileUpdated?.(updated);
        }
      }
      const nextList = students.map((s) => updatedMap.get(s.ownerId) || s);
      setStudents(nextList);
      syncRowDrafts(nextList);
      showToast(`✓ सभी ${targets.length} अकाउंट्स का Used Count 0 पर रीसेट हो गया!`);
    } catch (err) {
      console.error('Bulk reset used count failed:', err);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleBulkSetStatusForAllStudents = async (targetStatus: 'active' | 'blocked') => {
    const targets = students.filter((s) => s.role !== 'owner' && s.status !== targetStatus);
    if (targets.length === 0) return;
    setIsBulkUpdating(true);
    try {
      const updatedMap = new Map<string, StudentProfileData>();
      for (const st of targets) {
        const updated = await adminUpdateStudentProfile(st, { status: targetStatus });
        updatedMap.set(st.ownerId, updated);
      }
      const nextList = students.map((s) => updatedMap.get(s.ownerId) || s);
      setStudents(nextList);
      showToast(
        targetStatus === 'active'
          ? `✅ सभी ${targets.length} अभ्यर्थियों का एक्सेस सक्रिय किया गया!`
          : `🚫 सभी ${targets.length} अभ्यर्थियों का एक्सेस अस्थायी रूप से रोका गया!`
      );
    } catch (err) {
      console.error('Bulk status update failed:', err);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // Export registered students list to Excel-compatible UTF-8 CSV (Zero Token Cost)
  const handleExportStudentsCSV = () => {
    if (students.length === 0) {
      showToast('एक्सपोर्ट करने के लिए कोई अभ्यर्थी रिकॉर्ड नहीं है।');
      return;
    }

    const escapeCsvCell = (val: string | number) => {
      const str = String(val ?? '').replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = [
      'क्रमांक (S.No.)',
      'अभ्यर्थी का नाम (Name)',
      'ईमेल (Email)',
      'भूमिका (Role)',
      'स्थिति (Status)',
      'जाँची गई कॉपियाँ (Used Copies)',
      'कुल कोटा (Quota Limit)',
      'शेष कोटा (Remaining)',
      'पंजीकरण तिथि (Joined Date)',
    ];

    const rows = students.map((st, idx) => {
      const isOwnerRow = st.role === 'owner';
      const remaining = isOwnerRow ? 'Unlimited' : Math.max(0, (st.quotaLimit || 0) - (st.usedCount || 0));
      const joinedFormatted = new Date(st.joinedAt).toLocaleDateString('hi-IN');
      return [
        idx + 1,
        st.displayName,
        st.email,
        st.role === 'owner' ? 'Owner' : st.role === 'evaluator' ? 'Evaluator' : 'Student',
        st.status === 'active' ? 'Active' : 'Blocked',
        st.usedCount || 0,
        st.quotaLimit || 0,
        remaining,
        joinedFormatted,
      ]
        .map(escapeCsvCell)
        .join(',');
    });

    // Include UTF-8 BOM (\uFEFF) so Excel opens Hindi & English columns cleanly
    const csvContent = '\uFEFF' + [headers.map(escapeCsvCell).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.setAttribute('download', `UPSC_Portal_Students_List_${dateStamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    showToast(`📥 ${students.length} पंजीकृत अभ्यर्थियों की सूची (CSV/Excel) डाउनलोड हो गई!`);
  };

  const handleToggleStatus = async (student: StudentProfileData) => {
    if (student.role === 'owner') return;
    const nextStatus = student.status === 'active' ? 'blocked' : 'active';
    await applyProfileUpdate(
      student,
      { status: nextStatus },
      nextStatus === 'blocked'
        ? `🚫 ${student.displayName} का एक्सेस अस्थायी रूप से रोका गया`
        : `✅ ${student.displayName} का एक्सेस पुनः सक्रिय किया गया`
    );
  };

  const handleChangeRole = async (
    student: StudentProfileData,
    nextRole: 'student' | 'evaluator' | 'owner'
  ) => {
    await applyProfileUpdate(
      student,
      { role: nextRole },
      `✓ ${student.displayName} की भूमिका बदलकर '${
        nextRole === 'owner'
          ? 'ओनर (Owner)'
          : nextRole === 'evaluator'
            ? 'परीक्षक / मेंटॉर (Evaluator - अनलिमिटेड व बैच अधिकार)'
            : 'अभ्यर्थी (Student)'
      }' की गई`
    );
  };

  const handleViewStudentCopies = async (student: StudentProfileData) => {
    setSelectedStudentForCopies(student);
    setIsLoadingCopies(true);
    try {
      const evals = await loadEvaluationsFromCloud(student.ownerId, platformPolicy.retentionDays);
      // Merge with local IndexedDB cache if any local high-res pages exist on this device
      const studentLocal =
        (await localforage.getItem<HistoryEntry[]>(`upsc_mains_history_${student.ownerId}`).catch(() => [])) || [];
      const ownerLocal =
        (await localforage.getItem<HistoryEntry[]>('upsc_mains_history').catch(() => [])) || [];
      const localMap = new Map<string, HistoryEntry>();
      for (const item of [...ownerLocal, ...studentLocal]) {
        if (item?.id && item.uploadedPages && item.uploadedPages.length > 0) {
          localMap.set(item.id, item);
        }
      }

      const merged = evals.map((c: any) => {
        const localMatch = localMap.get(c.id);
        if (localMatch && (!c.uploadedPages || c.uploadedPages.length === 0)) {
          return { ...c, uploadedPages: localMatch.uploadedPages };
        }
        return c;
      });
      setStudentCopies(merged);
    } catch (err) {
      console.error('Failed to load student copies:', err);
      setStudentCopies([]);
    } finally {
      setIsLoadingCopies(false);
    }
  };

  const handleDeleteStudentCopy = async (evalId: string) => {
    if (!selectedStudentForCopies) return;
    try {
      await deleteEvaluationFromCloud(selectedStudentForCopies.ownerId, evalId);
      setStudentCopies((prev) => prev.filter((c) => c.id !== evalId));
      showToast('✓ मूल्यांकन रिकॉर्ड क्लाउड से हटाया गया');
    } catch (err) {
      console.error('Failed to delete student evaluation:', err);
    }
  };

  const isCloudOwnerAuthenticated = Boolean(auth.currentUser && isSuperAdminUser(auth.currentUser));

  const handleConnectOwnerCloud = async () => {
    try {
      const u = await signInWithGoogle(true);
      if (!u) return;
      if (isSuperAdminUser(u)) {
        await savePlatformPolicy(u.uid, draftPolicy);
        await fetchStudentsList();
        showToast('☁️ ओनर क्लाउड अकाउंट सफलतापूर्वक जुड़ गया और छात्र सूची सिंक हो गई!');
      } else {
        showToast('⚠️ कृपया ओनर ईमेल (9554jitendrakumar@gmail.com) से लॉगिन करें।');
      }
    } catch (err) {
      console.warn('Owner cloud sign-in cancelled or failed:', err);
    }
  };

  const handleSavePolicySubmit = async () => {
    setIsSavingPolicy(true);
    try {
      await savePlatformPolicy(ownerUid, draftPolicy);
      onPolicyUpdated(draftPolicy);
      showToast(
        isCloudOwnerAuthenticated
          ? '✓ संस्थान ब्रांडिंग, पेमेंट मोड व प्लेटफॉर्म नियम क्लाउड पर लागू किए गए!'
          : '✓ संस्थान ब्रांडिंग व नियम सेव हो गए! (क्लाउड सिंक हेतु Google ओनर अकाउंट कनेक्ट करें)'
      );
    } catch (err) {
      console.error('Failed to save platform policy:', err);
    } finally {
      setIsSavingPolicy(false);
    }
  };

  const handleTogglePaymentApprovalMode = async (nextMode: 'auto' | 'manual') => {
    const updated: PlatformPolicyConfig = {
      ...draftPolicy,
      paymentApprovalMode: nextMode,
    };
    setDraftPolicy(updated);
    try {
      await savePlatformPolicy(ownerUid, updated);
      onPolicyUpdated(updated);
      showToast(
        nextMode === 'auto'
          ? '⚡ Auto-Approve चालू: अब छात्र द्वारा 12-अंकीय UTR डालते ही कोटा तुरंत जुड़ जाएगा!'
          : '🛡️ Manual 1-Click Approve चालू: अब आपके 1-Click अप्रूवल के बाद ही छात्र को कोटा मिलेगा!'
      );
    } catch (err) {
      console.error('Failed to toggle payment approval mode:', err);
    }
  };

  const handleProcessRequest = async (
    req: QuotaUpgradeRequestData,
    targetStatus: 'approved' | 'rejected'
  ) => {
    setProcessingRequestId(req.requestId);
    try {
      const matchedStudent = students.find((s) => s.ownerId === req.ownerId) || null;
      const res = await adminProcessQuotaRequest(req, targetStatus, matchedStudent);
      setQuotaRequests((prev) =>
        prev.map((r) => (r.requestId === req.requestId ? res.updatedRequest : r))
      );
      if (res.updatedProfile) {
        const up = res.updatedProfile;
        setStudents((prev) => prev.map((s) => (s.ownerId === up.ownerId ? up : s)));
        setRowQuotaDrafts((prev) => ({ ...prev, [up.ownerId]: String(up.quotaLimit) }));
        if (up.ownerId === ownerUid || up.ownerId === auth.currentUser?.uid) {
          onStudentProfileUpdated?.(up);
        }
      }
      showToast(
        targetStatus === 'approved'
          ? `✅ ${req.studentName} का UTR (${req.utrNumber}) अप्रूव किया गया (+${req.copiesRequested} कोटा जुड़ा)!`
          : `🚫 ${req.studentName} का UTR (${req.utrNumber}) अस्वीकृत किया गया और कोटा समायोजित हुआ।`
      );
    } catch (err) {
      console.error('Failed to process quota request:', err);
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleDeleteRequest = async (req: QuotaUpgradeRequestData) => {
    setProcessingRequestId(req.requestId);
    try {
      await adminDeleteQuotaRequest(req.requestId);
      setQuotaRequests((prev) => prev.filter((r) => r.requestId !== req.requestId));
      showToast(`🗑️ ट्रांजेक्शन रिकॉर्ड (${req.utrNumber}) हटाया गया।`);
    } catch (err) {
      console.error('Failed to delete quota request:', err);
    } finally {
      setProcessingRequestId(null);
    }
  };

  const pendingRequestsCount = quotaRequests.filter((r) => r.status === 'pending').length;

  const filteredStudents = students.filter((s) => {
    if (studentFilter === 'active' && s.status !== 'active') return false;
    if (studentFilter === 'blocked' && s.status !== 'blocked') return false;
    if (studentFilter === 'quota_full' && (s.role === 'owner' || s.usedCount < s.quotaLimit)) return false;

    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      s.displayName.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      s.role.toLowerCase().includes(q)
    );
  });

  const totalEvaluationsUsed = students.reduce((acc, s) => acc + (s.usedCount || 0), 0);
  const activeCount = students.filter((s) => s.status === 'active').length;
  const estimatedStorageMb = Math.max(0.4, Number((totalEvaluationsUsed * 0.35).toFixed(1)));
  const storagePct = Math.min(100, Math.round((estimatedStorageMb / 1024) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/65 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl max-h-[92vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        {/* Top Executive Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center">
              <Shield className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-white">
                  ओनर कंट्रोल एवं एडटेक कमांड सेंटर
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 font-black uppercase tracking-wider">
                  Admin Studio
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                अभ्यर्थी एक्सेस, कॉपी कोटा, संस्थान ब्रांडिंग और प्लेटफॉर्म नियम नियंत्रण
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onToggleStudentPreviewMode}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                isStudentPreviewMode
                  ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-sm'
                  : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
              }`}
              title="देखें कि छात्र को पोर्टल कैसा दिखाई देता है"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{isStudentPreviewMode ? 'Student View: चालू (Owner मोड में लौटें)' : 'Student View प्रीव्यू'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs & Executive Metrics Bar */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setSelectedStudentForCopies(null);
                setActiveTab('students');
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'students'
                  ? 'bg-slate-900 text-amber-400 dark:bg-amber-500 dark:text-slate-950 shadow-2xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>पंजीकृत अभ्यर्थी एवं कोटा ({students.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('payments')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'payments'
                  ? 'bg-slate-900 text-amber-400 dark:bg-amber-500 dark:text-slate-950 shadow-2xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>UPI पेमेंट व UTR पैनल ({quotaRequests.length})</span>
              {pendingRequestsCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black">
                  {pendingRequestsCount} लंबित
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('policy')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'policy'
                  ? 'bg-slate-900 text-amber-400 dark:bg-amber-500 dark:text-slate-950 shadow-2xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>संस्थान ब्रांडिंग व नियम ({platformPolicy.retentionDays} दिन)</span>
            </button>
            <button
              onClick={() => setActiveTab('economics')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'economics'
                  ? 'bg-slate-900 text-amber-400 dark:bg-amber-500 dark:text-slate-950 shadow-2xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
              }`}
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>बिज़नेस व लागत कैलकुलेटर</span>
            </button>
            <button
              onClick={() => setActiveTab('ops')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'ops'
                  ? 'bg-slate-900 text-amber-400 dark:bg-amber-500 dark:text-slate-950 shadow-2xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>नो-कोड मेंटेनेंस, बैकअप व गाइड</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800">
              सक्रिय: {activeCount}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800">
              कुल जाँची कॉपियाँ: {totalEvaluationsUsed}
            </span>
            <span
              className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border border-slate-200 dark:border-slate-700 flex items-center gap-1.5"
              title="अनुमानित क्लाउड स्टोरेज उपयोग (1 GB क्षमता में से)"
            >
              <Database className="w-3.5 h-3.5 text-emerald-600" />
              <span>स्टोरेज: ~{estimatedStorageMb} MB / 1 GB ({storagePct}%)</span>
            </span>
          </div>
        </div>

        {/* Main Content Body */}
        <div className="flex-1 overflow-y-auto p-5 bg-slate-50/40 dark:bg-slate-900/50">
          {activeTab === 'students' ? (
            selectedStudentForCopies ? (
              /* Student Copies Drill-down View */
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>📂 {selectedStudentForCopies.displayName} की मूल्यांकित कॉपियाँ</span>
                      <span className="text-xs font-normal text-slate-500">({selectedStudentForCopies.email})</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      किसी भी कॉपी को मुख्य कैनवास पर खोलकर उसकी लाल-पेन टिप्पणियाँ, उत्तर-पुस्तिका पृष्ठ व स्कोरकार्ड देखें या संशोधित करें।
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedStudentForCopies(null)}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    ← सभी अभ्यर्थियों की सूची पर वापस जाएं
                  </button>
                </div>

                {isLoadingCopies ? (
                  <div className="py-16 text-center text-sm text-slate-500 font-semibold animate-pulse">
                    छात्र की कॉपियाँ लोड हो रही हैं...
                  </div>
                ) : studentCopies.length === 0 ? (
                  <div className="py-14 text-center bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <FileText className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      इस छात्र का अभी कोई मूल्यांकन रिकॉर्ड उपलब्ध नहीं है।
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {studentCopies.map((copy) => {
                      const pageCount =
                        Array.isArray(copy.uploadedPages) && copy.uploadedPages.length > 0
                          ? copy.uploadedPages.length
                          : Array.isArray(copy.evalResult?.pages)
                            ? copy.evalResult.pages.length
                            : 0;
                      const hasImages = Array.isArray(copy.uploadedPages) && copy.uploadedPages.length > 0;

                      return (
                        <div
                          key={copy.id}
                          className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs flex items-center justify-between gap-4 hover:border-amber-400 transition-all"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                                {copy.subject || 'GS'}
                              </span>
                              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                {copy.studentName}
                              </p>
                              {hasImages && (
                                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>चेक्ड कॉपी ({pageCount} पृष्ठ)</span>
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">
                              अंक: <strong className="text-emerald-600">{copy.obtained}/{copy.max_marks}</strong> •{' '}
                              {new Date(copy.timestamp).toLocaleString('hi-IN')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => {
                                onInspectStudentCopy(selectedStudentForCopies, copy);
                                onClose();
                              }}
                              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>कॉपी खोलें</span>
                            </button>
                            <button
                              onClick={() => handleDeleteStudentCopy(copy.id)}
                              className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 cursor-pointer"
                              title="यह रिकॉर्ड हटाएं"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* Main Students Directory Table */
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="relative flex-1 min-w-[220px]">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="अभ्यर्थी का नाम या ईमेल खोजें..."
                      className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  {/* Filter Pills */}
                  <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                    {[
                      { id: 'all' as const, label: 'सभी' },
                      { id: 'active' as const, label: 'सक्रिय' },
                      { id: 'quota_full' as const, label: 'कोटा समाप्त' },
                      { id: 'blocked' as const, label: 'ब्लॉक' },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setStudentFilter(f.id)}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          studentFilter === f.id
                            ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleExportStudentsCSV}
                      disabled={students.length === 0}
                      className="px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="सभी पंजीकृत छात्रों का नाम, ईमेल और कोटा डेटा Excel/CSV में डाउनलोड करें"
                    >
                      <Download className="w-3.5 h-3.5 text-indigo-600" />
                      <span>छात्र सूची CSV एक्सपोर्ट</span>
                    </button>

                    <button
                      onClick={fetchStudentsList}
                      disabled={isLoadingStudents}
                      className="px-3 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStudents ? 'animate-spin' : ''}`} />
                      <span>रिफ्रेश</span>
                    </button>
                  </div>
                </div>

                {/* Owner Custom Bulk Quota & Master Rights Bar */}
                <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                      ⚡ बल्क कोटा व अधिकार:
                    </span>
                    <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700">
                      <span className="text-[11px] font-bold text-slate-500">कॉपियाँ:</span>
                      <input
                        type="number"
                        min={0}
                        max={10000}
                        value={bulkCustomQuota}
                        onChange={(e) => setBulkCustomQuota(e.target.value)}
                        className="w-20 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-extrabold text-slate-900 dark:text-white"
                        placeholder="उदा: 50"
                      />
                      <button
                        type="button"
                        onClick={() => handleBulkSetExactQuotaForAllStudents(Number(bulkCustomQuota) || 0)}
                        disabled={isBulkUpdating || students.length === 0}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                        title="सभी छात्रों की कुल कॉपी लिमिट इस संख्या पर फिक्स करें"
                      >
                        सभी की लिमिट सेट करें
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBulkAddQuotaToActiveStudents(Number(bulkCustomQuota) || 0)}
                        disabled={isBulkUpdating || activeCount === 0}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        title="सभी सक्रिय छात्रों के वर्तमान कोटा में इतनी कॉपियाँ जोड़ें"
                      >
                        <Plus className="w-3 h-3" />
                        <span>सभी में जोड़ें</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleBulkResetAllUsedCounts}
                      disabled={isBulkUpdating || students.length === 0}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      title="सभी अकाउंट्स का Used Count 0 पर रीसेट करें"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>सभी का Used 0 करें</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkSetStatusForAllStudents('active')}
                      disabled={isBulkUpdating || students.length === 0}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-bold cursor-pointer disabled:opacity-50"
                    >
                      सभी सक्रिय करें
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkSetStatusForAllStudents('blocked')}
                      disabled={isBulkUpdating || students.length === 0}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold cursor-pointer disabled:opacity-50"
                    >
                      सभी को रोकें
                    </button>
                  </div>
                </div>

                {!isCloudOwnerAuthenticated && (
                  <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="text-xs font-extrabold text-amber-950 dark:text-amber-300">
                        ☁️ लाइव छात्र सूची एवं क्लाउड कोटा सिंक के लिए ओनर Google अकाउंट कनेक्ट करें
                      </p>
                      <p className="text-[11px] text-amber-800 dark:text-amber-400">
                        अभी आप लोकल मोड में हैं। पंजीकृत छात्रों की सूची देखने और क्लाउड नियम सिंक करने हेतु अपने ओनर ईमेल से लॉगिन करें।
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleConnectOwnerCloud}
                      className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold shadow-2xs cursor-pointer shrink-0"
                    >
                      Google ओनर लॉगिन करें
                    </button>
                  </div>
                )}

                {isLoadingStudents ? (
                  <div className="py-16 text-center text-sm text-slate-500 font-semibold animate-pulse">
                    पंजीकृत अभ्यर्थियों की सूची लोड हो रही है...
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <div className="py-14 text-center bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <Users className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      {isCloudOwnerAuthenticated
                        ? 'कोई अभ्यर्थी प्रोफाइल नहीं मिला।'
                        : 'क्लाउड छात्र सूची देखने के लिए ऊपर दिए गए बटन से Google ओनर लॉगिन करें।'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {filteredStudents.map((st) => {
                      const isOwnerRow = st.role === 'owner';
                      const isUpdating = updatingStudentId === st.ownerId;
                      const usagePct =
                        st.quotaLimit > 0 ? Math.min(100, Math.round((st.usedCount / st.quotaLimit) * 100)) : 100;
                      const rowQuotaVal = rowQuotaDrafts[st.ownerId] ?? String(st.quotaLimit ?? 0);
                      const rowUsedVal = rowUsedDrafts[st.ownerId] ?? String(st.usedCount ?? 0);

                      return (
                        <div
                          key={st.ownerId}
                          className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs flex flex-col gap-3"
                        >
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {editingNameId === st.ownerId ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      value={draftNameValue}
                                      onChange={(e) => setDraftNameValue(e.target.value.slice(0, 200))}
                                      className="px-2 py-1 rounded-lg border border-amber-400 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white"
                                      autoFocus
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleSaveStudentName(st)}
                                      disabled={isUpdating}
                                      className="p-1 rounded bg-emerald-600 text-white cursor-pointer"
                                      title="नाम सेव करें"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingNameId(null)}
                                      className="p-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                                      {st.displayName}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingNameId(st.ownerId);
                                        setDraftNameValue(st.displayName);
                                      }}
                                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 cursor-pointer"
                                      title="अभ्यर्थी का नाम एडिट करें"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}

                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${
                                    st.role === 'owner'
                                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                                      : st.role === 'evaluator'
                                        ? 'bg-purple-100 text-purple-800 border-purple-300'
                                        : 'bg-blue-50 text-blue-700 border-blue-200'
                                  }`}
                                >
                                  {st.role === 'owner'
                                    ? '👑 ओनर'
                                    : st.role === 'evaluator'
                                      ? '👨‍🏫 परीक्षक (अनलिमिटेड व बैच अधिकार)'
                                      : '🎓 अभ्यर्थी'}
                                </span>
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${
                                    st.status === 'active'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : 'bg-red-100 text-red-700 border-red-300'
                                  }`}
                                >
                                  {st.status === 'active' ? '● सक्रिय' : '🚫 ब्लॉक'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {st.email} • पंजीकरण: {new Date(st.joinedAt).toLocaleDateString('hi-IN')}
                              </p>
                            </div>

                            {/* Action Buttons (Role, Status, View Copies, Delete) */}
                            <div className="flex flex-wrap items-center gap-2">
                              {!isOwnerRow && (
                                <>
                                  <select
                                    value={st.role}
                                    disabled={isUpdating}
                                    onChange={(e) =>
                                      handleChangeRole(
                                        st,
                                        e.target.value as 'student' | 'evaluator' | 'owner'
                                      )
                                    }
                                    className="px-2.5 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-200 border border-purple-200 dark:border-purple-800 text-xs font-bold cursor-pointer disabled:opacity-50"
                                    title="अधिकार और भूमिका चुनें"
                                  >
                                    <option value="student">🎓 भूमिका: अभ्यर्थी (कोटा अनुसार)</option>
                                    <option value="evaluator">👨‍🏫 भूमिका: परीक्षक (अनलिमिटेड + बंच अधिकार)</option>
                                    <option value="owner">👑 भूमिका: को-ओनर (पूर्ण एडमिन अधिकार)</option>
                                  </select>

                                  <button
                                    onClick={() => handleToggleStatus(st)}
                                    disabled={isUpdating}
                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 border cursor-pointer disabled:opacity-50 ${
                                      st.status === 'active'
                                        ? 'bg-red-50 hover:bg-red-100 text-red-600 border-red-200'
                                        : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                                    }`}
                                  >
                                    <Ban className="w-3 h-3" />
                                    <span>{st.status === 'active' ? 'रोकें' : 'सक्रिय करें'}</span>
                                  </button>

                                  <button
                                    onClick={() => handleDeleteStudent(st)}
                                    disabled={isUpdating}
                                    className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 cursor-pointer disabled:opacity-50"
                                    title="इस छात्र प्रोफाइल को हटाएं"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}

                              <button
                                onClick={() => handleViewStudentCopies(st)}
                                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5 text-amber-400" />
                                <span>कॉपियाँ देखें</span>
                              </button>
                            </div>
                          </div>

                          {/* Direct Custom Quota Limit & Used Count Control Strip (Available for ALL rows including Owner) */}
                          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-700/70 flex flex-wrap items-center justify-between gap-2.5">
                            {/* Visual Progress Pill */}
                            <div className="w-40 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                              <div className="flex justify-between text-[11px] font-bold mb-1">
                                <span className="text-slate-500">कोटा स्थिति:</span>
                                <span className="text-slate-900 dark:text-white font-extrabold">
                                  {st.usedCount} / {st.quotaLimit}
                                </span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    usagePct >= 90 ? 'bg-red-500' : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${usagePct}%` }}
                                />
                              </div>
                            </div>

                            {/* Direct Editable Inputs for Used Count & Quota Limit */}
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                                <span className="text-[11px] font-bold text-slate-500">जाँची गई:</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={100000}
                                  value={rowUsedVal}
                                  onChange={(e) =>
                                    setRowUsedDrafts((prev) => ({ ...prev, [st.ownerId]: e.target.value }))
                                  }
                                  className="w-14 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-extrabold text-center text-slate-900 dark:text-white"
                                />
                                <span className="text-xs font-bold text-slate-400">/</span>
                                <span className="text-[11px] font-bold text-slate-500">लिमिट:</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={10000}
                                  value={rowQuotaVal}
                                  onChange={(e) =>
                                    setRowQuotaDrafts((prev) => ({ ...prev, [st.ownerId]: e.target.value }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleSetExactQuotaAndUsed(st);
                                    }
                                  }}
                                  className="w-20 px-1.5 py-0.5 rounded border border-indigo-300 dark:border-indigo-600 bg-white dark:bg-slate-800 text-xs font-extrabold text-center text-indigo-700 dark:text-indigo-300"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSetExactQuotaAndUsed(st)}
                                  disabled={isUpdating}
                                  className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-extrabold cursor-pointer disabled:opacity-50"
                                  title="यह कस्टम कोटा लिमिट और उपयोग संख्या लागू करें"
                                >
                                  सेट करें
                                </button>
                              </div>

                              {/* Quick Preset Chips & +10 / +50 / Reset */}
                              <div className="flex flex-wrap items-center gap-1">
                                {[2, 5, 10, 25, 50, 100, 500, 10000].map((preset) => (
                                  <button
                                    key={preset}
                                    type="button"
                                    onClick={() => handleSetExactQuotaAndUsed(st, preset, st.usedCount)}
                                    disabled={isUpdating}
                                    className={`px-2 py-1 rounded-md text-[10px] font-extrabold border transition-all cursor-pointer disabled:opacity-50 ${
                                      st.quotaLimit === preset
                                        ? 'bg-amber-500 text-slate-950 border-amber-500'
                                        : 'bg-white dark:bg-slate-900 hover:bg-amber-50 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                    }`}
                                    title={`कुल लिमिट सीधे ${preset} सेट करें`}
                                  >
                                    {preset === 10000 ? '∞ (10000)' : preset}
                                  </button>
                                ))}

                                <button
                                  onClick={() => handleAdjustQuota(st, 10, false)}
                                  disabled={isUpdating}
                                  className="px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-bold flex items-center gap-0.5 cursor-pointer disabled:opacity-50"
                                  title="वर्तमान कोटा में +10 कॉपियाँ जोड़ें"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>10</span>
                                </button>
                                <button
                                  onClick={() => handleAdjustQuota(st, 50, false)}
                                  disabled={isUpdating}
                                  className="px-2 py-1 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold flex items-center gap-0.5 cursor-pointer disabled:opacity-50"
                                  title="वर्तमान कोटा में +50 कॉपियाँ जोड़ें"
                                >
                                  <Sparkles className="w-3 h-3" />
                                  <span>+50</span>
                                </button>
                                <button
                                  onClick={() => handleAdjustQuota(st, 0, true)}
                                  disabled={isUpdating}
                                  className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                  title="उपयोग काउंटर (Used Count) को 0 पर रीसेट करें"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>0 रीसेट</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )
          ) : activeTab === 'payments' ? (
            /* Owner Payment & UTR Verification Panel */
            <div className="space-y-4">
              {/* Master Switch Card: Auto-Approve vs Manual 1-Click Approve */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-800 border-2 border-indigo-200 dark:border-indigo-800 shadow-2xs space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      <span>मास्टर पेमेंट कोटा स्विच (Auto-Approve बनाम Manual 1-Click Approve)</span>
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      यह स्विच पूरी तरह आपके हाथ में है—आप जब चाहें ऑटो-अप्रूवल या मैनुअल 1-Click अप्रूवल चुन सकते हैं।
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={fetchQuotaRequestsList}
                    disabled={isLoadingRequests}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRequests ? 'animate-spin' : ''}`} />
                    <span>लिस्ट रिफ्रेश करें</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleTogglePaymentApprovalMode('auto')}
                    className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
                      (draftPolicy.paymentApprovalMode ?? 'auto') === 'auto'
                        ? 'bg-emerald-50/80 dark:bg-emerald-950/50 border-emerald-600 dark:border-emerald-400 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-emerald-600" />
                        <span>⚡ Auto-Approve (तुरंत कोटा दें)</span>
                      </span>
                      {(draftPolicy.paymentApprovalMode ?? 'auto') === 'auto' && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black">
                          सक्रिय (Active)
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                      छात्र जैसे ही QR स्कैन करके वैध <strong>12-अंकीय UTR नंबर</strong> डालेगा, उसे तुरंत अतिरिक्त कॉपियाँ मिल जाएंगी (रात में भी बिना इंतज़ार के)। बाद में आप किसी भी गलत UTR को 1-Click में Reject करके कोटा वापस ले सकते हैं।
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTogglePaymentApprovalMode('manual')}
                    className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
                      draftPolicy.paymentApprovalMode === 'manual'
                        ? 'bg-amber-50/80 dark:bg-amber-950/50 border-amber-500 dark:border-amber-400 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-amber-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-amber-950 dark:text-amber-300 flex items-center gap-1.5">
                        <Shield className="w-4 h-4 text-amber-600" />
                        <span>🛡️ Manual 1-Click Approve (ओनर वेरिफिकेशन)</span>
                      </span>
                      {draftPolicy.paymentApprovalMode === 'manual' && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black">
                          सक्रिय (Active)
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                      छात्र का 12-अंकीय UTR यहाँ <strong>Pending</strong> सूची में आएगा। जब आप अपने बैंक/UPI ऐप में राशि देखकर नीचे <strong>"✅ Approve"</strong> दबाएंगे, तभी कोटा जुड़ेगा।
                    </p>
                  </button>
                </div>
              </div>

              {/* Submitted UPI / UTR Requests List */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
                  <div>
                    <h4 className="text-sm font-black text-slate-900 dark:text-white">
                      अभ्यर्थियों के UPI / UTR कोटा अपग्रेड ट्रांजेक्शन ({quotaRequests.length})
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      प्रत्येक 12-अंकीय UTR का विवरण देखें और 1-Click में कोटा अप्रूव या अस्वीकृत करें।
                    </p>
                  </div>
                </div>

                {isLoadingRequests ? (
                  <div className="py-12 text-center text-xs font-bold text-slate-500 animate-pulse">
                    पेमेंट व UTR रिकॉर्ड लोड हो रहे हैं...
                  </div>
                ) : quotaRequests.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-500">
                    अभी तक कोई UPI / UTR कोटा अपग्रेड रिक्वेस्ट सबमिट नहीं हुई है।
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {quotaRequests.map((req) => {
                      const isProcessing = processingRequestId === req.requestId;
                      return (
                        <div
                          key={req.requestId}
                          className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-black text-slate-900 dark:text-white">
                                {req.studentName}
                              </span>
                              <span className="text-xs text-slate-500">({req.studentEmail})</span>
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${
                                  req.status === 'auto_approved' || req.status === 'approved'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300'
                                    : req.status === 'rejected'
                                      ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300'
                                      : 'bg-amber-100 text-amber-900 border-amber-300'
                                }`}
                              >
                                {req.status === 'auto_approved'
                                  ? '⚡ Auto-Approved (कोटा जुड़ चुका है)'
                                  : req.status === 'approved'
                                    ? '✅ Approved (कोटा जुड़ चुका है)'
                                    : req.status === 'rejected'
                                      ? '🚫 Rejected (कोटा हटाया गया)'
                                      : '⏳ Pending (अप्रूवल की प्रतीक्षा)'}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-xs">
                              <span className="font-extrabold text-indigo-700 dark:text-indigo-300">
                                पैक: +{req.copiesRequested} कॉपियाँ (₹{req.amountInr})
                              </span>
                              <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-black text-slate-900 dark:text-white">
                                UTR: {req.utrNumber}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {new Date(req.createdAt).toLocaleString('hi-IN')}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {(req.status === 'pending' || req.status === 'rejected') && (
                              <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => handleProcessRequest(req, 'approved')}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Approve (+{req.copiesRequested} कोटा दें)</span>
                              </button>
                            )}

                            {req.status !== 'rejected' && (
                              <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => handleProcessRequest(req, 'rejected')}
                                className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                <span>
                                  {req.status === 'pending'
                                    ? 'Reject करें'
                                    : `Reject (-${req.copiesRequested} कोटा वापस लें)`}
                                </span>
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => handleDeleteRequest(req)}
                              className="p-1.5 rounded-lg bg-slate-200/70 dark:bg-slate-800 hover:bg-rose-100 text-slate-500 hover:text-rose-600 cursor-pointer disabled:opacity-50"
                              title="यह रिकॉर्ड हटाएं"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'policy' ? (
            /* Platform Rules, Coaching Branding & Retention Policy Tab */
            <div className="max-w-2xl mx-auto space-y-5 bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              {/* Public Student Portal Link & Mobile Home Screen Guide */}
              {(() => {
                const publicPortalUrl =
                  typeof window !== 'undefined'
                    ? window.location.origin.replace('https://ais-dev-', 'https://ais-pre-')
                    : 'https://ais-pre-e6kge55l7f2bssaukqplpe-151979150920.asia-southeast1.run.app';
                const isCurrentlyOnDevUrl =
                  typeof window !== 'undefined' && window.location.origin.includes('ais-dev-');

                return (
                  <div className="p-4 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/70 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-600 dark:text-amber-400" />
                        <span>आधिकारिक पब्लिक स्टूडेंट पोर्टल लिंक (Public Shared URL)</span>
                      </h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-900">
                        100% Mobile Ready
                      </span>
                    </div>

                    {isCurrentlyOnDevUrl && (
                      <p className="text-[11px] font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 p-2 rounded-lg border border-rose-200 dark:border-rose-800">
                        ⚠️ ध्यान दें: `ais-dev` लिंक केवल डेवलपर प्रिव्यू के लिए होता है (इसे फोन की होम स्क्रीन पर सेव करने से "Could not open app" आता है)। अपने फोन और छात्रों के लिए हमेशा नीचे दिया गया **`ais-pre` (Public Link)** ही खोलें और सेव करें:
                      </p>
                    )}

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                      <span className="text-xs font-mono font-bold text-indigo-700 dark:text-indigo-300 select-all break-all">
                        {publicPortalUrl}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(publicPortalUrl);
                            showToast('✓ पब्लिक स्टूडेंट पोर्टल लिंक कॉपी हो गया!');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold cursor-pointer"
                        >
                          लिंक कॉपी करें
                        </button>
                        <a
                          href={publicPortalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-400 text-xs font-extrabold"
                        >
                          खोलें ↗
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Coaching Branding Section (Viral Marketing on PDF & WhatsApp Reports) */}
              <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-600" />
                    <span>संस्थान ब्रांडिंग एवं वॉटरमार्क (PDF कॉपी व रिपोर्ट ब्रांडिंग)</span>
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-200/80 text-amber-950">
                    Zero Token • Free Marketing
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  छात्र जब भी अपनी चेक्ड कॉपी (PDF) डाउनलोड करेंगे या WhatsApp पर रिपोर्ट शेयर करेंगे, तो हर पृष्ठ और स्कोरकार्ड पर आपके संस्थान का नाम व टैगलाइन छपकर जाएगी।
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      संस्थान / कोचिंग का नाम (Institute Name)
                    </label>
                    <input
                      type="text"
                      value={draftPolicy.instituteName ?? DEFAULT_PLATFORM_POLICY.instituteName ?? ''}
                      onChange={(e) =>
                        setDraftPolicy({
                          ...draftPolicy,
                          instituteName: e.target.value.slice(0, 120),
                        })
                      }
                      placeholder="उदा: लक्ष्य IAS मुख्य परीक्षा टेस्ट सीरीज़"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      टैगलाइन / वेबसाइट / टेलीग्राम (Tagline / Contact)
                    </label>
                    <input
                      type="text"
                      value={draftPolicy.instituteTagline ?? DEFAULT_PLATFORM_POLICY.instituteTagline ?? ''}
                      onChange={(e) =>
                        setDraftPolicy({
                          ...draftPolicy,
                          instituteTagline: e.target.value.slice(0, 200),
                        })
                      }
                      placeholder="उदा: आधिकारिक 4-स्तंभीय उत्तर-पुस्तिका मूल्यांकन पोर्टल"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>
              </div>

              {/* UPI & WhatsApp Quota Upgrade Configuration */}
              <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>UPI एवं WhatsApp कोटा अपग्रेड सेटिंग्स (Student Quota Upgrade)</span>
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-200/80 text-emerald-950">
                    Direct UPI + WhatsApp
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  जब किसी छात्र का प्रारंभिक कोटा समाप्त होगा या वह <strong>+कोटा</strong> पर क्लिक करेगा, तो उसे आपका यह UPI ID, प्लान और 1-Click WhatsApp बटन दिखाई देगा।
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      आपकी UPI ID (GPay/PhonePe)
                    </label>
                    <input
                      type="text"
                      value={draftPolicy.ownerUpiId ?? DEFAULT_PLATFORM_POLICY.ownerUpiId ?? ''}
                      onChange={(e) =>
                        setDraftPolicy({
                          ...draftPolicy,
                          ownerUpiId: e.target.value.slice(0, 100),
                        })
                      }
                      placeholder="उदा: 9554jitendrakumar@upi"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      WhatsApp नंबर (10 अंक)
                    </label>
                    <input
                      type="text"
                      value={draftPolicy.ownerWhatsappNumber ?? ''}
                      onChange={(e) =>
                        setDraftPolicy({
                          ...draftPolicy,
                          ownerWhatsappNumber: e.target.value.replace(/[^0-9+]/g, '').slice(0, 20),
                        })
                      }
                      placeholder="उदा: 919554000000"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      कोटा पैक (कॉपियाँ:रुपये)
                    </label>
                    <input
                      type="text"
                      value={draftPolicy.quotaPlanSummary ?? DEFAULT_PLATFORM_POLICY.quotaPlanSummary ?? '10:99,25:199,60:399'}
                      onChange={(e) =>
                        setDraftPolicy({
                          ...draftPolicy,
                          quotaPlanSummary: e.target.value.slice(0, 200),
                        })
                      }
                      placeholder="10:99,25:199,60:399"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="border-b border-slate-100 dark:border-slate-700 pb-3 pt-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span>प्लेटफॉर्म नियम, प्रारंभिक कोटा एवं ऑटो-डेटा रिटेंशन</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  यहाँ निर्धारित नियम पोर्टल पर जुड़ने वाले सभी अभ्यर्थियों पर स्वतः लागू होंगे।
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    नए अभ्यर्थी का डिफ़ॉल्ट कॉपी कोटा (0–10000 जितनी चाहें)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      value={draftPolicy.defaultStudentQuota}
                      onChange={(e) =>
                        setDraftPolicy({
                          ...draftPolicy,
                          defaultStudentQuota: Math.max(0, Math.min(10000, Number(e.target.value) || 0)),
                        })
                      }
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {[1, 2, 5, 10, 25, 50, 100, 500, 1000, 10000].map((qVal) => (
                      <button
                        key={qVal}
                        type="button"
                        onClick={() => setDraftPolicy({ ...draftPolicy, defaultStudentQuota: qVal })}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                          draftPolicy.defaultStudentQuota === qVal
                            ? 'bg-amber-500 text-slate-950 border-amber-500'
                            : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {qVal === 10000 ? '∞ (10000)' : `${qVal} कॉपियाँ`}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    क्लाउड डेटा रिटेंशन अवधि (Auto-Cleanup)
                  </label>
                  <select
                    value={draftPolicy.retentionDays}
                    onChange={(e) =>
                      setDraftPolicy({
                        ...draftPolicy,
                        retentionDays: Number(e.target.value) || 30,
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-bold text-slate-900 dark:text-white"
                  >
                    <option value={15}>15 दिन (हाई-स्पीड बैच मोड)</option>
                    <option value={30}>30 दिन (1 महीना - अनुशंसित)</option>
                    <option value={90}>90 दिन (3 महीने - टेस्ट सीरीज़)</option>
                    <option value={180}>180 दिन (6 महीने)</option>
                    <option value={365}>365 दिन (1 वर्ष)</option>
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    निर्धारित दिनों से पुरानी कॉपियाँ स्वतः क्लीन हो जाती हैं जिससे क्लाउड स्टोरेज हमेशा खाली रहता है।
                  </p>
                </div>
              </div>

              {/* Per-Question Max Pages Limit (Token Protection) */}
              <div className="p-4 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/25 border border-indigo-200 dark:border-indigo-800/60 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    <span>ग्लोबल प्रति कॉपी अधिकतम पृष्ठ सीमा (Token Safety & Page Guard)</span>
                  </h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-900">
                    टोकन सुरक्षा सक्रिय
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  कोई भी छात्र 1 कॉपी के नाम पर बड़ी PDF अपलोड करके आपके टोकन खर्च न कर सके, इसके लिए प्रति कॉपी ग्लोबल अधिकतम पृष्ठ सीमा:
                </p>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    प्रति उत्तर-पुस्तिका अधिकतम पृष्ठ (डिफ़ॉल्ट: 4 पृष्ठ)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={draftPolicy.maxPages10Marker ?? 4}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(15, Number(e.target.value) || 4));
                      setDraftPolicy({
                        ...draftPolicy,
                        maxPages10Marker: val,
                        maxPages15Marker: val,
                      });
                    }}
                    className="w-full sm:w-64 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    {draftPolicy.allowStudentUploads ? (
                      <Unlock className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Lock className="w-4 h-4 text-red-600" />
                    )}
                    <span>अभ्यर्थियों द्वारा नई कॉपी मूल्यांकन की अनुमति</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    बंद करने पर छात्र केवल अपनी पुरानी जाँची गई कॉपियाँ व स्कोरकार्ड देख सकेंगे।
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDraftPolicy({
                      ...draftPolicy,
                      allowStudentUploads: !draftPolicy.allowStudentUploads,
                    })
                  }
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                    draftPolicy.allowStudentUploads
                      ? 'bg-emerald-600 text-white'
                      : 'bg-red-600 text-white'
                  }`}
                >
                  {draftPolicy.allowStudentUploads ? 'चालू (Active)' : 'रोका गया (Paused)'}
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    स्टूडेंट पोर्टल सूचना बैनर (Student Dashboard Notice)
                  </label>
                  {draftPolicy.platformBanner && (
                    <button
                      type="button"
                      onClick={() => setDraftPolicy({ ...draftPolicy, platformBanner: '' })}
                      className="text-[10px] font-bold text-red-600 hover:underline cursor-pointer"
                    >
                      सूचना हटाएं
                    </button>
                  )}
                </div>
                <textarea
                  rows={2}
                  value={draftPolicy.platformBanner}
                  onChange={(e) =>
                    setDraftPolicy({
                      ...draftPolicy,
                      platformBanner: e.target.value.slice(0, 500),
                    })
                  }
                  placeholder="छात्रों के डैशबोर्ड पर शीर्ष पर दिखने वाली महत्वपूर्ण सूचना..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDraftPolicy({
                        ...draftPolicy,
                        platformBanner:
                          '📢 मुख्य परीक्षा उत्तर-पुस्तिका मूल्यांकन पोर्टल सक्रिय है। कृपया साफ व पठनीय PDF/इमेज अपलोड करें एवं मूल्यांकन के बाद अपनी चेक्ड कॉपी डाउनलोड कर लें।',
                      })
                    }
                    className="text-[10px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                  >
                    + मानक परीक्षा निर्देश टेम्पलेट
                  </button>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleSavePolicySubmit}
                  disabled={isSavingPolicy}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSavingPolicy ? 'सहेजा जा रहा है...' : '✓ ब्रांडिंग व प्लेटफॉर्म नियम सहेजें'}
                </button>
              </div>
            </div>
          ) : (
            <FounderCommandCenterTab
              mode={activeTab === 'economics' ? 'economics' : 'ops'}
              ownerUid={ownerUid}
              students={students}
              quotaRequests={quotaRequests}
              platformPolicy={platformPolicy}
              onPolicyUpdated={onPolicyUpdated}
              onRefreshData={() => {
                fetchStudentsList();
                fetchQuotaRequestsList();
              }}
              showToast={showToast}
            />
          )}
        </div>
      </div>
    </div>
  );
};
