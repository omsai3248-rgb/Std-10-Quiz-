import type { GitHubReleaseInfo } from '../types/models';

export const APP_VERSION_NAME = '1.0.0';

export function sanitizeOwnerRepo(raw: string): string {
  const trimmed = raw
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '');
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed) ? trimmed : '';
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

export async function fetchLatestRelease(
  ownerRepo: string,
  currentVersionName = APP_VERSION_NAME
): Promise<GitHubReleaseInfo> {
  const cleanRepo = sanitizeOwnerRepo(ownerRepo);
  if (!cleanRepo) {
    throw new Error('માન્ય GitHub repository (owner/repo) સેટ કરેલ નથી.');
  }

  const response = await fetch(`https://api.github.com/repos/${cleanRepo}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('GitHub પર હજી કોઈ રિલીઝ પબ્લિશ થયું નથી.');
    }
    throw new Error(`GitHub અપડેટ ચેક નિષ્ફળ (HTTP ${response.status}).`);
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
  const releaseTitle = (root.name ?? tagName).trim() || tagName;
  const releaseNotes = (root.body ?? '').trim();
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

  return {
    tagName,
    versionName,
    releaseTitle,
    releaseNotes,
    apkDownloadUrl,
    htmlUrl,
    apkSizeBytes,
    isUpdateAvailable: isNewerVersion(versionName, currentVersionName),
  };
}
