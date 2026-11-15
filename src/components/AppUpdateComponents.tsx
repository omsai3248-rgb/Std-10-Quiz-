import React from 'react';
import { RefreshCw, ExternalLink, Sparkles } from 'lucide-react';
import type { GitHubReleaseInfo } from '../types/models';

interface AppUpdateFooterCardProps {
  currentVersionName: string;
  isCheckingUpdate: boolean;
  hasConfiguredRepo: boolean;
  onCheckUpdateClick: () => void;
}

export const AppUpdateFooterCard: React.FC<AppUpdateFooterCardProps> = ({
  currentVersionName,
  isCheckingUpdate,
  hasConfiguredRepo,
  onCheckUpdateClick,
}) => {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          ધોરણ ૧૦ ક્વિઝ • વર્ઝન v{currentVersionName}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {hasConfiguredRepo
            ? 'GitHub પરથી નવા અપડેટની ચકાસણી ઉપલબ્ધ છે'
            : 'ઓટો-અપડેટ માટે એડમિન પેનલમાં GitHub repo સેટ કરો'}
        </p>
      </div>
      <button
        type="button"
        onClick={onCheckUpdateClick}
        disabled={isCheckingUpdate}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
        <span>{isCheckingUpdate ? 'ચેક થાય છે...' : 'અપડેટ ચેક કરો'}</span>
      </button>
    </div>
  );
};

interface UpdateAvailableModalProps {
  release: GitHubReleaseInfo;
  currentVersionName: string;
  onDismiss: () => void;
}

export const UpdateAvailableModal: React.FC<UpdateAvailableModalProps> = ({
  release,
  currentVersionName,
  onDismiss,
}) => {
  const targetUrl = release.apkDownloadUrl || release.htmlUrl;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-[#1E3A8A] dark:text-[#93C5FD]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              નવું અપડેટ ઉપલબ્ધ છે!
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              હાલનું: v{currentVersionName} → નવું: v{release.versionName}
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 text-sm text-slate-700 dark:text-slate-300 max-h-40 overflow-y-auto whitespace-pre-wrap">
          {release.releaseNotes || release.releaseTitle}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onDismiss}
            className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            પછીથી
          </button>
          {targetUrl && (
            <a
              href={targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-[#1E3A8A] text-white hover:bg-[#1E3A8A]/90 transition-colors"
            >
              <span>રિલીઝ ખોલો</span>
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
