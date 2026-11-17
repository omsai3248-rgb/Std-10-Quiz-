import type { PaymentRequest, QuizAttempt, StudentProfile, SubjectId } from '../types/models';
import { ALL_SUBJECT_IDS } from '../types/models';
import { getCurrentDeviceIdentity } from '../utils/imageUtils';
import { timestampToMillis } from './syncManager';

export const DRIVE_BACKUP_FILENAME = 'Std10Quiz_StudentData.json';
export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

export const DEFAULT_WEB_OAUTH_CLIENT_ID =
  '498516159413-u64mm2rdgp8iou7o4t6jf4hhmd3hivr9.apps.googleusercontent.com';

const DRIVE_TOKEN_KEY = 'std10_google_drive_token_v1';
const DRIVE_FILE_ID_PREFIX = 'std10_drive_file_id_v1_';
const DRIVE_HASH_PREFIX = 'std10_drive_last_hash_v1_';
const DRIVE_BACKUP_LOCAL_PREFIX = 'std10_gmail_student_backup_v1_';
const DRIVE_LAST_SYNC_PREFIX = 'std10_drive_last_sync_ms_v1_';
const GMAIL_SESSION_META_KEY = 'std10_gmail_session_meta_v1';

export interface GmailStudentSessionMeta {
  uid: string;
  email: string;
  displayName: string;
  photoUrl?: string;
}

export interface SerializedQuizAttempt {
  id: string;
  userId: string;
  subjectId: SubjectId;
  subjectTitle: string;
  chapterTitle: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  timeTakenSeconds: number;
  createdAtMs: number;
}

export interface SerializedPaymentSummary {
  id: string;
  amountRupees: number;
  status: 'pending' | 'approved' | 'rejected';
  assignedCode: string;
  subjectId?: string;
  upiTransactionRef: string;
  createdAtMs: number;
}

export interface StudentDriveBackupData {
  version: 1;
  appId: 'std10_gujarati_quiz';
  gmail: string;
  uid: string;
  updatedAtMs: number;
  lastSyncedDevice: string;
  profile: {
    fullName: string;
    mobileNumber: string;
    email: string;
    standard: string;
    hasQuizAccess: boolean;
    redeemedCode: string;
    paymentStatus: 'none' | 'pending' | 'approved' | 'rejected';
    totalQuizzesTaken: number;
    bestScorePercent: number;
    unlockedSubjects: string[];
    paymentRequestIds: string[];
  };
  attempts: SerializedQuizAttempt[];
  paymentsSummary: SerializedPaymentSummary[];
}

export type DriveSyncState = 'idle' | 'syncing' | 'synced' | 'needs_reconnect' | 'offline' | 'error';

export interface DriveSyncStatus {
  state: DriveSyncState;
  gmail: string;
  lastSyncAtMs: number | null;
  fileId: string;
  errorMessage: string;
}

interface StoredTokenRecord {
  accessToken: string;
  email: string;
  expiresAtMs: number;
}

interface TokenClientInstance {
  requestAccessToken: (overrideConfig?: { prompt?: string; login_hint?: string }) => void;
}

interface GoogleIdentityAccounts {
  oauth2: {
    initTokenClient: (config: {
      client_id: string;
      scope: string;
      callback: (resp: {
        access_token?: string;
        expires_in?: number;
        error?: string;
        error_description?: string;
      }) => void;
      error_callback?: (err: { type?: string; message?: string }) => void;
    }) => TokenClientInstance;
  };
}

declare global {
  interface Window {
    google?: {
      accounts?: GoogleIdentityAccounts;
    };
  }
}

let driveStatus: DriveSyncStatus = {
  state: 'idle',
  gmail: '',
  lastSyncAtMs: null,
  fileId: '',
  errorMessage: '',
};

const driveStatusListeners = new Set<(status: DriveSyncStatus) => void>();

function emitDriveStatus(patch: Partial<DriveSyncStatus>): void {
  driveStatus = { ...driveStatus, ...patch };
  const snap = { ...driveStatus };
  driveStatusListeners.forEach((cb) => cb(snap));
}

export function getDriveSyncStatus(): DriveSyncStatus {
  return { ...driveStatus };
}

export function subscribeDriveSyncStatus(cb: (status: DriveSyncStatus) => void): () => void {
  driveStatusListeners.add(cb);
  cb({ ...driveStatus });
  return () => {
    driveStatusListeners.delete(cb);
  };
}

export function normalizeGmail(email: string): string {
  return email.trim().toLowerCase();
}

export function saveGmailSessionMeta(meta: GmailStudentSessionMeta | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!meta || !meta.email) {
      localStorage.removeItem(GMAIL_SESSION_META_KEY);
      emitDriveStatus({ gmail: '', lastSyncAtMs: null, fileId: '', state: 'idle', errorMessage: '' });
      return;
    }
    const clean: GmailStudentSessionMeta = {
      uid: meta.uid.trim(),
      email: normalizeGmail(meta.email),
      displayName: meta.displayName.trim().slice(0, 60),
      photoUrl: meta.photoUrl?.trim() || '',
    };
    localStorage.setItem(GMAIL_SESSION_META_KEY, JSON.stringify(clean));
    const savedSyncMs = loadLastDriveSyncMs(clean.email);
    const savedFileId = loadCachedDriveFileId(clean.email);
    emitDriveStatus({
      gmail: clean.email,
      lastSyncAtMs: savedSyncMs,
      fileId: savedFileId,
      state: getStoredDriveAccessToken(clean.email) ? 'synced' : 'idle',
      errorMessage: '',
    });
  } catch {
    // Ignore storage error
  }
}

export function loadGmailSessionMeta(): GmailStudentSessionMeta | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GMAIL_SESSION_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GmailStudentSessionMeta>;
    if (!parsed.email || !parsed.uid) return null;
    return {
      uid: String(parsed.uid),
      email: normalizeGmail(String(parsed.email)),
      displayName: String(parsed.displayName ?? ''),
      photoUrl: typeof parsed.photoUrl === 'string' ? parsed.photoUrl : '',
    };
  } catch {
    return null;
  }
}

export function storeDriveAccessToken(
  accessToken: string,
  email: string,
  expiresInSeconds = 3300
): void {
  if (!accessToken.trim()) return;
  const cleanEmail = normalizeGmail(email);
  const expiresAtMs = Date.now() + Math.max(300, expiresInSeconds - 120) * 1000;
  const rec: StoredTokenRecord = {
    accessToken: accessToken.trim(),
    email: cleanEmail,
    expiresAtMs,
  };
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(DRIVE_TOKEN_KEY, JSON.stringify(rec));
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DRIVE_TOKEN_KEY, JSON.stringify(rec));
    }
  } catch {
    // Ignore
  }
}

export function getStoredDriveAccessToken(expectedEmail = ''): string | null {
  const cleanExpected = normalizeGmail(expectedEmail);
  const readFrom = (store: Storage | undefined): StoredTokenRecord | null => {
    if (!store) return null;
    try {
      const raw = store.getItem(DRIVE_TOKEN_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as StoredTokenRecord;
    } catch {
      return null;
    }
  };
  const rec =
    readFrom(typeof sessionStorage !== 'undefined' ? sessionStorage : undefined) ??
    readFrom(typeof localStorage !== 'undefined' ? localStorage : undefined);
  if (!rec || !rec.accessToken) return null;
  if (Date.now() >= Number(rec.expiresAtMs || 0)) return null;
  if (cleanExpected && rec.email && normalizeGmail(rec.email) !== cleanExpected) {
    return null;
  }
  return rec.accessToken;
}

export function clearDriveAccessToken(): void {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(DRIVE_TOKEN_KEY);
    if (typeof localStorage !== 'undefined') localStorage.removeItem(DRIVE_TOKEN_KEY);
  } catch {
    // Ignore
  }
}

function loadCachedDriveFileId(email: string): string {
  if (typeof localStorage === 'undefined' || !email) return '';
  try {
    return localStorage.getItem(`${DRIVE_FILE_ID_PREFIX}${normalizeGmail(email)}`) ?? '';
  } catch {
    return '';
  }
}

function saveCachedDriveFileId(email: string, fileId: string): void {
  if (typeof localStorage === 'undefined' || !email) return;
  try {
    if (fileId) {
      localStorage.setItem(`${DRIVE_FILE_ID_PREFIX}${normalizeGmail(email)}`, fileId);
    } else {
      localStorage.removeItem(`${DRIVE_FILE_ID_PREFIX}${normalizeGmail(email)}`);
    }
  } catch {
    // Ignore
  }
}

function loadLastDriveSyncMs(email: string): number | null {
  if (typeof localStorage === 'undefined' || !email) return null;
  try {
    const raw = localStorage.getItem(`${DRIVE_LAST_SYNC_PREFIX}${normalizeGmail(email)}`);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function saveLastDriveSyncMs(email: string, ms: number): void {
  if (typeof localStorage === 'undefined' || !email) return;
  try {
    localStorage.setItem(`${DRIVE_LAST_SYNC_PREFIX}${normalizeGmail(email)}`, String(Math.floor(ms)));
  } catch {
    // Ignore
  }
}

function loadLastUploadedHash(email: string): string {
  if (typeof localStorage === 'undefined' || !email) return '';
  try {
    return localStorage.getItem(`${DRIVE_HASH_PREFIX}${normalizeGmail(email)}`) ?? '';
  } catch {
    return '';
  }
}

function saveLastUploadedHash(email: string, hash: string): void {
  if (typeof localStorage === 'undefined' || !email) return;
  try {
    localStorage.setItem(`${DRIVE_HASH_PREFIX}${normalizeGmail(email)}`, hash);
  } catch {
    // Ignore
  }
}

export function saveLocalGmailBackup(data: StudentDriveBackupData): void {
  if (typeof localStorage === 'undefined' || !data.gmail) return;
  try {
    localStorage.setItem(
      `${DRIVE_BACKUP_LOCAL_PREFIX}${normalizeGmail(data.gmail)}`,
      JSON.stringify(data)
    );
  } catch {
    // Ignore quota errors
  }
}

export function loadLocalGmailBackup(email: string): StudentDriveBackupData | null {
  if (typeof localStorage === 'undefined' || !email) return null;
  try {
    const raw = localStorage.getItem(`${DRIVE_BACKUP_LOCAL_PREFIX}${normalizeGmail(email)}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StudentDriveBackupData;
    if (!parsed || typeof parsed !== 'object' || !parsed.profile) return null;
    return parsed;
  } catch {
    return null;
  }
}

let gisLoadPromise: Promise<void> | null = null;

export function ensureGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('GIS requires a browser environment'));
  }
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-gis-client="1"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('GIS_LOAD_FAILED')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.gisClient = '1';
    script.onload = () => resolve();
    script.onerror = () => {
      gisLoadPromise = null;
      reject(new Error('GIS_LOAD_FAILED'));
    };
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

export async function requestGoogleDriveAccessTokenViaGis(params: {
  clientId?: string;
  loginHint?: string;
  prompt?: '' | 'consent' | 'select_account';
} = {}): Promise<{ accessToken: string; expiresIn: number }> {
  await ensureGoogleIdentityScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error('GOOGLE_GIS_UNAVAILABLE');
  }
  const effectiveClientId = params.clientId?.trim() || DEFAULT_WEB_OAUTH_CLIENT_ID;

  return new Promise<{ accessToken: string; expiresIn: number }>((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('SIGN_IN_TIMEOUT'));
      }
    }, 60_000);

    const client = oauth2.initTokenClient({
      client_id: effectiveClientId,
      scope: DRIVE_SCOPES,
      callback: (resp) => {
        window.clearTimeout(timeoutId);
        if (settled) return;
        settled = true;
        if (resp.error || !resp.access_token) {
          const errCode = (resp.error || 'SIGN_IN_FAILED').toLowerCase();
          if (errCode.includes('access_denied') || errCode.includes('cancelled')) {
            reject(new Error('SIGN_IN_CANCELLED'));
          } else {
            reject(new Error(resp.error_description || resp.error || 'GOOGLE_DRIVE_AUTH_FAILED'));
          }
          return;
        }
        resolve({
          accessToken: resp.access_token,
          expiresIn: Number(resp.expires_in ?? 3500),
        });
      },
      error_callback: (err) => {
        window.clearTimeout(timeoutId);
        if (settled) return;
        settled = true;
        const type = (err.type || '').toLowerCase();
        if (type === 'popup_closed') {
          reject(new Error('SIGN_IN_CANCELLED'));
        } else if (type === 'popup_failed_to_open') {
          reject(new Error('POPUP_BLOCKED'));
        } else {
          reject(new Error(err.message || 'GOOGLE_DRIVE_AUTH_FAILED'));
        }
      },
    });

    client.requestAccessToken({
      prompt: params.prompt ?? (params.loginHint ? 'consent' : 'select_account'),
      ...(params.loginHint ? { login_hint: params.loginHint } : {}),
    });
  });
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<{
  sub: string;
  email: string;
  name: string;
  picture: string;
  emailVerified: boolean;
}> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('DRIVE_AUTH_EXPIRED');
    }
    throw new Error(`USERINFO_HTTP_${res.status}`);
  }
  const data = (await res.json()) as {
    sub?: string;
    email?: string;
    name?: string;
    picture?: string;
    email_verified?: boolean;
  };
  return {
    sub: String(data.sub ?? ''),
    email: normalizeGmail(String(data.email ?? '')),
    name: String(data.name ?? '').trim().slice(0, 60),
    picture: String(data.picture ?? ''),
    emailVerified: Boolean(data.email_verified),
  };
}

export async function verifyDriveTokenHasAccess(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(
      'https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export function serializeAttemptForBackup(a: QuizAttempt, fallbackUid: string): SerializedQuizAttempt {
  const createdMs = timestampToMillis(a.createdAt) || Date.now();
  return {
    id: a.id,
    userId: a.userId || fallbackUid,
    subjectId: a.subjectId,
    subjectTitle: a.subjectTitle,
    chapterTitle: a.chapterTitle,
    score: Number(a.score ?? 0),
    totalQuestions: Number(a.totalQuestions ?? 0),
    percentage: Number(a.percentage ?? 0),
    timeTakenSeconds: Number(a.timeTakenSeconds ?? 0),
    createdAtMs: createdMs,
  };
}

export function deserializeBackupAttempt(a: SerializedQuizAttempt): QuizAttempt {
  const sec = Math.floor((a.createdAtMs || Date.now()) / 1000);
  const ns = Math.floor(((a.createdAtMs || 0) % 1000) * 1_000_000);
  return {
    id: a.id,
    userId: a.userId,
    subjectId: a.subjectId,
    subjectTitle: a.subjectTitle,
    chapterTitle: a.chapterTitle,
    score: a.score,
    totalQuestions: a.totalQuestions,
    percentage: a.percentage,
    timeTakenSeconds: a.timeTakenSeconds,
    createdAt: {
      seconds: sec,
      nanoseconds: ns,
      toDate: () => new Date(a.createdAtMs || Date.now()),
      toMillis: () => a.createdAtMs || Date.now(),
    } as QuizAttempt['createdAt'],
  };
}

export function buildDriveBackupPayload(params: {
  gmail: string;
  uid: string;
  student: StudentProfile | null;
  unlockedSubjects: string[];
  attempts: QuizAttempt[];
  payments: PaymentRequest[];
  fallbackName?: string;
  fallbackMobile?: string;
}): StudentDriveBackupData {
  const cleanGmail = normalizeGmail(params.gmail);
  const unlockedSet = new Set<string>(params.unlockedSubjects);
  if (params.student?.hasQuizAccess) {
    unlockedSet.add('all');
    ALL_SUBJECT_IDS.forEach((s) => unlockedSet.add(s));
  }
  (params.student?.unlockedSubjects ?? []).forEach((s) => unlockedSet.add(s));
  if (unlockedSet.has('all') || ALL_SUBJECT_IDS.every((s) => unlockedSet.has(s))) {
    unlockedSet.add('all');
    ALL_SUBJECT_IDS.forEach((s) => unlockedSet.add(s));
  }

  const hasFull = unlockedSet.has('all') || ALL_SUBJECT_IDS.every((s) => unlockedSet.has(s));
  const serializedAttempts = params.attempts
    .slice(0, 200)
    .map((a) => serializeAttemptForBackup(a, params.uid));

  const bestFromAttempts = serializedAttempts.reduce(
    (max, a) => Math.max(max, Number(a.percentage ?? 0)),
    0
  );

  const paymentIds = Array.from(
    new Set([
      ...(params.student?.paymentRequestIds ?? []),
      ...params.payments.map((p) => p.id),
    ])
  )
    .filter((id) => /^pay_[a-f0-9]{32}$/.test(id))
    .slice(0, 25);

  return {
    version: 1,
    appId: 'std10_gujarati_quiz',
    gmail: cleanGmail,
    uid: params.uid,
    updatedAtMs: Date.now(),
    lastSyncedDevice: getCurrentDeviceIdentity().deviceName,
    profile: {
      fullName: (params.student?.fullName || params.fallbackName || cleanGmail.split('@')[0] || 'Student').slice(0, 60),
      mobileNumber: (params.student?.mobileNumber || params.fallbackMobile || '').replace(/\D/g, '').slice(-10),
      email: cleanGmail,
      standard: params.student?.standard || 'ધોરણ 10',
      hasQuizAccess: hasFull,
      redeemedCode: params.student?.redeemedCode || '',
      paymentStatus: params.student?.paymentStatus || 'none',
      totalQuizzesTaken: Math.max(
        params.student?.totalQuizzesTaken ?? 0,
        serializedAttempts.length
      ),
      bestScorePercent: Math.max(params.student?.bestScorePercent ?? 0, bestFromAttempts),
      unlockedSubjects: Array.from(unlockedSet).slice(0, 10),
      paymentRequestIds: paymentIds,
    },
    attempts: serializedAttempts,
    paymentsSummary: params.payments.slice(0, 25).map((p) => ({
      id: p.id,
      amountRupees: Number(p.amountRupees ?? 24),
      status: p.status,
      assignedCode: p.assignedCode || '',
      subjectId: p.subjectId,
      upiTransactionRef: p.upiTransactionRef || '',
      createdAtMs: timestampToMillis(p.createdAt) || Date.now(),
    })),
  };
}

export function mergeStudentDriveBackups(
  a: StudentDriveBackupData | null | undefined,
  b: StudentDriveBackupData | null | undefined
): StudentDriveBackupData | null {
  if (!a && !b) return null;
  if (!a) return b ?? null;
  if (!b) return a;

  const newer = b.updatedAtMs >= a.updatedAtMs ? b : a;
  const older = newer === b ? a : b;

  const unlocked = new Set<string>([
    ...(older.profile.unlockedSubjects ?? []),
    ...(newer.profile.unlockedSubjects ?? []),
  ]);
  const hasFull =
    older.profile.hasQuizAccess ||
    newer.profile.hasQuizAccess ||
    unlocked.has('all') ||
    ALL_SUBJECT_IDS.every((s) => unlocked.has(s));
  if (hasFull) {
    unlocked.add('all');
    ALL_SUBJECT_IDS.forEach((s) => unlocked.add(s));
  }

  const attemptMap = new Map<string, SerializedQuizAttempt>();
  for (const item of [...older.attempts, ...newer.attempts]) {
    if (!item?.id) continue;
    const prev = attemptMap.get(item.id);
    if (!prev || item.createdAtMs >= prev.createdAtMs) {
      attemptMap.set(item.id, item);
    }
  }
  const mergedAttempts = Array.from(attemptMap.values())
    .sort((x, y) => y.createdAtMs - x.createdAtMs)
    .slice(0, 200);

  const payMap = new Map<string, SerializedPaymentSummary>();
  for (const item of [...older.paymentsSummary, ...newer.paymentsSummary]) {
    if (!item?.id) continue;
    payMap.set(item.id, item);
  }

  const paymentRequestIds = Array.from(
    new Set([...(older.profile.paymentRequestIds ?? []), ...(newer.profile.paymentRequestIds ?? [])])
  ).slice(0, 25);

  const bestFromAttempts = mergedAttempts.reduce((m, x) => Math.max(m, Number(x.percentage ?? 0)), 0);

  return {
    version: 1,
    appId: 'std10_gujarati_quiz',
    gmail: newer.gmail || older.gmail,
    uid: newer.uid || older.uid,
    updatedAtMs: Math.max(a.updatedAtMs, b.updatedAtMs, Date.now()),
    lastSyncedDevice: newer.lastSyncedDevice || older.lastSyncedDevice,
    profile: {
      fullName: newer.profile.fullName || older.profile.fullName || 'Student',
      mobileNumber: newer.profile.mobileNumber || older.profile.mobileNumber || '',
      email: newer.profile.email || older.profile.email || newer.gmail || older.gmail,
      standard: newer.profile.standard || older.profile.standard || 'ધોરણ 10',
      hasQuizAccess: hasFull,
      redeemedCode: newer.profile.redeemedCode || older.profile.redeemedCode || '',
      paymentStatus:
        newer.profile.paymentStatus !== 'none'
          ? newer.profile.paymentStatus
          : older.profile.paymentStatus,
      totalQuizzesTaken: Math.max(
        older.profile.totalQuizzesTaken,
        newer.profile.totalQuizzesTaken,
        mergedAttempts.length
      ),
      bestScorePercent: Math.max(
        older.profile.bestScorePercent,
        newer.profile.bestScorePercent,
        bestFromAttempts
      ),
      unlockedSubjects: Array.from(unlocked).slice(0, 10),
      paymentRequestIds,
    },
    attempts: mergedAttempts,
    paymentsSummary: Array.from(payMap.values()).slice(0, 25),
  };
}

export function computeBackupSignature(data: StudentDriveBackupData): string {
  return JSON.stringify({
    gmail: data.gmail,
    profile: data.profile,
    attemptIds: data.attempts.map((a) => `${a.id}:${a.score}:${a.totalQuestions}`),
    payments: data.paymentsSummary.map((p) => `${p.id}:${p.status}:${p.assignedCode}`),
  });
}

export async function findStudentDriveBackupFile(
  accessToken: string,
  gmail = ''
): Promise<{ id: string; modifiedTime?: string } | null> {
  const q = `name='${DRIVE_BACKUP_FILENAME}' and trashed=false`;
  const url =
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}` +
    `&spaces=drive&orderBy=modifiedTime desc&pageSize=1&fields=files(id,name,modifiedTime)`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('DRIVE_AUTH_EXPIRED');
    }
    throw new Error(`DRIVE_LIST_HTTP_${res.status}`);
  }
  const body = (await res.json()) as { files?: Array<{ id: string; modifiedTime?: string }> };
  const first = body.files?.[0];
  if (!first?.id) return null;
  if (gmail) {
    saveCachedDriveFileId(gmail, first.id);
  }
  return first;
}

export async function loadStudentDataFromDrive(
  accessToken: string,
  gmail = ''
): Promise<{ fileId: string; data: StudentDriveBackupData | null }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    emitDriveStatus({ state: 'offline', gmail });
    return { fileId: loadCachedDriveFileId(gmail), data: loadLocalGmailBackup(gmail) };
  }

  emitDriveStatus({ state: 'syncing', gmail, errorMessage: '' });
  try {
    const fileMeta = await findStudentDriveBackupFile(accessToken, gmail);
    if (!fileMeta) {
      return { fileId: '', data: null };
    }
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileMeta.id)}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('DRIVE_AUTH_EXPIRED');
      }
      throw new Error(`DRIVE_READ_HTTP_${res.status}`);
    }
    const parsed = (await res.json()) as Partial<StudentDriveBackupData>;
    if (!parsed || typeof parsed !== 'object' || !parsed.profile) {
      return { fileId: fileMeta.id, data: null };
    }
    const normalized: StudentDriveBackupData = {
      version: 1,
      appId: 'std10_gujarati_quiz',
      gmail: normalizeGmail(parsed.gmail || gmail),
      uid: String(parsed.uid || ''),
      updatedAtMs: Number(parsed.updatedAtMs || Date.now()),
      lastSyncedDevice: String(parsed.lastSyncedDevice || ''),
      profile: {
        fullName: String(parsed.profile.fullName || 'Student'),
        mobileNumber: String(parsed.profile.mobileNumber || '').replace(/\D/g, '').slice(-10),
        email: normalizeGmail(String(parsed.profile.email || parsed.gmail || gmail)),
        standard: String(parsed.profile.standard || 'ધોરણ 10'),
        hasQuizAccess: Boolean(parsed.profile.hasQuizAccess),
        redeemedCode: String(parsed.profile.redeemedCode || ''),
        paymentStatus: parsed.profile.paymentStatus || 'none',
        totalQuizzesTaken: Number(parsed.profile.totalQuizzesTaken || 0),
        bestScorePercent: Number(parsed.profile.bestScorePercent || 0),
        unlockedSubjects: Array.isArray(parsed.profile.unlockedSubjects)
          ? parsed.profile.unlockedSubjects.map((x) => String(x))
          : [],
        paymentRequestIds: Array.isArray(parsed.profile.paymentRequestIds)
          ? parsed.profile.paymentRequestIds.map((x) => String(x))
          : [],
      },
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
      paymentsSummary: Array.isArray(parsed.paymentsSummary) ? parsed.paymentsSummary : [],
    };

    const nowMs = Date.now();
    saveLocalGmailBackup(normalized);
    if (normalized.gmail) {
      saveLastUploadedHash(normalized.gmail, computeBackupSignature(normalized));
      saveLastDriveSyncMs(normalized.gmail, nowMs);
    }
    emitDriveStatus({
      state: 'synced',
      gmail: normalized.gmail,
      fileId: fileMeta.id,
      lastSyncAtMs: nowMs,
      errorMessage: '',
    });
    return { fileId: fileMeta.id, data: normalized };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    if (msg === 'DRIVE_AUTH_EXPIRED') {
      emitDriveStatus({ state: 'needs_reconnect', gmail, errorMessage: msg });
    } else {
      emitDriveStatus({ state: 'error', gmail, errorMessage: msg });
    }
    throw err;
  }
}

export async function saveStudentDataToDrive(
  accessToken: string,
  data: StudentDriveBackupData,
  options: { force?: boolean; knownFileId?: string } = {}
): Promise<{ fileId: string; skipped: boolean }> {
  const cleanGmail = normalizeGmail(data.gmail);
  saveLocalGmailBackup(data);

  const nextHash = computeBackupSignature(data);
  const prevHash = loadLastUploadedHash(cleanGmail);
  let fileId = options.knownFileId || loadCachedDriveFileId(cleanGmail);

  if (!options.force && prevHash && prevHash === nextHash && fileId) {
    return { fileId, skipped: true };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    emitDriveStatus({ state: 'offline', gmail: cleanGmail });
    return { fileId, skipped: true };
  }

  emitDriveStatus({ state: 'syncing', gmail: cleanGmail, errorMessage: '' });

  try {
    if (!fileId) {
      const existing = await findStudentDriveBackupFile(accessToken, cleanGmail);
      if (existing?.id) {
        fileId = existing.id;
      }
    }

    const boundary = `std10_drive_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const metadata: Record<string, unknown> = {
      name: DRIVE_BACKUP_FILENAME,
      mimeType: 'application/json',
      appProperties: {
        app: 'std10_quiz_portal',
        gmail: cleanGmail,
      },
    };
    const jsonPayload = JSON.stringify(data, null, 2);
    const multipartBody = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      jsonPayload,
      `--${boundary}--`,
      '',
    ].join('\r\n');

    const uploadUrl = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id,modifiedTime`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime`;

    let res = await fetch(uploadUrl, {
      method: fileId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    });

    // If cached fileId was deleted by the user from Google Drive, recreate once via POST
    if (fileId && res.status === 404) {
      saveCachedDriveFileId(cleanGmail, '');
      res = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartBody,
        }
      );
    }

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('DRIVE_AUTH_EXPIRED');
      }
      throw new Error(`DRIVE_UPLOAD_HTTP_${res.status}`);
    }

    const body = (await res.json()) as { id?: string };
    const finalFileId = body.id || fileId;
    const nowMs = Date.now();
    if (finalFileId) saveCachedDriveFileId(cleanGmail, finalFileId);
    saveLastUploadedHash(cleanGmail, nextHash);
    saveLastDriveSyncMs(cleanGmail, nowMs);

    emitDriveStatus({
      state: 'synced',
      gmail: cleanGmail,
      fileId: finalFileId,
      lastSyncAtMs: nowMs,
      errorMessage: '',
    });

    return { fileId: finalFileId, skipped: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    if (msg === 'DRIVE_AUTH_EXPIRED') {
      emitDriveStatus({ state: 'needs_reconnect', gmail: cleanGmail, errorMessage: msg });
    } else {
      emitDriveStatus({ state: 'error', gmail: cleanGmail, errorMessage: msg });
    }
    throw err;
  }
}
