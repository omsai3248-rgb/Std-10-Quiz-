import React, { useEffect, useRef, useState } from 'react';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
  type ConfirmationResult,
} from 'firebase/auth';
import { Lock, LogIn, MessageSquare, ShieldAlert, ShieldCheck, Smartphone } from 'lucide-react';
import { auth } from '../firebase';
import { useTranslation } from '../i18n/translations';
import { ADMIN_PHONE_TEN_DIGITS } from '../services/quizRepository';
import { normalizeIndianMobileInput } from '../utils/imageUtils';

interface AdminPhoneLoginScreenProps {
  onAdminAuthenticated: () => void;
}

export const AdminPhoneLoginScreen: React.FC<AdminPhoneLoginScreenProps> = ({
  onAdminAuthenticated,
}) => {
  const { lang, t } = useTranslation();

  const [phoneInput, setPhoneInput] = useState(ADMIN_PHONE_TEN_DIGITS);
  const [otpInput, setOtpInput] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);

  const clearRecaptcha = () => {
    try {
      recaptchaRef.current?.clear();
    } catch {
      // Ignore cleanup errors
    }
    recaptchaRef.current = null;
  };

  useEffect(() => {
    return () => {
      clearRecaptcha();
    };
  }, []);

  const handleSendOtp = async () => {
    const digits = phoneInput.replace(/\D/g, '').slice(-10);
    if (digits !== ADMIN_PHONE_TEN_DIGITS) {
      setErrorMessage(t.onlyAdminAllowedError);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      clearRecaptcha();
      if (!recaptchaContainerRef.current) {
        throw new Error('reCAPTCHA container unavailable');
      }
      const verifier = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
        size: 'invisible',
      });
      recaptchaRef.current = verifier;

      const result = await signInWithPhoneNumber(auth, `+91${ADMIN_PHONE_TEN_DIGITS}`, verifier);
      setConfirmationResult(result);
    } catch (err: unknown) {
      clearRecaptcha();
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/operation-not-allowed') {
        setErrorMessage(
          lang === 'en'
            ? 'Firebase Phone Auth is disabled. Enable Phone sign-in in Firebase Console → Authentication → Sign-in method.'
            : 'Firebase Phone Auth બંધ છે. Firebase Console → Authentication → Sign-in method માં Phone ચાલુ કરો.'
        );
      } else if (code === 'auth/unauthorized-domain') {
        setErrorMessage(
          lang === 'en'
            ? 'This domain is not authorized for Phone OTP. Add it in Firebase Console → Authentication → Settings → Authorized domains.'
            : 'આ ડોમેન Authorized નથી. Firebase Console → Authentication → Settings → Authorized domains માં ઉમેરો.'
        );
      } else if (code === 'auth/too-many-requests') {
        setErrorMessage(
          lang === 'en'
            ? 'Too many OTP requests. Please wait a bit before retrying.'
            : 'ઘણી બધી OTP વિનંતીઓ થઈ છે. થોડી વાર પછી ફરી પ્રયાસ કરો.'
        );
      } else if (code === 'auth/captcha-check-failed') {
        setErrorMessage(
          lang === 'en'
            ? 'reCAPTCHA verification failed. Please reload and try again.'
            : 'reCAPTCHA ચકાસણી નિષ્ફળ ગઈ. કૃપા કરીને ફરી પ્રયાસ કરો.'
        );
      } else {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : lang === 'en'
              ? 'Failed to send OTP.'
              : 'OTP મોકલવામાં ભૂલ આવી.'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!confirmationResult || otpInput.length !== 6) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const cred = await confirmationResult.confirm(otpInput);
      const signedInPhone = cred.user.phoneNumber ?? '';
      if (signedInPhone !== `+91${ADMIN_PHONE_TEN_DIGITS}`) {
        await signOut(auth);
        setErrorMessage(t.onlyAdminAllowedError);
        return;
      }
      onAdminAuthenticated();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/code-expired') {
        setErrorMessage(
          lang === 'en'
            ? 'OTP has expired. Please tap Resend OTP.'
            : 'OTP ની સમયમર્યાદા પૂરી થઈ ગઈ છે. ફરી OTP મોકલો.'
        );
      } else {
        setErrorMessage(
          lang === 'en'
            ? 'Invalid or expired 6-digit OTP.'
            : 'ખોટો અથવા સમાપ્ત થયેલ ૬-અંકનો OTP.'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    if (!confirmationResult) {
      if (phoneInput.length === 10) void handleSendOtp();
    } else if (otpInput.length === 6) {
      void handleVerifyOtp();
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

        <form onSubmit={handleFormSubmit} className="space-y-3">
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
                disabled={Boolean(confirmationResult) || isLoading}
                value={phoneInput}
                onChange={(e) => {
                  setPhoneInput(normalizeIndianMobileInput(e.target.value));
                  setErrorMessage(null);
                }}
                className="w-full bg-transparent text-sm font-extrabold tabular-nums outline-none"
              />
            </div>
          </div>

          {confirmationResult && (
            <div className="space-y-2">
              <div className="rounded-lg bg-[#D1FAE5]/60 dark:bg-[#064E3B]/50 px-3 py-1.5 text-xs font-bold text-[#064E3B] dark:text-[#D1FAE5]">
                {t.otpSentBanner}
              </div>
              <label
                htmlFor="admin-otp-input"
                className="block text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                {t.enterOtpLabel}
              </label>
              <div className="flex items-center rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] px-3.5 h-12 focus-within:border-[#047857]">
                <Lock className="h-4 w-4 text-slate-400 mr-2 shrink-0" />
                <input
                  id="admin-otp-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  disabled={isLoading}
                  value={otpInput}
                  onChange={(e) => {
                    setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6));
                    setErrorMessage(null);
                  }}
                  placeholder="123456"
                  className="w-full bg-transparent text-base font-extrabold tracking-widest outline-none tabular-nums"
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => {
                    setConfirmationResult(null);
                    setOtpInput('');
                    setErrorMessage(null);
                  }}
                  className="font-bold text-[#1E3A8A] dark:text-[#93C5FD] hover:underline cursor-pointer"
                >
                  {t.changeNumberBtn}
                </button>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => void handleSendOtp()}
                  className="font-bold text-[#1E3A8A] dark:text-[#93C5FD] hover:underline cursor-pointer"
                >
                  {t.resendOtpBtn}
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

          {!confirmationResult ? (
            <button
              type="submit"
              disabled={isLoading || phoneInput.length !== 10}
              className="w-full h-12 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-sm font-extrabold flex items-center justify-center gap-2 transition-colors disabled:opacity-55 cursor-pointer"
            >
              <MessageSquare className="h-4 w-4" />
              <span>{isLoading ? t.sendingOtpBtn : t.sendOtpBtn}</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={isLoading || otpInput.length !== 6}
              className="w-full h-12 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] text-white text-sm font-extrabold flex items-center justify-center gap-2 transition-colors disabled:opacity-55 cursor-pointer"
            >
              <LogIn className="h-4 w-4" />
              <span>{isLoading ? t.verifyingOtpBtn : t.verifyOtpBtn}</span>
            </button>
          )}
        </form>

        <div ref={recaptchaContainerRef} />
      </div>
    </div>
  );
};
