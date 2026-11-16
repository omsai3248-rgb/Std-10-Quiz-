import React, { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  Smartphone,
  User,
} from 'lucide-react';
import { useTranslation } from '../i18n/translations';
import { extractReadableErrorMessage } from '../services/firestoreErrorHandler';
import {
  ADMIN_PHONE_TEN_DIGITS,
  signInAsAdminWithPasscode,
} from '../services/quizRepository';
import { normalizeIndianMobileInput } from '../utils/imageUtils';

interface StudentMobileLoginScreenProps {
  initialName?: string;
  initialMobile?: string;
  onLoginSuccess: (name: string, mobile: string) => Promise<void> | void;
  onAdminAuthenticated: () => void;
}

export const StudentMobileLoginScreen: React.FC<StudentMobileLoginScreenProps> = ({
  initialName = '',
  initialMobile = '',
  onLoginSuccess,
  onAdminAuthenticated,
}) => {
  const { lang, t } = useTranslation();
  const [nameInput, setNameInput] = useState(initialName);
  const [mobileInput, setMobileInput] = useState(initialMobile);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cleanDigits = mobileInput.replace(/\D/g, '');
  const isAdminNumberTyped = cleanDigits === ADMIN_PHONE_TEN_DIGITS;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setErrorMsg(null);

    if (!/^[0-9]{10}$/.test(cleanDigits)) {
      setErrorMsg(t.errInvalidMobile);
      return;
    }

    if (isAdminNumberTyped) {
      if (!passwordInput) {
        setErrorMsg(t.errWrongAdminPassword);
        return;
      }
      setIsLoading(true);
      try {
        await signInAsAdminWithPasscode(cleanDigits, passwordInput);
        setPasswordInput('');
        onAdminAuthenticated();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '';
        if (msg === 'INVALID_ADMIN_PASSWORD') {
          setErrorMsg(t.errWrongAdminPassword);
        } else if (msg === 'ONLY_ADMIN_NUMBER') {
          setErrorMsg(t.onlyAdminAllowedError);
        } else if (msg === 'ONLY_ADMIN_GOOGLE_EMAIL') {
          setErrorMsg(t.errWrongAdminGoogleAccount);
        } else if (msg === 'SIGN_IN_CANCELLED') {
          setErrorMsg(null);
        } else {
          setErrorMsg(extractReadableErrorMessage(err, lang));
        }
      } finally {
        setIsLoading(false);
      }
      return;
    }

    const cleanName = nameInput.trim().slice(0, 60);
    if (!cleanName) {
      setErrorMsg(t.errInvalidName);
      return;
    }

    setIsLoading(true);
    try {
      await onLoginSuccess(cleanName, cleanDigits);
    } catch (err: unknown) {
      setErrorMsg(extractReadableErrorMessage(err, lang));
    } finally {
      setIsLoading(false);
    }
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

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3.5">
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
                disabled={isLoading}
                value={mobileInput}
                onChange={(e) => {
                  const next = normalizeIndianMobileInput(e.target.value);
                  setMobileInput(next);
                  if (next !== ADMIN_PHONE_TEN_DIGITS) {
                    setPasswordInput('');
                  }
                  setErrorMsg(null);
                }}
                placeholder={t.fieldMobilePlaceholder}
                className="w-full bg-transparent text-base font-bold tabular-nums outline-none"
              />
            </div>
          </div>

          {isAdminNumberTyped ? (
            <div>
              <label
                htmlFor="student-login-admin-password"
                className="block text-xs font-bold text-[#047857] dark:text-[#6EE7B7] mb-1"
              >
                {t.adminPasswordLabel}
              </label>
              <div className="flex items-center rounded-xl border border-[#047857] dark:border-[#10B981] bg-[#FAF9F5] dark:bg-[#0F172A] pl-3.5 pr-1 h-12">
                <Lock className="h-4 w-4 text-[#047857] dark:text-[#6EE7B7] mr-2 shrink-0" />
                <input
                  id="student-login-admin-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  disabled={isLoading}
                  value={passwordInput}
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    setErrorMsg(null);
                  }}
                  placeholder={t.adminPasswordPlaceholder}
                  className="w-full bg-transparent text-sm font-bold outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="h-11 min-w-[44px] flex items-center justify-center text-slate-500 hover:text-slate-700 dark:text-slate-400 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ) : (
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
                  disabled={isLoading}
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
          )}

          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 p-3 text-xs font-semibold text-red-700 dark:text-red-300"
            >
              {errorMsg}
            </div>
          )}

          {isAdminNumberTyped ? (
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-sm font-extrabold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>{isLoading ? t.loggingInBtn : t.adminLoginBtn}</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] dark:bg-[#2563EB] text-white text-sm font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>{t.loginBtn}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
