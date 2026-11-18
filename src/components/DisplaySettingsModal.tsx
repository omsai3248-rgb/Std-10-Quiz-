import React, { useEffect } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Maximize2,
  Monitor,
  RectangleHorizontal,
  RectangleVertical,
  RotateCcw,
  Smartphone,
  Sparkles,
  Tablet,
  Tv,
  X,
} from 'lucide-react';
import { useAdaptiveDisplay } from '../context/AdaptiveDisplayContext';
import { useTranslation } from '../i18n/translations';
import type { DeviceType, DisplayModeSetting } from '../services/adaptiveDisplay';

interface DisplaySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function getDeviceTypeIcon(deviceType: DeviceType) {
  switch (deviceType) {
    case 'android_tv':
      return <Tv className="h-5 w-5" />;
    case 'smart_board':
    case 'large_touchscreen':
    case 'landscape_monitor':
      return <Monitor className="h-5 w-5" />;
    case 'tablet':
    case 'foldable':
      return <Tablet className="h-5 w-5" />;
    default:
      return <Smartphone className="h-5 w-5" />;
  }
}

export const DisplaySettingsModal: React.FC<DisplaySettingsModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const {
    deviceType,
    windowSizeClass,
    effectiveOrientation,
    displayMode,
    isFullScreen,
    widthDp,
    heightDp,
    diagonalInches,
    hingePosture,
    screenProfileLabel,
    setDisplayMode,
    toggleFullScreenMode,
    resetDisplaySettings,
  } = useAdaptiveDisplay();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const deviceTypeLabelMap: Record<DeviceType, string> = {
    mobile_phone: t.deviceTypeMobile,
    tablet: t.deviceTypeTablet,
    smart_board: t.deviceTypeSmartBoard,
    android_tv: t.deviceTypeAndroidTv,
    large_touchscreen: t.deviceTypeLargeTouchscreen,
    landscape_monitor: t.deviceTypeLandscapeMonitor,
    foldable: t.deviceTypeFoldable,
  };

  const modeOptions: Array<{
    id: DisplayModeSetting;
    title: string;
    desc: string;
    Icon: React.FC<{ className?: string }>;
  }> = [
    {
      id: 'auto_adaptive',
      title: t.displayModeAutoTitle,
      desc: t.displayModeAutoDesc,
      Icon: Sparkles,
    },
    {
      id: 'portrait',
      title: t.displayModePortraitTitle,
      desc: t.displayModePortraitDesc,
      Icon: RectangleVertical,
    },
    {
      id: 'landscape',
      title: t.displayModeLandscapeTitle,
      desc: t.displayModeLandscapeDesc,
      Icon: RectangleHorizontal,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 w-full h-[100dvh] bg-[#FAF9F5] dark:bg-[#0B1120] text-[#0F172A] dark:text-[#F8FAFC] flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={t.displaySettingsTitle}
      data-testid="display_settings_fullscreen_view"
    >
      {/* Full-Screen Top Bar */}
      <header className="shrink-0 w-full bg-white/95 dark:bg-[#1E293B]/95 backdrop-blur border-b border-[#E2E8F0] dark:border-[#334155]">
        <div className="max-w-5xl mx-auto w-full px-3 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onClose}
              aria-label={t.closeBtn}
              className="min-h-[48px] min-w-[48px] rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="h-10 w-10 rounded-xl bg-[#DBEAFE] dark:bg-[#1E3A5F] text-[#1E3A8A] dark:text-[#93C5FD] flex items-center justify-center shrink-0">
              {getDeviceTypeIcon(deviceType)}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-lg font-extrabold truncate">
                {t.displaySettingsTitle}
              </h2>
              <p className="text-[11px] sm:text-xs text-[#475569] dark:text-[#94A3B8] truncate">
                {t.displaySettingsSubtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="close_display_settings_btn"
            onClick={onClose}
            aria-label={t.closeBtn}
            className="min-h-[48px] min-w-[48px] rounded-xl border border-[#CBD5E1] dark:border-[#334155] flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Scrollable Full-Screen Content */}
      <main className="flex-1 overflow-y-auto w-full">
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-5 space-y-5">
          {/* Live Detected Screen Telemetry */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 text-xs">
          <div className="rounded-xl bg-[#EFF4FA] dark:bg-[#0F172A] p-2.5">
            <p className="text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8]">
              {t.displayDetectedDeviceLabel}
            </p>
            <p className="font-extrabold mt-0.5 truncate">{deviceTypeLabelMap[deviceType]}</p>
          </div>
          <div className="rounded-xl bg-[#EFF4FA] dark:bg-[#0F172A] p-2.5">
            <p className="text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8]">
              {t.displayWindowClassLabel}
            </p>
            <p className="font-extrabold mt-0.5 uppercase">{windowSizeClass}</p>
          </div>
          <div className="rounded-xl bg-[#EFF4FA] dark:bg-[#0F172A] p-2.5">
            <p className="text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8]">
              {t.displayOrientationLabel}
            </p>
            <p className="font-extrabold mt-0.5">
              {effectiveOrientation === 'landscape'
                ? t.orientationLandscapeLabel
                : t.orientationPortraitLabel}
            </p>
          </div>
          <div className="rounded-xl bg-[#EFF4FA] dark:bg-[#0F172A] p-2.5">
            <p className="text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8]">
              {t.displayResolutionLabel}
            </p>
            <p className="font-extrabold mt-0.5 tabular-nums">
              {widthDp}×{heightDp}dp • {diagonalInches}&Prime;
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-[#DBEAFE]/60 dark:bg-[#1E3A5F]/50 px-3 py-2 text-xs font-bold text-[#1E3A8A] dark:text-[#DBEAFE] flex items-center justify-between gap-2">
          <span className="truncate">{screenProfileLabel}</span>
          {hingePosture !== 'none' && (
            <span className="rounded-md bg-white/80 dark:bg-black/30 px-2 py-0.5 text-[10px] uppercase">
              Fold: {hingePosture}
            </span>
          )}
        </div>

        {/* 1-3 Orientation / Layout Modes & 4 Full Screen Toggle */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {modeOptions.map(({ id, title, desc, Icon }) => {
            const active = displayMode === id;
            return (
              <button
                key={id}
                type="button"
                data-testid={`display_mode_${id}`}
                onClick={() => setDisplayMode(id)}
                className={`w-full min-h-[72px] rounded-2xl border-2 p-4 text-left flex items-center gap-3.5 transition-colors cursor-pointer ${
                  active
                    ? 'border-[#1E3A8A] dark:border-[#3B82F6] bg-[#DBEAFE]/55 dark:bg-[#1E3A5F]/65'
                    : 'border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] hover:border-[#94A3B8]'
                }`}
              >
                <div
                  className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
                    active
                      ? 'bg-[#1E3A8A] dark:bg-[#2563EB] text-white'
                      : 'bg-[#EFF4FA] dark:bg-[#0F172A] text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold">{title}</p>
                  <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-snug">{desc}</p>
                </div>
                {active && (
                  <CheckCircle2 className="h-5 w-5 text-[#1E3A8A] dark:text-[#93C5FD] shrink-0" />
                )}
              </button>
            );
          })}

          {/* 4. Full Screen Mode Toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={isFullScreen}
            data-testid="display_mode_fullscreen_toggle"
            onClick={toggleFullScreenMode}
            className={`w-full min-h-[72px] rounded-2xl border-2 p-4 text-left flex items-center gap-3.5 transition-colors cursor-pointer ${
              isFullScreen
                ? 'border-[#047857] bg-[#ECFDF5] dark:bg-[#064E3B]/50'
                : 'border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] hover:border-[#94A3B8]'
            }`}
          >
            <div
              className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
                isFullScreen
                  ? 'bg-[#047857] text-white'
                  : 'bg-[#EFF4FA] dark:bg-[#0F172A] text-slate-600 dark:text-slate-300'
              }`}
            >
              <Maximize2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold">{t.displayModeFullScreenTitle}</p>
              <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-snug">
                {t.displayModeFullScreenDesc}
              </p>
            </div>
            <span
              className={`w-12 h-7 rounded-full p-1 transition-colors flex items-center shrink-0 ${
                isFullScreen
                  ? 'bg-[#047857] justify-end'
                  : 'bg-slate-300 dark:bg-slate-700 justify-start'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-white shadow" />
            </span>
          </button>
        </div>
        </div>
      </main>

      {/* Full-Screen Sticky Bottom Action Bar */}
      <footer className="shrink-0 w-full bg-white/95 dark:bg-[#1E293B]/95 backdrop-blur border-t border-[#E2E8F0] dark:border-[#334155]">
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            data-testid="display_mode_reset_btn"
            onClick={resetDisplaySettings}
            className="min-h-[48px] px-4 rounded-xl border border-[#CBD5E1] dark:border-[#334155] text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
            <span>{t.displayResetDefaultBtn}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] px-6 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] dark:bg-[#2563EB] text-white text-xs sm:text-sm font-extrabold cursor-pointer"
          >
            {t.closeBtn}
          </button>
        </div>
      </footer>
    </div>
  );
};
