import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cloud,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  ShieldCheck,
  Smartphone,
  Sparkles,
  User,
} from 'lucide-react';
import { useTranslation } from '../i18n/translations';
import type { AppAuthUser } from '../services/nativeFirebaseBridge';
import {
  ADMIN_PHONE_TEN_DIGITS,
  signInAsAdminWithPasscode,
  type AdminPasscodeAuthResult,
} from '../services/quizRepository';
import {
  isValidIndianMobile10,
  normalizeIndianMobile10,
  type UserProfile,
} from '../types/models';

interface StudentMobileLoginScreenProps {
  authUser: AppAuthUser | null;
  userProfile: UserProfile | null;
  isProfileLoading: boolean;
  isAdmin: boolean;
  initialName?: string;
  initialMobile?: string;
  onGoogleSignIn: () => Promise<void>;
  onLinkMobileSubmit: (params: { mobileNumber: string; displayName: string }) => Promise<void>;
  onSignOut: () => Promise<void>;
  onOpenAdminPanel?: () => void;
  onAdminAuthenticated: (result: AdminPasscodeAuthResult) => void;
}

const GoogleLogoSvg: React.FC<{ className?: string }> = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.44a5.51 5.51 0 0 1-2.39 3.61v3h3.87c2.26-2.08 3.57-5.15 3.57-8.64z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.28v3.09A12 12 0 0 0 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.29A7.21 7.21 0 0 1 4.9 12c0-.79.14-1.57.38-2.29V6.62H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.38l4-3.09z"
    />
    <path
      fill="#EA4335"
      d="M12 4.76c1.76 0 3.34.61 4.59 1.79l3.44-3.44C17.94 1.19 15.23 0 12 0A12 12 0 0 0 1.28 6.62l4 3.09C6.23 6.87 8.88 4.76 12 4.76z"
    />
  </svg>
);

export const StudentMobileLoginScreen: React.FC<StudentMobileLoginScreenProps> = ({
  authUser,
  userProfile,
  isProfileLoading,
  isAdmin,
  initialName = '',
  initialMobile = '',
  onGoogleSignIn,
  onLinkMobileSubmit,
  onSignOut,
  onOpenAdminPanel,
  onAdminAuthenticated,
}) => {
  const { lang, t } = useTranslation();
  const isEn = lang === 'en';

  // Step 1: Google Auth state
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(
    null
  );

  // Step 2: Mobile Number onboarding state
  const [displayName, setDisplayName] = useState(
    userProfile?.name || authUser?.displayName || initialName
  );
  const [mobileInput, setMobileInput] = useState(normalizeIndianMobile10(initialMobile));
  const [isLinkingMobile, setIsLinkingMobile] = useState(false);

  // Discreet Admin Passcode panel (preserved for existing admin workflow)
  const [showAdminAccess, setShowAdminAccess] = useState(false);
  const [adminPhone, setAdminPhone] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminSigningIn, setIsAdminSigningIn] = useState(false);

  useEffect(() => {
    const resolvedName = (userProfile?.name || authUser?.displayName || initialName || '').trim();
    if (resolvedName && !displayName) {
      setDisplayName(resolvedName);
    }
  }, [authUser?.displayName, displayName, initialName, userProfile?.name]);

  const cleanMobile = normalizeIndianMobile10(mobileInput);
  const isMobileValid = isValidIndianMobile10(cleanMobile);

  const mapAuthError = (err: unknown): string => {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    if (msg.startsWith('GOOGLE_SIGNIN_SHA1_MISMATCH:')) {
      const sha1 = msg.slice('GOOGLE_SIGNIN_SHA1_MISMATCH:'.length);
      return isEn
        ? `APK signing SHA-1 mismatch (${sha1}). Register this SHA-1 in Firebase Console.`
        : `APK SHA-1 ફિંગરપ્રિન્ટ મેચ થતી નથી (${sha1}). Firebase Console માં આ SHA-1 ઉમેરો.`;
    }
    switch (msg) {
      case 'SIGN_IN_CANCELLED':
        return isEn
          ? 'Google Sign-In was cancelled. Tap the button again to continue.'
          : 'Google સાઇન-ઇન રદ કરવામાં આવ્યું. આગળ વધવા ફરી બટન દબાવો.';
      case 'NO_GOOGLE_CREDENTIAL':
        return isEn
          ? 'No Google account found on this device. Please sign in to Google in Android Settings first.'
          : 'આ ફોનમાં કોઈ Google એકાઉન્ટ નથી. પહેલા Android Settings માં Google એકાઉન્ટ ઉમેરો.';
      case 'GOOGLE_SIGNIN_CONFIG_ERROR':
        return isEn
          ? 'Google Sign-In could not connect. Check internet connection or popup settings and retry.'
          : 'Google સાઇન-ઇન કનેક્ટ થઈ શક્યું નથી. ઇન્ટરનેટ અથવા પોપ-અપ સેટિંગ્સ તપાસી ફરી પ્રયાસ કરો.';
      case 'ONLY_ADMIN_GOOGLE_EMAIL':
        return isEn
          ? 'This Google account is not authorized as an Admin.'
          : 'આ Google એકાઉન્ટ Admin તરીકે અધિકૃત નથી.';
      case 'INVALID_ADMIN_PASSWORD':
        return isEn
          ? 'Invalid Admin passcode. Please try again.'
          : 'ખોટો Admin પાસકોડ. કૃપા કરીને ફરી પ્રયાસ કરો.';
      case 'ONLY_ADMIN_NUMBER':
        return isEn
          ? 'Please enter the authorized Admin mobile number.'
          : 'કૃપા કરીને અધિકૃત Admin મોબાઇલ નંબર દાખલ કરો.';
      case 'INVALID_MOBILE':
        return isEn
          ? 'Please enter a valid 10-digit Indian mobile number.'
          : 'કૃપા કરીને માન્ય 10 અંકનો મોબાઇલ નંબર દાખલ કરો.';
      case 'RESERVED_ADMIN_MOBILE':
        return isEn
          ? 'This mobile number is reserved for the App Admin.'
          : 'આ મોબાઇલ નંબર એપ એડમિન માટે આરક્ષિત છે.';
      case 'MOBILE_ALREADY_LINKED':
        return isEn
          ? 'This mobile number is already linked to another Google account. Please use your own mobile number or sign in with that Google account.'
          : 'આ મોબાઇલ નંબર પહેલેથી બીજા Google એકાઉન્ટ સાથે જોડાયેલો છે. કૃપા કરીને તમારો નંબર દાખલ કરો અથવા તે Google એકાઉન્ટથી લોગિન કરો.';
      case 'MOBILE_ALREADY_SET':
        return isEn
          ? 'A mobile number is already linked to your Google account.'
          : 'તમારા Google એકાઉન્ટ સાથે પહેલેથી એક મોબાઇલ નંબર જોડાયેલો છે.';
      case 'AUTH_REQUIRED':
        return isEn
          ? 'Please sign in with Google first.'
          : 'પહેલા Google એકાઉન્ટથી સાઇન-ઇન કરો.';
      default:
        return (
          msg ||
          (isEn
            ? 'Something went wrong. Please check your internet and try again.'
            : 'કંઈક ખામી આવી છે. કૃપા કરીને ઇન્ટરનેટ તપાસી ફરી પ્રયાસ કરો.')
        );
    }
  };

  const handleGoogleLoginClick = async () => {
    setStatusMessage(null);
    setIsGoogleLoading(true);
    try {
      await onGoogleSignIn();
      setStatusMessage({
        type: 'success',
        text: isEn
          ? 'Google Account verified successfully!'
          : 'Google એકાઉન્ટ સફળતાપૂર્વક વેરિફાય થયું!',
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: mapAuthError(err),
      });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleMobileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!isMobileValid) {
      setStatusMessage({
        type: 'error',
        text: isEn
          ? 'Please enter a valid 10-digit Indian mobile number (without +91).'
          : 'કૃપા કરીને માન્ય 10 અંકનો મોબાઇલ નંબર દાખલ કરો (+91 વગર).',
      });
      return;
    }

    const effectiveName = (displayName || userProfile?.name || authUser?.displayName || '').trim();
    if (!effectiveName) {
      setStatusMessage({
        type: 'error',
        text: isEn ? 'Please enter your name.' : 'કૃપા કરીને તમારું નામ દાખલ કરો.',
      });
      return;
    }

    setIsLinkingMobile(true);
    try {
      await onLinkMobileSubmit({
        mobileNumber: cleanMobile,
        displayName: effectiveName.slice(0, 60),
      });
      setStatusMessage({
        type: 'success',
        text: isEn
          ? 'Mobile number saved to your profile!'
          : 'મોબાઇલ નંબર તમારી પ્રોફાઇલમાં સુરક્ષિત રીતે સાચવાયો!',
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: mapAuthError(err),
      });
    } finally {
      setIsLinkingMobile(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    const digits = adminPhone.replace(/\D/g, '').slice(-10);
    if (digits !== ADMIN_PHONE_TEN_DIGITS) {
      setStatusMessage({
        type: 'error',
        text: isEn
          ? 'Please enter the authorized Admin mobile number.'
          : 'કૃપા કરીને અધિકૃત Admin મોબાઇલ નંબર દાખલ કરો.',
      });
      return;
    }
    setIsAdminSigningIn(true);
    try {
      const res = await signInAsAdminWithPasscode(digits, adminPassword);
      onAdminAuthenticated(res);
    } catch (err) {
      setStatusMessage({ type: 'error', text: mapAuthError(err) });
    } finally {
      setIsAdminSigningIn(false);
    }
  };

  // Loading state while fetching /users/{uid} immediately after Google auth
  if (authUser && isProfileLoading) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="rounded-3xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-8 shadow-lg text-center space-y-4">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-[#1E3A8A]/10 dark:bg-[#1E3A8A]/30 flex items-center justify-center">
            <Loader2 className="h-7 w-7 text-[#1E3A8A] dark:text-[#93C5FD] animate-spin" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-extrabold text-[#0F172A] dark:text-[#F8FAFC]">
              {isEn ? 'Syncing your Google Profile…' : 'તમારી Google પ્રોફાઇલ લોડ થઈ રહી છે…'}
            </h2>
            <p className="text-xs font-semibold text-[#475569] dark:text-[#94A3B8]">
              {authUser.email}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // STEP 2: First-Time Mobile Number Setup Screen (Authenticated Google User without linked mobile)
  if (authUser) {
    const avatarUrl = userProfile?.photoURL || authUser.photoUrl || '';
    const googleName = userProfile?.name || authUser.displayName || 'Student';
    const initials = googleName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || 'S';

    return (
      <div className="max-w-md mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <div
          data-testid="mobile_setup_card"
          className="rounded-3xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] shadow-xl overflow-hidden"
        >
          {/* Verified Google Account Header */}
          <div className="bg-gradient-to-br from-[#1E3A8A] via-[#1D4ED8] to-[#0F172A] p-5 text-white">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/20 border border-emerald-300/40 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-100">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{isEn ? 'Step 2 of 2 • Complete Profile' : 'પગલું 2 / 2 • પ્રોફાઇલ પૂર્ણ કરો'}</span>
              </span>
              <button
                type="button"
                data-testid="mobile_setup_logout_btn"
                onClick={() => void onSignOut()}
                className="inline-flex items-center gap-1 rounded-xl bg-white/15 hover:bg-white/25 px-2.5 py-1.5 min-h-[36px] text-[11px] font-bold text-white transition-colors cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{isEn ? 'Logout' : 'લોગ આઉટ'}</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={googleName}
                  referrerPolicy="no-referrer"
                  className="h-12 w-12 rounded-2xl object-cover ring-2 ring-white/40 shrink-0"
                />
              ) : (
                <div className="h-12 w-12 rounded-2xl bg-white/20 ring-2 ring-white/40 flex items-center justify-center text-base font-extrabold shrink-0">
                  {initials}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-base font-extrabold truncate leading-tight">{googleName}</p>
                <p className="text-xs text-blue-100/90 truncate">{authUser.email}</p>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-6 space-y-5">
            {isAdmin && onOpenAdminPanel && (
              <button
                type="button"
                data-testid="mobile_setup_open_admin_btn"
                onClick={onOpenAdminPanel}
                className="w-full min-h-[48px] rounded-2xl bg-[#047857] hover:bg-[#065F46] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>{isEn ? 'Open Admin Panel Directly' : 'સીધા Admin Panel ખોલો'}</span>
              </button>
            )}

            <div className="space-y-1">
              <h2 className="text-lg font-extrabold text-[#0F172A] dark:text-[#F8FAFC]">
                {isEn ? 'Add Your Mobile Number' : 'તમારો મોબાઇલ નંબર દાખલ કરો'}
              </h2>
              <p className="text-xs leading-relaxed text-[#475569] dark:text-[#94A3B8]">
                {isEn
                  ? 'Link your 10-digit Indian mobile number once. Any existing quiz unlocks, scores, and history on this number will be restored automatically.'
                  : 'તમારો 10 અંકનો ભારતીય મોબાઇલ નંબર એક જ વાર જોડો. આ નંબર પરના તમારા હાલના બધા ક્વિઝ અનલોક, સ્કોર અને હિસ્ટ્રી આપમેળે સુરક્ષિત રહેશે.'}
              </p>
            </div>

            {statusMessage && (
              <div
                role="alert"
                data-testid="mobile_setup_status_banner"
                className={`rounded-2xl p-3.5 text-xs font-bold flex items-start gap-2.5 border ${
                  statusMessage.type === 'error'
                    ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                    : 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                }`}
              >
                {statusMessage.type === 'error' ? (
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                )}
                <span className="leading-relaxed">{statusMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleMobileSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="profile-display-name"
                  className="block text-xs font-extrabold text-[#334155] dark:text-[#CBD5E1] mb-1.5"
                >
                  {isEn ? 'Student Name' : 'વિદ્યાર્થીનું નામ'}
                </label>
                <div className="relative">
                  <User className="h-4 w-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="profile-display-name"
                    data-testid="profile_name_input"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value.slice(0, 60))}
                    placeholder={isEn ? 'Enter your full name' : 'તમારું પૂરું નામ લખો'}
                    autoComplete="name"
                    className="w-full min-h-[50px] pl-10 pr-4 rounded-2xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="profile-mobile-input"
                    className="block text-xs font-extrabold text-[#334155] dark:text-[#CBD5E1]"
                  >
                    {isEn ? 'Indian Mobile Number (+91)' : 'મોબાઇલ નંબર (+91)'}
                  </label>
                  <span
                    className={`text-[11px] font-extrabold tabular-nums ${
                      isMobileValid
                        ? 'text-[#047857] dark:text-[#6EE7B7]'
                        : 'text-[#64748B] dark:text-[#94A3B8]'
                    }`}
                  >
                    {cleanMobile.length}/10
                  </span>
                </div>

                <div className="flex items-stretch gap-2">
                  <div className="shrink-0 min-h-[52px] px-3.5 rounded-2xl border border-[#CBD5E1] dark:border-[#334155] bg-slate-100 dark:bg-[#0F172A] flex items-center gap-1.5 text-sm font-extrabold text-[#0F172A] dark:text-[#F8FAFC]">
                    <span aria-hidden="true">🇮🇳</span>
                    <span>+91</span>
                  </div>
                  <div className="relative flex-1">
                    <Smartphone className="h-4 w-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="profile-mobile-input"
                      data-testid="student_mobile_input"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      maxLength={10}
                      value={cleanMobile}
                      onChange={(e) => {
                        setMobileInput(normalizeIndianMobile10(e.target.value));
                        if (statusMessage?.type === 'error') setStatusMessage(null);
                      }}
                      placeholder={isEn ? '10-digit mobile number' : '10 અંકનો મોબાઇલ નંબર'}
                      className="w-full min-h-[52px] pl-10 pr-4 rounded-2xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] text-base font-extrabold tracking-wider text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] tabular-nums"
                    />
                  </div>
                </div>
              </div>

              {/* Honest Verification Notice (OTP-ready, no fake verification) */}
              <div className="rounded-2xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 p-3 text-[11px] leading-relaxed text-amber-950 dark:text-amber-200 space-y-1">
                <div className="font-extrabold flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {isEn
                      ? 'One mobile number per Google account'
                      : 'એક મોબાઇલ નંબર ફક્ત એક જ Google એકાઉન્ટ સાથે જોડાશે'}
                  </span>
                </div>
                <p className="text-amber-900/90 dark:text-amber-200/90">
                  {isEn
                    ? 'Your number will be saved as Unverified (SMS OTP verification will be added in a future update — no paid SMS needed).'
                    : 'તમારો નંબર અત્યારે અપ્રમાણિત (Unverified) તરીકે સાચવાશે. ભવિષ્યમાં SMS OTP વેરિફિકેશનની સુવિધા ઉમેરાશે.'}
                </p>
              </div>

              <button
                type="submit"
                data-testid="save_mobile_profile_button"
                disabled={isLinkingMobile || !isMobileValid}
                className="w-full min-h-[54px] rounded-2xl bg-[#1E3A8A] hover:bg-[#1E40AF] disabled:opacity-50 text-white font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
              >
                {isLinkingMobile ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>{isEn ? 'Saving & Checking…' : 'ચકાસાઈ રહ્યું છે…'}</span>
                  </>
                ) : (
                  <>
                    <span>{isEn ? 'Save Mobile & Continue' : 'નંબર સાચવો અને આગળ વધો'}</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // STEP 1: Premium Google Sign-In Landing Screen
  return (
    <div className="max-w-md mx-auto px-3 sm:px-4 py-6 sm:py-10 space-y-4">
      <div
        data-testid="google_login_card"
        className="rounded-3xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] shadow-xl overflow-hidden"
      >
        {/* Premium Hero Header */}
        <div className="relative bg-gradient-to-br from-[#0F172A] via-[#1E3A8A] to-[#047857] px-6 pt-8 pb-7 text-white text-center overflow-hidden">
          <div className="mx-auto mb-3.5 h-20 w-20 rounded-3xl bg-black p-1.5 shadow-lg ring-2 ring-[#FACC15]/70 flex items-center justify-center">
            <img
              src="/images/ic_app_logo.png"
              alt={t.appName}
              className="h-full w-full rounded-2xl object-contain"
            />
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 border border-white/25 px-3 py-1 text-[11px] font-extrabold text-[#FDE047] mb-2">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{isEn ? 'Std 10 Board Exam Quiz' : 'ધોરણ 10 બોર્ડ પરીક્ષા ક્વિઝ'}</span>
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight leading-snug">
            {isEn ? 'Sign in to Quick Quiz' : 'Quick Quiz માં લોગિન કરો'}
          </h2>
          <p className="text-xs sm:text-sm text-blue-100/90 mt-1.5 leading-relaxed max-w-xs mx-auto">
            {isEn
              ? 'Sign in securely with your Google Account to save scores, unlocks, and history.'
              : 'તમારા ક્વિઝ સ્કોર, હિસ્ટ્રી અને અનલોક ડેટા સુરક્ષિત રાખવા Google એકાઉન્ટથી લોગિન કરો.'}
          </p>
        </div>

        {/* Sign-In Body */}
        <div className="p-6 space-y-5">
          {statusMessage && (
            <div
              role="alert"
              data-testid="google_login_status_banner"
              className={`rounded-2xl p-3.5 text-xs font-bold flex items-start gap-2.5 border ${
                statusMessage.type === 'error'
                  ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                  : 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              }`}
            >
              {statusMessage.type === 'error' ? (
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{statusMessage.text}</span>
            </div>
          )}

          {/* Official-Style Google Sign-In Button */}
          <button
            type="button"
            data-testid="google_sign_in_button"
            disabled={isGoogleLoading}
            onClick={() => void handleGoogleLoginClick()}
            className="w-full min-h-[56px] px-5 rounded-2xl bg-white dark:bg-[#0F172A] hover:bg-slate-50 dark:hover:bg-slate-800/90 active:scale-[0.99] border-2 border-[#CBD5E1] dark:border-[#475569] text-[#0F172A] dark:text-[#F8FAFC] font-extrabold text-base flex items-center justify-center gap-3 shadow-sm transition-all cursor-pointer disabled:opacity-60"
          >
            {isGoogleLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-[#1E3A8A] dark:text-[#93C5FD]" />
                <span>
                  {isEn ? 'Signing in with Google…' : 'Google એકાઉન્ટ ચકાસાઈ રહ્યું છે…'}
                </span>
              </>
            ) : (
              <>
                <GoogleLogoSvg className="h-6 w-6 shrink-0" />
                <span>{isEn ? 'Continue with Google' : 'Google સાથે સાઇન-ઇન કરો'}</span>
              </>
            )}
          </button>

          {/* Trust & Feature Highlights */}
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center gap-3 rounded-2xl bg-[#FAF9F5] dark:bg-[#0F172A]/80 border border-[#E2E8F0] dark:border-[#334155] px-3.5 py-2.5">
              <div className="h-9 w-9 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-[#1E3A8A] dark:text-[#93C5FD] flex items-center justify-center shrink-0">
                <ShieldCheck className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-[#0F172A] dark:text-[#F8FAFC]">
                  {isEn ? 'Verified Google Authentication' : 'સુરક્ષિત Google એકાઉન્ટ વેરિફિકેશન'}
                </p>
                <p className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                  {isEn
                    ? 'Private UID-protected profile, quiz scores & history.'
                    : 'તમારો પ્રોફાઇલ, સ્કોર અને હિસ્ટ્રી ફક્ત તમારા એકાઉન્ટ માટે સુરક્ષિત.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl bg-[#FAF9F5] dark:bg-[#0F172A]/80 border border-[#E2E8F0] dark:border-[#334155] px-3.5 py-2.5">
              <div className="h-9 w-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-[#047857] dark:text-[#6EE7B7] flex items-center justify-center shrink-0">
                <Cloud className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-[#0F172A] dark:text-[#F8FAFC]">
                  {isEn ? 'Existing Unlocks Stay Safe' : 'હાલના અનલોક અને સ્કોર સુરક્ષિત રહેશે'}
                </p>
                <p className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                  {isEn
                    ? 'Link your +91 mobile number once after login to restore all previous data.'
                    : 'લોગિન પછી એક વાર +91 મોબાઇલ નંબર જોડતા જ જૂનો બધો ડેટા પાછો મળશે.'}
                </p>
              </div>
            </div>
          </div>

          {/* Collapsible Admin Access (preserved for admin convenience) */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              data-testid="toggle_admin_login_btn"
              onClick={() => setShowAdminAccess((prev) => !prev)}
              className="w-full min-h-[42px] flex items-center justify-center gap-1.5 text-xs font-bold text-[#64748B] dark:text-[#94A3B8] hover:text-[#1E3A8A] dark:hover:text-[#93C5FD] transition-colors cursor-pointer"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>{isEn ? 'Admin Access' : 'એડમિન લોગિન'}</span>
              {showAdminAccess ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>

            {showAdminAccess && (
              <form onSubmit={handleAdminSubmit} className="mt-3 space-y-2.5">
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={adminPhone}
                  onChange={(e) => setAdminPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder={isEn ? 'Admin 10-digit mobile' : 'એડમિન મોબાઇલ નંબર'}
                  className="w-full min-h-[46px] px-3.5 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] text-sm font-bold"
                />
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder={isEn ? 'Admin passcode' : 'એડમિન પાસકોડ'}
                  className="w-full min-h-[46px] px-3.5 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] text-sm font-bold"
                />
                <button
                  type="submit"
                  disabled={isAdminSigningIn}
                  className="w-full min-h-[46px] rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isAdminSigningIn ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  <span>{isEn ? 'Verify Admin Account' : 'એડમિન વેરિફાય કરો'}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
