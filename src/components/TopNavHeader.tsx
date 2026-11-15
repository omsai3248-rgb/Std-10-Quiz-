import React from 'react';
import { KeyRound, Languages, Moon, ShieldCheck, Sun, Wallet } from 'lucide-react';
import { useTranslation } from '../i18n/translations';

export type PublicTabId = 'payment' | 'use_code' | 'admin';

interface TopNavHeaderProps {
  activeTab: PublicTabId;
  isAdmin: boolean;
  adminBadgeCount: number;
  isDarkTheme: boolean;
  onSelectTab: (tab: PublicTabId) => void;
  onToggleTheme: () => void;
}

export const TopNavHeader: React.FC<TopNavHeaderProps> = ({
  activeTab,
  isAdmin,
  adminBadgeCount,
  isDarkTheme,
  onSelectTab,
  onToggleTheme,
}) => {
  const { lang, toggleLang, t } = useTranslation();

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

      {/* Mobile-First 3-Tab Switcher */}
      <nav
        aria-label="Primary Navigation"
        className="max-w-4xl mx-auto px-2 sm:px-4 grid grid-cols-3 border-t border-slate-100 dark:border-slate-800"
      >
        <button
          type="button"
          onClick={() => onSelectTab('payment')}
          className={`h-11 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'payment'
              ? 'border-[#1E3A8A] text-[#1E3A8A] dark:border-[#93C5FD] dark:text-[#93C5FD]'
              : 'border-transparent text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white'
          }`}
        >
          <Wallet className="h-4 w-4 shrink-0" />
          <span className="truncate">{t.navSubmitPayment}</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('use_code')}
          className={`h-11 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'use_code'
              ? 'border-[#1E3A8A] text-[#1E3A8A] dark:border-[#93C5FD] dark:text-[#93C5FD]'
              : 'border-transparent text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white'
          }`}
        >
          <KeyRound className="h-4 w-4 shrink-0" />
          <span className="truncate">{t.navUseCode}</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('admin')}
          className={`h-11 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'admin'
              ? 'border-[#047857] text-[#047857] dark:border-[#6EE7B7] dark:text-[#6EE7B7]'
              : 'border-transparent text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white'
          }`}
        >
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span className="truncate">{isAdmin ? t.navAdminLive : t.navAdmin}</span>
          {isAdmin && adminBadgeCount > 0 && (
            <span className="rounded-full bg-[#DC2626] text-white text-[10px] font-extrabold px-1.5 py-0.5 min-w-[18px] text-center leading-none tabular-nums">
              {adminBadgeCount}
            </span>
          )}
        </button>
      </nav>
    </header>
  );
};
