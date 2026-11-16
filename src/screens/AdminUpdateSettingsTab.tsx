import React, { useEffect, useState } from 'react';
import { CloudUpload, RefreshCw, Save, Sparkles } from 'lucide-react';
import type { AppReleaseConfig } from '../types/models';

interface AdminUpdateSettingsTabProps {
  releaseConfig: AppReleaseConfig | null;
  effectiveGithubRepo: string;
  currentVersionName: string;
  isBusy: boolean;
  isCheckingUpdate: boolean;
  onSaveGithubRepo: (ownerRepo: string, releaseNotes: string) => void;
  onTestUpdateCheck: () => void;
}

export const AdminUpdateSettingsTab: React.FC<AdminUpdateSettingsTabProps> = ({
  releaseConfig,
  effectiveGithubRepo,
  currentVersionName,
  isBusy,
  isCheckingUpdate,
  onSaveGithubRepo,
  onTestUpdateCheck,
}) => {
  const [repoInput, setRepoInput] = useState('');
  const [notesInput, setNotesInput] = useState('');

  useEffect(() => {
    if (!repoInput) {
      const nextRepo = releaseConfig?.githubOwnerRepo?.trim() || effectiveGithubRepo;
      if (nextRepo) setRepoInput(nextRepo);
    }
    if (!notesInput && releaseConfig?.releaseNotes?.trim()) {
      setNotesInput(releaseConfig.releaseNotes);
    }
  }, [releaseConfig, effectiveGithubRepo, repoInput, notesInput]);

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">
      <div className="rounded-2xl bg-[#DBEAFE] dark:bg-[#1E3A5F] p-5 space-y-3.5 text-[#1E3A8A] dark:text-[#DBEAFE]">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          <h2 className="text-base font-bold">GitHub ઓટો-અપડેટ સેટિંગ્સ</h2>
        </div>

        <div className="text-xs space-y-1 opacity-90">
          <p>હાલનું ઇન્સ્ટોલ વર્ઝન: v{currentVersionName}</p>
          <p>સક્રિય GitHub Repo: {effectiveGithubRepo || 'હજી સેટ નથી'}</p>
        </div>

        <div className="space-y-2.5">
          <div>
            <label
              htmlFor="admin-github-repo-input"
              className="block text-xs font-semibold mb-1"
            >
              GitHub Repository (owner/repo)
            </label>
            <input
              id="admin-github-repo-input"
              type="text"
              maxLength={120}
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value.slice(0, 120))}
              placeholder="ઉદા. omsai/std10-quiz"
              className="w-full h-11 rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] px-3.5 text-sm outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="admin-release-notes-input"
              className="block text-xs font-semibold mb-1"
            >
              વૈકલ્પિક નોંધ (Release Note)
            </label>
            <textarea
              id="admin-release-notes-input"
              rows={3}
              maxLength={300}
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value.slice(0, 300))}
              className="w-full rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] p-3 text-sm outline-none"
            />
          </div>

          <button
            type="button"
            disabled={isBusy || !repoInput.trim()}
            onClick={() => onSaveGithubRepo(repoInput, notesInput)}
            className="w-full h-11 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Save className="h-4 w-4" />
            <span>GitHub અપડેટ લિંક સેવ કરો</span>
          </button>

          <button
            type="button"
            disabled={isCheckingUpdate || !effectiveGithubRepo}
            onClick={onTestUpdateCheck}
            className="w-full h-11 rounded-xl border border-[#1E3A8A]/40 dark:border-[#93C5FD]/40 bg-white/70 dark:bg-slate-900/50 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-white dark:hover:bg-slate-900 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
            <span>
              {isCheckingUpdate
                ? 'GitHub રિલીઝ ચેક થઈ રહ્યું છે...'
                : 'હમણાં નવું અપડેટ ચેક કરો'}
            </span>
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-5 space-y-2">
        <div className="flex items-center gap-2">
          <CloudUpload className="h-5 w-5 text-[#D97706] dark:text-[#FCD34D]" />
          <h3 className="text-sm font-bold">GitHub રિલીઝ અપડેટ કેવી રીતે કામ કરે છે</h3>
        </div>
        <p className="text-xs leading-relaxed text-[#475569] dark:text-[#94A3B8] whitespace-pre-line">
          {`૧. જ્યારે તમે GitHub પર નવું રિલીઝ ટેગ (ઉદા. v1.0.x) પબ્લિશ કરો, ત્યારે એપ આપમેળે નવું વર્ઝન તપાસી શકે છે.\n૨. લાઇવ અપડેટ નોટિફિકેશન અને રિલીઝ લિંક માત્ર એડમિન પેનલ / એડમિન સેશનને જ દેખાશે (વિદ્યાર્થીઓને કોઈ અપડેટ પોપઅપ દેખાશે નહીં).`}
        </p>
      </div>
    </div>
  );
};
