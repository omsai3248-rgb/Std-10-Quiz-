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

  return (
    <div className="rounded-2xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-0.5 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
            {t.appName.split('&')[0].trim()} • v{currentVersionName} ({currentVersionCode})
          </p>
          {hasAvailableUpdate && latestVersionName && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#DCFCE7] dark:bg-[#064E3B] text-[#047857] dark:text-[#6EE7B7] px-2.5 py-0.5 text-[11px] font-extrabold">
              <Sparkles className="h-3 w-3" />
              <span>v{latestVersionName}</span>
            </span>
          )}
        </div>
        <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
          {hasAvailableUpdate ? t.appUpdateAvailableTitle : t.appUpdateUpToDateMsg}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {hasAvailableUpdate && onOpenUpdateModal ? (
          <button
            type="button"
            data-testid="footer_update_now_btn"
            onClick={onOpenUpdateModal}
            className="min-h-[48px] inline-flex items-center gap-2 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] text-white px-4 py-2 text-xs font-bold transition-colors cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>{t.appUpdateNowBtn}</span>
          </button>
        ) : (
          <button
            type="button"
            data-testid="check_app_updates_btn"
            onClick={onCheckUpdateClick}
            disabled={isCheckingUpdate}
            className="min-h-[48px] inline-flex items-center gap-2 rounded-xl border border-[#CBD5E1] dark:border-[#475569] px-4 py-2 text-xs font-bold text-[#0F172A] dark:text-[#F8FAFC] hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
            <span>
              {isCheckingUpdate ? t.appUpdateCheckingBtn : t.appUpdateCheckNowBtn}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};

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
  const { isLargeScreen, isTvOrSmartBoard } = useAdaptiveDisplay();
  const isMandatory = Boolean(release.isMandatory);
  const isNative = hasNativeFirebaseBridge();
  const isWebSwUpdate = release.source === 'web_sw';
  const [progressState, setProgressState] = useState<AppUpdateProgressEvent>({
    status: 'idle',
    progressPercent: 0,
    bytesDownloaded: 0,
    totalBytes: release.apkSizeBytes || 0,
    message: '',
  });

  useEffect(() => {
    if (!isNative) return undefined;
    return subscribeNativeAppUpdateProgress((evt) => {
      setProgressState(evt);
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

    if (!release.apkDownloadUrl) {
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
      link.href = release.apkDownloadUrl;
      link.download = `std10quiz_v${release.versionName}.apk`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    setProgressState({
      status: 'downloading',
      progressPercent: 0,
      bytesDownloaded: 0,
      totalBytes: release.apkSizeBytes || 0,
      message: '',
    });

    try {
      await downloadAndInstallNativeAppUpdate({
        apkDownloadUrl: release.apkDownloadUrl,
        versionName: release.versionName,
        versionCode: release.versionCode ?? currentVersionCode + 1,
        apkSizeBytes: release.apkSizeBytes,
        apkSha256: release.apkSha256,
        signingCertSha256: release.signingCertSha256,
      });
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

  const totalMbText = isWebSwUpdate
    ? ''
    : formatApkSizeMb(progressState.totalBytes || release.apkSizeBytes);
  const downloadedMbText = isWebSwUpdate
    ? ''
    : formatApkSizeMb(progressState.bytesDownloaded);

  const containerWidthCls = isLargeScreen ? 'max-w-4xl' : 'max-w-2xl';
  const headingCls = isTvOrSmartBoard ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl';

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col w-full h-[100dvh] bg-[#FAF9F5] dark:bg-[#0B1120] text-[#0F172A] dark:text-[#F8FAFC]"
      role="dialog"
      aria-modal="true"
      aria-label={isMandatory ? t.appUpdateMandatoryTitle : t.appUpdateAvailableTitle}
      data-testid="app_update_modal"
    >
      {/* Full-Screen Sticky Header */}
      <header className="shrink-0 pt-[env(safe-area-inset-top)] bg-white/95 dark:bg-[#1E293B]/95 backdrop-blur border-b border-[#E2E8F0] dark:border-[#334155]">
        <div
          className={`${containerWidthCls} mx-auto px-4 sm:px-6 py-3.5 flex items-start justify-between gap-3`}
        >
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <img
              src="/images/ic_app_logo.png"
              alt={t.appName}
              className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl object-contain bg-black border border-slate-200 dark:border-slate-700 shrink-0"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${
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
                  <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[11px] font-bold text-[#475569] dark:text-[#CBD5E1] tabular-nums">
                    APK: {totalMbText}
                  </span>
                )}
              </div>
              <h2 className={`${headingCls} font-extrabold leading-snug break-words`}>
                {isMandatory ? t.appUpdateMandatoryTitle : t.appUpdateAvailableTitle}
              </h2>
            </div>
          </div>

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
      </header>

      {/* Full-Screen Scrollable Content (Zero Clipping) */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div
          className={`${containerWidthCls} mx-auto px-4 sm:px-6 py-5 sm:py-6 space-y-4 sm:space-y-5`}
        >
          {/* Version Comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-4 shadow-sm">
              <p className="text-xs font-semibold text-[#475569] dark:text-[#94A3B8]">
                {t.appUpdateCurrentVersionLabel}
              </p>
              <p className="text-lg font-extrabold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums mt-1 break-words">
                v{currentVersionName} ({currentVersionCode})
              </p>
            </div>
            <div className="rounded-2xl bg-[#ECFDF5] dark:bg-[#064E3B]/45 border border-[#A7F3D0] dark:border-[#047857] p-4 shadow-sm">
              <p className="text-xs font-semibold text-[#047857] dark:text-[#6EE7B7]">
                {t.appUpdateNewVersionLabel}
              </p>
              <p className="text-lg font-extrabold text-[#047857] dark:text-[#6EE7B7] tabular-nums mt-1 break-words">
                v{release.versionName}
                {release.versionCode ? ` (${release.versionCode})` : ''}
              </p>
            </div>
          </div>

          {isMandatory && (
            <div className="rounded-2xl bg-[#FEF2F2] dark:bg-[#450A0A]/60 border border-[#FECACA] dark:border-[#991B1B] p-4 text-sm font-semibold text-[#991B1B] dark:text-[#FECACA] leading-relaxed break-words">
              {t.appUpdateMandatoryDesc}
            </div>
          )}

          {/* Full Release Notes (Unclipped) */}
          <div className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-4 sm:p-5 shadow-sm space-y-2.5">
            {release.releaseTitle && (
              <h3 className="text-base sm:text-lg font-extrabold text-[#0F172A] dark:text-[#F8FAFC] break-words">
                {release.releaseTitle}
              </h3>
            )}
            <div className="text-sm sm:text-base text-[#334155] dark:text-[#CBD5E1] whitespace-pre-wrap break-words leading-relaxed">
              {release.releaseNotes || release.releaseTitle}
            </div>
          </div>

          {/* Security & Data Preservation Note */}
          <div className="rounded-2xl bg-[#EFF6FF] dark:bg-[#1E3A5F]/40 border border-[#BFDBFE] dark:border-[#1E40AF] p-4 flex items-start gap-3 text-xs sm:text-sm font-semibold text-[#1E3A8A] dark:text-[#BFDBFE]">
            <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5 text-[#047857] dark:text-[#6EE7B7]" />
            <span className="leading-relaxed break-words">
              {lang === 'en'
                ? 'Updates directly in-place — your student login, unlocks & progress remain completely intact.'
                : 'સીધું એપની અંદર ઇન્સ્ટોલ થશે — તમારું જૂનું લૉગિન, અનલૉક વિષયો અને ડેટા સંપૂર્ણ સુરક્ષિત રહેશે.'}
            </span>
          </div>

          {/* Download / Verification / Installer Progress */}
          {progressState.status !== 'idle' && (
            <div className="rounded-2xl border-2 border-[#CBD5E1] dark:border-[#475569] bg-white dark:bg-[#1E293B] p-4 sm:p-5 space-y-3 shadow-sm">
              {(progressState.status === 'downloading' ||
                progressState.status === 'verifying' ||
                progressState.status === 'installing') && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-extrabold text-[#1E3A8A] dark:text-[#93C5FD]">
                    <span>
                      {isWebSwUpdate
                        ? t.webUpdateApplyingLabel
                        : progressState.status === 'verifying'
                          ? t.appUpdateVerifyingLabel
                          : progressState.status === 'installing'
                            ? t.appUpdateInstallingLabel
                            : t.appUpdateDownloadingBtn}
                    </span>
                    <span className="tabular-nums">
                      {progressState.progressPercent}%
                      {downloadedMbText && totalMbText
                        ? ` (${downloadedMbText} / ${totalMbText})`
                        : ''}
                    </span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className="h-full bg-[#1E3A8A] dark:bg-[#3B82F6] transition-all duration-150"
                      style={{ width: `${Math.max(4, progressState.progressPercent)}%` }}
                    />
                  </div>
                </>
              )}

              {(progressState.status === 'permission_required' ||
                progressState.status === 'permission_denied') && (
                <div className="space-y-3 text-sm text-[#92400E] dark:text-[#FDE68A]">
                  <p className="font-bold flex items-start gap-2 leading-relaxed">
                    <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                    <span>{t.appUpdatePermissionRequiredDesc}</span>
                  </p>
                  <button
                    type="button"
                    data-testid="retry_install_permission_btn"
                    onClick={() => void handleRetryPermissionInstall()}
                    className="min-h-[48px] w-full rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer px-4"
                  >
                    <CheckCircle2 className="h-5 w-5" />
                    <span>{t.appUpdateGrantInstallPermBtn}</span>
                  </button>
                </div>
              )}

              {progressState.status === 'error' && (
                <div className="text-sm text-[#B91C1C] dark:text-[#FCA5A5]">
                  <p className="font-bold flex items-start gap-2 leading-relaxed break-words">
                    <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                    <span>{progressState.message || 'Download failed'}</span>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Recent Push Notification History (Unclipped) */}
          {updateHistory.length > 0 && (
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#475569] dark:text-[#94A3B8]">
                <Bell className="h-4 w-4 shrink-0" />
                <span>{t.appUpdateHistoryTitle}</span>
              </div>
              <div className="space-y-2">
                {updateHistory.slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-3.5 text-xs sm:text-sm space-y-1 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold text-[#0F172A] dark:text-[#F8FAFC] break-words">
                        {item.title} (v{item.versionName})
                      </p>
                      <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8] shrink-0">
                        {formatTimestampLabel(item.createdAt)}
                      </span>
                    </div>
                    <p className="text-[#475569] dark:text-[#CBD5E1] break-words whitespace-pre-line leading-relaxed">
                      {item.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pinned Bottom Action Bar (Always Accessible, Zero Clipping) */}
      <footer className="shrink-0 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 px-4 sm:px-6 bg-white/95 dark:bg-[#1E293B]/95 backdrop-blur border-t border-[#E2E8F0] dark:border-[#334155]">
        <div
          className={`${containerWidthCls} mx-auto flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3`}
        >
          {!isMandatory && !isTransferring && (
            <button
              type="button"
              data-testid="update_later_btn"
              onClick={onDismiss}
              className="min-h-[50px] px-5 py-2.5 rounded-xl border border-[#CBD5E1] dark:border-[#475569] text-sm font-bold text-[#334155] dark:text-[#CBD5E1] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {t.appUpdateLaterBtn}
            </button>
          )}

          <button
            type="button"
            data-testid="update_now_btn"
            disabled={isTransferring}
            onClick={() => void handleStartInAppUpdate()}
            className="min-h-[52px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm sm:text-base font-extrabold bg-[#1E3A8A] hover:bg-[#172554] dark:bg-[#2563EB] text-white disabled:opacity-50 transition-colors cursor-pointer shadow-md"
          >
            {progressState.status === 'error' ? (
              <>
                <RefreshCw className="h-5 w-5" />
                <span>{t.appUpdateRetryBtn}</span>
              </>
            ) : (
              <>
                <Download className="h-5 w-5" />
                <span>
                  {isTransferring
                    ? `${progressState.progressPercent}%`
                    : t.appUpdateNowBtn}
                </span>
              </>
            )}
          </button>
        </div>
      </footer>
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

  return (
    <div
      className="fixed inset-x-0 top-0 z-[85] flex justify-center px-3 pt-[max(env(safe-area-inset-top),0.5rem)] pointer-events-none"
      data-testid="app_update_banner"
    >
      <div
        role="region"
        aria-label={t.appUpdateAvailableTitle}
        className="pointer-events-auto max-w-2xl w-full max-h-[45dvh] overflow-y-auto rounded-2xl bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-md border-2 border-[#1E3A8A] dark:border-[#3B82F6] shadow-2xl p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="h-10 w-10 rounded-xl bg-[#DBEAFE] dark:bg-[#1E3A8A] text-[#1E3A8A] dark:text-[#93C5FD] flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs sm:text-sm font-extrabold text-[#0F172A] dark:text-[#F8FAFC] break-words">
                {t.appUpdateAvailableTitle}
              </p>
              <span className="rounded-full bg-[#DCFCE7] dark:bg-[#064E3B] text-[#047857] dark:text-[#6EE7B7] px-2 py-0.5 text-[10px] font-extrabold tabular-nums shrink-0">
                v{release.versionName}
                {release.versionCode ? ` (${release.versionCode})` : ''}
              </span>
            </div>
            {(release.releaseNotes || release.releaseTitle) && (
              <p className="text-[11px] sm:text-xs text-[#475569] dark:text-[#CBD5E1] whitespace-pre-line break-words leading-relaxed">
                {release.releaseNotes || release.releaseTitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
          <button
            type="button"
            data-testid="banner_update_later_btn"
            onClick={onUpdateLater}
            className="min-h-[48px] px-3.5 py-2 rounded-xl text-xs font-bold text-[#475569] dark:text-[#CBD5E1] hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            {t.appUpdateLaterBtn}
          </button>
          <button
            type="button"
            data-testid="banner_update_now_btn"
            onClick={onUpdateNow}
            className="min-h-[48px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] dark:bg-[#2563EB] text-white text-xs font-extrabold transition-colors cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{t.appUpdateNowBtn}</span>
          </button>
        </div>
      </div>
    </div>
  );
};


