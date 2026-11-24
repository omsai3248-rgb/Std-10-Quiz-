import React from 'react';
import {
  Bell,
  BellOff,
  Languages,
  LogOut,
  Monitor,
  Moon,
  ShieldCheck,
  Smartphone,
  Sun,
} from 'lucide-react';
import { useAdaptiveDisplay } from '../context/AdaptiveDisplayContext';
import { useTranslation } from '../i18n/translations';

export type PublicTabId = 'quiz' | 'admin';

interface TopNavHeaderProps {
  activeTab: PublicTabId;
  isStudentLoggedIn: boolean;
  studentName?: string;
  studentMobile?: string;
  studentPhotoUrl?: string;
  studentEmail?: string;
  mobileVerified?: boolean;
  isAdmin: boolean;
  adminBadgeCount: number;
  isDarkTheme: boolean;
  onSelectTab: (tab: PublicTabId) => void;
  onStudentLogout: () => void;
  onOpenProfile?: () => void;
  onToggleTheme: () => void;
  onOpenDisplaySettings?: () => void;
  notificationPermissionStatus?: 'granted' | 'denied' | 'default';
  pushBroadcastCount?: number;
  onOpenNotifications?: () => void;
}

export const TopNavHeader: React.FC<TopNavHeaderProps> = ({
  activeTab,
  isStudentLoggedIn,
  studentName = '',
  studentMobile = '',
  studentPhotoUrl = '',
  studentEmail = '',
  mobileVerified = false,
  isAdmin,
  adminBadgeCount,
  isDarkTheme,
  onSelectTab,
  onStudentLogout,
  onOpenProfile,
  onToggleTheme,
  onOpenDisplaySettings,
  notificationPermissionStatus = 'default',
  pushBroadcastCount = 0,
  onOpenNotifications,
}) => {
  const { lang, toggleLang, t } = useTranslation();
  const { isLargeScreen, isTvOrSmartBoard, isFullScreen, displayMode } = useAdaptiveDisplay();

  const identityLabel = [
    studentName || 'Student',
    studentMobile ? `+91 ${studentMobile}` : '',
  ]
    .filter(Boolean)
    .join(' • ');

  const containerWidthCls = isLargeScreen ? 'max-w-[1440px] px-4 sm:px-6' : 'max-w-4xl px-3 sm:px-4';
  const controlHeightCls = isTvOrSmartBoard ? 'min-h-[48px] px-3.5 text-sm' : 'min-h-[42px] px-2.5 text-xs';

  return (
    <header className="sticky top-0 z-30 pt-[env(safe-area-inset-top)] bg-white/95 dark:bg-[#1E293B]/95 backdrop-blur border-b border-[#E2E8F0] dark:border-[#334155]">
      <div
        className={`${containerWidthCls} mx-auto ${
          isTvOrSmartBoard ? 'h-18' : 'h-15'
        } flex items-center justify-between gap-2`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src="/images/ic_app_logo.png"
            alt={t.appName}
            className={`${
              isTvOrSmartBoard ? 'h-11 w-11' : 'h-9 w-9'
            } rounded-xl object-contain bg-black border border-slate-200 dark:border-slate-700 shrink-0`}
          />
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-extrabold truncate leading-tight">
              {t.appName}
            </h1>
            <p className="text-[11px] text-[#475569] dark:text-[#94A3B8] truncate hidden sm:block">
              {t.appSubtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {isAdmin && (
            <button
              type="button"
              onClick={() => onSelectTab('admin')}
              className={`${controlHeightCls} rounded-xl bg-[#047857] hover:bg-[#065F46] text-white font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer`}
            >
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{t.navAdminLive}</span>
              {adminBadgeCount > 0 && (
                <span className="rounded-full bg-[#DC2626] text-white text-[10px] font-extrabold px-1.5 py-0.5 min-w-[18px] text-center leading-none tabular-nums">
                  {adminBadgeCount}
                </span>
              )}
            </button>
          )}

          {onOpenNotifications && (
            <button
              type="button"
              data-testid="open_student_notifications_btn"
              onClick={onOpenNotifications}
              aria-label="Quick Quiz Notifications"
              title="Quick Quiz Notifications"
              className={`${
                isTvOrSmartBoard ? 'min-h-[48px] min-w-[48px]' : 'min-h-[42px] min-w-[42px]'
              } relative rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer`}
            >
              {notificationPermissionStatus === 'granted' ? (
                <Bell className="h-4 w-4 text-[#047857] dark:text-[#6EE7B7] shrink-0" />
              ) : (
                <BellOff className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              )}
              {notificationPermissionStatus !== 'granted' ? (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-[#1E293B]" />
              ) : pushBroadcastCount > 0 ? (
                <span className="absolute -top-1 -right-1 rounded-full bg-[#DC2626] text-white text-[9px] font-extrabold px-1 min-w-[16px] h-4 flex items-center justify-center leading-none tabular-nums">
                  {pushBroadcastCount > 9 ? '9+' : pushBroadcastCount}
                </span>
              ) : null}
            </button>
          )}

          {onOpenDisplaySettings && (
            <button
              type="button"
              data-testid="open_display_settings_btn"
              onClick={onOpenDisplaySettings}
              aria-label={t.displaySettingsTitle}
              title={t.displaySettingsTitle}
              className={`${controlHeightCls} rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] hover:bg-slate-100 dark:hover:bg-slate-800 font-bold flex items-center gap-1.5 transition-colors cursor-pointer`}
            >
              <Monitor className="h-4 w-4 text-[#1E3A8A] dark:text-[#93C5FD] shrink-0" />
              <span className="hidden md:inline">{t.displaySettingsBtn}</span>
              {(isFullScreen || displayMode !== 'auto_adaptive') && (
                <span className="h-2 w-2 rounded-full bg-[#047857] dark:bg-[#6EE7B7] shrink-0" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={toggleLang}
            aria-label="Toggle language"
            className={`${controlHeightCls} rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] hover:bg-slate-100 dark:hover:bg-slate-800 font-bold flex items-center gap-1.5 transition-colors cursor-pointer`}
          >
            <Languages className="h-4 w-4 text-[#1E3A8A] dark:text-[#93C5FD]" />
            <span>{lang === 'gu' ? 'EN' : 'ગુજરાતી'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
            className={`${
              isTvOrSmartBoard ? 'min-h-[48px] min-w-[48px]' : 'min-h-[42px] min-w-[42px]'
            } rounded-xl border border-[#CBD5E1] dark:border-[#334155] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer`}
          >
            {isDarkTheme ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Logged-in Student Profile Strip */}
      {isStudentLoggedIn && activeTab === 'quiz' && (
        <div
          className={`${containerWidthCls} mx-auto py-1.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 bg-[#FAF9F5]/80 dark:bg-[#0F172A]/60 text-xs`}
        >
          <button
            type="button"
            data-testid="open_user_profile_btn"
            onClick={() => onOpenProfile?.()}
            title={studentEmail || identityLabel}
            className="flex items-center gap-2 min-w-0 text-left rounded-xl px-1.5 py-1 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
          >
            {studentPhotoUrl ? (
              <img
                src={studentPhotoUrl}
                alt={studentName || 'Student'}
                referrerPolicy="no-referrer"
                className="h-7 w-7 rounded-full object-cover border border-[#CBD5E1] dark:border-[#334155] shrink-0"
              />
            ) : (
              <div className="h-7 w-7 rounded-full bg-[#1E3A8A]/10 dark:bg-[#1E3A8A]/40 text-[#1E3A8A] dark:text-[#93C5FD] flex items-center justify-center shrink-0">
                <Smartphone className="h-3.5 w-3.5" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-bold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                <span className="truncate">{identityLabel}</span>
                {!mobileVerified && (
                  <span className="hidden sm:inline-block shrink-0 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 text-[9px] font-extrabold">
                    {lang === 'en' ? 'Unverified' : 'OTP બાકી'}
                  </span>
                )}
              </div>
            </div>
          </button>
          <button
            type="button"
            data-testid="student_logout_button"
            onClick={onStudentLogout}
            className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-[#CBD5E1] dark:border-[#334155] px-2.5 py-1 min-h-[36px] text-[11px] font-bold text-[#475569] dark:text-[#94A3B8] hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
          >
            <LogOut className="h-3 w-3" />
            <span>{t.switchAccountBtn}</span>
          </button>
        </div>
      )}
    </header>
  );
};

