import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Folder,
  History,
  KeyRound,
  Lock,
  LockOpen,
  Smartphone,
  Trophy,
  User,
} from 'lucide-react';
import { std10Subjects } from '../data/curriculum/std10Curriculum';
import { useTranslation } from '../i18n/translations';
import { extractReadableErrorMessage } from '../services/firestoreErrorHandler';
import {
  ALL_SUBJECT_IDS,
  getSubjectDisplayName,
  type QuizAttempt,
  type QuizSubject,
  type SubjectId,
} from '../types/models';
import { normalizeIndianMobileInput } from '../utils/imageUtils';

interface UseCodeScreenProps {
  unlockedSubjects: string[];
  recentAttempts: QuizAttempt[];
  prefilledCode?: string;
  prefilledName?: string;
  prefilledMobile?: string;
  isAuthReady: boolean;
  isBusy: boolean;
  onRedeemCode: (params: {
    code: string;
    name: string;
    mobile: string;
  }) => Promise<{ code: string; subjectId: string } | undefined>;
  onOpenSubject: (subject: QuizSubject) => void;
}

export const UseCodeScreen: React.FC<UseCodeScreenProps> = ({
  unlockedSubjects,
  recentAttempts,
  prefilledCode = '',
  prefilledName = '',
  prefilledMobile = '',
  isAuthReady,
  isBusy,
  onRedeemCode,
  onOpenSubject,
}) => {
  const { lang, t } = useTranslation();

  const [codeInput, setCodeInput] = useState(prefilledCode);
  const [nameInput, setNameInput] = useState(prefilledName);
  const [mobileInput, setMobileInput] = useState(prefilledMobile);
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastUnlockedResult, setLastUnlockedResult] = useState<{
    code: string;
    subjectId: string;
  } | null>(null);

  useEffect(() => {
    if (prefilledCode) setCodeInput(prefilledCode);
  }, [prefilledCode]);

  useEffect(() => {
    if (prefilledName) setNameInput((prev) => prev || prefilledName);
  }, [prefilledName]);

  useEffect(() => {
    if (prefilledMobile) setMobileInput((prev) => prev || prefilledMobile);
  }, [prefilledMobile]);

  const hasSubjectAccess = (subjectId: SubjectId): boolean => {
    return unlockedSubjects.includes('all') || unlockedSubjects.includes(subjectId);
  };

  const allUnlocked = ALL_SUBJECT_IDS.every((id) => hasSubjectAccess(id));
  const anyUnlocked = ALL_SUBJECT_IDS.some((id) => hasSubjectAccess(id));

  const mapError = (err: unknown): string => {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'INVALID_CODE_FORMAT') return t.errInvalidCodeFormat;
    if (msg === 'INVALID_NAME') return t.errInvalidName;
    if (msg === 'INVALID_MOBILE') return t.errInvalidMobile;
    if (msg === 'CODE_NOT_FOUND') return t.errCodeNotFound;
    if (msg === 'CODE_ALREADY_USED') return t.errCodeAlreadyUsed;
    if (msg.startsWith('SUBJECT_MISMATCH:')) {
      const codeSub = msg.split(':')[1] ?? 'all';
      const subName = getSubjectDisplayName(codeSub, lang);
      return lang === 'en'
        ? `This code is valid for ${subName}.`
        : `આ કોડ ${subName} માટે છે.`;
    }
    return extractReadableErrorMessage(err, lang);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const cleanCode = codeInput.trim().toUpperCase();
    const cleanName = nameInput.trim();
    const cleanMobile = mobileInput.replace(/\D/g, '');

    if (!/^[A-Z0-9_-]{4,32}$/.test(cleanCode)) {
      setLocalError(t.errInvalidCodeFormat);
      return;
    }
    if (!cleanName) {
      setLocalError(t.errInvalidName);
      return;
    }
    if (!/^[0-9]{10}$/.test(cleanMobile)) {
      setLocalError(t.errInvalidMobile);
      return;
    }

    try {
      const res = await onRedeemCode({
        code: cleanCode,
        name: cleanName,
        mobile: cleanMobile,
      });
      if (res) {
        setLastUnlockedResult(res);
        setCodeInput('');
      }
    } catch (err) {
      setLocalError(mapError(err));
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-5 space-y-5">
      {/* Code Redemption Card */}
      <section className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] shadow-sm p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-xl bg-[#DBEAFE] dark:bg-[#1E3A5F] flex items-center justify-center text-[#1E3A8A] dark:text-[#93C5FD] shrink-0">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-extrabold">{t.useCodeTitle}</h2>
            <p className="text-xs text-[#475569] dark:text-[#94A3B8]">{t.useCodeSubtitle}</p>
          </div>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div>
            <label
              htmlFor="redeem-code-input"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
            >
              {t.fieldCodeLabel}
            </label>
            <input
              id="redeem-code-input"
              type="text"
              maxLength={32}
              value={codeInput}
              onChange={(e) => {
                setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32));
                setLocalError(null);
              }}
              placeholder={t.fieldCodePlaceholder}
              className="w-full h-12 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] px-3.5 text-base font-extrabold font-mono tracking-widest outline-none focus:border-[#1E3A8A]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="redeem-name-input"
                className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
              >
                {t.fieldFullName}
              </label>
              <div className="flex items-center rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] px-3 h-11">
                <User className="h-4 w-4 text-slate-400 mr-2 shrink-0" />
                <input
                  id="redeem-name-input"
                  type="text"
                  maxLength={60}
                  value={nameInput}
                  onChange={(e) => {
                    setNameInput(e.target.value);
                    setLocalError(null);
                  }}
                  placeholder={t.fieldFullNamePlaceholder}
                  className="w-full bg-transparent text-sm font-medium outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="redeem-mobile-input"
                className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
              >
                {t.fieldMobile}
              </label>
              <div className="flex items-center rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] px-3 h-11">
                <Smartphone className="h-4 w-4 text-slate-400 mr-2 shrink-0" />
                <span className="text-xs font-bold text-slate-500 mr-1.5">+91</span>
                <input
                  id="redeem-mobile-input"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={mobileInput}
                  onChange={(e) => {
                    setMobileInput(normalizeIndianMobileInput(e.target.value));
                    setLocalError(null);
                  }}
                  placeholder={t.fieldMobilePlaceholder}
                  className="w-full bg-transparent text-sm font-semibold tabular-nums outline-none"
                />
              </div>
            </div>
          </div>

          {localError && (
            <div
              role="alert"
              className="rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 p-3 text-xs font-semibold text-red-700 dark:text-red-300"
            >
              {localError}
            </div>
          )}

          <button
            type="submit"
            disabled={isBusy || !isAuthReady}
            className="w-full h-12 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] dark:bg-[#2563EB] text-white text-sm font-extrabold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
          >
            <LockOpen className="h-4.5 w-4.5" />
            <span>{isBusy ? t.redeemingBtn : t.redeemNowBtn}</span>
          </button>
        </form>

        {lastUnlockedResult && (
          <div className="rounded-xl bg-[#D1FAE5] dark:bg-[#064E3B] p-3.5 flex items-start gap-2.5 text-[#064E3B] dark:text-[#D1FAE5]">
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-sm font-extrabold">{t.codeSuccessTitle}</p>
              <p className="text-xs">
                {t.codeSuccessDesc} ({lastUnlockedResult.code} •{' '}
                {getSubjectDisplayName(lastUnlockedResult.subjectId, lang)})
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Protected Content: Std 10 Quiz Folders */}
      <section className="space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base sm:text-lg font-extrabold">{t.unlockedContentTitle}</h3>
            <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
              {t.unlockedContentSubtitle}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold ${
              allUnlocked
                ? 'bg-[#D1FAE5] text-[#064E3B] dark:bg-[#064E3B] dark:text-[#D1FAE5]'
                : anyUnlocked
                  ? 'bg-[#DBEAFE] text-[#1E3A8A] dark:bg-[#1E3A5F] dark:text-[#DBEAFE]'
                  : 'bg-[#FEF3C7] text-[#92400E] dark:bg-[#451A03] dark:text-[#FDE68A]'
            }`}
          >
            {allUnlocked
              ? t.unlockedBadge
              : anyUnlocked
                ? t.partialUnlockedBadge
                : t.lockedBadge}
          </span>
        </div>

        <div className="space-y-3.5">
          {std10Subjects.map((subject) => {
            const access = hasSubjectAccess(subject.id);
            const totalQuestions = subject.chapters.reduce((sum, ch) => sum + ch.questions.length, 0);
            return (
              <div key={subject.id} className="w-full">
                <div
                  className="ml-4 inline-flex items-center gap-1.5 rounded-t-xl px-3.5 py-1 text-white text-xs font-bold"
                  style={{ backgroundColor: subject.accentHex }}
                >
                  <Folder className="h-3.5 w-3.5" />
                  <span>{subject.englishSubtitle}</span>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenSubject(subject)}
                  className="w-full text-left rounded-tr-2xl rounded-b-2xl rounded-tl-md bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] shadow-sm hover:shadow-md transition-shadow p-3.5 flex items-center gap-3.5 cursor-pointer"
                >
                  <div className="relative w-22 h-18 sm:w-28 sm:h-20 rounded-xl overflow-hidden shrink-0">
                    <img
                      src={subject.imageUrl}
                      alt={subject.title}
                      className="w-full h-full object-cover"
                    />
                    <div
                      className="absolute inset-0"
                      style={{
                        background: `linear-gradient(180deg, ${subject.accentHex}10 0%, ${subject.accentHex}75 100%)`,
                      }}
                    />
                    <div className="absolute top-1.5 right-1.5 rounded-full bg-white/95 dark:bg-slate-900/95 p-1 shadow">
                      {access ? (
                        <CheckCircle2 className="h-4 w-4 text-[#047857] dark:text-[#6EE7B7]" />
                      ) : (
                        <Lock className="h-4 w-4" style={{ color: subject.accentHex }} />
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <h4 className="text-base sm:text-lg font-bold">
                      {lang === 'en' ? `${subject.englishSubtitle} (${subject.title})` : subject.title}
                    </h4>
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8] line-clamp-2">
                      {subject.description}
                    </p>
                    <span
                      className="inline-block rounded-md px-2 py-0.5 text-xs font-bold tabular-nums"
                      style={{
                        backgroundColor: `${subject.accentHex}1F`,
                        color: subject.accentHex,
                      }}
                    >
                      {subject.chapters.length} / {totalQuestions} {t.chaptersAndQuestions}
                    </span>
                  </div>

                  <ArrowRight className="h-5 w-5 shrink-0" style={{ color: subject.accentHex }} />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {recentAttempts.length > 0 && (
        <section className="space-y-2.5 pt-2">
          <div className="flex items-center gap-2">
            <History className="h-4.5 w-4.5 text-[#1E3A8A] dark:text-[#93C5FD]" />
            <h3 className="text-base font-bold">{t.recentAttemptsTitle}</h3>
          </div>
          <div className="space-y-2">
            {recentAttempts.slice(0, 5).map((attempt) => (
              <div
                key={attempt.id}
                className="rounded-xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Trophy className="h-4.5 w-4.5 text-[#D97706] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-bold truncate">
                      {attempt.subjectTitle} • {attempt.chapterTitle}
                    </p>
                    <p className="text-[11px] text-[#475569] dark:text-[#94A3B8] tabular-nums">
                      {attempt.score}/{attempt.totalQuestions} • {attempt.timeTakenSeconds}s
                    </p>
                  </div>
                </div>
                <span className="rounded-lg bg-[#DBEAFE] dark:bg-[#1E3A5F] text-[#1E3A8A] dark:text-[#DBEAFE] px-2.5 py-1 text-xs font-bold tabular-nums">
                  {attempt.percentage}%
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
