import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Download,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useAdaptiveDisplay } from '../context/AdaptiveDisplayContext';
import { useTranslation } from '../i18n/translations';
import {
  downloadAndInstallNativeAppUpdate,
  hasNativeFirebaseBridge,
  retryNativePendingApkInstall,
  subscribeNativeAppUpdateProgress,
} from '../services/nativeFirebaseBridge';
import { applyWebSwUpdateWithProgress } from '../services/webSwUpdateService';
import type {
  AppUpdateProgressEvent,
  GitHubReleaseInfo,
  UpdateNotificationRecord,
} from '../types/models';
import { formatTimestampLabel } from '../utils/imageUtils';

export function formatApkSizeMb(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface AppUpdateFooterCardProps {
  currentVersionName: string;
  currentVersionCode?: number;
  isCheckingUpdate: boolean;
  hasAvailableUpdate?: boolean;
  latestVersionName?: string;
  onCheckUpdateClick: () => void;
  onOpenUpdateModal?: () => void;
}

export const AppUpdateFooterCard: React.FC<AppUpdateFooterCardProps> = ({
  currentVersionName,
  currentVersionCode = 1,
  isCheckingUpdate,
  hasAvailableUpdate = false,
  latestVersionName = '',
  onCheckUpdateClick,
  onOpenUpdateModal,
}) => {
  const { t } = useTranslation();
  const { isTvOrSmartBoard } = useAdaptiveDisplay();

  return (
    <div
      className={`rounded-2xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] ${
        isTvOrSmartBoard ? 'p-5 sm:p-6' : 'p-4'
      } h-auto flex flex-wrap items-center justify-between gap-3`}
    >
      <div className="space-y-1 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={`${
              isTvOrSmartBoard ? 'text-base sm:text-lg' : 'text-sm sm:text-base'
            } font-bold text-[#0F172A] dark:text-[#F8FAFC] whitespace-normal break-words`}
          >
            {t.appName.split('&')[0].trim()} • v{currentVersionName} ({currentVersionCode})
          </p>
          {hasAvailableUpdate && latestVersionName && (
            <span
              className={`inline-flex items-center gap-1 rounded-full bg-[#DCFCE7] dark:bg-[#064E3B] text-[#047857] dark:text-[#6EE7B7] px-2.5 py-0.5 ${
                isTvOrSmartBoard ? 'text-xs sm:text-sm' : 'text-[11px] sm:text-xs'
              } font-extrabold whitespace-nowrap`}
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              <span>v{latestVersionName}</span>
            </span>
          )}
        </div>
        <p
          className={`${
            isTvOrSmartBoard ? 'text-sm sm:text-base' : 'text-xs sm:text-sm'
          } text-[#475569] dark:text-[#94A3B8] whitespace-normal break-words leading-relaxed`}
        >
          {hasAvailableUpdate ? t.appUpdateAvailableTitle : t.appUpdateUpToDateMsg}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
        {hasAvailableUpdate && onOpenUpdateModal ? (
          <button
            type="button"
            data-testid="footer_update_now_btn"
            onClick={onOpenUpdateModal}
            className={`${
              isTvOrSmartBoard ? 'min-h-[54px] px-5 text-sm sm:text-base' : 'min-h-[48px] px-4 text-xs sm:text-sm'
            } inline-flex items-center justify-center gap-2 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] text-white py-2.5 font-bold whitespace-normal text-center transition-colors cursor-pointer`}
          >
            <Download className="h-4 w-4 shrink-0" />
            <span>{t.appUpdateNowBtn}</span>
          </button>
        ) : (
          <button
            type="button"
            data-testid="check_app_updates_btn"
            onClick={onCheckUpdateClick}
            disabled={isCheckingUpdate}
            className={`${
              isTvOrSmartBoard ? 'min-h-[54px] px-5 text-sm sm:text-base' : 'min-h-[48px] px-4 text-xs sm:text-sm'
            } inline-flex items-center justify-center gap-2 rounded-xl border border-[#CBD5E1] dark:border-[#475569] py-2.5 font-bold text-[#0F172A] dark:text-[#F8FAFC] hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-normal text-center transition-colors cursor-pointer`}
          >
            <RefreshCw className={`h-4 w-4 shrink-0 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
            <span>
              {isCheckingUpdate ? t.appUpdateCheckingBtn : t.appUpdateCheckNowBtn}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};

interface UpdateModalErrorBoundaryProps {
  onErrorFallback?: () => void;
  children: React.ReactNode;
}

interface UpdateModalErrorBoundaryState {
  hasError: boolean;
}

export class UpdateModalErrorBoundary extends React.Component<
  UpdateModalErrorBoundaryProps,
  UpdateModalErrorBoundaryState
> {
  constructor(props: UpdateModalErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): UpdateModalErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error('UpdateAvailableModal render error (auto-dismissed to prevent blank screen):', error, info);
    try {
      document.body.classList.remove('update-screen-open');
    } catch {
      // Ignore
    }
    this.props.onErrorFallback?.();
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

interface UpdateAvailableModalProps {
  release: GitHubReleaseInfo;
  currentVersionName: string;
  currentVersionCode?: number;
  updateHistory?: UpdateNotificationRecord[];
  onDismiss: () => void;
  onNotify?: (msg: string, isError?: boolean) => void;
}

export const UpdateAvailableModal: React.FC<UpdateAvailableModalProps> = ({
  release,
  currentVersionName,
  currentVersionCode = 1,
  updateHistory = [],
  onDismiss,
  onNotify,
}) => {
  const { t, lang } = useTranslation();
  const { isTvOrSmartBoard } = useAdaptiveDisplay();
  const safeVersionName = String(release?.versionName ?? '').trim() || currentVersionName;
  const safeVersionCode =
    typeof release?.versionCode === 'number' && Number.isFinite(release.versionCode) && release.versionCode > 0
      ? release.versionCode
      : undefined;
  const safeReleaseTitle = String(release?.releaseTitle ?? '').trim() || `Quick Quiz v${safeVersionName}`;
  const safeReleaseNotes = String(release?.releaseNotes ?? '').trim();
  const safeApkDownloadUrl = String(release?.apkDownloadUrl ?? '').trim();
  const safeApkSizeBytes = Number(release?.apkSizeBytes ?? 0) || 0;
  const safeHistory = Array.isArray(updateHistory)
    ? updateHistory.filter((item): item is UpdateNotificationRecord => Boolean(item && typeof item === 'object'))
    : [];
  const isMandatory = Boolean(release?.isMandatory);
  const isNative = hasNativeFirebaseBridge();
  const isWebSwUpdate = release?.source === 'web_sw';
  const [progressState, setProgressState] = useState<AppUpdateProgressEvent>({
    status: 'idle',
    progressPercent: 0,
    bytesDownloaded: 0,
    totalBytes: safeApkSizeBytes,
    message: '',
  });

  useEffect(() => {
    if (!isNative) return undefined;
    return subscribeNativeAppUpdateProgress((evt) => {
      if (evt && typeof evt === 'object') {
        setProgressState(evt);
      }
    });
  }, [isNative]);

  const isTransferring =
    progressState.status === 'downloading' ||
    progressState.status === 'verifying' ||
    progressState.status === 'installing';

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isMandatory && !isTransferring) {
        onDismiss();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMandatory, isTransferring, onDismiss]);

  const handleStartInAppUpdate = async () => {
    if (isWebSwUpdate) {
      try {
        await applyWebSwUpdateWithProgress((evt) => {
          setProgressState(evt);
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Web update failed';
        setProgressState((prev) => ({
          ...prev,
          status: 'error',
          message: msg,
        }));
        onNotify?.(msg, true);
      }
      return;
    }

    if (!safeApkDownloadUrl) {
      onNotify?.(
        lang === 'en'
          ? 'Update APK URL is unavailable. Please contact Admin.'
          : 'અપડેટ APK ફાઇલ લિંક ઉપલબ્ધ નથી.',
        true
      );
      return;
    }

    if (!isNative) {
      // Browser fallback downloads the APK directly without third-party site branding
      const link = document.createElement('a');
      link.href = safeApkDownloadUrl;
      link.download = `std10quiz_v${safeVersionName}.apk`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    setProgressState({
      status: 'downloading',
      progressPercent: 0,
      bytesDownloaded: 0,
      totalBytes: safeApkSizeBytes,
      message: '',
    });

    try {
      const result = await downloadAndInstallNativeAppUpdate({
        apkDownloadUrl: safeApkDownloadUrl,
        versionName: safeVersionName,
        versionCode: safeVersionCode ?? currentVersionCode + 1,
        apkSizeBytes: safeApkSizeBytes,
        apkSha256: release?.apkSha256,
        signingCertSha256: release?.signingCertSha256,
      });
      if (result?.status === 'opened_browser') {
        onNotify?.(
          lang === 'en'
            ? 'Update download opened in your browser.'
            : 'અપડેટ ડાઉનલોડ તમારા બ્રાઉઝરમાં ખુલી ગયું છે.'
        );
        setProgressState({
          status: 'idle',
          progressPercent: 100,
          bytesDownloaded: safeApkSizeBytes,
          totalBytes: safeApkSizeBytes,
          message: '',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Update download failed';
      setProgressState((prev) => ({
        ...prev,
        status: prev.status === 'permission_denied' ? 'permission_denied' : 'error',
        message: msg,
      }));
      onNotify?.(msg, true);
    }
  };

  const handleRetryPermissionInstall = async () => {
    try {
      await retryNativePendingApkInstall();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to resume installation';
      setProgressState((prev) => ({
        ...prev,
        status: 'permission_denied',
        message: msg,
      }));
    }
  };

  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    document.body.classList.add('update-screen-open');
    return () => {
      document.body.classList.remove('update-screen-open');
    };
  }, []);

  const totalMbText = isWebSwUpdate
    ? ''
    : formatApkSizeMb(progressState.totalBytes || safeApkSizeBytes);
  const downloadedMbText = isWebSwUpdate
    ? ''
    : formatApkSizeMb(progressState.bytesDownloaded);

  const clampedPercent = Math.max(0, Math.min(100, Math.round(progressState.progressPercent || 0)));
  const progressStatusLabel =
    progressState.status === 'idle'
      ? lang === 'en'
        ? 'Ready to Download & Install'
        : 'ડાઉનલોડ અને ઇન્સ્ટોલ માટે તૈયાર'
      : isWebSwUpdate
        ? t.webUpdateApplyingLabel
        : progressState.status === 'verifying'
          ? t.appUpdateVerifyingLabel
          : progressState.status === 'installing'
            ? t.appUpdateInstallingLabel
            : progressState.status === 'error'
              ? lang === 'en'
                ? 'Download Interrupted'
                : 'ડાઉનલોડમાં મુશ્કેલી આવી'
              : progressState.status === 'permission_required' ||
                  progressState.status === 'permission_denied'
                ? lang === 'en'
                  ? 'Install Permission Needed'
                  : 'ઇન્સ્ટોલ પરવાનગી જરૂરી છે'
                : t.appUpdateDownloadingBtn;

  return (
    <div
      className="update-screen-root bg-gradient-to-b from-[#FAF9F5] via-[#F4F7FB] to-[#EEF2FF] dark:from-[#0B1120] dark:via-[#0F172A] dark:to-[#111C33] text-[#0F172A] dark:text-[#F8FAFC]"
      role="dialog"
      aria-modal="true"
      aria-label={isMandatory ? t.appUpdateMandatoryTitle : t.appUpdateAvailableTitle}
      data-testid="app_update_modal"
    >
      {/* Top Compact Safe-Area Header */}
      <header className="update-screen-header bg-white/95 dark:bg-[#1E293B]/95 border-b border-[#E2E8F0] dark:border-[#334155] shadow-xs">
        <div className="update-screen-header-inner w-full mx-auto flex items-center justify-between gap-2.5 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <img
              src="/images/ic_app_logo.png"
              alt={t.appName}
              className={`${
                isTvOrSmartBoard ? 'h-12 w-12' : 'h-9 w-9 sm:h-11 sm:w-11'
              } rounded-xl object-contain bg-black border border-slate-200 dark:border-slate-700 shrink-0 shadow-xs`}
            />
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 ${
                    isTvOrSmartBoard ? 'text-xs' : 'text-[10px] sm:text-xs'
                  } font-extrabold uppercase tracking-wide ${
                    isMandatory
                      ? 'bg-[#DC2626] text-white'
                      : 'bg-[#DBEAFE] dark:bg-[#1E3A5F] text-[#1E3A8A] dark:text-[#93C5FD]'
                  }`}
                >
                  {isMandatory ? (
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>
                    {isMandatory ? t.appUpdateMandatoryBadge : t.appUpdateOptionalBadge}
                  </span>
                </span>
                {totalMbText && (
                  <span
                    className={`rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 ${
                      isTvOrSmartBoard ? 'text-xs' : 'text-[10px] sm:text-xs'
                    } font-bold text-[#475569] dark:text-[#CBD5E1] tabular-nums`}
                  >
                    APK: {totalMbText}
                  </span>
                )}
              </div>
              <h2 className="update-screen-title font-extrabold whitespace-normal break-words">
                {isMandatory ? t.appUpdateMandatoryTitle : t.appUpdateAvailableTitle}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {safeHistory.length > 0 && (
              <button
                type="button"
                data-testid="update_history_toggle_btn"
                onClick={() => setShowHistory((prev) => !prev)}
                aria-pressed={showHistory}
                className={`min-h-[48px] px-3 rounded-xl border text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  showHistory
                    ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] dark:bg-[#2563EB] dark:border-[#2563EB]'
                    : 'bg-slate-50 dark:bg-slate-800 text-[#334155] dark:text-[#CBD5E1] border-[#CBD5E1] dark:border-[#475569] hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <Bell className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{t.appUpdateHistoryTitle}</span>
                <span className="tabular-nums">({Math.min(safeHistory.length, 5)})</span>
              </button>
            )}

            {!isMandatory && !isTransferring && (
              <button
                type="button"
                data-testid="update_modal_close_btn"
                onClick={onDismiss}
                aria-label={t.closeBtn}
                className="min-h-[48px] min-w-[48px] p-2 rounded-xl border border-[#CBD5E1] dark:border-[#334155] flex items-center justify-center text-[#475569] dark:text-[#CBD5E1] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Full-Screen Adaptive Flexbox Body (Portrait: Single-Screen Column | Landscape/Tablet/TV: 2-Pane Split) */}
      <main className="update-screen-body">
        <div className="update-screen-shell">
          {/* LEFT / TOP PANE: Version Comparison + Release Notes (or History) */}
          <section className="update-screen-pane-left">
            {/* Compact Side-by-Side Version Comparison */}
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 shrink-0">
              <div className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] px-3.5 py-2.5 sm:px-4 sm:py-3.5 shadow-xs">
                <p className="text-[11px] sm:text-xs font-semibold text-[#475569] dark:text-[#94A3B8] whitespace-normal break-words">
                  {t.appUpdateCurrentVersionLabel}
                </p>
                <p className="update-screen-version-num font-extrabold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums mt-0.5 break-words">
                  v{currentVersionName} ({currentVersionCode})
                </p>
              </div>
              <div className="rounded-2xl bg-[#ECFDF5] dark:bg-[#064E3B]/50 border border-[#A7F3D0] dark:border-[#047857] px-3.5 py-2.5 sm:px-4 sm:py-3.5 shadow-xs">
                <p className="text-[11px] sm:text-xs font-semibold text-[#047857] dark:text-[#6EE7B7] whitespace-normal break-words">
                  {t.appUpdateNewVersionLabel}
                </p>
                <p className="update-screen-version-num font-extrabold text-[#047857] dark:text-[#6EE7B7] tabular-nums mt-0.5 break-words">
                  v{safeVersionName}
                  {safeVersionCode ? ` (${safeVersionCode})` : ''}
                </p>
              </div>
            </div>

            {isMandatory && (
              <div className="shrink-0 rounded-2xl bg-[#FEF2F2] dark:bg-[#450A0A]/60 border border-[#FECACA] dark:border-[#991B1B] px-3.5 py-2.5 update-screen-text font-semibold text-[#991B1B] dark:text-[#FECACA] whitespace-normal break-words">
                {t.appUpdateMandatoryDesc}
              </div>
            )}

            {/* Release Details / Optional History Swapper (Auto-fits remaining viewport height) */}
            <div className="update-screen-notes-card rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] px-3.5 py-3 sm:px-5 sm:py-4 shadow-xs">
              {showHistory && safeHistory.length > 0 ? (
                <>
                  <div className="shrink-0 flex items-center justify-between gap-2 pb-2 mb-2 border-b border-[#E2E8F0] dark:border-[#334155]">
                    <h3 className="update-screen-text font-extrabold text-[#0F172A] dark:text-[#F8FAFC]">
                      {t.appUpdateHistoryTitle}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowHistory(false)}
                      className="text-xs font-bold text-[#1E3A8A] dark:text-[#93C5FD] underline cursor-pointer"
                    >
                      {lang === 'en' ? 'Back to Notes' : 'વિગતો જુઓ'}
                    </button>
                  </div>
                  <div className="update-screen-notes-body space-y-2 pr-1">
                    {safeHistory.slice(0, 5).map((item, idx) => (
                      <div
                        key={item.id || `hist_${idx}`}
                        className="rounded-xl bg-slate-50 dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] p-2.5 text-xs sm:text-sm space-y-0.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <p className="font-bold text-[#0F172A] dark:text-[#F8FAFC] whitespace-normal break-words">
                            {item.title || `v${item.versionName || safeVersionName}`} (v{item.versionName || safeVersionName})
                          </p>
                          <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8] shrink-0">
                            {formatTimestampLabel(item.createdAt, lang)}
                          </span>
                        </div>
                        <p className="text-[#475569] dark:text-[#CBD5E1] whitespace-pre-line break-words leading-snug">
                          {item.body || ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  {safeReleaseTitle && (
                    <h3 className="shrink-0 update-screen-text font-extrabold text-[#0F172A] dark:text-[#F8FAFC] whitespace-normal break-words mb-1">
                      {safeReleaseTitle}
                    </h3>
                  )}
                  <div className="update-screen-notes-body update-screen-text text-[#334155] dark:text-[#CBD5E1] whitespace-pre-wrap break-words pr-1">
                    {safeReleaseNotes || safeReleaseTitle}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* RIGHT / BOTTOM PANE: Live Progress Bar + Percentage + Data-Safe Strip + Action Buttons */}
          <section className="update-screen-pane-right">
            {/* Always-Visible Progress Bar & Percentage Card (Zero Layout Jump) */}
            <div
              className={`shrink-0 rounded-2xl border-2 px-3.5 py-3 sm:px-4 sm:py-3.5 shadow-xs space-y-2 ${
                progressState.status === 'error'
                  ? 'border-[#DC2626]/60 bg-[#FEF2F2] dark:bg-[#450A0A]/40'
                  : progressState.status === 'permission_required' ||
                      progressState.status === 'permission_denied'
                    ? 'border-[#D97706]/60 bg-[#FFFBEB] dark:bg-[#451A03]/40'
                    : isTransferring
                      ? 'border-[#1E3A8A] dark:border-[#3B82F6] bg-white dark:bg-[#1E293B]'
                      : 'border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E293B]'
              }`}
              data-testid="update_progress_panel"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="update-screen-text font-extrabold text-[#1E3A8A] dark:text-[#93C5FD] whitespace-normal break-words">
                  {progressStatusLabel}
                </span>
                <span
                  className="update-screen-version-num font-black tabular-nums text-[#0F172A] dark:text-[#F8FAFC] shrink-0"
                  data-testid="update_progress_percent"
                >
                  {clampedPercent}%
                </span>
              </div>

              <div className="h-3 sm:h-3.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-150 ${
                    progressState.status === 'error'
                      ? 'bg-[#DC2626]'
                      : progressState.status === 'permission_required' ||
                          progressState.status === 'permission_denied'
                        ? 'bg-[#D97706]'
                        : isTransferring
                          ? 'bg-gradient-to-r from-[#1E3A8A] via-[#2563EB] to-[#0EA5E9]'
                          : 'bg-[#94A3B8] dark:bg-[#475569]'
                  }`}
                  style={{
                    width: `${isTransferring ? Math.max(4, clampedPercent) : clampedPercent}%`,
                  }}
                />
              </div>

              {(downloadedMbText || totalMbText) && (
                <p className="text-[11px] sm:text-xs font-semibold text-[#475569] dark:text-[#94A3B8] tabular-nums flex items-center justify-between gap-2">
                  <span>
                    {downloadedMbText && totalMbText
                      ? `${downloadedMbText} / ${totalMbText}`
                      : totalMbText
                        ? `APK • ${totalMbText}`
                        : downloadedMbText}
                  </span>
                  <span>
                    {isTransferring
                      ? lang === 'en'
                        ? 'Please wait...'
                        : 'કૃપા કરીને રાહ જુઓ...'
                      : lang === 'en'
                        ? 'In-App Update'
                        : 'સીધું એપ અપડેટ'}
                  </span>
                </p>
              )}

              {(progressState.status === 'permission_required' ||
                progressState.status === 'permission_denied') && (
                <div className="pt-1 space-y-2 text-xs sm:text-sm text-[#92400E] dark:text-[#FDE68A]">
                  <p className="font-bold flex items-start gap-2 leading-snug whitespace-normal break-words">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{t.appUpdatePermissionRequiredDesc}</span>
                  </p>
                  <button
                    type="button"
                    data-testid="retry_install_permission_btn"
                    onClick={() => void handleRetryPermissionInstall()}
                    className="update-screen-btn w-full rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white font-bold flex items-center justify-center gap-2 cursor-pointer px-4"
                  >
                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                    <span>{t.appUpdateGrantInstallPermBtn}</span>
                  </button>
                </div>
              )}

              {progressState.status === 'error' && (
                <p className="pt-0.5 text-xs sm:text-sm font-bold text-[#B91C1C] dark:text-[#FCA5A5] flex items-start gap-2 leading-snug whitespace-normal break-words">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{progressState.message || 'Download failed'}</span>
                </p>
              )}
            </div>

            {/* Compact Security & Data Preservation Strip */}
            <div className="shrink-0 rounded-2xl bg-[#EFF6FF] dark:bg-[#1E3A5F]/45 border border-[#BFDBFE] dark:border-[#1E40AF] px-3 py-2 sm:px-3.5 sm:py-2.5 flex items-center gap-2.5 text-[11px] sm:text-xs font-semibold text-[#1E3A8A] dark:text-[#BFDBFE]">
              <ShieldCheck className="h-5 w-5 shrink-0 text-[#047857] dark:text-[#6EE7B7]" />
              <span className="leading-snug whitespace-normal break-words">
                {lang === 'en'
                  ? 'Direct in-place update — student login, unlocks & progress stay safe.'
                  : 'સીધું એપની અંદર અપડેટ થશે — તમારું લૉગિન, અનલૉક વિષયો અને ડેટા સુરક્ષિત રહેશે.'}
              </span>
            </div>

            {/* Primary Action Buttons — Always Single-Row Accessible Without Scrolling */}
            <div
              className={`shrink-0 grid ${
                !isMandatory && !isTransferring ? 'grid-cols-2' : 'grid-cols-1'
              } gap-2.5 sm:gap-3`}
            >
              <button
                type="button"
                data-testid="update_now_btn"
                disabled={isTransferring}
                onClick={() => void handleStartInAppUpdate()}
                className="update-screen-btn w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-extrabold bg-[#1E3A8A] hover:bg-[#172554] dark:bg-[#2563EB] dark:hover:bg-[#1D4ED8] text-white disabled:opacity-65 whitespace-normal text-center transition-colors cursor-pointer shadow-md"
              >
                {progressState.status === 'error' ? (
                  <>
                    <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                    <span>{t.appUpdateRetryBtn}</span>
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                    <span>
                      {isTransferring
                        ? `${t.appUpdateDownloadingBtn} ${clampedPercent}%`
                        : t.appUpdateNowBtn}
                    </span>
                  </>
                )}
              </button>

              {!isMandatory && !isTransferring && (
                <button
                  type="button"
                  data-testid="update_later_btn"
                  onClick={onDismiss}
                  className="update-screen-btn w-full px-4 py-2.5 rounded-xl border border-[#CBD5E1] dark:border-[#475569] bg-white dark:bg-[#1E293B] font-bold text-[#334155] dark:text-[#CBD5E1] hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-normal text-center transition-colors cursor-pointer"
                >
                  {t.appUpdateLaterBtn}
                </button>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

interface UpdateAvailableBannerProps {
  release: GitHubReleaseInfo;
  onUpdateNow: () => void;
  onUpdateLater: () => void;
}

export const UpdateAvailableBanner: React.FC<UpdateAvailableBannerProps> = ({
  release,
  onUpdateNow,
  onUpdateLater,
}) => {
  const { t } = useTranslation();
  const { isLargeScreen, isTvOrSmartBoard } = useAdaptiveDisplay();

  const maxBannerWidthCls = isTvOrSmartBoard
    ? 'max-w-[min(94vw,60rem)]'
    : isLargeScreen
      ? 'max-w-[min(94vw,44rem)]'
      : 'max-w-[min(96vw,36rem)]';

  return (
    <div
      className="fixed inset-x-0 top-0 z-[85] flex justify-center px-3 sm:px-6 pt-[max(env(safe-area-inset-top),0.75rem)] pointer-events-none"
      data-testid="app_update_banner"
    >
      <div
        role="region"
        aria-label={t.appUpdateAvailableTitle}
        className={`pointer-events-auto ${maxBannerWidthCls} w-full h-auto rounded-2xl bg-white dark:bg-[#0F172A] border-2 border-[#1E3A8A] dark:border-[#3B82F6] shadow-2xl ${
          isTvOrSmartBoard ? 'p-5 sm:p-6 gap-4' : 'p-4 sm:p-5 gap-3'
        } flex flex-col sm:flex-row sm:items-center justify-between`}
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className={`${
              isTvOrSmartBoard ? 'h-12 w-12' : 'h-10 w-10 sm:h-11 sm:w-11'
            } rounded-xl bg-[#DBEAFE] dark:bg-[#1E3A8A] text-[#1E3A8A] dark:text-[#93C5FD] flex items-center justify-center shrink-0`}
          >
            <Sparkles className={isTvOrSmartBoard ? 'h-6 w-6' : 'h-5 w-5'} />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p
                className={`${
                  isTvOrSmartBoard
                    ? 'text-lg sm:text-xl'
                    : isLargeScreen
                      ? 'text-base sm:text-lg'
                      : 'text-sm sm:text-base'
                } font-extrabold text-[#0F172A] dark:text-[#F8FAFC] whitespace-normal break-words leading-snug`}
              >
                {t.appUpdateAvailableTitle}
              </p>
              <span
                className={`rounded-full bg-[#DCFCE7] dark:bg-[#064E3B] text-[#047857] dark:text-[#6EE7B7] px-2.5 py-0.5 ${
                  isTvOrSmartBoard ? 'text-xs sm:text-sm' : 'text-[11px] sm:text-xs'
                } font-extrabold tabular-nums shrink-0 whitespace-nowrap`}
              >
                v{release.versionName}
                {release.versionCode ? ` (${release.versionCode})` : ''}
              </span>
            </div>
            {(release.releaseNotes || release.releaseTitle) && (
              <p
                className={`${
                  isTvOrSmartBoard
                    ? 'text-base sm:text-lg'
                    : isLargeScreen
                      ? 'text-sm sm:text-base'
                      : 'text-xs sm:text-sm'
                } text-[#334155] dark:text-[#CBD5E1] whitespace-pre-line break-words leading-relaxed`}
              >
                {release.releaseNotes || release.releaseTitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0 w-full sm:w-auto justify-end pt-1 sm:pt-0">
          <button
            type="button"
            data-testid="banner_update_later_btn"
            onClick={onUpdateLater}
            className={`${
              isTvOrSmartBoard
                ? 'min-h-[54px] px-5 text-sm sm:text-base'
                : 'min-h-[48px] px-4 text-xs sm:text-sm'
            } py-2 rounded-xl border border-[#CBD5E1] dark:border-[#334155] font-bold text-[#475569] dark:text-[#CBD5E1] hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-normal text-center cursor-pointer`}
          >
            {t.appUpdateLaterBtn}
          </button>
          <button
            type="button"
            data-testid="banner_update_now_btn"
            onClick={onUpdateNow}
            className={`${
              isTvOrSmartBoard
                ? 'min-h-[54px] px-5 text-sm sm:text-base'
                : 'min-h-[48px] px-4 text-xs sm:text-sm'
            } inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] dark:bg-[#2563EB] text-white font-extrabold whitespace-normal text-center transition-colors cursor-pointer`}
          >
            <Download className="h-4 w-4 shrink-0" />
            <span>{t.appUpdateNowBtn}</span>
          </button>
        </div>
      </div>
    </div>
  );
};




