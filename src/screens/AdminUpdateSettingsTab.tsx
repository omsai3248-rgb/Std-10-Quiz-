import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  CloudUpload,
  FileArchive,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useAdaptiveDisplay } from '../context/AdaptiveDisplayContext';
import { useTranslation } from '../i18n/translations';
import {
  hasNativeFirebaseBridge,
  pickAndInspectNativeApk,
} from '../services/nativeFirebaseBridge';
import type {
  AppReleaseConfig,
  InspectedApkMetadata,
  InstalledAppInfo,
  PublishAppUpdateInput,
  UpdateNotificationRecord,
} from '../types/models';
import { formatTimestampLabel } from '../utils/imageUtils';
import { formatApkSizeMb } from '../components/AppUpdateComponents';

interface AdminUpdateSettingsTabProps {
  releaseConfig: AppReleaseConfig | null;
  installedAppInfo: InstalledAppInfo | null;
  updateNotifications: UpdateNotificationRecord[];
  currentVersionName: string;
  currentVersionCode: number;
  isBusy: boolean;
  isCheckingUpdate: boolean;
  notificationPermissionStatus: 'granted' | 'denied' | 'default';
  onPublishAppUpdate: (
    input: PublishAppUpdateInput
  ) => Promise<{ releaseId: string; apkDownloadUrl: string; versionName: string; versionCode: number }>;
  onDeleteReleaseHistory?: (releaseId: string) => Promise<void>;
  onTestUpdateCheck: () => void;
  onRequestNotificationPermission?: () => Promise<void> | void;
  onNotify?: (msg: string, isError?: boolean) => void;
}

export const AdminUpdateSettingsTab: React.FC<AdminUpdateSettingsTabProps> = ({
  releaseConfig,
  installedAppInfo,
  updateNotifications,
  currentVersionName,
  currentVersionCode,
  isBusy,
  isCheckingUpdate,
  notificationPermissionStatus,
  onPublishAppUpdate,
  onDeleteReleaseHistory,
  onTestUpdateCheck,
  onRequestNotificationPermission,
  onNotify,
}) => {
  const { t, lang } = useTranslation();
  const { useSplitLayout } = useAdaptiveDisplay();
  const webFileInputRef = useRef<HTMLInputElement | null>(null);

  const [inspectedApk, setInspectedApk] = useState<InspectedApkMetadata | null>(null);
  const [selectedWebFile, setSelectedWebFile] = useState<File | null>(null);
  const [isInspectingApk, setIsInspectingApk] = useState(false);

  const [versionNameInput, setVersionNameInput] = useState(() => {
    const base = releaseConfig?.latestVersionName || currentVersionName || '1.0.0';
    const parts = base.split('.').map((p) => Number.parseInt(p, 10) || 0);
    if (parts.length >= 3) {
      parts[parts.length - 1] += 1;
      return parts.join('.');
    }
    return base;
  });
  const [versionCodeInput, setVersionCodeInput] = useState(() =>
    String(Math.max(currentVersionCode, releaseConfig?.latestVersionCode ?? 1) + 1)
  );
  const [updateTitleInput, setUpdateTitleInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [isMandatory, setIsMandatory] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);

  useEffect(() => {
    if (!updateTitleInput && versionNameInput) {
      setUpdateTitleInput(`Quick Quiz v${versionNameInput}`);
    }
  }, [updateTitleInput, versionNameInput]);

  const handlePickApk = async () => {
    if (hasNativeFirebaseBridge()) {
      setIsInspectingApk(true);
      try {
        const meta = await pickAndInspectNativeApk();
        setInspectedApk(meta);
        setSelectedWebFile(null);
        if (meta.versionName) {
          setVersionNameInput(meta.versionName);
          setUpdateTitleInput(`Quick Quiz v${meta.versionName}`);
        }
        if (meta.versionCode > 0) {
          setVersionCodeInput(String(meta.versionCode));
        }
        if (!meta.packageMatches) {
          onNotify?.(t.adminUpdateMismatchPkg, true);
        } else if (!meta.signatureMatches) {
          onNotify?.(t.adminUpdateMismatchSig, true);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg !== 'PICK_CANCELLED') {
          onNotify?.(msg || 'Failed to read APK', true);
        }
      } finally {
        setIsInspectingApk(false);
      }
      return;
    }

    webFileInputRef.current?.click();
  };

  const handleWebApkSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.apk')) {
      onNotify?.('Please choose a valid .apk file.', true);
      return;
    }
    setSelectedWebFile(file);
    setInspectedApk(null);
  };

  const parsedVersionCode = Number.parseInt(versionCodeInput.trim(), 10) || 1;
  const hasNativeApkReady = Boolean(
    inspectedApk &&
      inspectedApk.stagedFilePath &&
      inspectedApk.packageMatches &&
      inspectedApk.signatureMatches
  );
  const hasWebApkReady = Boolean(selectedWebFile);
  const canPublish =
    !isBusy &&
    !isUploading &&
    !isInspectingApk &&
    versionNameInput.trim().length > 0 &&
    parsedVersionCode >= 1 &&
    notesInput.trim().length > 0 &&
    (hasNativeApkReady || hasWebApkReady);

  const handlePublish = async () => {
    if (!canPublish) return;
    setIsUploading(true);
    setUploadPercent(0);
    try {
      await onPublishAppUpdate({
        stagedFilePath: inspectedApk?.stagedFilePath,
        file: selectedWebFile,
        versionName: versionNameInput.trim(),
        versionCode: parsedVersionCode,
        updateTitle: updateTitleInput.trim() || `Quick Quiz v${versionNameInput.trim()}`,
        releaseNotes: notesInput.trim(),
        isMandatory,
        apkFileName: inspectedApk?.fileName || selectedWebFile?.name,
        apkSizeBytes: inspectedApk?.fileSizeBytes || selectedWebFile?.size,
        apkSha256: inspectedApk?.apkSha256,
        signingCertSha256:
          inspectedApk?.signingCertSha256 || installedAppInfo?.signingCertSha256 || '',
        packageName:
          inspectedApk?.packageName ||
          installedAppInfo?.packageName ||
          'com.aistudio.std10quiz.kqxmtv',
        githubOwnerRepo: releaseConfig?.githubOwnerRepo ?? '',
        onUploadProgress: (pct) => setUploadPercent(pct),
      });
      setInspectedApk(null);
      setSelectedWebFile(null);
      setNotesInput('');
      setVersionCodeInput(String(parsedVersionCode + 1));
    } catch {
      // Error banner handled by parent callback
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      className={`p-4 ${
        useSplitLayout
          ? 'max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5 items-start'
          : 'max-w-3xl mx-auto space-y-4'
      }`}
    >
      {/* Hidden Web APK File Input */}
      <input
        ref={webFileInputRef}
        type="file"
        accept=".apk,application/vnd.android.package-archive"
        className="hidden"
        onChange={handleWebApkSelected}
      />

      {/* Left / Main Form: Upload APK & Publish Update */}
      <div
        className={`${
          useSplitLayout ? 'lg:col-span-7' : ''
        } rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-5 space-y-4 shadow-sm`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 text-[#1E3A8A] dark:text-[#93C5FD]">
            <CloudUpload className="h-5 w-5" />
            <h2 className="text-base font-extrabold">{t.adminUpdateControlTitle}</h2>
          </div>

          <span className="rounded-full bg-[#DBEAFE] dark:bg-[#1E3A5F] text-[#1E3A8A] dark:text-[#DBEAFE] px-3 py-1 text-xs font-bold tabular-nums">
            v{currentVersionName} ({currentVersionCode})
          </span>
        </div>

        {/* Notification Permission Banner if not granted */}
        {hasNativeFirebaseBridge() && notificationPermissionStatus !== 'granted' && (
          <div className="rounded-xl bg-[#FEF3C7] dark:bg-[#78350F]/40 border border-[#F59E0B]/40 p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-[#92400E] dark:text-[#FDE68A] space-y-0.5">
              <p className="font-bold">{t.pushPermissionEnableTitle}</p>
              <p className="opacity-90">{t.pushPermissionEnableDesc}</p>
            </div>
            {onRequestNotificationPermission && (
              <button
                type="button"
                onClick={() => void onRequestNotificationPermission()}
                className="min-h-[48px] px-3.5 py-2 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold cursor-pointer"
              >
                {t.pushPermissionEnableBtn}
              </button>
            )}
          </div>
        )}

        {/* Step 1: Select & Inspect APK */}
        <div className="rounded-xl bg-slate-50 dark:bg-[#0F172A] border border-dashed border-[#94A3B8] dark:border-[#475569] p-4 space-y-3">
          <button
            type="button"
            data-testid="upload_apk_btn"
            disabled={isInspectingApk || isUploading}
            onClick={() => void handlePickApk()}
            className="w-full min-h-[48px] rounded-xl bg-[#1E3A8A] hover:bg-[#172554] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <FileArchive className="h-4 w-4" />
            <span>
              {isInspectingApk
                ? t.adminUpdateInspectingApk
                : inspectedApk || selectedWebFile
                  ? t.adminUpdateChangeApkBtn
                  : t.adminUpdateUploadApkBtn}
            </span>
          </button>

          {inspectedApk && (
            <div className="rounded-xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-3 text-xs space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-extrabold text-[#0F172A] dark:text-[#F8FAFC] break-all">
                  {inspectedApk.fileName}
                </span>
                <span className="font-bold text-[#1E3A8A] dark:text-[#93C5FD]">
                  {formatApkSizeMb(inspectedApk.fileSizeBytes)}
                </span>
              </div>
              <p className="text-[#475569] dark:text-[#94A3B8] tabular-nums">
                Package: {inspectedApk.packageName} • v{inspectedApk.versionName} (Code{' '}
                {inspectedApk.versionCode})
              </p>
              <div className="flex flex-col gap-1 pt-1">
                <p
                  className={`flex items-center gap-1.5 font-bold ${
                    inspectedApk.packageMatches
                      ? 'text-[#047857] dark:text-[#6EE7B7]'
                      : 'text-[#DC2626] dark:text-[#FCA5A5]'
                  }`}
                >
                  {inspectedApk.packageMatches ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>
                    {inspectedApk.packageMatches
                      ? t.adminUpdateVerifiedPkg
                      : t.adminUpdateMismatchPkg}
                  </span>
                </p>
                <p
                  className={`flex items-center gap-1.5 font-bold ${
                    inspectedApk.signatureMatches
                      ? 'text-[#047857] dark:text-[#6EE7B7]'
                      : 'text-[#DC2626] dark:text-[#FCA5A5]'
                  }`}
                >
                  {inspectedApk.signatureMatches ? (
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>
                    {inspectedApk.signatureMatches
                      ? t.adminUpdateVerifiedSig
                      : t.adminUpdateMismatchSig}
                  </span>
                </p>
              </div>
            </div>
          )}

          {selectedWebFile && !inspectedApk && (
            <div className="rounded-xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-3 text-xs flex items-center justify-between gap-2">
              <span className="font-bold text-[#0F172A] dark:text-[#F8FAFC] break-all">
                {selectedWebFile.name}
              </span>
              <span className="font-bold text-[#1E3A8A] dark:text-[#93C5FD] shrink-0">
                {formatApkSizeMb(selectedWebFile.size)}
              </span>
            </div>
          )}
        </div>

        {/* Step 2: Release Metadata Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="admin-update-version-name"
              className="block text-xs font-bold mb-1 text-[#0F172A] dark:text-[#E2E8F0]"
            >
              {t.adminUpdateVersionNameLabel}
            </label>
            <input
              id="admin-update-version-name"
              data-testid="update_version_name_input"
              type="text"
              maxLength={32}
              value={versionNameInput}
              onChange={(e) => setVersionNameInput(e.target.value.slice(0, 32))}
              placeholder="1.0.2"
              className="w-full h-12 rounded-xl border border-[#CBD5E1] dark:border-[#475569] bg-slate-50 dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] px-3.5 text-sm outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="admin-update-version-code"
              className="block text-xs font-bold mb-1 text-[#0F172A] dark:text-[#E2E8F0]"
            >
              {t.adminUpdateVersionCodeLabel}
            </label>
            <input
              id="admin-update-version-code"
              data-testid="update_version_code_input"
              type="number"
              min={1}
              max={1000000}
              value={versionCodeInput}
              onChange={(e) => setVersionCodeInput(e.target.value.replace(/\D/g, ''))}
              placeholder="2"
              className="w-full h-12 rounded-xl border border-[#CBD5E1] dark:border-[#475569] bg-slate-50 dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] px-3.5 text-sm outline-none tabular-nums"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="admin-update-title"
            className="block text-xs font-bold mb-1 text-[#0F172A] dark:text-[#E2E8F0]"
          >
            {t.adminUpdateTitleLabel}
          </label>
          <input
            id="admin-update-title"
            data-testid="update_title_input"
            type="text"
            maxLength={120}
            value={updateTitleInput}
            onChange={(e) => setUpdateTitleInput(e.target.value.slice(0, 120))}
            className="w-full h-12 rounded-xl border border-[#CBD5E1] dark:border-[#475569] bg-slate-50 dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] px-3.5 text-sm outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="admin-update-notes"
            className="block text-xs font-bold mb-1 text-[#0F172A] dark:text-[#E2E8F0]"
          >
            {t.adminUpdateNotesLabel}
          </label>
          <textarea
            id="admin-update-notes"
            data-testid="update_notes_input"
            rows={3}
            maxLength={1000}
            value={notesInput}
            onChange={(e) => setNotesInput(e.target.value.slice(0, 1000))}
            placeholder={
              lang === 'en'
                ? 'Describe new features, bug fixes, or improvements...'
                : 'નવા ફીચર્સ અથવા સુધારાની વિગત લખો...'
            }
            className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#475569] bg-slate-50 dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] p-3 text-sm outline-none"
          />
        </div>

        {/* Optional vs Mandatory Selector */}
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-[#0F172A] dark:text-[#E2E8F0]">
            {t.adminUpdateTypeLabel}
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              data-testid="update_mode_optional_btn"
              onClick={() => setIsMandatory(false)}
              className={`min-h-[48px] rounded-xl border px-3 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                !isMandatory
                  ? 'bg-[#DBEAFE] dark:bg-[#1E3A8A] border-[#1E3A8A] dark:border-[#60A5FA] text-[#1E3A8A] dark:text-white'
                  : 'border-[#E2E8F0] dark:border-[#334155] text-[#475569] dark:text-[#94A3B8]'
              }`}
            >
              <Sparkles className="h-4 w-4" />
              <span>{t.adminUpdateOptionalOption}</span>
            </button>

            <button
              type="button"
              data-testid="update_mode_mandatory_btn"
              onClick={() => setIsMandatory(true)}
              className={`min-h-[48px] rounded-xl border px-3 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                isMandatory
                  ? 'bg-[#FEE2E2] dark:bg-[#7F1D1D] border-[#DC2626] dark:border-[#F87171] text-[#991B1B] dark:text-white'
                  : 'border-[#E2E8F0] dark:border-[#334155] text-[#475569] dark:text-[#94A3B8]'
              }`}
            >
              <ShieldAlert className="h-4 w-4" />
              <span>{t.adminUpdateMandatoryOption}</span>
            </button>
          </div>
        </div>

        {/* Upload Progress Bar */}
        {isUploading && (
          <div className="rounded-xl bg-[#EFF6FF] dark:bg-[#172554]/50 border border-[#BFDBFE] dark:border-[#1E40AF] p-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-[#1E3A8A] dark:text-[#93C5FD]">
              <span>{t.adminUpdateUploadingProgress}</span>
              <span className="tabular-nums">{uploadPercent}%</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full bg-[#1E3A8A] dark:bg-[#3B82F6] transition-all duration-150"
                style={{ width: `${Math.max(4, uploadPercent)}%` }}
              />
            </div>
          </div>
        )}

        {/* Publish Button */}
        <button
          type="button"
          data-testid="publish_update_btn"
          disabled={!canPublish}
          onClick={() => void handlePublish()}
          className="w-full min-h-[48px] rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-sm font-extrabold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Send className="h-4 w-4" />
          <span>
            {isUploading ? t.adminUpdatePublishingBtn : t.adminUpdatePublishBtn}
          </span>
        </button>

        <button
          type="button"
          data-testid="admin_test_update_check_btn"
          disabled={isCheckingUpdate}
          onClick={onTestUpdateCheck}
          className="w-full min-h-[48px] rounded-xl border border-[#CBD5E1] dark:border-[#475569] text-xs font-bold flex items-center justify-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
          <span>{isCheckingUpdate ? t.appUpdateCheckingBtn : t.appUpdateCheckNowBtn}</span>
        </button>
      </div>

      {/* Right / Secondary Column: Active Live Release & Notification History */}
      <div className={`${useSplitLayout ? 'lg:col-span-5' : ''} space-y-4`}>
        <div className="rounded-2xl bg-[#DBEAFE]/60 dark:bg-[#1E3A5F] border border-[#BFDBFE] dark:border-[#1E40AF] p-5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-[#1E3A8A] dark:text-[#DBEAFE]">
              {t.adminUpdateActiveReleaseTitle}
            </h3>
            {releaseConfig?.isMandatory && (
              <span className="rounded-full bg-[#DC2626] text-white px-2.5 py-0.5 text-[10px] font-bold">
                {t.appUpdateMandatoryBadge}
              </span>
            )}
          </div>

          {releaseConfig?.apkDownloadUrl && releaseConfig?.latestVersionName ? (
            <div className="space-y-1.5 text-xs text-[#1E3A8A] dark:text-[#E2E8F0]">
              <p className="text-sm font-bold">
                {releaseConfig.updateTitle || `v${releaseConfig.latestVersionName}`}
              </p>
              <p className="font-semibold tabular-nums">
                v{releaseConfig.latestVersionName} (Code {releaseConfig.latestVersionCode ?? 1})
                {releaseConfig.apkSizeBytes
                  ? ` • ${formatApkSizeMb(releaseConfig.apkSizeBytes)}`
                  : ''}
              </p>
              {releaseConfig.apkFileName && (
                <p className="opacity-85 break-all">{releaseConfig.apkFileName}</p>
              )}
              {releaseConfig.releaseNotes && (
                <p className="rounded-xl bg-white/75 dark:bg-slate-900/50 p-2.5 whitespace-pre-wrap text-[#0F172A] dark:text-[#E2E8F0]">
                  {releaseConfig.releaseNotes}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-[#1E3A8A]/80 dark:text-[#CBD5E1]">
              {t.adminUpdateNoActiveRelease}
            </p>
          )}
        </div>

        {/* Update Notification History */}
        <div className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4.5 w-4.5 text-[#D97706] dark:text-[#FCD34D]" />
            <h3 className="text-sm font-extrabold">{t.appUpdateHistoryTitle}</h3>
          </div>

          {updateNotifications.length === 0 ? (
            <p className="text-xs text-[#475569] dark:text-[#94A3B8]">{t.appUpdateNoHistory}</p>
          ) : (
            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {updateNotifications.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-slate-50 dark:bg-[#0F172A] p-3 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                        {item.title} • v{item.versionName} ({item.versionCode})
                      </p>
                      <p className="text-[11px] text-[#475569] dark:text-[#94A3B8] whitespace-pre-wrap">
                        {item.body}
                      </p>
                    </div>
                    {onDeleteReleaseHistory && (
                      <button
                        type="button"
                        aria-label={t.deleteBtn}
                        onClick={() => void onDeleteReleaseHistory(item.releaseId || item.id)}
                        className="p-2 rounded-lg text-[#DC2626] hover:bg-red-100 dark:hover:bg-red-950/50 cursor-pointer shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-[#64748B] dark:text-[#94A3B8]">
                    <span>
                      {item.isMandatory
                        ? t.appUpdateMandatoryBadge
                        : t.appUpdateOptionalBadge}
                      {item.pushDispatched ? ` • ${t.adminUpdatePushSentCount}` : ''}
                    </span>
                    <span>{formatTimestampLabel(item.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
