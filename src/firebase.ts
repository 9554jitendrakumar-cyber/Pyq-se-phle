import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  setLogLevel,
  disableNetwork,
  enableNetwork
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Silence internal @firebase/firestore console.error spam (such as free-tier resource-exhausted backoff logs)
// while keeping structured application-level error handling intact.
try {
  setLogLevel('silent');
} catch {
  // Ignore if log level setting fails
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const SUPER_ADMIN_EMAILS = [
  '9554jitendrakumar@gmail.com',
  'jkkbhu1995@gmail.com',
] as const;
export const SUPER_ADMIN_EMAIL = SUPER_ADMIN_EMAILS[0];

export function isSuperAdminEmailString(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  return SUPER_ADMIN_EMAILS.some((allowed) => allowed.toLowerCase() === normalized);
}

export function getFirebaseSystemInfo() {
  return {
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
    firestoreDatabaseId: firebaseConfig.firestoreDatabaseId,
    storageBucket: firebaseConfig.storageBucket,
    superAdminEmails: [...SUPER_ADMIN_EMAILS],
    currentUserEmail: auth.currentUser?.email || null,
    currentUserVerified: Boolean(auth.currentUser?.emailVerified),
    firebaseConsoleUrl: `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${firebaseConfig.firestoreDatabaseId}/data`,
    collections: [
      {
        path: '/platform_settings/global',
        purpose: 'संस्थान ब्रांडिंग, डिफ़ॉल्ट छात्र कोटा, पेमेंट मोड (Auto/Manual) व UPI ID',
        ownerAccess: 'Read / Write / Delete',
        studentAccess: 'Read Only',
      },
      {
        path: '/student_profiles/{userId}',
        purpose: 'पंजीकृत छात्रों व परीक्षकों का रोल, स्टेटस, कोटा लिमिट और उपयोग गिनती',
        ownerAccess: 'All Profiles (List/Edit/Delete)',
        studentAccess: 'Own Profile Only (+1 Usage / Top-Up)',
      },
      {
        path: '/quota_requests/{requestId}',
        purpose: 'UPI पेमेंट एवं 12-अंकीय UTR कोटा अपग्रेड अनुरोध',
        ownerAccess: 'All Requests (Approve/Reject/Delete)',
        studentAccess: 'Own Requests (Create/View)',
      },
      {
        path: '/user_configs/{userId}',
        purpose: 'प्रॉम्प्ट स्लॉट्स (1–5), AI मॉडल सेटिंग्स व रूब्रिक नियम',
        ownerAccess: 'Full Access (All Users)',
        studentAccess: 'Own Config Only',
      },
      {
        path: '/user_configs/{userId}/evaluations/{evalId}',
        purpose: 'मूल्यांकित कॉपी स्कोरकार्ड, लाल-पेन टिप्पणियाँ और कंप्रेस्ड पृष्ठ',
        ownerAccess: 'Inspect / Edit / Delete All Copies',
        studentAccess: 'Own Copies Only',
      },
      {
        path: '/user_configs/{userId}/learning_logs/{logId}',
        purpose: 'मानव परीक्षक सुधार एवं AI लर्निंग डेटाबेस लॉग्स',
        ownerAccess: 'Full Access',
        studentAccess: 'Own Logs Only',
      },
      {
        path: '/feedback/{feedbackId}',
        purpose: 'मूल्यांकन सुझावों पर छात्रों द्वारा भेजे गए फीडबैक',
        ownerAccess: 'View / Manage All',
        studentAccess: 'Own Feedback Only',
      },
      {
        path: '/admins/{adminUid}',
        purpose: 'अतिरिक्त विश्वसनीय एडमिन रजिस्ट्री (केवल सुपर-एडमिन द्वारा प्रबंधित)',
        ownerAccess: 'Full Control (Super Admin Only)',
        studentAccess: 'No Access',
      },
    ],
  };
}

// ============================================================================
// FIRESTORE WRITE QUOTA CIRCUIT BREAKER, RATE LIMITER & DEDUPLICATION FIREWALL
// ============================================================================
const QUOTA_CIRCUIT_STORAGE_KEY = 'upsc_firestore_quota_exhausted_at';
const QUOTA_COOLDOWN_MS = 60 * 60 * 1000; // Pause cloud writes for 1 hour once daily free write quota is hit
const MAX_WRITES_PER_MINUTE = 10;
const MAX_WRITES_PER_SESSION = 80;
let memoryQuotaExhaustedUntil = 0;
let sessionTotalWriteCount = 0;
const recentWriteTimestamps: number[] = [];
const lastWrittenSignatureByPath = new Map<string, string>();
const sessionVerifiedProfiles = new Set<string>();

function fastSignatureHash(str: string): string {
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(36)}_${(h1 >>> 0).toString(36)}_${str.length}`;
}

export function isFirestoreQuotaExhausted(): boolean {
  const now = Date.now();
  if (memoryQuotaExhaustedUntil > now) {
    return true;
  }
  try {
    const raw = sessionStorage.getItem(QUOTA_CIRCUIT_STORAGE_KEY);
    if (raw) {
      const ts = Number(raw);
      if (Number.isFinite(ts) && now - ts < QUOTA_COOLDOWN_MS) {
        memoryQuotaExhaustedUntil = ts + QUOTA_COOLDOWN_MS;
        return true;
      }
      sessionStorage.removeItem(QUOTA_CIRCUIT_STORAGE_KEY);
    }
  } catch {
    // Ignore sessionStorage errors
  }
  return false;
}

export function markFirestoreQuotaExhausted(): void {
  const now = Date.now();
  memoryQuotaExhaustedUntil = now + QUOTA_COOLDOWN_MS;
  try {
    sessionStorage.setItem(QUOTA_CIRCUIT_STORAGE_KEY, String(now));
  } catch {
    // Ignore storage errors
  }
  // Immediately halt Firestore SDK background write retry loop so it does not spam backoff errors
  try {
    disableNetwork(db).catch(() => {});
  } catch {
    // Ignore
  }
}

export function getFirestoreFirewallStats() {
  const now = Date.now();
  while (recentWriteTimestamps.length > 0 && now - recentWriteTimestamps[0] > 60000) {
    recentWriteTimestamps.shift();
  }
  const circuitOpen = isFirestoreQuotaExhausted();
  return {
    sessionWritesUsed: sessionTotalWriteCount,
    maxSessionWrites: MAX_WRITES_PER_SESSION,
    writesLastMinute: recentWriteTimestamps.length,
    maxWritesPerMinute: MAX_WRITES_PER_MINUTE,
    cachedSignaturesCount: lastWrittenSignatureByPath.size,
    circuitBreakerActive: circuitOpen,
    dailyFreeWriteQuota: 20000,
    dailyFreeReadQuota: 50000
  };
}

export async function resetFirestoreWriteFirewall(): Promise<void> {
  memoryQuotaExhaustedUntil = 0;
  sessionTotalWriteCount = 0;
  recentWriteTimestamps.length = 0;
  lastWrittenSignatureByPath.clear();
  try {
    sessionStorage.removeItem(QUOTA_CIRCUIT_STORAGE_KEY);
  } catch {
    // Ignore
  }
  try {
    await enableNetwork(db);
  } catch {
    // Ignore
  }
}

export function isQuotaOrTransientFirestoreError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || '');
  const code = (error as any)?.code ? String((error as any).code) : '';
  const combined = `${code} ${msg}`.toLowerCase();
  return (
    combined.includes('resource-exhausted') ||
    combined.includes('quota limit exceeded') ||
    combined.includes('quota exceeded') ||
    combined.includes('maximum backoff delay') ||
    combined.includes('client is offline') ||
    combined.includes('unavailable')
  );
}

function shouldSkipDuplicateWrite(path: string, payload: Record<string, any>): boolean {
  if (isFirestoreQuotaExhausted()) return true;

  // 1. Check payload deduplication (both in-memory and sessionStorage across page reloads)
  try {
    const { updatedAt, ...comparable } = payload;
    const rawJson = JSON.stringify(comparable);
    const sigHash = fastSignatureHash(rawJson);
    const storageKey = `upsc_fs_sig_${path}`;
    if (lastWrittenSignatureByPath.get(path) === sigHash) {
      return true;
    }
    try {
      if (sessionStorage.getItem(storageKey) === sigHash) {
        lastWrittenSignatureByPath.set(path, sigHash);
        return true;
      }
    } catch {
      // Ignore sessionStorage read error
    }

    // 2. Enforce hard sliding-window rate limit (Max 10 writes/min, Max 80 writes/session)
    const now = Date.now();
    while (recentWriteTimestamps.length > 0 && now - recentWriteTimestamps[0] > 60000) {
      recentWriteTimestamps.shift();
    }
    if (recentWriteTimestamps.length >= MAX_WRITES_PER_MINUTE || sessionTotalWriteCount >= MAX_WRITES_PER_SESSION) {
      console.warn(`[Firestore Firewall] Write rate limit reached (${recentWriteTimestamps.length}/min, ${sessionTotalWriteCount}/session). Skipping cloud write to ${path}.`);
      return true;
    }

    recentWriteTimestamps.push(now);
    sessionTotalWriteCount += 1;
    lastWrittenSignatureByPath.set(path, sigHash);
    try {
      sessionStorage.setItem(storageKey, sigHash);
    } catch {
      // Ignore sessionStorage write error
    }
  } catch {
    // Ignore serialization issues
  }
  return false;
}

export function isSuperAdminUser(user: User | null | undefined): boolean {
  return Boolean(user && isSuperAdminEmailString(user.email));
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  if (isQuotaOrTransientFirestoreError(error)) {
    markFirestoreQuotaExhausted();
  }
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate Connection to Firestore on boot
async function testConnection() {
  if (isFirestoreQuotaExhausted()) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (isQuotaOrTransientFirestoreError(error)) {
      if (String(error).toLowerCase().includes('resource-exhausted') || String(error).toLowerCase().includes('quota')) {
        markFirestoreQuotaExhausted();
      }
      return;
    }
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

// Sanitize ID to match ^[a-zA-Z0-9_\-]+$ and length <= 128
export function sanitizeFirestoreId(rawId: string): string {
  const cleaned = String(rawId || 'doc')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : `doc_${Date.now()}`;
}

// Deep strip undefined values and keep document size well under Firestore's 1MB limit
export function sanitizeForFirestoreMap(obj: any, maxDepth = 7, currentDepth = 0): any {
  if (currentDepth > maxDepth) return null;
  if (obj === null || obj === undefined) return null;
  if (typeof obj === 'number') return Number.isFinite(obj) ? obj : 0;
  if (typeof obj === 'boolean') return obj;
  if (typeof obj === 'string') {
    if (obj.startsWith('data:image/') && obj.length > 260000) {
      return obj.slice(0, 260000);
    }
    return obj.slice(0, 260000);
  }
  if (Array.isArray(obj)) {
    return obj.slice(0, 60).map((item) => sanitizeForFirestoreMap(item, maxDepth, currentDepth + 1));
  }
  if (typeof obj === 'object') {
    const out: Record<string, any> = {};
    const keys = Object.keys(obj).slice(0, 45);
    for (const k of keys) {
      if (k === 'file') continue;
      const val = obj[k];
      if (val !== undefined && typeof val !== 'function') {
        out[k] = sanitizeForFirestoreMap(val, maxDepth, currentDepth + 1);
      }
    }
    return out;
  }
  return String(obj);
}

/**
 * Compresses answer sheet pages into lightweight JPEG dataUrls so that all pages of an evaluated copy
 * fit comfortably inside a single Firestore document (< 650KB total) and can be viewed on any device by Owner & Student.
 */
export async function compressPagesForCloud(
  pages: Array<{ id?: string; name?: string; dataUrl?: string; imageUrl?: string; pageNumber?: number }>
): Promise<Array<{ id: string; name: string; dataUrl: string; pageNumber: number }>> {
  if (!Array.isArray(pages) || pages.length === 0) return [];
  const sliced = pages.slice(0, 12);
  const maxTotalChars = 640000; // ~640KB safe budget inside 1MB Firestore document
  const perPageBudget = Math.floor(maxTotalChars / sliced.length);

  const compressSingle = (
    rawUrl: string,
    targetWidth: number,
    quality: number
  ): Promise<string> =>
    new Promise((resolve) => {
      if (!rawUrl || rawUrl.startsWith('MOCK_') || typeof document === 'undefined') {
        resolve(rawUrl || '');
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          const w = img.naturalWidth || img.width || 800;
          const h = img.naturalHeight || img.height || 1131;
          const scale = Math.min(1, targetWidth / w);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(w * scale));
          canvas.height = Math.max(1, Math.round(h * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(rawUrl.length <= perPageBudget ? rawUrl : '');
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          let out = canvas.toDataURL('image/jpeg', quality);
          if (out.length > perPageBudget) {
            out = canvas.toDataURL('image/jpeg', Math.max(0.32, quality - 0.18));
          }
          if (out.length > perPageBudget) {
            // Downscale further if still above per-page budget
            const smallerCanvas = document.createElement('canvas');
            smallerCanvas.width = Math.max(1, Math.round(canvas.width * 0.72));
            smallerCanvas.height = Math.max(1, Math.round(canvas.height * 0.72));
            const sCtx = smallerCanvas.getContext('2d');
            if (sCtx) {
              sCtx.fillStyle = '#ffffff';
              sCtx.fillRect(0, 0, smallerCanvas.width, smallerCanvas.height);
              sCtx.drawImage(canvas, 0, 0, smallerCanvas.width, smallerCanvas.height);
              out = smallerCanvas.toDataURL('image/jpeg', 0.42);
            }
          }
          resolve(out.length <= 250000 ? out : '');
        } catch {
          resolve('');
        }
      };
      img.onerror = () => resolve('');
      img.src = rawUrl;
    });

  const baseWidth = sliced.length <= 3 ? 820 : sliced.length <= 5 ? 680 : 560;
  const baseQuality = sliced.length <= 3 ? 0.58 : sliced.length <= 5 ? 0.50 : 0.44;

  const results: Array<{ id: string; name: string; dataUrl: string; pageNumber: number }> = [];
  for (let i = 0; i < sliced.length; i++) {
    const p = sliced[i];
    const src = p.dataUrl || p.imageUrl || '';
    const compressedUrl = await compressSingle(src, baseWidth, baseQuality);
    if (compressedUrl) {
      results.push({
        id: String(p.id || `page-${i + 1}`),
        name: String(p.name || `Page ${i + 1}`).slice(0, 120),
        dataUrl: compressedUrl,
        pageNumber: Number(p.pageNumber) || i + 1,
      });
    }
  }
  return results;
}

let activeGoogleSignInPromise: Promise<User | null> | null = null;

// Sign in with Google Popup (always prompts account selection so users can switch accounts easily)
export async function signInWithGoogle(forceAccountPicker = true): Promise<User | null> {
  if (activeGoogleSignInPromise) {
    return activeGoogleSignInPromise;
  }

  activeGoogleSignInPromise = (async () => {
    try {
      if (forceAccountPicker) {
        googleProvider.setCustomParameters({ prompt: 'select_account' });
      }
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    } catch (err: any) {
      const code = String(err?.code || '');
      const msg = String(err?.message || '');
      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request' ||
        msg.includes('auth/popup-closed-by-user') ||
        msg.includes('auth/cancelled-popup-request')
      ) {
        // In some cross-origin iframe environments, the popup closes right as auth succeeds
        if (auth.currentUser) {
          return auth.currentUser;
        }
        return null;
      }
      throw err;
    } finally {
      activeGoogleSignInPromise = null;
    }
  })();

  return activeGoogleSignInPromise;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export { onAuthStateChanged };
export type { User };

// ============================================================================
// PLATFORM POLICY & RETENTION RULES (/platform_settings/global)
// ============================================================================
export interface PlatformPolicyConfig {
  defaultStudentQuota: number;
  retentionDays: number;
  allowStudentUploads: boolean;
  platformBanner: string;
  instituteName?: string;
  instituteTagline?: string;
  maxPages10Marker?: number;
  maxPages15Marker?: number;
  ownerWhatsappNumber?: string;
  ownerUpiId?: string;
  quotaPlanSummary?: string;
  paymentApprovalMode?: 'auto' | 'manual';
}

export const DEFAULT_PLATFORM_POLICY: PlatformPolicyConfig = {
  defaultStudentQuota: 2,
  retentionDays: 180,
  allowStudentUploads: true,
  platformBanner: 'UPSC Mains AI Evaluation Portal: प्रत्येक छात्र का मूल्यांकन डेटा प्लेटफॉर्म नियमों के अनुसार क्लाउड पर सुरक्षित रहता है।',
  instituteName: 'UPSC मुख्य परीक्षा मूल्यांकन पोर्टल',
  instituteTagline: 'आधिकारिक 4-स्तंभीय उत्तर-पुस्तिका जाँच एवं विस्तृत स्कोरकार्ड प्रणाली',
  maxPages10Marker: 4,
  maxPages15Marker: 4,
  ownerWhatsappNumber: '',
  ownerUpiId: '9554jitendrakumar@upi',
  quotaPlanSummary: '10:99,25:199,60:399',
  paymentApprovalMode: 'auto',
};

export function getMaxAllowedPagesForMarks(
  _maxMarks: number,
  policy: PlatformPolicyConfig = DEFAULT_PLATFORM_POLICY
): number {
  return Math.max(1, Math.min(15, Number(policy?.maxPages10Marker) || 4));
}

export const LOCAL_POLICY_STORAGE_KEY = 'upsc_platform_policy_local';

export function getLocalPlatformPolicy(): PlatformPolicyConfig {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_PLATFORM_POLICY;
    const raw = localStorage.getItem(LOCAL_POLICY_STORAGE_KEY);
    if (!raw) return DEFAULT_PLATFORM_POLICY;
    const d = JSON.parse(raw);
    const migrated10 =
      typeof d.maxPages10Marker === 'number' && d.maxPages10Marker >= 1 && !(d.maxPages10Marker === 3 && d.maxPages15Marker === 4)
        ? Math.min(15, Math.round(d.maxPages10Marker))
        : 4;
    const migrated15 =
      typeof d.maxPages15Marker === 'number' && d.maxPages15Marker >= 1 && !(d.maxPages10Marker === 3 && d.maxPages15Marker === 4) && d.maxPages15Marker !== 5
        ? Math.min(20, Math.round(d.maxPages15Marker))
        : migrated10;
    return {
      defaultStudentQuota: typeof d.defaultStudentQuota === 'number' ? d.defaultStudentQuota : DEFAULT_PLATFORM_POLICY.defaultStudentQuota,
      retentionDays: typeof d.retentionDays === 'number' ? d.retentionDays : DEFAULT_PLATFORM_POLICY.retentionDays,
      allowStudentUploads: typeof d.allowStudentUploads === 'boolean' ? d.allowStudentUploads : DEFAULT_PLATFORM_POLICY.allowStudentUploads,
      platformBanner: typeof d.platformBanner === 'string' ? d.platformBanner : DEFAULT_PLATFORM_POLICY.platformBanner,
      instituteName:
        typeof d.instituteName === 'string' && d.instituteName.trim()
          ? d.instituteName.trim()
          : DEFAULT_PLATFORM_POLICY.instituteName,
      instituteTagline:
        typeof d.instituteTagline === 'string' && d.instituteTagline.trim()
          ? d.instituteTagline.trim()
          : DEFAULT_PLATFORM_POLICY.instituteTagline,
      maxPages10Marker: migrated10,
      maxPages15Marker: migrated15,
      ownerWhatsappNumber:
        typeof d.ownerWhatsappNumber === 'string'
          ? d.ownerWhatsappNumber.trim().slice(0, 30)
          : DEFAULT_PLATFORM_POLICY.ownerWhatsappNumber,
      ownerUpiId:
        typeof d.ownerUpiId === 'string' && d.ownerUpiId.trim()
          ? d.ownerUpiId.trim().slice(0, 100)
          : DEFAULT_PLATFORM_POLICY.ownerUpiId,
      quotaPlanSummary:
        typeof d.quotaPlanSummary === 'string' && d.quotaPlanSummary.trim()
          ? d.quotaPlanSummary.trim().slice(0, 200)
          : DEFAULT_PLATFORM_POLICY.quotaPlanSummary,
      paymentApprovalMode:
        d.paymentApprovalMode === 'manual' || d.paymentApprovalMode === 'auto'
          ? d.paymentApprovalMode
          : DEFAULT_PLATFORM_POLICY.paymentApprovalMode,
    };
  } catch {
    return DEFAULT_PLATFORM_POLICY;
  }
}

export function saveLocalPlatformPolicy(policy: PlatformPolicyConfig): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_POLICY_STORAGE_KEY, JSON.stringify(policy));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export async function loadPlatformPolicy(): Promise<PlatformPolicyConfig> {
  if (!auth.currentUser) {
    return getLocalPlatformPolicy();
  }
  const docRef = doc(db, 'platform_settings', 'global');
  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return getLocalPlatformPolicy();
    }
    const d = snap.data();
    const localFallback = getLocalPlatformPolicy();
    const loaded: PlatformPolicyConfig = {
      defaultStudentQuota: typeof d.defaultStudentQuota === 'number' ? d.defaultStudentQuota : 2,
      retentionDays: typeof d.retentionDays === 'number' ? d.retentionDays : 180,
      allowStudentUploads: typeof d.allowStudentUploads === 'boolean' ? d.allowStudentUploads : true,
      platformBanner: typeof d.platformBanner === 'string' ? d.platformBanner : DEFAULT_PLATFORM_POLICY.platformBanner,
      instituteName:
        typeof d.instituteName === 'string' && d.instituteName.trim()
          ? d.instituteName.trim()
          : DEFAULT_PLATFORM_POLICY.instituteName,
      instituteTagline:
        typeof d.instituteTagline === 'string' && d.instituteTagline.trim()
          ? d.instituteTagline.trim()
          : DEFAULT_PLATFORM_POLICY.instituteTagline,
      maxPages10Marker:
        typeof d.maxPages10Marker === 'number' && d.maxPages10Marker >= 1
          ? Math.min(15, Math.round(d.maxPages10Marker))
          : 4,
      maxPages15Marker:
        typeof d.maxPages15Marker === 'number' && d.maxPages15Marker >= 1 && d.maxPages15Marker !== 5
          ? Math.min(20, Math.round(d.maxPages15Marker))
          : 4,
      ownerWhatsappNumber:
        typeof d.ownerWhatsappNumber === 'string'
          ? d.ownerWhatsappNumber.trim().slice(0, 30)
          : localFallback.ownerWhatsappNumber || '',
      ownerUpiId:
        typeof d.ownerUpiId === 'string' && d.ownerUpiId.trim()
          ? d.ownerUpiId.trim().slice(0, 100)
          : localFallback.ownerUpiId || DEFAULT_PLATFORM_POLICY.ownerUpiId,
      quotaPlanSummary:
        typeof d.quotaPlanSummary === 'string' && d.quotaPlanSummary.trim()
          ? d.quotaPlanSummary.trim().slice(0, 200)
          : localFallback.quotaPlanSummary || DEFAULT_PLATFORM_POLICY.quotaPlanSummary,
      paymentApprovalMode:
        d.paymentApprovalMode === 'manual' || d.paymentApprovalMode === 'auto'
          ? d.paymentApprovalMode
          : localFallback.paymentApprovalMode || 'auto',
    };
    saveLocalPlatformPolicy(loaded);
    return loaded;
  } catch (error) {
    console.warn('Could not load platform policy, using local/default:', error);
    return getLocalPlatformPolicy();
  }
}

export async function savePlatformPolicy(_userId: string, policy: PlatformPolicyConfig): Promise<void> {
  // Always persist locally first so Owner branding & policy work immediately even before Cloud Sign-In
  saveLocalPlatformPolicy(policy);

  // Only write to Firestore /platform_settings/global when authenticated as Super Admin
  if (!auth.currentUser || !isSuperAdminUser(auth.currentUser) || isFirestoreQuotaExhausted()) {
    return;
  }

  const cleanUid = sanitizeFirestoreId(auth.currentUser.uid);
  const path = 'platform_settings/global';
  const docRef = doc(db, 'platform_settings', 'global');
  const payload = {
    updatedBy: cleanUid,
    defaultStudentQuota: Math.max(0, Math.min(10000, Math.round(Number(policy.defaultStudentQuota) || 2))),
    retentionDays: Math.max(1, Math.min(3650, Math.round(Number(policy.retentionDays) || 180))),
    allowStudentUploads: Boolean(policy.allowStudentUploads),
    platformBanner: String(policy.platformBanner || '').slice(0, 500),
    instituteName: String(policy.instituteName || DEFAULT_PLATFORM_POLICY.instituteName || '').slice(0, 120),
    instituteTagline: String(policy.instituteTagline || DEFAULT_PLATFORM_POLICY.instituteTagline || '').slice(0, 200),
    maxPages10Marker: Math.max(1, Math.min(15, Math.round(Number(policy.maxPages10Marker) || 4))),
    maxPages15Marker: Math.max(1, Math.min(20, Math.round(Number(policy.maxPages15Marker ?? policy.maxPages10Marker) || 4))),
    ownerWhatsappNumber: String(policy.ownerWhatsappNumber || '').trim().slice(0, 30),
    ownerUpiId: String(policy.ownerUpiId || DEFAULT_PLATFORM_POLICY.ownerUpiId || '').trim().slice(0, 100),
    quotaPlanSummary: String(policy.quotaPlanSummary || DEFAULT_PLATFORM_POLICY.quotaPlanSummary || '').trim().slice(0, 200),
    paymentApprovalMode: policy.paymentApprovalMode === 'manual' ? 'manual' : 'auto',
    updatedAt: serverTimestamp(),
  };
  if (shouldSkipDuplicateWrite(path, payload)) return;
  try {
    await setDoc(docRef, payload);
  } catch (error) {
    if (isQuotaOrTransientFirestoreError(error)) {
      markFirestoreQuotaExhausted();
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ============================================================================
// STUDENT & EVALUATOR PROFILES (/student_profiles/{userId})
// ============================================================================
export interface StudentProfileData {
  ownerId: string;
  displayName: string;
  email: string;
  role: 'student' | 'evaluator' | 'owner';
  status: 'active' | 'blocked';
  quotaLimit: number;
  usedCount: number;
  joinedAt: string;
}

const LOCAL_STUDENT_PROFILE_PREFIX = 'upsc_student_profile_';

function saveLocalStudentProfile(profile: StudentProfileData): void {
  try {
    localStorage.setItem(`${LOCAL_STUDENT_PROFILE_PREFIX}${profile.ownerId}`, JSON.stringify(profile));
  } catch {
    // Ignore storage errors
  }
}

function getLocalStudentProfile(cleanUserId: string): StudentProfileData | null {
  try {
    const raw = localStorage.getItem(`${LOCAL_STUDENT_PROFILE_PREFIX}${cleanUserId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.ownerId) {
      return parsed as StudentProfileData;
    }
  } catch {
    // Ignore
  }
  return null;
}

export async function ensureStudentProfile(
  user: User,
  defaultQuota = 10
): Promise<StudentProfileData> {
  const cleanUserId = sanitizeFirestoreId(user.uid);
  const path = `student_profiles/${cleanUserId}`;
  const docRef = doc(db, 'student_profiles', cleanUserId);
  const isOwner = isSuperAdminUser(user);
  const safeQuota = isOwner ? 10000 : Math.max(0, Math.min(10000, defaultQuota));
  const initialRole: 'owner' | 'student' = isOwner ? 'owner' : 'student';

  const localCached = getLocalStudentProfile(cleanUserId);
  const fallbackProfile: StudentProfileData = localCached
    ? {
        ...localCached,
        role: isOwner ? 'owner' : localCached.role,
        quotaLimit: isOwner ? 10000 : localCached.quotaLimit,
      }
    : {
        ownerId: cleanUserId,
        displayName: String(user.displayName || user.email?.split('@')[0] || 'UPSC Aspirant').slice(0, 200),
        email: String(user.email || 'user@example.com').slice(0, 200),
        role: initialRole,
        status: 'active',
        quotaLimit: safeQuota,
        usedCount: 0,
        joinedAt: new Date().toISOString(),
      };

  if (isFirestoreQuotaExhausted() || (localCached && sessionVerifiedProfiles.has(cleanUserId))) {
    saveLocalStudentProfile(fallbackProfile);
    return fallbackProfile;
  }

  try {
    const snap = await getDoc(docRef);
    sessionVerifiedProfiles.add(cleanUserId);
    if (snap.exists()) {
      const d = snap.data();
      // If super admin email, ensure role is owner
      if (isOwner && d.role !== 'owner') {
        const updatedProfile: StudentProfileData = {
          ownerId: cleanUserId,
          displayName: String(user.displayName || d.displayName || 'App Owner').slice(0, 200),
          email: String(user.email || d.email || SUPER_ADMIN_EMAIL).slice(0, 200),
          role: 'owner',
          status: 'active',
          quotaLimit: 10000,
          usedCount: Number(d.usedCount) || 0,
          joinedAt: String(d.joinedAt || new Date().toISOString()).slice(0, 64),
        };
        saveLocalStudentProfile(updatedProfile);
        const writePayload = {
          ...updatedProfile,
          updatedAt: serverTimestamp(),
        };
        if (!shouldSkipDuplicateWrite(path, writePayload)) {
          await setDoc(docRef, writePayload);
        }
        return updatedProfile;
      }
      const existingProfile: StudentProfileData = {
        ownerId: d.ownerId || cleanUserId,
        displayName: d.displayName || user.displayName || 'Student',
        email: d.email || user.email || '',
        role: d.role || 'student',
        status: d.status || 'active',
        quotaLimit: typeof d.quotaLimit === 'number' ? d.quotaLimit : defaultQuota,
        usedCount: typeof d.usedCount === 'number' ? d.usedCount : 0,
        joinedAt: d.joinedAt || new Date().toISOString(),
      };
      saveLocalStudentProfile(existingProfile);
      return existingProfile;
    }

    saveLocalStudentProfile(fallbackProfile);
    const createPayload = {
      ...fallbackProfile,
      updatedAt: serverTimestamp(),
    };
    if (!shouldSkipDuplicateWrite(path, createPayload)) {
      await setDoc(docRef, createPayload);
    }
    return fallbackProfile;
  } catch (error) {
    if (isQuotaOrTransientFirestoreError(error)) {
      markFirestoreQuotaExhausted();
      saveLocalStudentProfile(fallbackProfile);
      return fallbackProfile;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function incrementStudentUsage(profile: StudentProfileData): Promise<StudentProfileData> {
  const nextUsed = (Number(profile.usedCount) || 0) + 1;
  const nextProfile: StudentProfileData = {
    ...profile,
    usedCount: nextUsed,
  };
  saveLocalStudentProfile(nextProfile);

  if (!auth.currentUser || isFirestoreQuotaExhausted()) {
    return nextProfile;
  }
  const cleanUserId = sanitizeFirestoreId(profile.ownerId);
  const path = `student_profiles/${cleanUserId}`;
  const docRef = doc(db, 'student_profiles', cleanUserId);

  const updatedDoc = {
    ownerId: cleanUserId,
    displayName: String(profile.displayName || 'Student').slice(0, 200),
    email: String(profile.email).slice(0, 200),
    role: profile.role,
    status: profile.status,
    quotaLimit: Number(profile.quotaLimit) || 10,
    usedCount: nextUsed,
    joinedAt: String(profile.joinedAt).slice(0, 64),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(docRef, updatedDoc);
    return nextProfile;
  } catch (error) {
    if (isQuotaOrTransientFirestoreError(error)) {
      markFirestoreQuotaExhausted();
      return nextProfile;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// Super Admin: List all registered student profiles
export async function loadAllStudentProfiles(): Promise<StudentProfileData[]> {
  if (!auth.currentUser || !isSuperAdminUser(auth.currentUser) || isFirestoreQuotaExhausted()) {
    return [];
  }
  const path = 'student_profiles';
  const colRef = collection(db, 'student_profiles');
  try {
    const snap = await getDocs(colRef);
    const list: StudentProfileData[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      list.push({
        ownerId: d.ownerId || docSnap.id,
        displayName: d.displayName || 'Student',
        email: d.email || '',
        role: d.role || 'student',
        status: d.status || 'active',
        quotaLimit: typeof d.quotaLimit === 'number' ? d.quotaLimit : 10,
        usedCount: typeof d.usedCount === 'number' ? d.usedCount : 0,
        joinedAt: d.joinedAt || new Date().toISOString(),
      });
    });
    return list.sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime());
  } catch (error) {
    if (isQuotaOrTransientFirestoreError(error)) {
      markFirestoreQuotaExhausted();
      return [];
    }
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// Super Admin: Update a student's role, status, quotaLimit, or usedCount
export async function adminUpdateStudentProfile(
  profile: StudentProfileData,
  updates: Partial<Pick<StudentProfileData, 'displayName' | 'role' | 'status' | 'quotaLimit' | 'usedCount'>>
): Promise<StudentProfileData> {
  const cleanUserId = sanitizeFirestoreId(profile.ownerId);
  const path = `student_profiles/${cleanUserId}`;
  const docRef = doc(db, 'student_profiles', cleanUserId);

  const merged: StudentProfileData = {
    ownerId: cleanUserId,
    displayName: String(updates.displayName ?? profile.displayName).slice(0, 200),
    email: String(profile.email).slice(0, 200),
    role: updates.role ?? profile.role,
    status: updates.status ?? profile.status,
    quotaLimit: Math.max(0, Math.min(10000, Number(updates.quotaLimit ?? profile.quotaLimit))),
    usedCount: Math.max(0, Math.min(100000, Number(updates.usedCount ?? profile.usedCount))),
    joinedAt: String(profile.joinedAt).slice(0, 64),
  };
  saveLocalStudentProfile(merged);

  if (!auth.currentUser || !isSuperAdminUser(auth.currentUser) || isFirestoreQuotaExhausted()) {
    return merged;
  }

  try {
    await setDoc(docRef, {
      ...merged,
      updatedAt: serverTimestamp(),
    });
    return merged;
  } catch (error) {
    if (isQuotaOrTransientFirestoreError(error)) {
      markFirestoreQuotaExhausted();
      return merged;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// Super Admin: Delete a student profile record
export async function adminDeleteStudentProfile(userId: string): Promise<void> {
  if (!auth.currentUser || !isSuperAdminUser(auth.currentUser) || isFirestoreQuotaExhausted()) {
    return;
  }
  const cleanUserId = sanitizeFirestoreId(userId);
  const path = `student_profiles/${cleanUserId}`;
  const docRef = doc(db, 'student_profiles', cleanUserId);
  try {
    await deleteDoc(docRef);
  } catch (error) {
    if (isQuotaOrTransientFirestoreError(error)) {
      markFirestoreQuotaExhausted();
      return;
    }
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ============================================================================
// UPI & UTR QUOTA UPGRADE REQUESTS (/quota_requests/{requestId})
// ============================================================================
export interface QuotaUpgradeRequestData {
  requestId: string;
  ownerId: string;
  studentName: string;
  studentEmail: string;
  planTitle: string;
  copiesRequested: number;
  amountInr: number;
  utrNumber: string;
  status: 'pending' | 'approved' | 'auto_approved' | 'rejected';
  createdAt: string;
}

export function validateSmartUtrNumber(rawUtr: string): {
  isValid: boolean;
  cleanUtr: string;
  reason?: string;
} {
  const digitsOnly = String(rawUtr || '').replace(/[^0-9]/g, '');
  if (digitsOnly.length !== 12) {
    return {
      isValid: false,
      cleanUtr: digitsOnly,
      reason: 'UPI Transaction / UTR नंबर ठीक 12 अंकों (12 Digits) का होना चाहिए।',
    };
  }
  // Reject trivial fake patterns like 000000000000, 111111111111, 123456789012
  if (/^(\d)\1{11}$/.test(digitsOnly) || digitsOnly === '123456789012' || digitsOnly === '987654321098') {
    return {
      isValid: false,
      cleanUtr: digitsOnly,
      reason: 'यह UTR नंबर अमान्य प्रतीत होता है। कृपया अपने GPay/PhonePe/Paytm ऐप से वास्तविक 12-अंकीय UTR नंबर दर्ज करें।',
    };
  }
  return {
    isValid: true,
    cleanUtr: digitsOnly,
  };
}

export async function submitQuotaUpgradeRequest(params: {
  profile: StudentProfileData;
  planTitle: string;
  copiesRequested: number;
  amountInr: number;
  utrNumber: string;
  approvalMode: 'auto' | 'manual';
}): Promise<{
  request: QuotaUpgradeRequestData;
  updatedProfile: StudentProfileData;
}> {
  const { isValid, cleanUtr, reason } = validateSmartUtrNumber(params.utrNumber);
  if (!isValid) {
    throw new Error(reason || 'अमान्य 12-अंकीय UTR नंबर');
  }

  const cleanUserId = sanitizeFirestoreId(params.profile.ownerId || auth.currentUser?.uid || 'student');
  // Deterministic requestId per user + UTR prevents duplicate quota credit for the same UTR
  const requestId = sanitizeFirestoreId(`utr_${cleanUserId.slice(0, 28)}_${cleanUtr}`);
  const reqPath = `quota_requests/${requestId}`;
  const reqRef = doc(db, 'quota_requests', requestId);

  const isAuto = params.approvalMode !== 'manual';
  const copiesToAdd = Math.max(1, Math.min(500, Math.round(Number(params.copiesRequested) || 10)));
  const amount = Math.max(1, Math.min(100000, Math.round(Number(params.amountInr) || 99)));
  const nowIso = new Date().toISOString();

  const requestRecord: QuotaUpgradeRequestData = {
    requestId,
    ownerId: cleanUserId,
    studentName: String(params.profile.displayName || 'UPSC Aspirant').slice(0, 200),
    studentEmail: String(params.profile.email || auth.currentUser?.email || '').slice(0, 200),
    planTitle: String(params.planTitle || `+${copiesToAdd} Copies`).slice(0, 120),
    copiesRequested: copiesToAdd,
    amountInr: amount,
    utrNumber: cleanUtr,
    status: isAuto ? 'auto_approved' : 'pending',
    createdAt: nowIso,
  };

  if (!auth.currentUser || isFirestoreQuotaExhausted()) {
    const nextLocalProfile: StudentProfileData = isAuto
      ? { ...params.profile, quotaLimit: Math.min(10000, (params.profile.quotaLimit || 0) + copiesToAdd) }
      : params.profile;
    saveLocalStudentProfile(nextLocalProfile);
    return {
      request: requestRecord,
      updatedProfile: nextLocalProfile,
    };
  }

  try {
    // Check if this UTR was already submitted by this student
    const existingSnap = await getDoc(reqRef);
    if (existingSnap.exists()) {
      throw new Error('यह 12-अंकीय UTR नंबर पहले ही सबमिट किया जा चुका है।');
    }

    await setDoc(reqRef, {
      ...requestRecord,
      updatedAt: serverTimestamp(),
    });
  } catch (error: any) {
    if (error?.message?.includes('UTR')) {
      throw error;
    }
    if (isQuotaOrTransientFirestoreError(error)) {
      markFirestoreQuotaExhausted();
    } else {
      handleFirestoreError(error, OperationType.CREATE, reqPath);
    }
  }

  let updatedProfile = params.profile;
  if (isAuto) {
    const profilePath = `student_profiles/${cleanUserId}`;
    const profileRef = doc(db, 'student_profiles', cleanUserId);
    const nextQuotaLimit = Math.max(
      1,
      Math.min(10000, (Number(params.profile.quotaLimit) || 0) + copiesToAdd)
    );
    updatedProfile = {
      ...params.profile,
      quotaLimit: nextQuotaLimit,
    };
    saveLocalStudentProfile(updatedProfile);
    if (!isFirestoreQuotaExhausted()) {
      const nextProfileDoc = {
        ownerId: cleanUserId,
        displayName: String(params.profile.displayName || 'Student').slice(0, 200),
        email: String(params.profile.email || auth.currentUser.email || '').slice(0, 200),
        role: params.profile.role,
        status: params.profile.status,
        quotaLimit: nextQuotaLimit,
        usedCount: Number(params.profile.usedCount) || 0,
        joinedAt: String(params.profile.joinedAt || nowIso).slice(0, 64),
        updatedAt: serverTimestamp(),
      };
      try {
        await setDoc(profileRef, nextProfileDoc);
      } catch (error) {
        if (isQuotaOrTransientFirestoreError(error)) {
          markFirestoreQuotaExhausted();
        } else {
          handleFirestoreError(error, OperationType.UPDATE, profilePath);
        }
      }
    }
  }

  return {
    request: requestRecord,
    updatedProfile,
  };
}

export async function loadStudentQuotaRequests(userId: string): Promise<QuotaUpgradeRequestData[]> {
  if (!auth.currentUser || isFirestoreQuotaExhausted()) return [];
  const cleanUserId = sanitizeFirestoreId(userId);
  const path = 'quota_requests';
  const colRef = collection(db, 'quota_requests');
  const q = query(colRef, where('ownerId', '==', cleanUserId));
  try {
    const snap = await getDocs(q);
    const list: QuotaUpgradeRequestData[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      list.push({
        requestId: d.requestId || docSnap.id,
        ownerId: d.ownerId || cleanUserId,
        studentName: d.studentName || 'Student',
        studentEmail: d.studentEmail || '',
        planTitle: d.planTitle || '',
        copiesRequested: Number(d.copiesRequested) || 10,
        amountInr: Number(d.amountInr) || 99,
        utrNumber: d.utrNumber || '',
        status: d.status || 'pending',
        createdAt: d.createdAt || new Date().toISOString(),
      });
    });
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    if (isQuotaOrTransientFirestoreError(error)) {
      markFirestoreQuotaExhausted();
      return [];
    }
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function loadAllQuotaRequestsForAdmin(): Promise<QuotaUpgradeRequestData[]> {
  if (!auth.currentUser || !isSuperAdminUser(auth.currentUser) || isFirestoreQuotaExhausted()) {
    return [];
  }
  const path = 'quota_requests';
  const colRef = collection(db, 'quota_requests');
  try {
    const snap = await getDocs(colRef);
    const list: QuotaUpgradeRequestData[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      list.push({
        requestId: d.requestId || docSnap.id,
        ownerId: d.ownerId || '',
        studentName: d.studentName || 'Student',
        studentEmail: d.studentEmail || '',
        planTitle: d.planTitle || '',
        copiesRequested: Number(d.copiesRequested) || 10,
        amountInr: Number(d.amountInr) || 99,
        utrNumber: d.utrNumber || '',
        status: d.status || 'pending',
        createdAt: d.createdAt || new Date().toISOString(),
      });
    });
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    if (isQuotaOrTransientFirestoreError(error)) {
      markFirestoreQuotaExhausted();
      return [];
    }
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function adminProcessQuotaRequest(
  req: QuotaUpgradeRequestData,
  targetStatus: 'approved' | 'rejected',
  studentProfile?: StudentProfileData | null
): Promise<{
  updatedRequest: QuotaUpgradeRequestData;
  updatedProfile?: StudentProfileData;
}> {
  if (!auth.currentUser || !isSuperAdminUser(auth.currentUser) || isFirestoreQuotaExhausted()) {
    return { updatedRequest: { ...req, status: targetStatus } };
  }
  const cleanReqId = sanitizeFirestoreId(req.requestId);
  const reqPath = `quota_requests/${cleanReqId}`;
  const reqRef = doc(db, 'quota_requests', cleanReqId);

  const updatedReq: QuotaUpgradeRequestData = {
    ...req,
    status: targetStatus,
  };

  try {
    await setDoc(reqRef, {
      ...updatedReq,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (isQuotaOrTransientFirestoreError(error)) {
      markFirestoreQuotaExhausted();
      return { updatedRequest: updatedReq };
    }
    handleFirestoreError(error, OperationType.UPDATE, reqPath);
  }

  let updatedProfile: StudentProfileData | undefined;
  // Adjust student's quotaLimit if needed
  if (studentProfile) {
    const wasCredited = req.status === 'approved' || req.status === 'auto_approved';
    const willBeCredited = targetStatus === 'approved';
    let quotaDelta = 0;
    if (!wasCredited && willBeCredited) {
      quotaDelta = req.copiesRequested;
    } else if (wasCredited && targetStatus === 'rejected') {
      quotaDelta = -req.copiesRequested;
    }

    if (quotaDelta !== 0) {
      const nextQuota = Math.max(0, Math.min(10000, (studentProfile.quotaLimit || 0) + quotaDelta));
      updatedProfile = await adminUpdateStudentProfile(studentProfile, {
        quotaLimit: nextQuota,
      });
    }
  }

  return {
    updatedRequest: updatedReq,
    updatedProfile,
  };
}

export async function adminDeleteQuotaRequest(requestId: string): Promise<void> {
  if (!auth.currentUser || !isSuperAdminUser(auth.currentUser) || isFirestoreQuotaExhausted()) return;
  const cleanReqId = sanitizeFirestoreId(requestId);
  const reqPath = `quota_requests/${cleanReqId}`;
  const reqRef = doc(db, 'quota_requests', cleanReqId);
  try {
    await deleteDoc(reqRef);
  } catch (error) {
    if (isQuotaOrTransientFirestoreError(error)) {
      markFirestoreQuotaExhausted();
      return;
    }
    handleFirestoreError(error, OperationType.DELETE, reqPath);
  }
}

// ============================================================================
// USER CLOUD CONFIG & EVALUATIONS (/user_configs/{userId})
// ============================================================================
const verifiedParentConfigUids = new Set<string>();

async function ensureParentUserConfigExists(cleanUserId: string): Promise<void> {
  if (verifiedParentConfigUids.has(cleanUserId) || !auth.currentUser || isFirestoreQuotaExhausted()) {
    return;
  }
  const docRef = doc(db, 'user_configs', cleanUserId);
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      verifiedParentConfigUids.add(cleanUserId);
      return;
    }
    await setDoc(docRef, {
      ownerId: cleanUserId,
      activeSlotId: 1,
      promptSlots: {},
      modelSettings: {},
      updatedAt: serverTimestamp(),
    });
    verifiedParentConfigUids.add(cleanUserId);
  } catch {
    // Ignore parent bootstrap error; main operation will handle any permission/quota error
  }
}

export async function saveUserCloudConfig(
  userId: string,
  payload: {
    activeSlotId: number;
    promptSlots: Array<{ id: number; name: string; content: string }>;
    modelSettings: Record<string, any>;
  }
): Promise<void> {
  if (!auth.currentUser || isFirestoreQuotaExhausted()) return;
  const cleanUserId = sanitizeFirestoreId(userId);
  const path = `user_configs/${cleanUserId}`;
  const docRef = doc(db, 'user_configs', cleanUserId);

  const slotsMap: Record<string, any> = {};
  (payload.promptSlots || []).slice(0, 10).forEach((s) => {
    slotsMap[`slot_${s.id}`] = {
      id: Number(s.id) || 1,
      name: String(s.name || `Slot ${s.id}`).slice(0, 200),
      content: String(s.content || '').slice(0, 60000),
    };
  });

  const cleanSettings = sanitizeForFirestoreMap(payload.modelSettings || {}) || {};

  const docData = {
    ownerId: cleanUserId,
    activeSlotId: Math.max(1, Math.min(10, Number(payload.activeSlotId) || 1)),
    promptSlots: slotsMap,
    modelSettings: cleanSettings,
    updatedAt: serverTimestamp(),
  };

  if ( verifiedParentConfigUids.has(cleanUserId) && shouldSkipDuplicateWrite(path, docData)) return;

  try {
    await setDoc(docRef, docData);
    verifiedParentConfigUids.add(cleanUserId);
  } catch (error) {
    if (isQuotaOrTransientFirestoreError(error)) {
      markFirestoreQuotaExhausted();
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function loadUserCloudConfig(userId: string): Promise<{
  activeSlotId: number;
  promptSlotsList: Array<{ id: number; name: string; content: string }>;
  modelSettings: Record<string, any>;
} | null> {
  if (!auth.currentUser || isFirestoreQuotaExhausted()) return null;
  const cleanUserId = sanitizeFirestoreId(userId);
  const path = `user_configs/${cleanUserId}`;
  const docRef = doc(db, 'user_configs', cleanUserId);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    verifiedParentConfigUids.add(cleanUserId);
    const data = snap.data();
    const slotsMap = data.promptSlots || {};
    const promptSlotsList = Object.values(slotsMap)
      .filter((s: any) => s && typeof s.id === 'number')
      .sort((a: any, b: any) => a.id - b.id) as Array<{ id: number; name: string; content: string }>;

    return {
      activeSlotId: Number(data.activeSlotId) || 1,
      promptSlotsList,
      modelSettings: data.modelSettings || {},
    };
  } catch (error) {
    if (isQuotaOrTransientFirestoreError(error)) {
      markFirestoreQuotaExhausted();
      return null;
    }
    handleFirestoreError(error, OperationType.GET, path);
  }
}

const compressedPagesCache = new Map<
  string,
  Array<{ id: string; name: string; dataUrl: string; pageNumber: number }>
>();

export async function saveEvaluationToCloud(
  userId: string,
  entry: {
    id: string;
    timestamp: string;
    studentName: string;
    subject?: string;
    obtained: number;
    max_marks: number;
    evalResult: any;
    modelAnswer?: string;
    uploadedPages?: any[];
    skipPageRecompression?: boolean;
  }
): Promise<void> {
  if (!auth.currentUser || isFirestoreQuotaExhausted()) return;
  const cleanUserId = sanitizeFirestoreId(userId);
  await ensureParentUserConfigExists(cleanUserId);
  const cleanEvalId = sanitizeFirestoreId(entry.id);
  const path = `user_configs/${cleanUserId}/evaluations/${cleanEvalId}`;
  const docRef = doc(db, 'user_configs', cleanUserId, 'evaluations', cleanEvalId);

  let compressedPages: Array<{ id: string; name: string; dataUrl: string; pageNumber: number }> = [];
  if (entry.skipPageRecompression && compressedPagesCache.has(cleanEvalId)) {
    compressedPages = compressedPagesCache.get(cleanEvalId) || [];
  } else if (Array.isArray(entry.uploadedPages) && entry.uploadedPages.length > 0) {
    compressedPages = await compressPagesForCloud(entry.uploadedPages);
    if (compressedPages.length > 0) {
      compressedPagesCache.set(cleanEvalId, compressedPages);
    }
  } else if (compressedPagesCache.has(cleanEvalId)) {
    compressedPages = compressedPagesCache.get(cleanEvalId) || [];
  } else {
    // If updating an existing evaluation without passing pages, preserve existing cloud pages if present
    try {
      const existingSnap = await getDoc(docRef);
      if (existingSnap.exists()) {
        const existingPages = existingSnap.data()?.evalData?.uploadedPages;
        if (Array.isArray(existingPages) && existingPages.length > 0) {
          compressedPages = existingPages;
          compressedPagesCache.set(cleanEvalId, existingPages);
        }
      }
    } catch {
      // Ignore read fallback error
    }
  }

  const safeEvalData = sanitizeForFirestoreMap({
    evalResult: entry.evalResult,
    modelAnswer: (entry.modelAnswer || '').slice(0, 15000),
    uploadedPages: compressedPages,
  });

  const docData = {
    ownerId: cleanUserId,
    studentName: String(entry.studentName || 'Unknown Student').slice(0, 200),
    subject: String(entry.subject || 'सामान्य अध्ययन').slice(0, 200),
    obtainedMarks: Math.max(0, Math.min(500, Number(entry.obtained) || 0)),
    maxMarks: Math.max(1, Math.min(500, Number(entry.max_marks) || 10)),
    evalData: safeEvalData || {},
    evaluatedAt: String(entry.timestamp || new Date().toISOString()).slice(0, 64),
    updatedAt: serverTimestamp(),
  };

  if (shouldSkipDuplicateWrite(path, docData)) return;

  try {
    await setDoc(docRef, docData);
  } catch (error) {
    if (isQuotaOrTransientFirestoreError(error)) {
      markFirestoreQuotaExhausted();
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteEvaluationFromCloud(userId: string, evalId: string): Promise<void> {
  if (!auth.currentUser || isFirestoreQuotaExhausted()) return;
  const cleanUserId = sanitizeFirestoreId(userId);
  const cleanEvalId = sanitizeFirestoreId(evalId);
  const path = `user_configs/${cleanUserId}/evaluations/${cleanEvalId}`;
  const docRef = doc(db, 'user_configs', cleanUserId, 'evaluations', cleanEvalId);
  compressedPagesCache.delete(cleanEvalId);
  lastWrittenSignatureByPath.delete(path);
  try {
    await deleteDoc(docRef);
  } catch (error) {
    if (isQuotaOrTransientFirestoreError(error)) {
      markFirestoreQuotaExhausted();
      return;
    }
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Load Evaluations from Cloud (and automatically enforce platform retention days if specified)
export async function loadEvaluationsFromCloud(
  userId: string,
  retentionDays = 180
): Promise<any[]> {
  if (!auth.currentUser || isFirestoreQuotaExhausted()) return [];
  const cleanUserId = sanitizeFirestoreId(userId);
  const path = `user_configs/${cleanUserId}/evaluations`;
  const colRef = collection(db, 'user_configs', cleanUserId, 'evaluations');
  const q = query(colRef, where('ownerId', '==', cleanUserId));

  try {
    const snap = await getDocs(q);
    const records: any[] = [];
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    for (const docSnap of snap.docs) {
      const d = docSnap.data();
      const evalTime = new Date(d.evaluatedAt || Date.now()).getTime();
      if (retentionDays > 0 && evalTime < cutoffTime) {
        // Filter out expired records in memory without triggering background deleteDoc writes during reads
        continue;
      }
      const rawPages = Array.isArray(d.evalData?.uploadedPages) ? d.evalData.uploadedPages : [];
      const restoredPages = rawPages
        .filter((p: any) => p && typeof p.dataUrl === 'string' && p.dataUrl.startsWith('data:image/'))
        .map((p: any, idx: number) => ({
          id: String(p.id || `page-${idx + 1}`),
          name: String(p.name || `Page ${idx + 1}`),
          dataUrl: p.dataUrl,
          imageUrl: p.dataUrl,
          pageNumber: Number(p.pageNumber) || idx + 1,
        }));

      if (restoredPages.length > 0) {
        compressedPagesCache.set(
          sanitizeFirestoreId(docSnap.id),
          restoredPages.map((p: any) => ({
            id: p.id,
            name: p.name,
            dataUrl: p.dataUrl,
            pageNumber: p.pageNumber,
          }))
        );
      }

      records.push({
        id: docSnap.id,
        ownerUid: cleanUserId,
        timestamp: d.evaluatedAt || new Date().toISOString(),
        studentName: d.studentName || 'Unknown Student',
        subject: d.subject || 'सामान्य अध्ययन',
        obtained: d.obtainedMarks ?? 0,
        max_marks: d.maxMarks ?? 10,
        evalResult: d.evalData?.evalResult || null,
        modelAnswer: d.evalData?.modelAnswer || '',
        uploadedPages: restoredPages,
        isCloudSynced: true,
      });
    }
    return records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (error) {
    if (isQuotaOrTransientFirestoreError(error)) {
      markFirestoreQuotaExhausted();
      return [];
    }
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// Subscribe in real-time to a user's evaluations so any Owner overrides/annotation adjustments reflect live
export function subscribeToUserEvaluations(
  userId: string,
  retentionDays = 180,
  onUpdate: (records: any[]) => void
): () => void {
  if (!auth.currentUser || isFirestoreQuotaExhausted()) return () => {};
  const cleanUserId = sanitizeFirestoreId(userId);
  const path = `user_configs/${cleanUserId}/evaluations`;
  const colRef = collection(db, 'user_configs', cleanUserId, 'evaluations');
  const q = query(colRef, where('ownerId', '==', cleanUserId));

  const unsubscribe = onSnapshot(
    q,
    (snap) => {
      const records: any[] = [];
      const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

      for (const docSnap of snap.docs) {
        const d = docSnap.data();
        const evalTime = new Date(d.evaluatedAt || Date.now()).getTime();
        if (retentionDays > 0 && evalTime < cutoffTime) {
          continue;
        }
        const rawPages = Array.isArray(d.evalData?.uploadedPages) ? d.evalData.uploadedPages : [];
        const restoredPages = rawPages
          .filter((p: any) => p && typeof p.dataUrl === 'string' && p.dataUrl.startsWith('data:image/'))
          .map((p: any, idx: number) => ({
            id: String(p.id || `page-${idx + 1}`),
            name: String(p.name || `Page ${idx + 1}`),
            dataUrl: p.dataUrl,
            imageUrl: p.dataUrl,
            pageNumber: Number(p.pageNumber) || idx + 1,
          }));

        if (restoredPages.length > 0) {
          compressedPagesCache.set(
            sanitizeFirestoreId(docSnap.id),
            restoredPages.map((p: any) => ({
              id: p.id,
              name: p.name,
              dataUrl: p.dataUrl,
              pageNumber: p.pageNumber,
            }))
          );
        }

        records.push({
          id: docSnap.id,
          ownerUid: cleanUserId,
          timestamp: d.evaluatedAt || new Date().toISOString(),
          studentName: d.studentName || 'Unknown Student',
          subject: d.subject || 'सामान्य अध्ययन',
          obtained: d.obtainedMarks ?? 0,
          max_marks: d.maxMarks ?? 10,
          evalResult: d.evalData?.evalResult || null,
          modelAnswer: d.evalData?.modelAnswer || '',
          uploadedPages: restoredPages,
          isCloudSynced: true,
        });
      }
      records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      onUpdate(records);
    },
    (error) => {
      if (isQuotaOrTransientFirestoreError(error)) {
        markFirestoreQuotaExhausted();
        return;
      }
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );

  return unsubscribe;
}

// Super Admin: Load all evaluations across all registered students so Owner sees every student's annotated copy in the unified system
export async function loadAllStudentEvaluationsForAdmin(retentionDays = 180): Promise<any[]> {
  if (!auth.currentUser || !isSuperAdminUser(auth.currentUser) || isFirestoreQuotaExhausted()) {
    return [];
  }
  try {
    const profiles = await loadAllStudentProfiles();
    const allLists = await Promise.all(
      profiles.map(async (st) => {
        try {
          const evals = await loadEvaluationsFromCloud(st.ownerId, retentionDays);
          return evals.map((ev) => ({
            ...ev,
            ownerUid: st.ownerId,
            studentEmail: st.email,
            studentName: ev.studentName || st.displayName,
          }));
        } catch {
          return [];
        }
      })
    );
    return allLists
      .flat()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (err) {
    console.warn('Could not load student evaluations for admin:', err);
    return [];
  }
}

// Save Learning Log to Cloud
export async function saveLearningLogToCloud(
  userId: string,
  log: {
    id: string;
    timestamp: string;
    studentName: string;
    originalEval: any;
    correctedEval: any;
  }
): Promise<void> {
  if (!auth.currentUser || isFirestoreQuotaExhausted()) return;
  const cleanUserId = sanitizeFirestoreId(userId);
  await ensureParentUserConfigExists(cleanUserId);
  const cleanLogId = sanitizeFirestoreId(log.id);
  const path = `user_configs/${cleanUserId}/learning_logs/${cleanLogId}`;
  const docRef = doc(db, 'user_configs', cleanUserId, 'learning_logs', cleanLogId);

  const docData = {
    ownerId: cleanUserId,
    studentName: String(log.studentName || 'Unknown Student').slice(0, 200),
    logData: sanitizeForFirestoreMap({
      originalEval: log.originalEval,
      correctedEval: log.correctedEval,
    }) || {},
    loggedAt: String(log.timestamp || new Date().toISOString()).slice(0, 64),
    updatedAt: serverTimestamp(),
  };

  if (shouldSkipDuplicateWrite(path, docData)) return;

  try {
    await setDoc(docRef, docData);
  } catch (error) {
    if (isQuotaOrTransientFirestoreError(error)) {
      markFirestoreQuotaExhausted();
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteLearningLogFromCloud(userId: string, logId: string): Promise<void> {
  if (!auth.currentUser || isFirestoreQuotaExhausted()) return;
  const cleanUserId = sanitizeFirestoreId(userId);
  const cleanLogId = sanitizeFirestoreId(logId);
  const path = `user_configs/${cleanUserId}/learning_logs/${cleanLogId}`;
  const docRef = doc(db, 'user_configs', cleanUserId, 'learning_logs', cleanLogId);
  lastWrittenSignatureByPath.delete(path);
  try {
    await deleteDoc(docRef);
  } catch (error) {
    if (isQuotaOrTransientFirestoreError(error)) {
      markFirestoreQuotaExhausted();
      return;
    }
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function loadLearningLogsFromCloud(userId: string): Promise<any[]> {
  if (!auth.currentUser || isFirestoreQuotaExhausted()) return [];
  const cleanUserId = sanitizeFirestoreId(userId);
  const path = `user_configs/${cleanUserId}/learning_logs`;
  const colRef = collection(db, 'user_configs', cleanUserId, 'learning_logs');
  const q = query(colRef, where('ownerId', '==', cleanUserId));

  try {
    const snap = await getDocs(q);
    const logs: any[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      logs.push({
        id: docSnap.id,
        timestamp: d.loggedAt || new Date().toISOString(),
        studentName: d.studentName || 'Unknown Student',
        originalEval: d.logData?.originalEval || {},
        correctedEval: d.logData?.correctedEval || {},
      });
    });
    return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (error) {
    if (isQuotaOrTransientFirestoreError(error)) {
      markFirestoreQuotaExhausted();
      return [];
    }
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function submitEvaluationFeedback(params: {
  evaluationId: string;
  section: string;
  note?: string;
}): Promise<void> {
  const cleanEvalId = sanitizeFirestoreId(params.evaluationId || `eval_${Date.now()}`);
  const cleanSection = String(params.section || 'सामान्य').trim().slice(0, 100) || 'सामान्य';
  const cleanNote = String(params.note || '').trim().slice(0, 1000);

  // Always save locally as fallback/instant record
  try {
    const existingRaw = localStorage.getItem('flagged_evaluation_comments_v1');
    const existing = existingRaw ? JSON.parse(existingRaw) : [];
    existing.unshift({
      id: `fb-${Date.now()}`,
      evaluationId: cleanEvalId,
      section: cleanSection,
      note: cleanNote,
      timestamp: new Date().toISOString(),
    });
    localStorage.setItem('flagged_evaluation_comments_v1', JSON.stringify(existing.slice(0, 100)));
  } catch {
    // Ignore local storage errors
  }

  if (!auth.currentUser || isFirestoreQuotaExhausted()) return;

  const feedbackId = sanitizeFirestoreId(`fb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const path = `feedback/${feedbackId}`;
  const docRef = doc(db, 'feedback', feedbackId);
  const docData: Record<string, any> = {
    evaluationId: cleanEvalId,
    section: cleanSection,
    ownerId: sanitizeFirestoreId(auth.currentUser.uid),
    createdAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  };
  if (cleanNote) {
    docData.note = cleanNote;
  }

  if (shouldSkipDuplicateWrite(path, docData)) return;

  try {
    await setDoc(docRef, docData);
  } catch (error) {
    if (isQuotaOrTransientFirestoreError(error)) {
      markFirestoreQuotaExhausted();
      return;
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

