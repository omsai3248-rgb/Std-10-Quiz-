import React, { useState } from 'react';
import { ArrowRight, BookOpen, IndianRupee, ShieldCheck, Smartphone, User } from 'lucide-react';
import { useTranslation } from '../i18n/translations';
import { ADMIN_PHONE_TEN_DIGITS } from '../services/quizRepository';
import { PRICE_ALL_SUBJECTS, PRICE_SINGLE_SUBJECT } from '../types/models';
import { normalizeIndianMobileInput } from '../utils/imageUtils';

interface StudentMobileLoginScreenProps {
  initialName?: string;
  initialMobile?: string;
  onLoginSuccess: (name: string, mobile: string) => void;
  onOpenAdminLogin: () => void;
}

export const StudentMobileLoginScreen: React.FC<StudentMobileLoginScreenProps> = ({
  initialName = '',
  initialMobile = '',
  onLoginSuccess,
  onOpenAdminLogin,
}) => {
  const { lang, t } = useTranslation();
  const [nameInput, setNameInput] = useState(initialName);
  const [mobileInput, setMobileInput] = useState(initialMobile);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const cleanName = nameInput.trim().slice(0, 60);
    const cleanMob = mobileInput.replace(/\D/g, '');

    if (!cleanName) {
      setErrorMsg(t.errInvalidName);
      return;
    }
    if (!/^[0-9]{10}$/.test(cleanMob)) {
      setErrorMsg(t.errInvalidMobile);
      return;
    }
    if (cleanMob === ADMIN_PHONE_TEN_DIGITS) {
      setErrorMsg(t.adminNumberLoginHint);
      return;
    }
    onLoginSuccess(cleanName, cleanMob);
  };

  return (
    <div className="max-w-md mx-auto px-4 py-7 space-y-5">
      <div className="rounded-3xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-[#DBEAFE] dark:bg-[#1E3A5F] flex items-center justify-center text-[#1E3A8A] dark:text-[#93C5FD] shrink-0">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold">{t.loginTitle}</h2>
            <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
              {t.loginSubtitle}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 text-center">
          <div className="rounded-xl bg-[#FAF9F5] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] p-2.5">
            <p className="text-[11px] font-bold text-[#475569] dark:text-[#94A3B8]">
              {t.unlockSingleSubjectLabel}
            </p>
            <p className="text-base font-extrabold text-[#1E3A8A] dark:text-[#93C5FD] tabular-nums flex items-center justify-center gap-0.5 mt-0.5">
              <IndianRupee className="h-3.5 w-3.5" />
              <span>{PRICE_SINGLE_SUBJECT}</span>
            </p>
          </div>
          <div className="rounded-xl bg-[#FEF3C7]/70 dark:bg-[#451A03]/60 border border-[#F59E0B]/30 p-2.5">
            <p className="text-[11px] font-bold text-[#92400E] dark:text-[#FDE68A]">
              {lang === 'en' ? 'All Subjects' : 'બધા જ વિષયો'}
            </p>
            <p className="text-base font-extrabold text-[#92400E] dark:text-[#FDE68A] tabular-nums flex items-center justify-center gap-0.5 mt-0.5">
              <IndianRupee className="h-3.5 w-3.5" />
              <span>{PRICE_ALL_SUBJECTS}</span>
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label
              htmlFor="student-login-name"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
            >
              {t.fieldFullName}
            </label>
            <div className="flex items-center rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] px-3.5 h-12 focus-within:border-[#1E3A8A]">
              <User className="h-4 w-4 text-slate-400 mr-2 shrink-0" />
              <input
                id="student-login-name"
                type="text"
                maxLength={60}
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder={t.fieldFullNamePlaceholder}
                className="w-full bg-transparent text-sm font-semibold outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="student-login-mobile"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
            >
              {t.fieldMobile}
            </label>
            <div className="flex items-center rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] px-3.5 h-12 focus-within:border-[#1E3A8A]">
              <Smartphone className="h-4 w-4 text-slate-400 mr-2 shrink-0" />
              <span className="text-sm font-bold text-slate-500 mr-1.5">+91</span>
              <input
                id="student-login-mobile"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={mobileInput}
                onChange={(e) => {
                  setMobileInput(normalizeIndianMobileInput(e.target.value));
                  setErrorMsg(null);
                }}
                placeholder={t.fieldMobilePlaceholder}
                className="w-full bg-transparent text-base font-bold tabular-nums outline-none"
              />
            </div>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 p-3 text-xs font-semibold text-red-700 dark:text-red-300 space-y-2"
            >
              <p>{errorMsg}</p>
              {mobileInput.replace(/\D/g, '') === ADMIN_PHONE_TEN_DIGITS && (
                <button
                  type="button"
                  onClick={onOpenAdminLogin}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#047857] text-white px-3 py-1.5 text-xs font-bold cursor-pointer"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>{t.adminLoginTitle}</span>
                </button>
              )}
            </div>
          )}

          <button
            type="submit"
            className="w-full h-12 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] dark:bg-[#2563EB] text-white text-sm font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>{t.loginBtn}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
