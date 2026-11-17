import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Cloud,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  Smartphone,
  User,
} from 'lucide-react';
import { useTranslation } from '../i18n/translations';
import { extractReadableErrorMessage } from '../services/firestoreErrorHandler';
import { ensureGoogleIdentityScript } from '../services/googleDriveSync';
import {
  ADMIN_PHONE_TEN_DIGITS,
  claimAdminSessionDevice,
  getCurrentDeviceIdentity,
  lookupStudentByMobile,
  signInAsAdminWithPasscode,
  type AdminPasscodeAuthResult,
} from '../services/quizRepository';
import { ALL_SUBJECT_IDS, getSubjectDisplayName, type StudentProfile } from '../types/models';
import { normalizeIndianMobileInput } from '../utils/imageUtils';

interface StudentMobileLoginScreenProps {
  initialName?: string;
  initialMobile?: string;
  onLoginSuccess: (name: string, mobile: string) => Promise<void> | void;
  onGmailLoginSuccess: () => Promise<void> | void;
  onAdminAuthenticated: (result: AdminPasscodeAuthResult) => void;
}

export const StudentMobileLoginScreen: React.FC<StudentMobileLoginScreenProps> = ({
  initialName = '',
  initialMobile = '',
  onLoginSuccess,
  onGmailLoginSuccess,
  onAdminAuthenticated,
}) => {
  const { lang, t } = useTranslation();
  const [nameInput, setNameInput] = useState(initialName);
  const [mobileInput, setMobileInput] = useState(initialMobile);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGmailLoading, setIsGmailLoading] = useState(false);
  const [isCheckingExisting, setIsCheckingExisting] = useState(false);
  const [existingProfile, setExistingProfile] = useState<StudentProfile | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const lookupCacheRef = useRef<Map<string, StudentProfile | null>>(new Map());
  const nameEditedManuallyRef = useRef(false);

  useEffect(() => {
    ensureGoogleIdentityScript().catch(() => {});
  }, []);

  const cleanDigits = mobileInput.replace(/\D/g, '');
  const isAdminNumberTyped = cleanDigits === ADMIN_PHONE_TEN_DIGITS;
  const currentDeviceId = getCurrentDeviceIdentity().deviceId;

  useEffect(() => {
    if (isAdminNumberTyped || !/^[0-9]{10}$/.test(cleanDigits)) {
      setExistingProfile(null);
      setIsCheckingExisting(false);
      return;
    }

    if (lookupCacheRef.current.has(cleanDigits)) {
      const cached = lookupCacheRef.current.get(cleanDigits) ?? null;
      setExistingProfile(cached);
      if (cached?.fullName && !nameEditedManuallyRef.current) {
        setNameInput(cached.fullName);
      }
      setIsCheckingExisting(false);
      return;
    }

    let cancelled = false;
    setIsCheckingExisting(true);
    const timer = window.setTimeout(() => {
      void lookupStudentByMobile(cleanDigits)
        .then((profile) => {
          if (cancelled) return;
          lookupCacheRef.current.set(cleanDigits, profile);
          setExistingProfile(profile);
          if (profile?.fullName && !nameEditedManuallyRef.current) {
            setNameInput(profile.fullName);
          }
        })
        .catch(() => {
          if (!cancelled) setExistingProfile(null);
        })
        .finally(() => {
          if (!cancelled) setIsCheckingExisting(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cleanDigits, isAdminNumberTyped]);

  const isLockedOnOtherDevice = Boolean(
    existingProfile?.activeDeviceId &&
      existingProfile.activeDeviceId.trim().length > 0 &&
      existingProfile.activeDeviceId !== currentDeviceId
  );

  const restoredSubjects = existingProfile
    ? existingProfile.hasQuizAccess
      ? ALL_SUBJECT_IDS
      : existingProfile.unlockedSubjects.filter((s) => s !== 'all')
    : [];

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
        const result = await signInAsAdminWithPasscode(cleanDigits, passwordInput);
        await claimAdminSessionDevice().catch(() => {});
        setPasswordInput('');
        onAdminAuthenticated(result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '';
        if (msg === 'INVALID_ADMIN_PASSWORD') {
          setErrorMsg(t.errWrongAdminPassword);
        } else if (msg === 'ONLY_ADMIN_NUMBER') {
          setErrorMsg(t.onlyAdminAllowedError);
        } else if (msg === 'ONLY_ADMIN_GOOGLE_EMAIL') {
          setErrorMsg(t.errWrongAdminGoogleAccount);
        } else if (msg === 'SIGN_IN_CANCELLED') {
          setErrorMsg(t.errAdminGoogleCancelled);
        } else if (msg === 'NO_GOOGLE_CREDENTIAL') {
          setErrorMsg(t.errAdminNoGoogleAccount);
        } else if (msg === 'GOOGLE_SIGNIN_CONFIG_ERROR') {
          setErrorMsg(t.errAdminGoogleConfig);
        } else if (msg.startsWith('GOOGLE_SIGNIN_SHA1_MISMATCH:')) {
          const sha1 = msg.slice('GOOGLE_SIGNIN_SHA1_MISMATCH:'.length) || 'unknown';
          setErrorMsg(t.errAdminSha1Mismatch.replace('{sha1}', sha1));
        } else if (msg === 'NATIVE_FIREBASE_MISSING') {
          setErrorMsg(t.errAdminNativeMissing);
        } else {
          setErrorMsg(extractReadableErrorMessage(err, lang));
        }
      } finally {
        setIsLoading(false);
      }
      return;
    }

    const cleanName = (nameInput.trim() || existingProfile?.fullName?.trim() || '').slice(0, 60);

    setIsLoading(true);
    try {
      await onLoginSuccess(cleanName, cleanDigits);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'INVALID_NAME' || msg === 'NAME_REQUIRED_FOR_NEW_USER') {
        setErrorMsg(t.errInvalidName);
      } else {
        setErrorMsg(extractReadableErrorMessage(err, lang));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGmailClick = async () => {
    if (isLoading || isGmailLoading) return;
    setErrorMsg(null);
    setIsGmailLoading(true);
    try {
      await onGmailLoginSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'SIGN_IN_CANCELLED') {
        setErrorMsg(t.errAdminGoogleCancelled);
      } else if (msg === 'POPUP_BLOCKED') {
        setErrorMsg(t.errPopupBlocked);
      } else if (msg === 'GOOGLE_EMAIL_MISSING') {
        setErrorMsg(t.errGoogleEmailMissing);
      } else if (msg === 'GOOGLE_DRIVE_AUTH_FAILED' || msg === 'GOOGLE_GIS_UNAVAILABLE') {
        setErrorMsg(t.errGoogleDriveAuthFailed);
      } else {
        setErrorMsg(extractReadableErrorMessage(err, lang) || t.errGoogleDriveAuthFailed);
      }
    } finally {
      setIsGmailLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-4">
      {/* Primary Student Gmail + Google Drive Card */}
      <div className="rounded-3xl bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE]/70 dark:from-[#172554]/80 dark:to-[#1E293B] border border-[#3B82F6]/30 shadow-sm p-5 space-y-3.5">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-2xl bg-white dark:bg-[#0F172A] border border-[#BFDBFE] dark:border-[#334155] flex items-center justify-center text-[#1E3A8A] dark:text-[#93C5FD] shrink-0 shadow-xs">
            <Cloud className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-extrabold text-[#0F172A] dark:text-white leading-snug">
              {t.loginWithGmailTitle}
            </h2>
            <p className="text-xs text-[#334155] dark:text-[#CBD5E1] leading-relaxed mt-0.5">
              {t.loginWithGmailDesc}
            </p>
          </div>
        </div>

        <button
          type="button"
          data-testid="gmail_login_button"
          disabled={isLoading || isGmailLoading}
          onClick={() => void handleGmailClick()}
          aria-label={t.loginWithGmailBtn}
          className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 dark:bg-[#0F172A] dark:hover:bg-slate-900 border border-[#CBD5E1] dark:border-[#475569] shadow-xs text-[#0F172A] dark:text-white text-sm font-extrabold flex items-center justify-center gap-2.5 transition-colors disabled:opacity-60 cursor-pointer"
        >
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
          </svg>
          <span>{isGmailLoading ? t.loginWithGmailLoading : t.loginWithGmailBtn}</span>
        </button>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 px-2">
        <div className="h-px flex-1 bg-[#CBD5E1] dark:bg-[#334155]" />
        <span className="text-[11px] font-extrabold text-[#64748B] dark:text-[#94A3B8] tracking-wide">
          {t.orMobileDivider}
        </span>
        <div className="h-px flex-1 bg-[#CBD5E1] dark:bg-[#334155]" />
      </div>

      {/* Existing Mobile / Admin Login Card */}
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
                inputMode="tel"
                maxLength={16}
                disabled={isLoading}
                value={mobileInput}
                onChange={(e) => {
                  const next = normalizeIndianMobileInput(e.target.value);
                  if (next !== mobileInput) {
                    nameEditedManuallyRef.current = false;
                  }
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

          {!isAdminNumberTyped && isCheckingExisting && (
            <div className="rounded-xl bg-[#EFF4FA] dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] px-3 py-2 text-xs font-semibold text-[#475569] dark:text-[#94A3B8]">
              {t.checkingAccountLabel}
            </div>
          )}

          {!isAdminNumberTyped && existingProfile && !isCheckingExisting && (
            <div
              className={`rounded-2xl p-3.5 text-xs space-y-1.5 border ${
                isLockedOnOtherDevice
                  ? 'bg-[#EFF6FF] dark:bg-[#172554]/50 border-[#3B82F6]/40 text-[#1E3A8A] dark:text-[#BFDBFE]'
                  : 'bg-[#D1FAE5]/60 dark:bg-[#064E3B]/50 border-[#10B981]/40 text-[#064E3B] dark:text-[#D1FAE5]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{t.returningAccountTitle}</span>
                </span>
                <span className="font-extrabold">{existingProfile.fullName}</span>
              </div>
              <p className="text-[11px] opacity-90">{t.returningAccountLoaded}</p>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                <span className="rounded-md bg-white/70 dark:bg-black/25 px-2 py-0.5 font-bold">
                  {t.quizzesTakenLabel} {existingProfile.totalQuizzesTaken}
                </span>
                {restoredSubjects.length > 0 && (
                  <span className="rounded-md bg-white/70 dark:bg-black/25 px-2 py-0.5 font-bold">
                    ✓{' '}
                    {restoredSubjects.length === ALL_SUBJECT_IDS.length
                      ? t.unlockedBadge
                      : restoredSubjects.map((s) => getSubjectDisplayName(s, lang)).join(', ')}
                  </span>
                )}
              </div>
              {isLockedOnOtherDevice && (
                <p className="text-[11px] font-bold pt-1 text-[#1D4ED8] dark:text-[#93C5FD]">
                  {t.deviceLockedOnLabel} {existingProfile.activeDeviceName || 'Other Device'}
                </p>
              )}
            </div>
          )}

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
                    nameEditedManuallyRef.current = true;
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
              className="w-full h-12 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] dark:bg-[#2563EB] text-white text-sm font-extrabold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
            >
              <span>{isLoading ? t.loggingInBtn : t.loginBtn}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </form>

        {!isAdminNumberTyped && (
          <p className="text-[11px] text-center text-[#475569] dark:text-[#94A3B8] leading-relaxed">
            🔒 {t.singleDeviceNote}
          </p>
        )}
      </div>
    </div>
  );
};
