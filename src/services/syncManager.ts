import type { Timestamp } from 'firebase/firestore';
import type { AccessCode, PaymentRequest, QuizAttempt, StudentProfile } from '../types/models';

export type SyncErrorKind = 'none' | 'network' | 'quota' | 'permission' | 'unknown';
export type LiveSyncState = 'active' | 'paused';

export type SyncOperationType =
  | 'quiz_attempt'
  | 'free_mock_used'
  | 'student_profile_sync'
  | 'payment_submit'
  | 'admin_toggle_access'
  | 'admin_reject_payment'
  | 'admin_release_config';

export interface QueuedSyncOperation {
  id: string;
  opKey: string;
  type: SyncOperationType;
  payload: Record<string, unknown>;
  createdAtMs: number;
  updatedAtMs: number;
  retryCount: number;
  nextRetryAtMs: number;
  status: 'pending' | 'failed';
  lastError: string;
}

export interface SyncStatusSnapshot {
  isOnline: boolean;
  serverConnected: boolean;
  liveSyncState: LiveSyncState;
  lastSyncAtMs: number | null;
  pendingSyncCount: number;
  failedSyncCount: number;
  isSyncing: boolean;
  errorKind: SyncErrorKind;
  quotaCooldownUntilMs: number;
  lastErrorMessage: string;
}

const STORAGE_KEYS = {
  LAST_SYNC_MS: 'std10_last_sync_at_ms_v1',
  QUOTA_COOLDOWN_MS: 'std10_quota_cooldown_until_ms_v1',
  SYNC_QUEUE: 'std10_offline_sync_queue_v1',
  ADMIN_PAYMENTS_CACHE: 'std10_admin_cache_payments_v1',
  ADMIN_CODES_CACHE: 'std10_admin_cache_codes_v1',
  ADMIN_STUDENTS_CACHE: 'std10_admin_cache_students_v1',
  COLLECTION_WATERMARK_PREFIX: 'std10_col_sync_ms_v1_',
  ATTEMPTS_CACHE_PREFIX: 'std10_my_attempts_cache_v1_',
} as const;

export const MAX_SYNC_RETRIES = 4;
const QUOTA_COOLDOWN_DURATION_MS = 5 * 60 * 1000;
const RETRY_BACKOFF_SCHEDULE_MS = [5_000, 15_000, 45_000, 120_000];

function readNumberFromStorage(key: string): number | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function writeNumberToStorage(key: string, val: number | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (val === null || val <= 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, String(Math.floor(val)));
    }
  } catch {
    // Ignore storage errors
  }
}

export function loadSyncQueue(): QueuedSyncOperation[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SYNC_QUEUE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is QueuedSyncOperation =>
        Boolean(item && typeof item === 'object' && typeof item.id === 'string' && typeof item.opKey === 'string')
    );
  } catch {
    return [];
  }
}

function saveSyncQueue(queue: QueuedSyncOperation[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(queue.slice(0, 60)));
  } catch {
    // If oversized due to a payment screenshot, trim oldest failed/completed payloads first
    try {
      const compact = queue.slice(-20);
      localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(compact));
    } catch {
      // Ignore unrecoverable storage quota error
    }
  }
}

function getInitialOnline(): boolean {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true;
}

const initialCooldown = readNumberFromStorage(STORAGE_KEYS.QUOTA_COOLDOWN_MS) ?? 0;
const initialQueue = loadSyncQueue();

let currentStatus: SyncStatusSnapshot = {
  isOnline: getInitialOnline(),
  serverConnected: getInitialOnline() && Date.now() >= initialCooldown,
  liveSyncState: getInitialOnline() && Date.now() >= initialCooldown ? 'active' : 'paused',
  lastSyncAtMs: readNumberFromStorage(STORAGE_KEYS.LAST_SYNC_MS),
  pendingSyncCount: initialQueue.filter((q) => q.status === 'pending').length,
  failedSyncCount: initialQueue.filter((q) => q.status === 'failed').length,
  isSyncing: false,
  errorKind: Date.now() < initialCooldown ? 'quota' : !getInitialOnline() ? 'network' : 'none',
  quotaCooldownUntilMs: initialCooldown,
  lastErrorMessage: '',
};

const statusListeners = new Set<(snapshot: SyncStatusSnapshot) => void>();

function recomputeCountsAndEmit(): void {
  const queue = loadSyncQueue();
  currentStatus = {
    ...currentStatus,
    pendingSyncCount: queue.filter((q) => q.status === 'pending').length,
    failedSyncCount: queue.filter((q) => q.status === 'failed').length,
  };
  const snap = { ...currentStatus };
  statusListeners.forEach((cb) => cb(snap));
}

export function getSyncStatus(): SyncStatusSnapshot {
  return { ...currentStatus };
}

export function subscribeSyncStatus(cb: (snapshot: SyncStatusSnapshot) => void): () => void {
  statusListeners.add(cb);
  cb({ ...currentStatus });
  return () => {
    statusListeners.delete(cb);
  };
}

export function classifyFirestoreError(err: unknown): SyncErrorKind {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const lower = raw.toLowerCase();
  if (
    raw === 'QUOTA_EXCEEDED' ||
    lower.includes('resource_exhausted') ||
    lower.includes('resource-exhausted') ||
    lower.includes('quota')
  ) {
    return 'quota';
  }
  if (
    lower.includes('unavailable') ||
    lower.includes('offline') ||
    lower.includes('network') ||
    lower.includes('failed to get document because the client is offline') ||
    lower.includes('deadline-exceeded') ||
    lower.includes('deadline_exceeded') ||
    lower.includes('timed out')
  ) {
    return 'network';
  }
  if (lower.includes('permission') || lower.includes('insufficient permissions')) {
    return 'permission';
  }
  return 'unknown';
}

export function isNonRetryableSyncError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (
    raw === 'DUPLICATE_UTR' ||
    raw === 'INVALID_MOBILE' ||
    raw === 'INVALID_NAME' ||
    raw === 'SCREENSHOT_REQUIRED' ||
    raw === 'RESERVED_ADMIN_MOBILE' ||
    raw === 'ALREADY_PROCESSED'
  ) {
    return true;
  }
  return classifyFirestoreError(err) === 'permission';
}

export function isQuotaCooldownActive(nowMs = Date.now()): boolean {
  return currentStatus.quotaCooldownUntilMs > nowMs;
}

export function setOnlineState(online: boolean): void {
  const changed = currentStatus.isOnline !== online;
  if (!online) {
    currentStatus = {
      ...currentStatus,
      isOnline: false,
      serverConnected: false,
      liveSyncState: 'paused',
      errorKind: currentStatus.errorKind === 'quota' ? 'quota' : 'network',
    };
  } else {
    const inCooldown = isQuotaCooldownActive();
    currentStatus = {
      ...currentStatus,
      isOnline: true,
      serverConnected: !inCooldown,
      liveSyncState: inCooldown ? 'paused' : 'active',
      errorKind: inCooldown ? 'quota' : 'none',
      lastErrorMessage: inCooldown ? currentStatus.lastErrorMessage : '',
    };
  }
  if (changed) {
    recomputeCountsAndEmit();
  }
}

export function setLiveSyncState(state: LiveSyncState): void {
  if (currentStatus.liveSyncState === state) return;
  currentStatus = {
    ...currentStatus,
    liveSyncState: state,
  };
  recomputeCountsAndEmit();
}

export function markServerSyncSuccess(nowMs = Date.now()): void {
  writeNumberToStorage(STORAGE_KEYS.LAST_SYNC_MS, nowMs);
  writeNumberToStorage(STORAGE_KEYS.QUOTA_COOLDOWN_MS, null);
  currentStatus = {
    ...currentStatus,
    isOnline: true,
    serverConnected: true,
    lastSyncAtMs: nowMs,
    quotaCooldownUntilMs: 0,
    errorKind: 'none',
    lastErrorMessage: '',
  };
  recomputeCountsAndEmit();
}

export function markServerSyncError(err: unknown, nowMs = Date.now()): SyncErrorKind {
  const kind = classifyFirestoreError(err);
  const rawMsg = err instanceof Error ? err.message : String(err ?? '');
  let cooldownUntil = currentStatus.quotaCooldownUntilMs;
  if (kind === 'quota') {
    cooldownUntil = nowMs + QUOTA_COOLDOWN_DURATION_MS;
    writeNumberToStorage(STORAGE_KEYS.QUOTA_COOLDOWN_MS, cooldownUntil);
  }
  currentStatus = {
    ...currentStatus,
    serverConnected: false,
    liveSyncState: kind === 'quota' || kind === 'network' ? 'paused' : currentStatus.liveSyncState,
    errorKind: kind,
    quotaCooldownUntilMs: cooldownUntil,
    lastErrorMessage: rawMsg,
  };
  recomputeCountsAndEmit();
  return kind;
}

export function clearQuotaCooldown(): void {
  writeNumberToStorage(STORAGE_KEYS.QUOTA_COOLDOWN_MS, null);
  currentStatus = {
    ...currentStatus,
    quotaCooldownUntilMs: 0,
    errorKind: currentStatus.isOnline ? 'none' : 'network',
    lastErrorMessage: '',
  };
  recomputeCountsAndEmit();
}

export function applyNativeSyncSnapshot(patch: Partial<SyncStatusSnapshot>): void {
  if (typeof patch.lastSyncAtMs === 'number' && patch.lastSyncAtMs > 0) {
    writeNumberToStorage(STORAGE_KEYS.LAST_SYNC_MS, patch.lastSyncAtMs);
  }
  if (typeof patch.quotaCooldownUntilMs === 'number') {
    writeNumberToStorage(
      STORAGE_KEYS.QUOTA_COOLDOWN_MS,
      patch.quotaCooldownUntilMs > 0 ? patch.quotaCooldownUntilMs : null
    );
  }
  currentStatus = {
    ...currentStatus,
    ...patch,
  };
  recomputeCountsAndEmit();
}

export function enqueueSyncOperation(
  type: SyncOperationType,
  opKey: string,
  payload: Record<string, unknown>,
  initialError?: string
): QueuedSyncOperation {
  const now = Date.now();
  const queue = loadSyncQueue();
  const existingIdx = queue.findIndex((item) => item.opKey === opKey);

  if (existingIdx >= 0) {
    const existing = queue[existingIdx];
    const updated: QueuedSyncOperation = {
      ...existing,
      type,
      payload,
      updatedAtMs: now,
      status: 'pending',
      nextRetryAtMs: now + RETRY_BACKOFF_SCHEDULE_MS[0],
      lastError: initialError ?? existing.lastError,
    };
    queue[existingIdx] = updated;
    saveSyncQueue(queue);
    recomputeCountsAndEmit();
    return updated;
  }

  const created: QueuedSyncOperation = {
    id: `sync_${now}_${Math.random().toString(36).slice(2, 8)}`,
    opKey,
    type,
    payload,
    createdAtMs: now,
    updatedAtMs: now,
    retryCount: 0,
    nextRetryAtMs: now + RETRY_BACKOFF_SCHEDULE_MS[0],
    status: 'pending',
    lastError: initialError ?? '',
  };
  queue.push(created);
  saveSyncQueue(queue);
  recomputeCountsAndEmit();
  return created;
}

export function resetFailedOperationsForRetry(): number {
  const now = Date.now();
  const queue = loadSyncQueue();
  let resetCount = 0;
  const next = queue.map((item) => {
    if (item.status === 'failed') {
      resetCount += 1;
      return {
        ...item,
        status: 'pending' as const,
        retryCount: 0,
        nextRetryAtMs: now,
      };
    }
    return {
      ...item,
      nextRetryAtMs: Math.min(item.nextRetryAtMs, now),
    };
  });
  saveSyncQueue(next);
  recomputeCountsAndEmit();
  return resetCount;
}

let activeFlushPromise: Promise<{ synced: number; failed: number; remaining: number }> | null = null;

export async function flushSyncQueue(
  executor: (op: QueuedSyncOperation) => Promise<void>,
  options: { forceDue?: boolean } = {}
): Promise<{ synced: number; failed: number; remaining: number }> {
  if (activeFlushPromise) return activeFlushPromise;

  activeFlushPromise = (async () => {
    const now = Date.now();
    if (!currentStatus.isOnline || (!options.forceDue && isQuotaCooldownActive(now))) {
      const q = loadSyncQueue();
      return {
        synced: 0,
        failed: q.filter((x) => x.status === 'failed').length,
        remaining: q.filter((x) => x.status === 'pending').length,
      };
    }

    const queue = loadSyncQueue();
    const dueItems = queue.filter(
      (item) => item.status === 'pending' && (options.forceDue || item.nextRetryAtMs <= now)
    );
    if (dueItems.length === 0) {
      return {
        synced: 0,
        failed: queue.filter((x) => x.status === 'failed').length,
        remaining: queue.filter((x) => x.status === 'pending').length,
      };
    }

    currentStatus = { ...currentStatus, isSyncing: true };
    recomputeCountsAndEmit();

    let synced = 0;
    let workingQueue = [...queue];

    for (const op of dueItems) {
      if (!currentStatus.isOnline || isQuotaCooldownActive()) {
        break;
      }
      try {
        await executor(op);
        workingQueue = workingQueue.filter((item) => item.opKey !== op.opKey);
        synced += 1;
        markServerSyncSuccess();
      } catch (err) {
        const errKind = markServerSyncError(err);
        const nonRetryable = isNonRetryableSyncError(err);
        const errMsg = err instanceof Error ? err.message : String(err ?? 'Sync failed');
        const nextRetryCount = op.retryCount + 1;
        const exhausted = nonRetryable || nextRetryCount >= MAX_SYNC_RETRIES;
        const backoff =
          RETRY_BACKOFF_SCHEDULE_MS[
            Math.min(nextRetryCount - 1, RETRY_BACKOFF_SCHEDULE_MS.length - 1)
          ];

        workingQueue = workingQueue.map((item) =>
          item.opKey === op.opKey
            ? {
                ...item,
                retryCount: nextRetryCount,
                nextRetryAtMs: Date.now() + backoff,
                status: exhausted ? ('failed' as const) : ('pending' as const),
                lastError: errMsg,
                updatedAtMs: Date.now(),
              }
            : item
        );

        if (errKind === 'quota' || errKind === 'network') {
          break;
        }
      }
    }

    saveSyncQueue(workingQueue);
    currentStatus = { ...currentStatus, isSyncing: false };
    recomputeCountsAndEmit();

    return {
      synced,
      failed: workingQueue.filter((x) => x.status === 'failed').length,
      remaining: workingQueue.filter((x) => x.status === 'pending').length,
    };
  })().finally(() => {
    activeFlushPromise = null;
  });

  return activeFlushPromise;
}

export function timestampToMillis(ts: Timestamp | { seconds?: number; nanoseconds?: number } | null | undefined): number {
  if (!ts) return 0;
  const sec = typeof ts.seconds === 'number' ? ts.seconds : 0;
  const ns = typeof ts.nanoseconds === 'number' ? ts.nanoseconds : 0;
  return sec * 1000 + Math.floor(ns / 1_000_000);
}

export function mergeRecordsByIdNewer<
  T extends { id?: string; updatedAt?: Timestamp | null; createdAt?: Timestamp | null }
>(existing: T[], incoming: T[], keyFn: (item: T) => string = (x) => String(x.id ?? '')): T[] {
  const map = new Map<string, T>();
  for (const item of existing) {
    const k = keyFn(item);
    if (k) map.set(k, item);
  }
  for (const inc of incoming) {
    const k = keyFn(inc);
    if (!k) continue;
    const prev = map.get(k);
    if (!prev) {
      map.set(k, inc);
      continue;
    }
    const prevMs = Math.max(timestampToMillis(prev.updatedAt), timestampToMillis(prev.createdAt));
    const incMs = Math.max(timestampToMillis(inc.updatedAt), timestampToMillis(inc.createdAt));
    // Prefer incoming when its timestamp is >= existing (or if existing had null serverTimestamp)
    if (incMs >= prevMs || prevMs === 0) {
      map.set(k, inc);
    }
  }
  return Array.from(map.values());
}

export function mergeStudentProfilesConflictSafe(
  remote: StudentProfile,
  local: StudentProfile | null | undefined
): StudentProfile {
  if (!local) return remote;
  const unlocked = new Set<string>([...(remote.unlockedSubjects ?? []), ...(local.unlockedSubjects ?? [])]);
  const hasFull =
    remote.hasQuizAccess ||
    local.hasQuizAccess ||
    unlocked.has('all') ||
    ['maths', 'science', 'social_science', 'english', 'gujarati', 'hindi'].every((s) =>
      unlocked.has(s)
    );
  if (hasFull) {
    unlocked.add('all');
    ['maths', 'science', 'social_science', 'english', 'gujarati', 'hindi'].forEach((s) =>
      unlocked.add(s)
    );
  }
  const mergedPaymentIds = Array.from(
    new Set([...(remote.paymentRequestIds ?? []), ...(local.paymentRequestIds ?? [])])
  ).slice(0, 25);
  const mergedFreeMocks = Array.from(
    new Set([...(remote.freeMockUsedSubjects ?? []), ...(local.freeMockUsedSubjects ?? [])])
  ).slice(0, 6);

  return {
    ...remote,
    hasQuizAccess: hasFull,
    unlockedSubjects: Array.from(unlocked).slice(0, 10),
    freeMockUsedSubjects: mergedFreeMocks,
    redeemedCode: remote.redeemedCode || local.redeemedCode,
    totalQuizzesTaken: Math.max(remote.totalQuizzesTaken, local.totalQuizzesTaken),
    bestScorePercent: Math.max(remote.bestScorePercent, local.bestScorePercent),
    paymentRequestIds: mergedPaymentIds,
  };
}

export function loadCachedAdminPayments(): PaymentRequest[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ADMIN_PAYMENTS_CACHE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PaymentRequest[]) : [];
  } catch {
    return [];
  }
}

export function saveCachedAdminPayments(items: PaymentRequest[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const capped = items.slice(0, 120);
    const json = JSON.stringify(capped);
    if (json.length <= 1_400_000) {
      localStorage.setItem(STORAGE_KEYS.ADMIN_PAYMENTS_CACHE, json);
      return;
    }
    // Strip heavy base64 thumbnails beyond top 6 to fit safely inside browser localStorage quota
    const trimmed = capped.map((p, idx) =>
      idx < 6 ? p : { ...p, screenshotBase64: '' }
    );
    localStorage.setItem(STORAGE_KEYS.ADMIN_PAYMENTS_CACHE, JSON.stringify(trimmed));
  } catch {
    try {
      const metadataOnly = items.slice(0, 80).map((p) => ({ ...p, screenshotBase64: '' }));
      localStorage.setItem(STORAGE_KEYS.ADMIN_PAYMENTS_CACHE, JSON.stringify(metadataOnly));
    } catch {
      // Ignore unrecoverable storage quota error
    }
  }
}

export function loadCachedAdminCodes(): AccessCode[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ADMIN_CODES_CACHE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AccessCode[]) : [];
  } catch {
    return [];
  }
}

export function saveCachedAdminCodes(items: AccessCode[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.ADMIN_CODES_CACHE, JSON.stringify(items.slice(0, 1500)));
  } catch {
    try {
      localStorage.setItem(STORAGE_KEYS.ADMIN_CODES_CACHE, JSON.stringify(items.slice(0, 400)));
    } catch {
      // Ignore unrecoverable localStorage quota error
    }
  }
}

export function loadCachedAdminStudents(): StudentProfile[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ADMIN_STUDENTS_CACHE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StudentProfile[]) : [];
  } catch {
    return [];
  }
}

export function saveCachedAdminStudents(items: StudentProfile[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.ADMIN_STUDENTS_CACHE, JSON.stringify(items.slice(0, 200)));
  } catch {
    // Ignore
  }
}

export function loadCachedMyAttempts(studentId: string): QuizAttempt[] {
  if (typeof localStorage === 'undefined' || !studentId.trim()) return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.ATTEMPTS_CACHE_PREFIX}${studentId.trim()}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QuizAttempt[]) : [];
  } catch {
    return [];
  }
}

export function saveCachedMyAttempts(studentId: string, items: QuizAttempt[]): void {
  if (typeof localStorage === 'undefined' || !studentId.trim()) return;
  try {
    localStorage.setItem(
      `${STORAGE_KEYS.ATTEMPTS_CACHE_PREFIX}${studentId.trim()}`,
      JSON.stringify(items.slice(0, 20))
    );
  } catch {
    // Ignore
  }
}

export function loadCollectionLastSyncMs(collectionKey: string): number {
  return readNumberFromStorage(`${STORAGE_KEYS.COLLECTION_WATERMARK_PREFIX}${collectionKey}`) ?? 0;
}

export function saveCollectionLastSyncMs(collectionKey: string, ms: number): void {
  writeNumberToStorage(`${STORAGE_KEYS.COLLECTION_WATERMARK_PREFIX}${collectionKey}`, ms);
}

export function formatLastSyncDateTime(ms: number | null, lang: 'gu' | 'en' = 'gu'): string {
  if (!ms || ms <= 0) {
    return lang === 'en' ? 'Not synced yet' : 'હજુ સિંક થયું નથી';
  }
  try {
    return new Date(ms).toLocaleString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return new Date(ms).toISOString();
  }
}
