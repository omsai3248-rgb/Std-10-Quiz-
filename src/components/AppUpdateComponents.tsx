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

  const [showHistory, setShowHistory] = useState(false);

  const totalMbText = isWebSwUpdate
    ? ''
    : formatApkSizeMb(progressState.totalBytes || release.apkSizeBytes);
  const downloadedMbText = isWebSwUpdate
    ? ''
    : formatApkSizeMb(progressState.bytesDownloaded);

  const containerWidthCls = isTvOrSmartBoard
    ? 'max-w-5xl'
    : isLargeScreen
      ? 'max-w-3xl'
      : 'max-w-xl';
  const headingCls = isTvOrSmartBoard ? 'text-2xl sm:text-3xl' : 'text-base sm:text-xl';

  return (
    <div
      className="min-h-[100dvh] w-full flex flex-col bg-[#FAF9F5] dark:bg-[#0B1120] text-[#0F172A] dark:text-[#F8FAFC]"
      role="dialog"
      aria-modal="true"
      aria-label={isMandatory ? t.appUpdateMandatoryTitle : t.appUpdateAvailableTitle}
      data-testid="app_update_modal"
    >
      {/* Top Safe-Area Header */}
      <header className="shrink-0 w-full pt-[env(safe-area-inset-top)] bg-white dark:bg-[#1E293B] border-b border-[#E2E8F0] dark:border-[#334155]">
        <div
          className={`${containerWidthCls} mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3`}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <img
              src="/images/ic_app_logo.png"
              alt={t.appName}
              className={`${
                isTvOrSmartBoard ? 'h-12 w-12' : 'h-10 w-10 sm:h-11 sm:w-11'
              } rounded-xl object-contain bg-black border border-slate-200 dark:border-slate-700 shrink-0`}
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
              <h2 className={`${headingCls} font-extrabold leading-tight whitespace-normal break-words`}>
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

      {/* Single-Screen Balanced Content (Fits cleanly without scrolling) */}
      <main className="flex-1 w-full flex flex-col justify-between">
        <div
          className={`${containerWidthCls} w-full mx-auto px-4 sm:px-6 py-4 sm:py-6 flex-1 flex flex-col justify-center gap-3.5 sm:gap-4`}
        >
          {/* Side-by-Side Version Comparison (Compact 2-Col on all devices) */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
            <div className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-3.5 sm:p-4 shadow-sm h-auto">
              <p
                className={`${
                  isTvOrSmartBoard ? 'text-sm' : 'text-[11px] sm:text-xs'
                } font-semibold text-[#475569] dark:text-[#94A3B8] whitespace-normal break-words`}
              >
                {t.appUpdateCurrentVersionLabel}
              </p>
              <p
                className={`${
                  isTvOrSmartBoard ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg'
                } font-extrabold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums mt-0.5 break-words`}
              >
                v{currentVersionName} ({currentVersionCode})
              </p>
            </div>
            <div className="rounded-2xl bg-[#ECFDF5] dark:bg-[#064E3B]/45 border border-[#A7F3D0] dark:border-[#047857] p-3.5 sm:p-4 shadow-sm h-auto">
              <p
                className={`${
                  isTvOrSmartBoard ? 'text-sm' : 'text-[11px] sm:text-xs'
                } font-semibold text-[#047857] dark:text-[#6EE7B7] whitespace-normal break-words`}
              >
                {t.appUpdateNewVersionLabel}
              </p>
              <p
                className={`${
                  isTvOrSmartBoard ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg'
                } font-extrabold text-[#047857] dark:text-[#6EE7B7] tabular-nums mt-0.5 break-words`}
              >
                v{release.versionName}
                {release.versionCode ? ` (${release.versionCode})` : ''}
              </p>
            </div>
          </div>

          {isMandatory && (
            <div
              className={`rounded-2xl bg-[#FEF2F2] dark:bg-[#450A0A]/60 border border-[#FECACA] dark:border-[#991B1B] p-3.5 ${
                isTvOrSmartBoard ? 'text-base' : 'text-xs sm:text-sm'
              } font-semibold text-[#991B1B] dark:text-[#FECACA] leading-relaxed whitespace-normal break-words`}
            >
              {t.appUpdateMandatoryDesc}
            </div>
          )}

          {/* Release Details (Auto-Height, Full Text Wrapping, Unclipped) */}
          <div className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-3.5 sm:p-5 shadow-sm space-y-1.5 h-auto">
            {release.releaseTitle && (
              <h3
                className={`${
                  isTvOrSmartBoard ? 'text-lg sm:text-xl' : 'text-sm sm:text-base'
                } font-extrabold text-[#0F172A] dark:text-[#F8FAFC] whitespace-normal break-words`}
              >
                {release.releaseTitle}
              </h3>
            )}
            <div
              className={`${
                isTvOrSmartBoard ? 'text-base sm:text-lg' : 'text-xs sm:text-sm'
              } text-[#334155] dark:text-[#CBD5E1] whitespace-pre-wrap break-words leading-relaxed`}
            >
              {release.releaseNotes || release.releaseTitle}
            </div>
          </div>

          {/* Compact Security & Data Preservation Strip */}
          <div
            className={`rounded-2xl bg-[#EFF6FF] dark:bg-[#1E3A5F]/40 border border-[#BFDBFE] dark:border-[#1E40AF] p-3 sm:p-3.5 flex items-start gap-2.5 ${
              isTvOrSmartBoard ? 'text-sm sm:text-base' : 'text-xs sm:text-sm'
            } font-semibold text-[#1E3A8A] dark:text-[#BFDBFE] h-auto`}
          >
            <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5 text-[#047857] dark:text-[#6EE7B7]" />
            <span className="leading-snug whitespace-normal break-words">
              {lang === 'en'
                ? 'Updates directly in-place — your student login, unlocks & progress stay completely safe.'
                : 'સીધું એપની અંદર ઇન્સ્ટોલ થશે — તમારું જૂનું લૉગિન, અનલૉક વિષયો અને ડેટા સંપૂર્ણ સુરક્ષિત રહેશે.'}
            </span>
          </div>

          {/* Download / Verification / Installer Progress */}
          {progressState.status !== 'idle' && (
            <div className="rounded-2xl border-2 border-[#1E3A8A]/35 dark:border-[#3B82F6]/50 bg-white dark:bg-[#1E293B] p-3.5 sm:p-4 space-y-2.5 shadow-sm h-auto">
              {(progressState.status === 'downloading' ||
                progressState.status === 'verifying' ||
                progressState.status === 'installing') && (
                <>
                  <div
                    className={`flex flex-wrap items-center justify-between gap-2 ${
                      isTvOrSmartBoard ? 'text-base' : 'text-xs sm:text-sm'
                    } font-extrabold text-[#1E3A8A] dark:text-[#93C5FD]`}
                  >
                    <span className="whitespace-normal break-words">
                      {isWebSwUpdate
                        ? t.webUpdateApplyingLabel
                        : progressState.status === 'verifying'
                          ? t.appUpdateVerifyingLabel
                          : progressState.status === 'installing'
                            ? t.appUpdateInstallingLabel
                            : t.appUpdateDownloadingBtn}
                    </span>
                    <span className="tabular-nums shrink-0">
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
                <div className="space-y-2.5 text-xs sm:text-sm text-[#92400E] dark:text-[#FDE68A]">
                  <p className="font-bold flex items-start gap-2 leading-relaxed whitespace-normal break-words">
                    <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                    <span>{t.appUpdatePermissionRequiredDesc}</span>
                  </p>
                  <button
                    type="button"
                    data-testid="retry_install_permission_btn"
                    onClick={() => void handleRetryPermissionInstall()}
                    className="min-h-[48px] w-full rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer px-4"
                  >
                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                    <span>{t.appUpdateGrantInstallPermBtn}</span>
                  </button>
                </div>
              )}

              {progressState.status === 'error' && (
                <div className="text-xs sm:text-sm text-[#B91C1C] dark:text-[#FCA5A5]">
                  <p className="font-bold flex items-start gap-2 leading-relaxed whitespace-normal break-words">
                    <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                    <span>{progressState.message || 'Download failed'}</span>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Primary Action Buttons — Always Immediately Visible Without Scrolling */}
          <div
            className={`grid ${
              !isMandatory && !isTransferring ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
            } gap-2.5 sm:gap-3 pt-1`}
          >
            <button
              type="button"
              data-testid="update_now_btn"
              disabled={isTransferring}
              onClick={() => void handleStartInAppUpdate()}
              className={`${
                isTvOrSmartBoard ? 'min-h-[58px] text-lg' : 'min-h-[52px] text-sm sm:text-base'
              } w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-extrabold bg-[#1E3A8A] hover:bg-[#172554] dark:bg-[#2563EB] text-white disabled:opacity-60 whitespace-normal text-center transition-colors cursor-pointer shadow-md`}
            >
              {progressState.status === 'error' ? (
                <>
                  <RefreshCw className="h-5 w-5 shrink-0" />
                  <span>{t.appUpdateRetryBtn}</span>
                </>
              ) : (
                <>
                  <Download className="h-5 w-5 shrink-0" />
                  <span>
                    {isTransferring
                      ? `${t.appUpdateDownloadingBtn} ${progressState.progressPercent}%`
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
                className={`${
                  isTvOrSmartBoard ? 'min-h-[58px] text-lg' : 'min-h-[50px] text-sm sm:text-base'
                } w-full px-5 py-2.5 rounded-xl border border-[#CBD5E1] dark:border-[#475569] bg-white dark:bg-[#1E293B] font-bold text-[#334155] dark:text-[#CBD5E1] hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-normal text-center transition-colors cursor-pointer`}
              >
                {t.appUpdateLaterBtn}
              </button>
            )}
          </div>

          {/* Optional Collapsible History (Collapsed by default so main update fits on 1 screen with zero scrolling) */}
          {updateHistory.length > 0 && (
            <div className="pt-1 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
              <button
                type="button"
                onClick={() => setShowHistory((prev) => !prev)}
                className="min-h-[44px] inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-[#475569] dark:text-[#94A3B8] hover:text-[#1E3A8A] dark:hover:text-[#93C5FD] cursor-pointer"
              >
                <Bell className="h-4 w-4 shrink-0" />
                <span>
                  {t.appUpdateHistoryTitle} ({Math.min(updateHistory.length, 5)}){' '}
                  {showHistory ? '▲' : '▼'}
                </span>
              </button>
              {showHistory && (
                <div className="mt-2 space-y-2">
                  {updateHistory.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-3 text-xs sm:text-sm space-y-1 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-bold text-[#0F172A] dark:text-[#F8FAFC] whitespace-normal break-words">
                          {item.title} (v{item.versionName})
                        </p>
                        <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8] shrink-0">
                          {formatTimestampLabel(item.createdAt)}
                        </span>
                      </div>
                      <p className="text-[#475569] dark:text-[#CBD5E1] whitespace-pre-line break-words leading-relaxed">
                        {item.body}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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
    ? 'max-w-4xl'
    : isLargeScreen
      ? 'max-w-2xl'
      : 'max-w-xl';

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




