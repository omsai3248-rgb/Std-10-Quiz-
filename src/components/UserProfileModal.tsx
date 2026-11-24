import React from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  LogOut,
  Mail,
  ShieldCheck,
  Smartphone,
  Trophy,
  User,
  X,
} from 'lucide-react';
import { useTranslation } from '../i18n/translations';
import {
  ALL_SUBJECT_IDS,
  formatIndianMobileDisplay,
  type StudentProfile,
  type UserProfile,
} from '../types/models';

interface UserProfileModalProps {
  isOpen: boolean;
  userProfile: UserProfile | null;
  student: StudentProfile | null;
  unlockedSubjects: string[];
  onClose: () => void;
  onLogout: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  userProfile,
  student,
  unlockedSubjects,
  onClose,
  onLogout,
}) => {
  const { lang } = useTranslation();

  if (!isOpen || !userProfile) return null;

  const isEn = lang === 'en';
  const displayName = userProfile.name || student?.fullName || 'Student';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || 'S';

  const unlockedCount = unlockedSubjects.includes('all')
    ? ALL_SUBJECT_IDS.length
    : ALL_SUBJECT_IDS.filter((id) => unlockedSubjects.includes(id)).length;

  const quizzesTaken = student?.totalQuizzesTaken ?? 0;
  const bestScore = student?.bestScorePercent ?? 0;
  const formattedMobile = formatIndianMobileDisplay(
    userProfile.mobileNumber || student?.mobileNumber || ''
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isEn ? 'User Profile' : 'યુઝર પ્રોફાઇલ'}
      onClick={onClose}
    >
      <div
        data-testid="user_profile_modal"
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Hero Banner */}
        <div className="relative bg-gradient-to-br from-[#1E3A8A] via-[#1D4ED8] to-[#0F172A] px-5 pt-5 pb-6 text-white">
          <button
            type="button"
            data-testid="close_profile_modal_btn"
            onClick={onClose}
            aria-label={isEn ? 'Close profile' : 'પ્રોફાઇલ બંધ કરો'}
            className="absolute top-3.5 right-3.5 h-10 w-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3.5 pr-10">
            {userProfile.photoURL ? (
              <img
                src={userProfile.photoURL}
                alt={displayName}
                referrerPolicy="no-referrer"
                className="h-16 w-16 rounded-2xl object-cover ring-2 ring-white/40 bg-white/10 shrink-0"
              />
            ) : (
              <div className="h-16 w-16 rounded-2xl bg-white/20 ring-2 ring-white/40 flex items-center justify-center text-xl font-extrabold shrink-0">
                {initials}
              </div>
            )}

            <div className="min-w-0">
              <div className="inline-flex items-center gap-1 rounded-full bg-emerald-400/20 border border-emerald-300/40 px-2.5 py-0.5 text-[10px] font-bold text-emerald-100 mb-1">
                <ShieldCheck className="h-3 w-3 shrink-0" />
                <span>{isEn ? 'Google Account Verified' : 'Google એકાઉન્ટ સુરક્ષિત'}</span>
              </div>
              <h2 className="text-lg font-extrabold truncate leading-tight">{displayName}</h2>
              {userProfile.email && (
                <p className="text-xs text-blue-100/90 truncate flex items-center gap-1 mt-0.5">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{userProfile.email}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-4">
          {/* Mobile Number Card with Honest Verification State */}
          <div className="rounded-2xl border border-[#E2E8F0] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#475569] dark:text-[#94A3B8]">
                <Smartphone className="h-4 w-4 text-[#1E3A8A] dark:text-[#93C5FD]" />
                <span>{isEn ? 'Linked Mobile Number' : 'જોડાયેલ મોબાઇલ નંબર'}</span>
              </div>

              {userProfile.mobileVerified ? (
                <span
                  data-testid="profile_mobile_verified_badge"
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-800 dark:text-emerald-300"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  <span>{isEn ? 'Verified' : 'વેરિફાઇડ'}</span>
                </span>
              ) : (
                <span
                  data-testid="profile_mobile_unverified_badge"
                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-800 dark:text-amber-300"
                >
                  <AlertCircle className="h-3 w-3" />
                  <span>{isEn ? 'Not Verified' : 'અપ્રમાણિત'}</span>
                </span>
              )}
            </div>

            <div
              data-testid="profile_mobile_number_value"
              className="text-lg font-extrabold tracking-wide text-[#0F172A] dark:text-[#F8FAFC] tabular-nums"
            >
              {formattedMobile || (isEn ? 'Not linked yet' : 'હજુ ઉમેરેલ નથી')}
            </div>

            {!userProfile.mobileVerified && (
              <p className="text-[11px] leading-relaxed text-[#475569] dark:text-[#94A3B8]">
                {isEn
                  ? 'Mobile numbers are never marked Verified without OTP. SMS OTP verification will be available in a future update.'
                  : 'OTP વિના મોબાઇલ નંબરને Verified ગણવામાં આવતો નથી. ભવિષ્યમાં SMS OTP વેરિફિકેશનની સુવિધા ઉમેરવામાં આવશે.'}
              </p>
            )}
          </div>

          {/* Quick Learning Summary */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-2xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#0F172A]/70 p-3 text-center">
              <BookOpen className="h-4 w-4 mx-auto text-[#1E3A8A] dark:text-[#93C5FD] mb-1" />
              <div className="text-base font-extrabold tabular-nums">
                {unlockedCount}/{ALL_SUBJECT_IDS.length}
              </div>
              <div className="text-[10px] font-bold text-[#475569] dark:text-[#94A3B8]">
                {isEn ? 'Subjects' : 'વિષયો'}
              </div>
            </div>
            <div className="rounded-2xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#0F172A]/70 p-3 text-center">
              <User className="h-4 w-4 mx-auto text-[#047857] dark:text-[#6EE7B7] mb-1" />
              <div className="text-base font-extrabold tabular-nums">{quizzesTaken}</div>
              <div className="text-[10px] font-bold text-[#475569] dark:text-[#94A3B8]">
                {isEn ? 'Quizzes' : 'ક્વિઝ'}
              </div>
            </div>
            <div className="rounded-2xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#0F172A]/70 p-3 text-center">
              <Trophy className="h-4 w-4 mx-auto text-amber-500 mb-1" />
              <div className="text-base font-extrabold tabular-nums">{bestScore}%</div>
              <div className="text-[10px] font-bold text-[#475569] dark:text-[#94A3B8]">
                {isEn ? 'Best Score' : 'શ્રેષ્ઠ સ્કોર'}
              </div>
            </div>
          </div>

          {/* Firebase UID Privacy Info */}
          <div className="flex items-center justify-between text-[11px] text-[#64748B] dark:text-[#94A3B8] px-1">
            <span>{isEn ? 'Account ID (UID)' : 'સુરક્ષિત એકાઉન્ટ ID'}</span>
            <span className="font-mono font-semibold truncate max-w-[180px]">
              {userProfile.uid.slice(0, 12)}…
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[48px] rounded-2xl border border-[#CBD5E1] dark:border-[#334155] font-extrabold text-sm text-[#0F172A] dark:text-[#F8FAFC] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {isEn ? 'Close' : 'બંધ કરો'}
            </button>
            <button
              type="button"
              data-testid="profile_logout_button"
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="flex-1 min-h-[48px] rounded-2xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span>{isEn ? 'Log Out' : 'લોગ આઉટ'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
