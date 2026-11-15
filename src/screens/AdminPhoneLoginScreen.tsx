import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  Lock,
  LogIn,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { useTranslation } from '../i18n/translations';
import { extractReadableErrorMessage } from '../services/firestoreErrorHandler';
import {
  ADMIN_PHONE_TEN_DIGITS,
  signInAdminWithGoogle,
  signInAsAdminWithPasscode,
} from '../services/quizRepository';
import { normalizeIndianMobileInput } from '../utils/imageUtils';

interface AdminPhoneLoginScreenProps {
  onAdminAuthenticated: (mode: 'firebase' | 'local') => void;
}

export const AdminPhoneLoginScreen: React.FC<AdminPhoneLoginScreenProps> = ({
  onAdminAuthenticated,
}) => {
  const { lang, t } = useTranslation();

  const [phoneInput, setPhoneInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cleanDigits = phoneInput.replace(/\D/g, '');
  const isAdminNumberTyped = cleanDigits === ADMIN_PHONE_TEN_DIGITS;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setErrorMessage(null);

    if (!isAdminNumberTyped) {
      setErrorMessage(t.onlyAdminAllowedError);
      return;
    }
    if (!passwordInput) {
      setErrorMessage(t.errWrongAdminPassword);
      return;
    }

    setIsLoading(true);
    try {
      const mode = await signInAsAdminWithPasscode(cleanDigits, passwordInput);
      setPasswordInput('');
      onAdminAuthenticated(mode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'INVALID_ADMIN_PASSWORD') {
        setErrorMessage(t.errWrongAdminPassword);
      } else if (msg === 'ONLY_ADMIN_NUMBER') {
        setErrorMessage(t.onlyAdminAllowedError);
      } else {
        setErrorMessage(extractReadableErrorMessage(err, lang));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await signInAdminWithGoogle();
      onAdminAuthenticated('firebase');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'SIGN_IN_CANCELLED') {
        return;
      }
      if (msg === 'ONLY_ADMIN_GOOGLE_EMAIL') {
        setErrorMessage(t.errWrongAdminGoogleAccount);
      } else {
        setErrorMessage(extractReadableErrorMessage(err, lang));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="rounded-3xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-[#D1FAE5] dark:bg-[#064E3B] flex items-center justify-center text-[#047857] dark:text-[#6EE7B7] shrink-0">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold">{t.adminLoginTitle}</h2>
            <p className="text-xs text-[#475569] dark:text-[#94A3B8]">{t.adminLoginSubtitle}</p>
          </div>
        </div>

        <div className="rounded-xl bg-[#FEF3C7] dark:bg-[#451A03] p-3 flex items-start gap-2 text-xs font-semibold text-[#92400E] dark:text-[#FDE68A]">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{t.adminOnlyNumberNote}</span>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3.5">
          <div>
            <label
              htmlFor="admin-phone-input"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
            >
              {t.adminPhoneLabel}
            </label>
            <div className="flex items-center rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] px-3.5 h-12 focus-within:border-[#047857]">
              <Smartphone className="h-4 w-4 text-slate-400 mr-2 shrink-0" />
              <span className="text-sm font-bold text-slate-600 dark:text-slate-300 mr-1.5">
                +91
              </span>
              <input
                id="admin-phone-input"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                disabled={isLoading}
                value={phoneInput}
                onChange={(e) => {
                  const next = normalizeIndianMobileInput(e.target.value);
                  setPhoneInput(next);
                  if (next !== ADMIN_PHONE_TEN_DIGITS) {
                    setPasswordInput('');
                  }
                  setErrorMessage(null);
                }}
                placeholder={t.fieldMobilePlaceholder}
                className="w-full bg-transparent text-base font-extrabold tabular-nums outline-none"
              />
            </div>
          </div>

          {isAdminNumberTyped && (
            <div className="space-y-1.5">
              <label
                htmlFor="admin-password-input"
                className="block text-xs font-bold text-[#047857] dark:text-[#6EE7B7]"
              >
                {t.adminPasswordLabel}
              </label>
              <div className="flex items-center rounded-xl border border-[#047857] dark:border-[#10B981] bg-[#FAF9F5] dark:bg-[#0F172A] pl-3.5 pr-1 h-12">
                <Lock className="h-4 w-4 text-[#047857] dark:text-[#6EE7B7] mr-2 shrink-0" />
                <input
                  id="admin-password-input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  disabled={isLoading}
                  value={passwordInput}
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    setErrorMessage(null);
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
          )}

          {errorMessage && (
            <div
              role="alert"
              className="rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 p-3 text-xs font-semibold text-red-700 dark:text-red-300"
            >
              {errorMessage}
            </div>
          )}

          {isAdminNumberTyped && (
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-sm font-extrabold flex items-center justify-center gap-2 transition-colors disabled:opacity-55 cursor-pointer"
            >
              <LogIn className="h-4 w-4" />
              <span>{isLoading ? t.loggingInBtn : t.adminLoginBtn}</span>
            </button>
          )}
        </form>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => void handleGoogleSignIn()}
            className="w-full min-h-[48px] py-2 px-3 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] hover:bg-slate-100 dark:hover:bg-slate-800 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-55 cursor-pointer"
          >
            <ShieldCheck className="h-4 w-4 text-[#1E3A8A] dark:text-[#93C5FD] shrink-0" />
            <span>{t.connectFirebaseGoogleBtn}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
