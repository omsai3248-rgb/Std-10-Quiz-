import type { GitHubReleaseInfo } from '../types/models';

const metaEnv: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' &&
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ? ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {})
    : {};

export const APP_VERSION_NAME = (metaEnv.VITE_APP_VERSION_NAME ?? '1.0.0').trim() || '1.0.0';
export const APP_VERSION_CODE = (() => {
  const parsed = Number.parseInt(metaEnv.VITE_APP_VERSION_CODE ?? '1', 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
})();
export const APP_BUILD_COMMIT_SHA = (metaEnv.VITE_BUILD_COMMIT_SHA ?? '').trim();

const GITHUB_REPO_STORAGE_KEY = 'std10_github_owner_repo_v1';

export function sanitizeOwnerRepo(raw: string): string {
  const trimmed = raw
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '');
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed) ? trimmed : '';
}

export const DEFAULT_GITHUB_OWNER_REPO = sanitizeOwnerRepo(metaEnv.VITE_GITHUB_REPO ?? '');

export function loadSavedGithubOwnerRepo(): string {
  if (typeof localStorage === 'undefined') return '';
  try {
    return sanitizeOwnerRepo(localStorage.getItem(GITHUB_REPO_STORAGE_KEY) ?? '');
  } catch {
    return '';
  }
}

export function saveGithubOwnerRepoPreference(raw: string): string {
  const clean = sanitizeOwnerRepo(raw);
  if (typeof localStorage === 'undefined') return clean;
  try {
    if (clean) {
      localStorage.setItem(GITHUB_REPO_STORAGE_KEY, clean);
    } else {
      localStorage.removeItem(GITHUB_REPO_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restriction
  }
  return clean;
}

export function resolveEffectiveGithubRepo(configuredRepo = ''): string {
  return (
    sanitizeOwnerRepo(configuredRepo) ||
    DEFAULT_GITHUB_OWNER_REPO ||
    loadSavedGithubOwnerRepo()
  );
}

function extractNumericParts(version: string): number[] {
  const clean = version.trim().replace(/^v/i, '');
  const matches = clean.match(/\d+/g);
  return matches ? matches.map((m) => Number.parseInt(m, 10)) : [];
}

export function isNewerVersion(remoteVersion: string, currentVersion: string): boolean {
  const remoteParts = extractNumericParts(remoteVersion);
  const currentParts = extractNumericParts(currentVersion);
  if (remoteParts.length === 0) return false;
  const maxLen = Math.max(remoteParts.length, currentParts.length);
  for (let i = 0; i < maxLen; i++) {
    const r = remoteParts[i] ?? 0;
    const c = currentParts[i] ?? 0;
    if (r > c) return true;
    if (r < c) return false;
  }
  return false;
}

export function compareVersionNames(a: string, b: string): number {
  if (isNewerVersion(a, b)) return 1;
  if (isNewerVersion(b, a)) return -1;
  return 0;
}

export function parseVersionCodeFromRelease(
  tagName: string,
  releaseTitle: string,
  releaseNotes: string,
  explicitVersionCode?: number
): number | undefined {
  if (typeof explicitVersionCode === 'number' && Number.isFinite(explicitVersionCode) && explicitVersionCode >= 1) {
    return Math.floor(explicitVersionCode);
  }
  const combined = `${releaseNotes}\n${releaseTitle}`;
  const htmlMeta = combined.match(/<!--\s*versionCode\s*:\s*(\d+)\s*-->/i);
  if (htmlMeta) {
    const parsed = Number.parseInt(htmlMeta[1], 10);
    if (parsed >= 1) return parsed;
  }
  const buildMatch = combined.match(/(?:Build\s*#|versionCode\s*[:=]?\s*|Code\s+)(\d+)/i);
  if (buildMatch) {
    const parsed = Number.parseInt(buildMatch[1], 10);
    if (parsed >= 1) return parsed;
  }
  const parts = extractNumericParts(tagName);
  if (parts.length >= 3 && parts[parts.length - 1] >= 2) {
    return parts[parts.length - 1];
  }
  return undefined;
}

export function parseSha256FromReleaseNotes(releaseNotes: string): string {
  const match = releaseNotes.match(/<!--\s*apkSha256\s*:\s*([a-fA-F0-9]{64})\s*-->/i);
  return match ? match[1].toLowerCase() : '';
}

export function stripReleaseMetadataComments(notes: string): string {
  return notes
    .replace(/<!--\s*[\s\S]*?\s*-->/g, '')
    .trim();
}

export function isReleaseVersionNewer(
  remoteVersionName: string,
  remoteVersionCode: number | undefined,
  currentVersionName: string,
  currentVersionCode: number
): boolean {
  if (typeof remoteVersionCode === 'number' && Number.isFinite(remoteVersionCode) && remoteVersionCode >= 1) {
    if (remoteVersionCode > currentVersionCode) return true;
    if (remoteVersionCode < currentVersionCode) return false;
  }
  return isNewerVersion(remoteVersionName, currentVersionName);
}

export function chooseNewestAvailableUpdate(
  candidates: Array<GitHubReleaseInfo | null | undefined>,
  currentVersionName: string,
  currentVersionCode: number
): GitHubReleaseInfo | null {
  const valid = candidates.filter((item): item is GitHubReleaseInfo => {
    if (!item || !item.versionName) return false;
    return isReleaseVersionNewer(
      item.versionName,
      item.versionCode,
      currentVersionName,
      currentVersionCode
    );
  });

  if (valid.length === 0) return null;

  valid.sort((a, b) => {
    const codeA = a.versionCode ?? 0;
    const codeB = b.versionCode ?? 0;
    if (codeA !== codeB) return codeB - codeA;
    const cmp = compareVersionNames(b.versionName, a.versionName);
    if (cmp !== 0) return cmp;
    // Prefer entry with direct APK link if version is identical
    const apkScoreA = a.apkDownloadUrl ? 1 : 0;
    const apkScoreB = b.apkDownloadUrl ? 1 : 0;
    return apkScoreB - apkScoreA;
  });

  return {
    ...valid[0],
    isUpdateAvailable: true,
  };
}

interface RemoteVersionJson {
  versionName?: string;
  versionCode?: number;
  tagName?: string;
  releaseTitle?: string;
  releaseNotes?: string;
  apkDownloadUrl?: string;
  apkSizeBytes?: number;
  apkSha256?: string;
  signingCertSha256?: string;
  isMandatory?: boolean;
}

export async function fetchLatestRelease(
  ownerRepo: string,
  currentVersionName = APP_VERSION_NAME,
  currentVersionCode = APP_VERSION_CODE
): Promise<GitHubReleaseInfo> {
  const cleanRepo = sanitizeOwnerRepo(ownerRepo);
  if (!cleanRepo) {
    throw new Error('માન્ય GitHub repository (owner/repo) સેટ કરેલ નથી.');
  }

  let versionMeta: RemoteVersionJson | null = null;

  const response = await fetch(`https://api.github.com/repos/${cleanRepo}/releases/latest`, {
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    // Fallback to direct release version.json asset download URL if GitHub API rate-limits
    if (response.status === 403 || response.status === 429) {
      const directRes = await fetch(
        `https://github.com/${cleanRepo}/releases/latest/download/version.json`,
        { cache: 'no-store' }
      ).catch(() => null);
      if (directRes && directRes.ok) {
        versionMeta = (await directRes.json()) as RemoteVersionJson;
      }
    }
    if (!versionMeta) {
      if (response.status === 404) {
        throw new Error('GitHub પર હજી કોઈ રિલીઝ પબ્લિશ થયું નથી.');
      }
      throw new Error(`GitHub અપડેટ ચેક નિષ્ફળ (HTTP ${response.status}).`);
    }
  }

  if (versionMeta) {
    const versionName = (versionMeta.versionName ?? '').replace(/^v/i, '').trim();
    const versionCode = parseVersionCodeFromRelease(
      versionMeta.tagName ?? `v${versionName}`,
      versionMeta.releaseTitle ?? '',
      versionMeta.releaseNotes ?? '',
      versionMeta.versionCode
    );
    return {
      tagName: (versionMeta.tagName ?? `v${versionName}`).trim(),
      versionName,
      versionCode,
      releaseTitle: (versionMeta.releaseTitle ?? `Quick Quiz v${versionName}`).trim(),
      releaseNotes: stripReleaseMetadataComments(versionMeta.releaseNotes ?? ''),
      apkDownloadUrl: (versionMeta.apkDownloadUrl ?? '').trim(),
      htmlUrl: `https://github.com/${cleanRepo}/releases/latest`,
      apkSizeBytes: Number(versionMeta.apkSizeBytes ?? 0),
      apkSha256: (versionMeta.apkSha256 ?? '').trim(),
      signingCertSha256: (versionMeta.signingCertSha256 ?? '').trim(),
      isMandatory: Boolean(versionMeta.isMandatory),
      source: 'github',
      isUpdateAvailable: isReleaseVersionNewer(
        versionName,
        versionCode,
        currentVersionName,
        currentVersionCode
      ),
    };
  }

  const root = (await response.json()) as {
    tag_name?: string;
    name?: string;
    body?: string;
    html_url?: string;
    assets?: Array<{ name?: string; browser_download_url?: string; size?: number }>;
  };

  const tagName = (root.tag_name ?? '').trim();
  const versionName = tagName.replace(/^v/i, '').trim();
  const rawBody = (root.body ?? '').trim();
  const releaseTitle = (root.name ?? tagName).trim() || tagName;
  const htmlUrl = root.html_url ?? '';

  let apkDownloadUrl = '';
  let apkSizeBytes = 0;
  for (const asset of root.assets ?? []) {
    if (asset.name?.toLowerCase().endsWith('.apk')) {
      apkDownloadUrl = asset.browser_download_url ?? '';
      apkSizeBytes = Number(asset.size ?? 0);
      break;
    }
  }

  const versionCode = parseVersionCodeFromRelease(tagName, releaseTitle, rawBody);
  const apkSha256 = parseSha256FromReleaseNotes(rawBody);
  const releaseNotes = stripReleaseMetadataComments(rawBody);

  return {
    tagName,
    versionName,
    versionCode,
    releaseTitle,
    releaseNotes,
    apkDownloadUrl,
    htmlUrl,
    apkSizeBytes,
    apkSha256,
    source: 'github',
    isUpdateAvailable: isReleaseVersionNewer(
      versionName,
      versionCode,
      currentVersionName,
      currentVersionCode
    ),
  };
}
