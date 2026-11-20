import {
  resolveCodeSubjectId,
  type AccessCode,
  type AccessScopeId,
} from '../types/models';

export const DIRECT_OR_UNTAGGED_BATCH_KEY = '__direct_untagged__';

export interface CodeBatchFolder {
  /** Exact Firestore batchName, or DIRECT_OR_UNTAGGED_BATCH_KEY for direct/untagged codes */
  folderKey: string;
  /** Human-readable display name shown on folder card & headers */
  displayName: string;
  /** True when codes do not belong to a named bulk batch */
  isDirectOrUntagged: boolean;
  /** All codes inside this batch folder (newest first) */
  codes: AccessCode[];
  /** Unused codes inside this batch folder */
  unusedCodes: AccessCode[];
  /** Used codes inside this batch folder */
  usedCodes: AccessCode[];
  totalCount: number;
  unusedCount: number;
  usedCount: number;
  subjectId: AccessScopeId;
  latestCreatedSec: number;
}

function getCodeCreatedSeconds(item: AccessCode): number {
  const ts = item.createdAt ?? item.updatedAt;
  if (!ts) return 0;
  if (typeof (ts as { seconds?: unknown }).seconds === 'number') {
    return (ts as { seconds: number }).seconds;
  }
  if (typeof (ts as { toMillis?: () => number }).toMillis === 'function') {
    return Math.floor((ts as { toMillis: () => number }).toMillis() / 1000);
  }
  return 0;
}

export function isAccessCodeUsed(item: AccessCode): boolean {
  return Boolean(item.isUsed || String(item.status || '').toLowerCase() === 'used');
}

export function normalizeBulkBatchName(batchName: string, fallback = 'Batch 1'): string {
  const trimmed = batchName.trim().replace(/\s+/g, ' ');
  return (trimmed || fallback).slice(0, 60);
}

export function groupAccessCodesIntoBatchFolders(
  codes: AccessCode[],
  lang: 'gu' | 'en' = 'gu'
): CodeBatchFolder[] {
  const bucketMap = new Map<string, { isDirect: boolean; displayName: string; items: AccessCode[] }>();

  for (const item of codes) {
    const rawBatch = (item.batchName || '').trim();
    const isDirect = rawBatch.length === 0;
    const folderKey = isDirect ? DIRECT_OR_UNTAGGED_BATCH_KEY : rawBatch;
    const displayName = isDirect
      ? lang === 'en'
        ? 'Direct / Payment Codes'
        : 'ડાયરેક્ટ / પેમેન્ટ કોડ'
      : rawBatch;

    let bucket = bucketMap.get(folderKey);
    if (!bucket) {
      bucket = { isDirect, displayName, items: [] };
      bucketMap.set(folderKey, bucket);
    }
    bucket.items.push(item);
  }

  const folders: CodeBatchFolder[] = [];
  for (const [folderKey, bucket] of bucketMap.entries()) {
    const sortedItems = [...bucket.items].sort(
      (a, b) => getCodeCreatedSeconds(b) - getCodeCreatedSeconds(a)
    );
    const unusedCodes: AccessCode[] = [];
    const usedCodes: AccessCode[] = [];
    for (const item of sortedItems) {
      if (isAccessCodeUsed(item)) {
        usedCodes.push(item);
      } else {
        unusedCodes.push(item);
      }
    }

    const sample = sortedItems[0];
    const subjectId: AccessScopeId = sample
      ? resolveCodeSubjectId(sample.code, sample.batchName, sample.subjectId)
      : 'all';
    const latestCreatedSec = sample ? getCodeCreatedSeconds(sample) : 0;

    folders.push({
      folderKey,
      displayName: bucket.displayName,
      isDirectOrUntagged: bucket.isDirect,
      codes: sortedItems,
      unusedCodes,
      usedCodes,
      totalCount: sortedItems.length,
      unusedCount: unusedCodes.length,
      usedCount: usedCodes.length,
      subjectId,
      latestCreatedSec,
    });
  }

  folders.sort((a, b) => {
    if (a.isDirectOrUntagged !== b.isDirectOrUntagged) {
      return a.isDirectOrUntagged ? 1 : -1;
    }
    if (b.latestCreatedSec !== a.latestCreatedSec) {
      return b.latestCreatedSec - a.latestCreatedSec;
    }
    return a.displayName.localeCompare(b.displayName);
  });

  return folders;
}

export function suggestNextBatchName(folders: CodeBatchFolder[]): string {
  let maxBatchNum = 0;
  const existingLower = new Set<string>();

  for (const folder of folders) {
    if (folder.isDirectOrUntagged) continue;
    existingLower.add(folder.folderKey.trim().toLowerCase());
    const match = folder.folderKey.match(/\bbatch\s*(\d+)\b/i);
    if (match) {
      const n = Number.parseInt(match[1], 10);
      if (Number.isFinite(n) && n > maxBatchNum) {
        maxBatchNum = n;
      }
    }
  }

  let candidateNum = maxBatchNum + 1;
  let candidate = `Batch ${candidateNum}`;
  while (existingLower.has(candidate.toLowerCase())) {
    candidateNum += 1;
    candidate = `Batch ${candidateNum}`;
  }
  return candidate;
}
