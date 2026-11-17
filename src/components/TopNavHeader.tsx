import React from 'react';
import { Languages, LogOut, Mail, Moon, ShieldCheck, Smartphone, Sun } from 'lucide-react';
import { useTranslation } from '../i18n/translations';

export type PublicTabId = 'quiz' | 'admin';

interface TopNavHeaderProps {
  activeTab: PublicTabId;
  isStudentLoggedIn: boolean;
  studentName?: string;
  studentMobile?: string;
  studentEmail?: string;
  isAdmin: boolean;
  adminBadgeCount: number;
  isDarkTheme: boolean;
  onSelectTab: (tab: PublicTabId) => void;
  onStudentLogout: () => void;
  onToggleTheme: () => void;
}

export const TopNavHeader: React.FC<TopNavHeaderProps> = ({
  activeTab,
  isStudentLoggedIn,
  studentName = '',
  studentMobile = '',
  studentEmail = '',
  isAdmin,
  adminBadgeCount,
  isDarkTheme,
  onSelectTab,
  onStudentLogout,
  onToggleTheme,
}) => {
  const { lang, toggleLang, t } = useTranslation();

  const identityLabel = [
    studentName || studentEmail.split('@')[0] || 'Student',
    studentEmail ? studentEmail : '',
    studentMobile ? `+91 ${studentMobile}` : '',
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#1E293B]/95 backdrop-blur border-b border-[#E2E8F0] dark:border-[#334155]">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 h-15 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src="/images/ic_app_logo.jpg"
            alt={t.appName}
            className="h-9 w-9 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
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

        <div className="flex items-center gap-1.5 shrink-0">
          {isAdmin && (
            <button
              type="button"
              onClick={() => onSelectTab('admin')}
              className="h-9 px-2.5 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">{t.navAdminLive}</span>
              {adminBadgeCount > 0 && (
                <span className="rounded-full bg-[#DC2626] text-white text-[10px] font-extrabold px-1.5 py-0.5 min-w-[18px] text-center leading-none tabular-nums">
                  {adminBadgeCount}
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={toggleLang}
            aria-label="Toggle language"
            className="h-9 px-2.5 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Languages className="h-3.5 w-3.5 text-[#1E3A8A] dark:text-[#93C5FD]" />
            <span>{lang === 'gu' ? 'EN' : 'ગુજરાતી'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
            className="h-9 w-9 rounded-xl border border-[#CBD5E1] dark:border-[#334155] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {isDarkTheme ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Logged-in Student Strip */}
      {isStudentLoggedIn && activeTab === 'quiz' && (
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-1.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 bg-[#FAF9F5]/80 dark:bg-[#0F172A]/60 text-xs">
          <div className="flex items-center gap-1.5 min-w-0 font-bold text-[#0F172A] dark:text-[#F8FAFC]">
            {studentEmail ? (
              <Mail className="h-3.5 w-3.5 text-[#1E3A8A] dark:text-[#93C5FD] shrink-0" />
            ) : (
              <Smartphone className="h-3.5 w-3.5 text-[#1E3A8A] dark:text-[#93C5FD] shrink-0" />
            )}
            <span className="truncate">{identityLabel}</span>
          </div>
          <button
            type="button"
            data-testid="student_logout_button"
            onClick={onStudentLogout}
            className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-[#CBD5E1] dark:border-[#334155] px-2.5 py-1 min-h-[32px] text-[11px] font-bold text-[#475569] dark:text-[#94A3B8] hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
          >
            <LogOut className="h-3 w-3" />
            <span>{t.switchAccountBtn}</span>
          </button>
        </div>
      )}
    </header>
  );
};
