import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  KeyRound,
  Layers,
  Loader2,
  PlusCircle,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserCheck,
  Wallet,
  X,
} from 'lucide-react';
import { useAdaptiveDisplay } from '../context/AdaptiveDisplayContext';
import { useTranslation } from '../i18n/translations';
import type { DirectMobileCodeResult } from '../services/quizRepository';
import {
  groupAccessCodesIntoBatchFolders,
  isAccessCodeUsed,
  suggestNextBatchName,
  type CodeBatchFolder,
} from '../utils/batchCodeUtils';
import {
  ALL_SUBJECT_IDS,
  displayPaymentTransactionRef,
  getDefaultPrefix,
  getFixedPlanPrice,
  getSubjectDisplayName,
  resolveCodeSubjectId,
  resolvePaymentSubjectId,
  type AccessCode,
  type AdminFocusedTarget,
  type PaymentRequest,
  type StudentProfile,
  type SubjectId,
} from '../types/models';
import {
  buildDirectCodeWhatsAppHref,
  buildPaymentApprovalWhatsAppHref,
  buildQuizUnlockWhatsAppHref,
  exportAccessCodesToCsv,
  formatTimestampLabel,
  launchExternalUrl,
  normalizeIndianMobileInput,
  resolvePaymentImageSrc,
} from '../utils/imageUtils';

const SUBJECT_LIST = [
  'all',
  'maths',
  'science',
  'social_science',
  'english',
  'gujarati',
  'hindi',
] as const;

const DirectMobileCodeCard: React.FC<{
  students: StudentProfile[];
  isBusy: boolean;
  onGenerateDirectCode: (params: {
    mobileNumber: string;
    userName?: string;
    subjectId: string;
  }) => Promise<DirectMobileCodeResult>;
  onNotify?: (message: string, isError?: boolean) => void;
}> = ({ students, isBusy, onGenerateDirectCode, onNotify }) => {
  const { lang, t } = useTranslation();
  const [mobileInput, setMobileInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [subjectId, setSubjectId] = useState<string>('all');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<DirectMobileCodeResult | null>(null);

  const cleanMobile = normalizeIndianMobileInput(mobileInput);
  const matchedStudent = useMemo(() => {
    if (cleanMobile.length !== 10) return null;
    return (
      students.find((s) => s.mobileNumber.replace(/\D/g, '').slice(-10) === cleanMobile) ?? null
    );
  }, [cleanMobile, students]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cleanMobile.length !== 10) {
      onNotify?.(t.errInvalidMobile, true);
      return;
    }
    setIsGenerating(true);
    try {
      const effectiveName = nameInput.trim() || matchedStudent?.fullName || '';
      const res = await onGenerateDirectCode({
        mobileNumber: cleanMobile,
        userName: effectiveName,
        subjectId,
      });
      setGeneratedResult(res);
    } catch {
      // Banner handles error feedback
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white dark:bg-[#1E293B] border-2 border-[#047857]/35 dark:border-[#6EE7B7]/35 p-4 space-y-3 shadow-sm">
      <div className="flex items-start gap-2.5">
        <div className="h-10 w-10 rounded-xl bg-[#D1FAE5] dark:bg-[#064E3B] text-[#047857] dark:text-[#6EE7B7] flex items-center justify-center shrink-0">
          <KeyRound className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm sm:text-base font-extrabold text-[#0F172A] dark:text-[#F8FAFC]">
            {t.directCodeSectionTitle}
          </h3>
          <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
            {t.directCodeSectionSubtitle}
          </p>
        </div>
      </div>

      <form onSubmit={(e) => void handleGenerate(e)} className="space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="flex items-center h-12 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] px-3 focus-within:border-[#1E3A8A]">
            <span className="text-xs font-extrabold text-[#475569] dark:text-[#94A3B8] mr-2 shrink-0">
              +91
            </span>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={14}
              value={mobileInput}
              onChange={(e) => {
                setMobileInput(normalizeIndianMobileInput(e.target.value));
                setGeneratedResult(null);
              }}
              placeholder={t.directCodeMobilePlaceholder}
              className="w-full bg-transparent text-sm font-bold tracking-wide outline-none"
            />
          </div>

          <input
            type="text"
            maxLength={60}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value.slice(0, 60))}
            placeholder={
              matchedStudent?.fullName
                ? `${matchedStudent.fullName}`
                : t.directCodeNamePlaceholder
            }
            className="h-12 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] px-3.5 text-sm font-semibold outline-none focus:border-[#1E3A8A]"
          />
        </div>

        {matchedStudent && (
          <div className="rounded-xl bg-[#DBEAFE] dark:bg-[#1E3A5F] text-[#1E3A8A] dark:text-[#DBEAFE] px-3 py-2 text-xs font-bold flex items-center justify-between gap-2">
            <span className="truncate">
              {t.directCodeStudentMatched} {matchedStudent.fullName}
            </span>
            <span className="shrink-0 tabular-nums">+91 {matchedStudent.mobileNumber}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {SUBJECT_LIST.map((subId) => {
            const active = subjectId === subId;
            const price = getFixedPlanPrice(subId);
            return (
              <button
                key={subId}
                type="button"
                onClick={() => setSubjectId(subId)}
                className={`min-h-[40px] rounded-xl px-3 py-1.5 text-xs font-bold border transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                    : 'bg-[#FAF9F5] dark:bg-[#0F172A] border-[#CBD5E1] dark:border-[#334155]'
                }`}
              >
                {getSubjectDisplayName(subId, lang)} • ₹{price}
              </button>
            );
          })}
        </div>

        <button
          type="submit"
          disabled={isBusy || isGenerating || cleanMobile.length !== 10}
          className="w-full h-12 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] text-white text-sm font-extrabold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <KeyRound className="h-4 w-4" />
          <span>{isGenerating ? t.directCodeGeneratingBtn : t.directCodeGenerateBtn}</span>
        </button>
      </form>

      {generatedResult && (
        <div className="rounded-2xl bg-[#D1FAE5] dark:bg-[#064E3B] p-3.5 space-y-2.5 text-[#064E3B] dark:text-[#D1FAE5]">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-bold opacity-85">{t.directCodeReadyLabel}</p>
              <p className="text-2xl font-extrabold tracking-widest font-mono">
                {generatedResult.code}
              </p>
              <p className="text-xs font-semibold truncate">
                {generatedResult.userName} • +91 {generatedResult.mobileNumber} •{' '}
                {getSubjectDisplayName(generatedResult.subjectId, lang)} (₹
                {generatedResult.amountRupees})
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(generatedResult.code);
                  onNotify?.(`${t.payUpiCopied}: ${generatedResult.code}`);
                } catch {
                  onNotify?.(generatedResult.code);
                }
              }}
              className="h-11 px-3.5 rounded-xl bg-white/85 dark:bg-black/30 text-xs font-extrabold flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Copy className="h-4 w-4" />
              <span>{t.copyCode}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              launchExternalUrl(buildDirectCodeWhatsAppHref(generatedResult, lang))
            }
            className="w-full h-12 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-sm font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Send className="h-4 w-4" />
            <span>
              {t.directCodeSendWhatsAppBtn} (+91 {generatedResult.mobileNumber})
            </span>
          </button>
        </div>
      )}
    </div>
  );
};

const EmptyStateCard: React.FC<{ message: string }> = ({ message }) => (
  <div className="rounded-2xl bg-[#EFF4FA] dark:bg-[#1E293B] p-8 flex flex-col items-center justify-center gap-2 text-center border border-[#E2E8F0] dark:border-[#334155]">
    <Filter className="h-8 w-8 text-slate-400" />
    <p className="text-sm font-semibold text-[#475569] dark:text-[#94A3B8]">{message}</p>
  </div>
);

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-[#475569] dark:text-[#94A3B8] shrink-0">{label}</span>
    <span className="font-bold text-right truncate max-w-[68%]">{value}</span>
  </div>
);

const LoadMoreButton: React.FC<{
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}> = ({ hasMore, isLoadingMore, onLoadMore }) => {
  const { t } = useTranslation();
  if (!hasMore || !onLoadMore) return null;
  return (
    <div className="pt-2 flex justify-center">
      <button
        type="button"
        disabled={isLoadingMore}
        onClick={onLoadMore}
        className="min-h-[48px] px-6 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E293B] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-extrabold text-[#1E3A8A] dark:text-[#93C5FD] transition-colors disabled:opacity-60 cursor-pointer"
      >
        {isLoadingMore ? t.loadingMoreBtn : t.loadMoreBtn}
      </button>
    </div>
  );
};

const FocusedNotificationBanner: React.FC<{
  target: AdminFocusedTarget | null | undefined;
  onClear?: () => void;
}> = ({ target, onClear }) => {
  if (!target) return null;
  const heading =
    target.title ||
    (target.actorName ? `${target.actorName}` : 'નોટિફિકેશનમાંથી ખુલેલ વિગત');
  const detail =
    target.body ||
    (target.actorMobile ? `+91 ${target.actorMobile}` : target.referenceId || '');
  return (
    <div
      data-testid="admin_focused_notification_banner"
      className="rounded-2xl bg-[#DBEAFE] dark:bg-[#1E3A5F] border-2 border-[#2563EB] dark:border-[#60A5FA] p-3.5 flex items-start justify-between gap-3 text-[#1E3A8A] dark:text-[#EFF6FF] shadow-sm"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="h-9 w-9 rounded-xl bg-[#1E3A8A] dark:bg-[#2563EB] text-white flex items-center justify-center shrink-0 mt-0.5">
          <BellRing className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-wide opacity-80">
            નોટિફિકેશનમાંથી ખુલ્યું
          </p>
          <p className="text-sm font-extrabold break-words">{heading}</p>
          {detail && <p className="text-xs opacity-90 break-words mt-0.5">{detail}</p>}
        </div>
      </div>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear highlight"
          className="min-h-[36px] min-w-[36px] rounded-xl bg-white/80 dark:bg-black/25 hover:bg-white dark:hover:bg-black/40 flex items-center justify-center shrink-0 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};

/* --- Tab 1: Live Payment Requests --- */
export const AdminRequestsTab: React.FC<{
  payments: PaymentRequest[];
  students: StudentProfile[];
  isBusy: boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  focusedTarget?: AdminFocusedTarget | null;
  onClearFocusedTarget?: () => void;
  onZoomScreenshot: (url: string) => void;
  onApprove: (req: PaymentRequest, adminNote: string, subjectId: string) => void;
  onReject: (req: PaymentRequest, reason: string) => void;
  onGenerateDirectCode: (params: {
    mobileNumber: string;
    userName?: string;
    subjectId: string;
  }) => Promise<DirectMobileCodeResult>;
  onDeleteRequest: (req: PaymentRequest) => void;
  onNotify?: (message: string, isError?: boolean) => void;
}> = ({
  payments,
  students,
  isBusy,
  hasMore,
  isLoadingMore,
  onLoadMore,
  focusedTarget = null,
  onClearFocusedTarget,
  onZoomScreenshot,
  onApprove,
  onReject,
  onGenerateDirectCode,
  onDeleteRequest,
  onNotify,
}) => {
  const { lang, t } = useTranslation();
  const { isLargeScreen } = useAdaptiveDisplay();
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [showQuickCodeGen, setShowQuickCodeGen] = useState(false);

  const focusedRefId = focusedTarget?.referenceId?.trim() ?? '';
  const focusedMobile = focusedTarget?.actorMobile?.replace(/\D/g, '').slice(-10) ?? '';

  const isFocusedPayment = (req: PaymentRequest): boolean => {
    if (!focusedTarget) return false;
    if (focusedRefId && req.id === focusedRefId) return true;
    if (focusedMobile && req.mobileNumber.replace(/\D/g, '').slice(-10) === focusedMobile) return true;
    return false;
  };

  useEffect(() => {
    if (!focusedTarget) return;
    const matched = payments.find(
      (p) =>
        (focusedRefId && p.id === focusedRefId) ||
        (focusedMobile && p.mobileNumber.replace(/\D/g, '').slice(-10) === focusedMobile)
    );
    if (matched) {
      setStatusFilter(matched.status);
    } else if (focusedRefId || focusedMobile) {
      setStatusFilter('all');
    }
  }, [focusedMobile, focusedRefId, focusedTarget, payments]);

  const pendingPayments = useMemo(() => payments.filter((p) => p.status === 'pending'), [payments]);
  const approvedPayments = useMemo(() => payments.filter((p) => p.status === 'approved'), [payments]);
  const rejectedPayments = useMemo(() => payments.filter((p) => p.status === 'rejected'), [payments]);

  const baseList =
    statusFilter === 'pending'
      ? pendingPayments
      : statusFilter === 'approved'
        ? approvedPayments
        : statusFilter === 'rejected'
          ? rejectedPayments
          : payments;

  const list = useMemo(() => {
    if (!focusedTarget) return baseList;
    return [...baseList].sort((a, b) => {
      const aHit = (focusedRefId && a.id === focusedRefId) || (focusedMobile && a.mobileNumber.replace(/\D/g, '').slice(-10) === focusedMobile) ? 1 : 0;
      const bHit = (focusedRefId && b.id === focusedRefId) || (focusedMobile && b.mobileNumber.replace(/\D/g, '').slice(-10) === focusedMobile) ? 1 : 0;
      return bHit - aHit;
    });
  }, [baseList, focusedMobile, focusedRefId, focusedTarget]);

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <FocusedNotificationBanner target={focusedTarget} onClear={onClearFocusedTarget} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'pending' as const, label: `${t.pendingLabel} (${pendingPayments.length})` },
            { id: 'approved' as const, label: `${t.approvedLabel} (${approvedPayments.length})` },
            { id: 'rejected' as const, label: `${t.rejectedLabel} (${rejectedPayments.length})` },
            { id: 'all' as const, label: `${t.allLabel} (${payments.length})` },
          ].map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setStatusFilter(chip.id)}
              className={`min-h-[40px] rounded-xl px-3.5 py-2 text-xs font-bold border transition-colors cursor-pointer ${
                statusFilter === chip.id
                  ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                  : 'bg-white dark:bg-[#1E293B] border-[#CBD5E1] dark:border-[#334155]'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowQuickCodeGen((prev) => !prev)}
          className="min-h-[40px] rounded-xl bg-[#047857] hover:bg-[#065F46] text-white px-3.5 py-2 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
        >
          <KeyRound className="h-3.5 w-3.5" />
          <span>{t.directCodeGenerateBtn} (WhatsApp)</span>
        </button>
      </div>

      {showQuickCodeGen && (
        <DirectMobileCodeCard
          students={students}
          isBusy={isBusy}
          onGenerateDirectCode={onGenerateDirectCode}
          onNotify={onNotify}
        />
      )}

      {list.length === 0 ? (
        <EmptyStateCard message={t.noRequestsFound} />
      ) : (
        <div
          className={`grid grid-cols-1 lg:grid-cols-2 ${isLargeScreen ? '2xl:grid-cols-3' : ''} gap-4`}
        >
          {list.map((req) => (
            <PaymentRequestCard
              key={req.id}
              req={req}
              lang={lang}
              isBusy={isBusy}
              isHighlighted={isFocusedPayment(req)}
              onZoomScreenshot={onZoomScreenshot}
              onApprove={onApprove}
              onReject={onReject}
              onDeleteRequest={onDeleteRequest}
              onNotify={onNotify}
            />
          ))}
        </div>
      )}

      <LoadMoreButton
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={onLoadMore}
      />
    </div>
  );
};

const PaymentRequestCard: React.FC<{
  req: PaymentRequest;
  lang: 'gu' | 'en';
  isBusy: boolean;
  isHighlighted?: boolean;
  onZoomScreenshot: (url: string) => void;
  onApprove: (req: PaymentRequest, adminNote: string, subjectId: string) => void;
  onReject: (req: PaymentRequest, reason: string) => void;
  onDeleteRequest: (req: PaymentRequest) => void;
  onNotify?: (message: string, isError?: boolean) => void;
}> = ({
  req,
  lang,
  isBusy,
  isHighlighted = false,
  onZoomScreenshot,
  onApprove,
  onReject,
  onDeleteRequest,
  onNotify,
}) => {
  const { t } = useTranslation();
  const requestedSubject = resolvePaymentSubjectId(req);
  const [selectedApproveSubject, setSelectedApproveSubject] = useState<string>(requestedSubject);
  const [noteInput, setNoteInput] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  const imageUrl = resolvePaymentImageSrc(req);
  const cleanUtr = displayPaymentTransactionRef(req);

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      onNotify?.(`${t.payUpiCopied}: ${code}`);
    } catch {
      onNotify?.(code);
    }
  };

  return (
    <div
      className={`rounded-2xl bg-white dark:bg-[#1E293B] shadow-sm p-4 space-y-3 transition-all ${
        isHighlighted
          ? 'border-2 border-[#2563EB] dark:border-[#60A5FA] ring-4 ring-[#2563EB]/15'
          : 'border border-[#E2E8F0] dark:border-[#334155]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-base font-extrabold truncate">{req.studentName}</h4>
          <p className="text-xs text-[#475569] dark:text-[#94A3B8] truncate tabular-nums">
            +91 {req.mobileNumber} • {req.id}
          </p>
        </div>
        <div className="flex items-start gap-1.5 shrink-0">
          <div className="flex flex-col items-end gap-1">
            <span
              className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                req.status === 'approved'
                  ? 'bg-[#D1FAE5] text-[#064E3B] dark:bg-[#064E3B] dark:text-[#D1FAE5]'
                  : req.status === 'rejected'
                    ? 'bg-[#FEE2E2] text-[#7F1D1D] dark:bg-[#7F1D1D] dark:text-[#FEE2E2]'
                    : 'bg-[#FEF3C7] text-[#92400E] dark:bg-[#451A03] dark:text-[#FDE68A]'
              }`}
            >
              {req.status === 'approved'
                ? t.statusApproved
                : req.status === 'rejected'
                  ? t.statusRejected
                  : t.statusPending}
            </span>
            <span className="rounded-md bg-[#DBEAFE] dark:bg-[#1E3A5F] text-[#1E3A8A] dark:text-[#DBEAFE] px-2 py-0.5 text-[11px] font-bold">
              {getSubjectDisplayName(requestedSubject, lang)}
            </span>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onDeleteRequest(req)}
            title={t.deleteBtn}
            aria-label={`${t.deleteBtn} ${req.studentName}`}
            className="h-9 w-9 rounded-xl border border-red-200 dark:border-red-900/70 text-red-600 dark:text-red-400 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 cursor-pointer shrink-0"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
        <button
          type="button"
          disabled={!imageUrl}
          onClick={() => imageUrl && onZoomScreenshot(imageUrl)}
          className="sm:col-span-5 relative h-48 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#EFF4FA] dark:bg-[#0F172A] overflow-hidden flex items-center justify-center cursor-pointer disabled:cursor-default"
        >
          {imageUrl ? (
            <>
              <img src={imageUrl} alt={t.zoomModalTitle} className="max-h-full max-w-full object-contain" />
              <span className="absolute bottom-1.5 rounded-full bg-white/95 dark:bg-slate-900/95 px-2.5 py-0.5 text-[10px] font-bold shadow">
                {t.tapToZoom}
              </span>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1 text-slate-400 p-2 text-center">
              <ImageIcon className="h-6 w-6" />
              <span className="text-[11px]">No Screenshot</span>
            </div>
          )}
        </button>

        <div className="sm:col-span-7 space-y-2.5">
          <div className="rounded-xl bg-[#EFF4FA] dark:bg-[#0F172A] p-3 space-y-1 text-xs">
            <DetailRow label={t.fieldAmount.replace(' *', '')} value={`₹${req.amountRupees}`} />
            {cleanUtr && <DetailRow label="UTR / Ref" value={cleanUtr} />}
            <DetailRow label="UPI" value={req.upiId} />
            <DetailRow label={t.createdAtLabel} value={formatTimestampLabel(req.createdAt, lang)} />
          </div>

          {req.status === 'approved' && req.assignedCode && (
            <div className="rounded-xl bg-[#D1FAE5] dark:bg-[#064E3B] p-3 space-y-2 text-[#064E3B] dark:text-[#D1FAE5]">
              <p className="text-[11px] font-bold">{t.generatedCodeLabel}</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-lg font-extrabold tracking-widest font-mono">
                  {req.assignedCode}
                </span>
                <button
                  type="button"
                  onClick={() => void copyCode(req.assignedCode)}
                  className="px-2.5 py-1 rounded-lg bg-white/75 dark:bg-black/30 text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{t.copyCode}</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => launchExternalUrl(buildPaymentApprovalWhatsAppHref(req, lang))}
                className="w-full h-10 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{t.sendOnWhatsAppBtn}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {req.adminNote && (
        <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
          {t.adminNoteLabel} {req.adminNote}
        </p>
      )}

      {req.status === 'pending' && (
        <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap gap-1.5">
            {SUBJECT_LIST.map((subId) => (
              <button
                key={subId}
                type="button"
                onClick={() => setSelectedApproveSubject(subId)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold border transition-colors cursor-pointer ${
                  selectedApproveSubject === subId
                    ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                    : 'bg-[#FAF9F5] dark:bg-[#0F172A] border-[#CBD5E1] dark:border-[#334155]'
                }`}
              >
                {getSubjectDisplayName(subId, lang)}
              </button>
            ))}
          </div>

          <input
            type="text"
            maxLength={150}
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value.slice(0, 150))}
            placeholder={isRejecting ? t.rejectReasonPlaceholder : `${t.adminNoteLabel} (${t.allLabel})`}
            className="w-full h-10 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] px-3 text-xs outline-none"
          />

          {isRejecting ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setIsRejecting(false)}
                className="flex-1 h-11 rounded-xl border border-[#CBD5E1] dark:border-[#334155] text-xs font-bold cursor-pointer"
              >
                {t.cancelBtn}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onReject(req, noteInput)}
                className="flex-[1.5] h-11 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-extrabold cursor-pointer"
              >
                {t.confirmRejectBtn}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setIsRejecting(true)}
                className="flex-1 h-11 rounded-xl border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-bold flex items-center justify-center gap-1 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
              >
                <X className="h-4 w-4" />
                <span>{t.rejectBtn}</span>
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onApprove(req, noteInput, selectedApproveSubject)}
                className="flex-[1.6] h-11 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Check className="h-4 w-4" />
                <span>{t.approveAndGenerateBtn}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* --- Tab 2: Permanent All Codes Tab (Batch Folders + PDF + 1-Click Delete Unused) --- */
const BULK_COUNT_PRESETS = [50, 100, 200, 400, 500, 1000] as const;
const INITIAL_VISIBLE_CODES = 60;

export const AdminAllCodesTab: React.FC<{
  accessCodes: AccessCode[];
  students: StudentProfile[];
  lastGeneratedBatch: string[];
  isBusy: boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onGenerateBulkCodes: (
    count: number,
    batchName: string,
    subjectId: string
  ) => Promise<{ batchName: string; codes: string[] } | null> | void;
  onGenerateDirectCode: (params: {
    mobileNumber: string;
    userName?: string;
    subjectId: string;
  }) => Promise<DirectMobileCodeResult>;
  onDeleteCode: (item: AccessCode) => void;
  onDeleteUnusedCodes?: (batchName?: string) => Promise<number>;
  onFetchBatchCodes?: (batchName: string) => Promise<AccessCode[]>;
  onNotify?: (message: string, isError?: boolean) => void;
}> = ({
  accessCodes,
  students,
  lastGeneratedBatch,
  isBusy,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onGenerateBulkCodes,
  onGenerateDirectCode,
  onDeleteCode,
  onDeleteUnusedCodes,
  onFetchBatchCodes,
  onNotify,
}) => {
  const { lang, t } = useTranslation();
  const { isLargeScreen } = useAdaptiveDisplay();

  const [viewMode, setViewMode] = useState<'folders' | 'all'>('folders');
  const [selectedFolderKey, setSelectedFolderKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unused' | 'used'>('all');
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_VISIBLE_CODES);

  const [showGenerator, setShowGenerator] = useState(false);
  const [genSubjectId, setGenSubjectId] = useState('all');
  const [countInputText, setCountInputText] = useState('400');
  const [batchName, setBatchName] = useState('Batch 1');
  const [hasCustomBatchName, setHasCustomBatchName] = useState(false);

  const [justCreatedBatch, setJustCreatedBatch] = useState<{
    batchName: string;
    count: number;
  } | null>(null);
  const [exportingPdfKey, setExportingPdfKey] = useState<string | null>(null);
  const [loadingFolderKey, setLoadingFolderKey] = useState<string | null>(null);
  const [pendingDeleteUnused, setPendingDeleteUnused] = useState<{
    batchKey?: string;
    label: string;
    unusedCount: number;
  } | null>(null);
  const [isDeletingUnused, setIsDeletingUnused] = useState(false);

  const batchFolders = useMemo(
    () => groupAccessCodesIntoBatchFolders(accessCodes, lang),
    [accessCodes, lang]
  );

  const suggestedNextBatch = useMemo(() => suggestNextBatchName(batchFolders), [batchFolders]);

  useEffect(() => {
    if (!hasCustomBatchName) {
      setBatchName(suggestedNextBatch);
    }
  }, [suggestedNextBatch, hasCustomBatchName]);

  const activeFolder: CodeBatchFolder | null = useMemo(() => {
    if (!selectedFolderKey) return null;
    return batchFolders.find((f) => f.folderKey === selectedFolderKey) ?? null;
  }, [batchFolders, selectedFolderKey]);

  // If an opened folder becomes empty (e.g., all unused codes deleted), return to folder list gracefully
  useEffect(() => {
    if (selectedFolderKey && !activeFolder) {
      setSelectedFolderKey(null);
    }
  }, [selectedFolderKey, activeFolder]);

  // Reset rendered card window when changing filters or folder
  useEffect(() => {
    setVisibleLimit(INITIAL_VISIBLE_CODES);
  }, [selectedFolderKey, viewMode, searchQuery, statusFilter]);

  const scopedCodes = useMemo(() => {
    if (viewMode === 'folders' && activeFolder) {
      return activeFolder.codes;
    }
    return accessCodes;
  }, [viewMode, activeFolder, accessCodes]);

  const filteredCodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scopedCodes.filter((item) => {
      const isUsed = isAccessCodeUsed(item);
      const matchesStatus =
        statusFilter === 'unused' ? !isUsed : statusFilter === 'used' ? isUsed : true;
      if (!matchesStatus) return false;
      if (!q) return true;
      return (
        item.code.toLowerCase().includes(q) ||
        item.batchName.toLowerCase().includes(q) ||
        item.userName.toLowerCase().includes(q) ||
        item.mobileNumber.includes(q) ||
        item.requestId.toLowerCase().includes(q) ||
        item.usedByName.toLowerCase().includes(q) ||
        item.usedByMobile.includes(q)
      );
    });
  }, [scopedCodes, searchQuery, statusFilter]);

  const totalUnusedCount = useMemo(
    () => accessCodes.filter((c) => !isAccessCodeUsed(c)).length,
    [accessCodes]
  );
  const totalUsedCount = accessCodes.length - totalUnusedCount;

  const scopedUnusedCount = useMemo(
    () => scopedCodes.filter((c) => !isAccessCodeUsed(c)).length,
    [scopedCodes]
  );
  const scopedUsedCount = scopedCodes.length - scopedUnusedCount;

  const copyText = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotify?.(msg);
    } catch {
      onNotify?.(text);
    }
  };

  const openBatchFolder = async (folder: CodeBatchFolder) => {
    setViewMode('folders');
    setSelectedFolderKey(folder.folderKey);
    setSearchQuery('');
    setStatusFilter('all');
    if (!folder.isDirectOrUntagged && onFetchBatchCodes) {
      setLoadingFolderKey(folder.folderKey);
      try {
        await onFetchBatchCodes(folder.folderKey);
      } finally {
        setLoadingFolderKey(null);
      }
    }
  };

  const handleDownloadBatchPdf = async (
    folder: CodeBatchFolder,
    onlyUnused = false
  ) => {
    const pdfKey = `${folder.folderKey}_${onlyUnused ? 'unused' : 'all'}`;
    setExportingPdfKey(pdfKey);
    try {
      let sourceCodes = folder.codes;
      if (!folder.isDirectOrUntagged && onFetchBatchCodes) {
        const fetched = await onFetchBatchCodes(folder.folderKey);
        if (fetched.length > sourceCodes.length) {
          sourceCodes = fetched;
        }
      }
      const targetCodes = onlyUnused
        ? sourceCodes.filter((c) => !isAccessCodeUsed(c))
        : sourceCodes;

      if (targetCodes.length === 0) {
        onNotify?.(
          lang === 'en'
            ? 'No codes available in this batch for PDF.'
            : 'આ બેચમાં PDF માટે કોઈ કોડ ઉપલબ્ધ નથી.',
          true
        );
        return;
      }

      const { exportAccessCodesA4Pdf } = await import('../services/pdfGenerator');
      const subtitle = onlyUnused ? `${folder.displayName} Unused` : folder.displayName;
      exportAccessCodesA4Pdf(targetCodes, subtitle);
      onNotify?.(
        lang === 'en'
          ? `PDF ready for "${folder.displayName}" (${targetCodes.length} codes)`
          : `"${folder.displayName}" ની PDF તૈયાર છે (${targetCodes.length} કોડ)`
      );
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'PDF error', true);
    } finally {
      setExportingPdfKey(null);
    }
  };

  const handleBulkGenerateSubmit = async () => {
    const parsedCount = Number.parseInt(countInputText, 10) || 10;
    const effectiveCount = Math.max(1, parsedCount);
    const effectiveBatch = (batchName.trim() || suggestedNextBatch).slice(0, 60);
    const result = await onGenerateBulkCodes(effectiveCount, effectiveBatch, genSubjectId);
    if (result && result.codes.length > 0) {
      setViewMode('folders');
      setSelectedFolderKey(result.batchName);
      setSearchQuery('');
      setStatusFilter('all');
      setShowGenerator(false);
      setHasCustomBatchName(false);
      setJustCreatedBatch({ batchName: result.batchName, count: result.codes.length });
    }
  };

  const handleConfirmDeleteUnused = async () => {
    if (!pendingDeleteUnused || !onDeleteUnusedCodes) return;
    setIsDeletingUnused(true);
    try {
      await onDeleteUnusedCodes(pendingDeleteUnused.batchKey);
      setPendingDeleteUnused(null);
    } finally {
      setIsDeletingUnused(false);
    }
  };

  const visibleCodes = useMemo(
    () => filteredCodes.slice(0, visibleLimit),
    [filteredCodes, visibleLimit]
  );

  return (
    <div
      className={`p-3 sm:p-4 space-y-4 ${isLargeScreen ? 'max-w-[1600px]' : 'max-w-5xl'} mx-auto`}
    >
      <DirectMobileCodeCard
        students={students}
        isBusy={isBusy}
        onGenerateDirectCode={onGenerateDirectCode}
        onNotify={onNotify}
      />

      {/* Bulk Generate + 1-Click Delete Unused Header Bar */}
      <div className="rounded-2xl bg-[#DBEAFE] dark:bg-[#1E3A5F] p-3.5 flex flex-wrap items-center justify-between gap-2.5 text-[#1E3A8A] dark:text-[#DBEAFE]">
        <div className="flex items-center gap-2 text-xs font-bold">
          <ShieldCheck className="h-4.5 w-4.5 shrink-0" />
          <span>{t.permanentCodesNote}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onDeleteUnusedCodes && (
            <button
              type="button"
              data-testid="delete_all_unused_codes_btn"
              disabled={isBusy || isDeletingUnused || totalUnusedCount === 0}
              onClick={() =>
                setPendingDeleteUnused({
                  batchKey: undefined,
                  label:
                    lang === 'en' ? 'All Batch Folders' : 'બધા બેચ ફોલ્ડર્સ',
                  unusedCount: totalUnusedCount,
                })
              }
              className="min-h-[40px] rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white px-3 py-1.5 text-xs font-extrabold flex items-center gap-1.5 disabled:opacity-45 cursor-pointer transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>
                {lang === 'en'
                  ? `Delete All Unused (${totalUnusedCount})`
                  : `બધા ન વપરાયેલા ડિલીટ (${totalUnusedCount})`}
              </span>
            </button>
          )}
          <button
            type="button"
            data-testid="toggle_bulk_generate_btn"
            onClick={() => setShowGenerator((prev) => !prev)}
            className="min-h-[40px] rounded-xl bg-[#1E3A8A] hover:bg-[#172554] text-white px-3.5 py-1.5 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span>{lang === 'en' ? 'Bulk Generate' : 'બલ્ક કોડ જનરેટ'}</span>
          </button>
        </div>
      </div>

      {/* Bulk Code Generator Panel */}
      {showGenerator && (
        <div
          data-testid="bulk_code_generator_panel"
          className="rounded-2xl bg-white dark:bg-[#1E293B] border-2 border-[#1E3A8A]/25 dark:border-[#3B82F6]/35 p-4 space-y-3.5 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Folder className="h-4.5 w-4.5 text-[#1E3A8A] dark:text-[#93C5FD]" />
              <h3 className="text-sm font-extrabold text-[#0F172A] dark:text-[#F8FAFC]">
                {lang === 'en'
                  ? 'Generate New Code Batch Folder'
                  : 'નવું બેચ ફોલ્ડર બનાવો (Bulk Generate)'}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowGenerator(false)}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Subject Pills */}
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-[#475569] dark:text-[#94A3B8]">
              {lang === 'en' ? 'Select Subject Scope' : 'વિષય પસંદ કરો'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUBJECT_LIST.map((subId) => (
                <button
                  key={subId}
                  type="button"
                  onClick={() => setGenSubjectId(subId)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold border cursor-pointer transition-colors ${
                    genSubjectId === subId
                      ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                      : 'bg-[#FAF9F5] dark:bg-[#0F172A] border-[#CBD5E1] dark:border-[#334155]'
                  }`}
                >
                  {getSubjectDisplayName(subId, lang)} ({getDefaultPrefix(subId)})
                </button>
              ))}
            </div>
            <p className="text-[11px] font-bold text-[#1E3A8A] dark:text-[#93C5FD] font-mono">
              {lang === 'en'
                ? `Code format: ${getDefaultPrefix(genSubjectId)} + 5 random chars (e.g. ${getDefaultPrefix(genSubjectId)}XXXXX)`
                : `કોડ ફોર્મેટ: ${getDefaultPrefix(genSubjectId)} + 5 રેન્ડમ અક્ષર (દા.ત. ${getDefaultPrefix(genSubjectId)}XXXXX)`}
            </p>
          </div>

          {/* Quick Count Presets */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-[#475569] dark:text-[#94A3B8]">
              {lang === 'en' ? 'Quick Count (Unlimited)' : 'કેટલા કોડ બનાવવા? (અમર્યાદિત)'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {BULK_COUNT_PRESETS.map((preset) => {
                const active = Number.parseInt(countInputText, 10) === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCountInputText(String(preset))}
                    className={`rounded-lg px-3 py-1.5 text-xs font-extrabold border cursor-pointer transition-colors ${
                      active
                        ? 'bg-[#047857] text-white border-[#047857]'
                        : 'bg-[#FAF9F5] dark:bg-[#0F172A] border-[#CBD5E1] dark:border-[#334155]'
                    }`}
                  >
                    {preset} {lang === 'en' ? 'Codes' : 'કોડ'}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-[#475569] dark:text-[#94A3B8]">
                {lang === 'en' ? 'Number of Codes (Unlimited)' : 'કોડની સંખ્યા (અમર્યાદિત)'}
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={5}
                data-testid="bulk_count_input"
                value={countInputText}
                onChange={(e) => setCountInputText(e.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="400"
                className="w-full h-11 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] px-3 text-sm font-extrabold outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-[#475569] dark:text-[#94A3B8]">
                {lang === 'en' ? 'Batch Folder Name (e.g. Batch 1)' : 'બેચ ફોલ્ડરનું નામ (દા.ત. Batch 1)'}
              </label>
              <input
                type="text"
                maxLength={60}
                data-testid="bulk_batch_name_input"
                value={batchName}
                onChange={(e) => {
                  setHasCustomBatchName(true);
                  setBatchName(e.target.value);
                }}
                placeholder="Batch 1"
                className="w-full h-11 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] px-3 text-sm font-bold outline-none"
              />
            </div>
          </div>

          <button
            type="button"
            data-testid="bulk_generate_submit_btn"
            disabled={isBusy}
            onClick={() => void handleBulkGenerateSubmit()}
            className="w-full min-h-[46px] rounded-xl bg-[#1E3A8A] hover:bg-[#172554] text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer transition-colors"
          >
            {isBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlusCircle className="h-4 w-4" />
            )}
            <span>
              {isBusy
                ? lang === 'en'
                  ? `Generating ${Math.max(1, Number.parseInt(countInputText, 10) || 10)} Codes... Please wait`
                  : `${Math.max(1, Number.parseInt(countInputText, 10) || 10)} કોડ બની રહ્યા છે... રાહ જુઓ`
                : lang === 'en'
                  ? `Generate ${Math.max(1, Number.parseInt(countInputText, 10) || 10)} Codes into "${batchName.trim() || suggestedNextBatch}"`
                  : `"${batchName.trim() || suggestedNextBatch}" ફોલ્ડરમાં ${Math.max(1, Number.parseInt(countInputText, 10) || 10)} નવા કોડ બનાવો`}
            </span>
          </button>

          {lastGeneratedBatch.length > 0 && (
            <button
              type="button"
              onClick={() =>
                void copyText(lastGeneratedBatch.join('\n'), `Copied ${lastGeneratedBatch.length} codes`)
              }
              className="w-full h-10 rounded-xl border border-[#1E3A8A] text-[#1E3A8A] dark:text-[#93C5FD] text-xs font-bold cursor-pointer"
            >
              {lang === 'en'
                ? `Copy Last Generated (${lastGeneratedBatch.length})`
                : `છેલ્લે બનાવેલા કોડ કોપી કરો (${lastGeneratedBatch.length})`}
            </button>
          )}
        </div>
      )}

      {/* Just-Generated Quick PDF Banner */}
      {justCreatedBatch && activeFolder && activeFolder.folderKey === justCreatedBatch.batchName && (
        <div
          data-testid="just_created_batch_banner"
          className="rounded-2xl bg-[#ECFDF5] dark:bg-[#064E3B]/45 border border-[#10B981]/50 p-3.5 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="space-y-0.5">
            <p className="text-xs sm:text-sm font-extrabold text-[#065F46] dark:text-[#A7F3D0]">
              {lang === 'en'
                ? `Folder "${justCreatedBatch.batchName}" ready with ${justCreatedBatch.count} codes!`
                : `"${justCreatedBatch.batchName}" ફોલ્ડરમાં ${justCreatedBatch.count} નવા કોડ તૈયાર થઈ ગયા!`}
            </p>
            <p className="text-[11px] font-semibold text-[#047857] dark:text-[#6EE7B7]">
              {lang === 'en'
                ? 'Tap below to download the printable A4 PDF for this batch.'
                : 'નીચે ક્લિક કરીને આ બેચની પ્રિન્ટ-રેડી A4 PDF ડાઉનલોડ કરો.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={exportingPdfKey !== null}
              onClick={() => void handleDownloadBatchPdf(activeFolder, false)}
              className="min-h-[42px] px-4 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {exportingPdfKey === `${activeFolder.folderKey}_all` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span>
                {lang === 'en'
                  ? `Download Batch PDF (${activeFolder.totalCount})`
                  : `બેચ PDF ડાઉનલોડ (${activeFolder.totalCount})`}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setJustCreatedBatch(null)}
              className="p-2 rounded-lg text-[#065F46] dark:text-[#A7F3D0] hover:bg-emerald-200/40 cursor-pointer"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* View Mode Tabs: Batch Folders vs All Codes */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] p-1 gap-1">
          <button
            type="button"
            data-testid="codes_view_folders_btn"
            onClick={() => {
              setViewMode('folders');
              setSelectedFolderKey(null);
            }}
            className={`min-h-[38px] px-3.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors ${
              viewMode === 'folders'
                ? 'bg-[#1E3A8A] text-white shadow-sm'
                : 'text-[#334155] dark:text-[#CBD5E1] hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Folder className="h-3.5 w-3.5" />
            <span>
              {lang === 'en'
                ? `Batch Folders (${batchFolders.length})`
                : `બેચ ફોલ્ડર્સ (${batchFolders.length})`}
            </span>
          </button>
          <button
            type="button"
            data-testid="codes_view_all_btn"
            onClick={() => {
              setViewMode('all');
              setSelectedFolderKey(null);
            }}
            className={`min-h-[38px] px-3.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors ${
              viewMode === 'all'
                ? 'bg-[#1E3A8A] text-white shadow-sm'
                : 'text-[#334155] dark:text-[#CBD5E1] hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>
              {lang === 'en'
                ? `All Codes (${accessCodes.length})`
                : `બધા કોડ (${accessCodes.length})`}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-bold text-[#475569] dark:text-[#94A3B8]">
          <span className="rounded-lg bg-[#D1FAE5] dark:bg-[#064E3B] text-[#065F46] dark:text-[#A7F3D0] px-2.5 py-1">
            {lang === 'en' ? `Unused: ${totalUnusedCount}` : `બાકી: ${totalUnusedCount}`}
          </span>
          <span className="rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-2.5 py-1">
            {lang === 'en' ? `Used: ${totalUsedCount}` : `વપરાયેલા: ${totalUsedCount}`}
          </span>
        </div>
      </div>

      {/* MODE A: BATCH FOLDERS GRID */}
      {viewMode === 'folders' && !activeFolder && (
        <div className="space-y-3" data-testid="batch_folders_grid">
          {batchFolders.length === 0 ? (
            <EmptyStateCard message={t.noCodesFound} />
          ) : (
            <div
              className={`grid grid-cols-1 md:grid-cols-2 ${isLargeScreen ? '2xl:grid-cols-3' : ''} gap-3.5`}
            >
              {batchFolders.map((folder) => {
                const isExportingThis =
                  exportingPdfKey === `${folder.folderKey}_all` ||
                  exportingPdfKey === `${folder.folderKey}_unused`;
                const isLoadingThis = loadingFolderKey === folder.folderKey;
                return (
                  <div
                    key={folder.folderKey}
                    data-testid={`batch_folder_card_${folder.folderKey}`}
                    className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-4 shadow-sm hover:border-[#1E3A8A]/45 dark:hover:border-[#60A5FA]/45 transition-colors flex flex-col justify-between gap-3.5"
                  >
                    <button
                      type="button"
                      onClick={() => void openBatchFolder(folder)}
                      className="text-left space-y-2.5 cursor-pointer group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
                              folder.isDirectOrUntagged
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                : 'bg-[#DBEAFE] dark:bg-[#1E3A5F] text-[#1E3A8A] dark:text-[#93C5FD]'
                            }`}
                          >
                            <Folder className="h-5.5 w-5.5" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-sm sm:text-base font-extrabold text-[#0F172A] dark:text-[#F8FAFC] truncate group-hover:text-[#1E3A8A] dark:group-hover:text-[#93C5FD]">
                              {folder.displayName}
                            </h4>
                            <span className="inline-block mt-0.5 rounded-md bg-[#DBEAFE] dark:bg-[#1E3A5F] text-[#1E3A8A] dark:text-[#DBEAFE] px-2 py-0.5 text-[10px] font-bold">
                              {getSubjectDisplayName(folder.subjectId, lang)}
                            </span>
                          </div>
                        </div>
                        <span className="rounded-xl bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-extrabold tabular-nums shrink-0">
                          {folder.totalCount} {lang === 'en' ? 'Codes' : 'કોડ'}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#0F172A] py-1.5 px-2">
                          <p className="text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8]">
                            {lang === 'en' ? 'Total' : 'કુલ'}
                          </p>
                          <p className="text-sm font-extrabold tabular-nums">{folder.totalCount}</p>
                        </div>
                        <div className="rounded-xl bg-[#ECFDF5] dark:bg-[#064E3B]/40 py-1.5 px-2">
                          <p className="text-[10px] font-bold text-[#047857] dark:text-[#6EE7B7]">
                            {lang === 'en' ? 'Unused' : 'બાકી'}
                          </p>
                          <p className="text-sm font-extrabold tabular-nums text-[#047857] dark:text-[#6EE7B7]">
                            {folder.unusedCount}
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-100 dark:bg-slate-800/80 py-1.5 px-2">
                          <p className="text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8]">
                            {lang === 'en' ? 'Used' : 'વપરાયેલા'}
                          </p>
                          <p className="text-sm font-extrabold tabular-nums">{folder.usedCount}</p>
                        </div>
                      </div>
                    </button>

                    {/* Folder Card Action Buttons */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        disabled={isLoadingThis}
                        onClick={() => void openBatchFolder(folder)}
                        className="flex-1 min-h-[42px] px-3 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        {isLoadingThis ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FolderOpen className="h-3.5 w-3.5" />
                        )}
                        <span>{lang === 'en' ? 'Open' : 'ખોલો'}</span>
                      </button>

                      <button
                        type="button"
                        data-testid={`batch_pdf_btn_${folder.folderKey}`}
                        disabled={isExportingThis || folder.totalCount === 0}
                        onClick={() => void handleDownloadBatchPdf(folder, false)}
                        className="flex-1 min-h-[42px] px-3 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer transition-colors"
                      >
                        {isExportingThis ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FileText className="h-3.5 w-3.5" />
                        )}
                        <span>{lang === 'en' ? 'PDF' : 'PDF ડાઉનલોડ'}</span>
                      </button>

                      {onDeleteUnusedCodes && folder.unusedCount > 0 && (
                        <button
                          type="button"
                          data-testid={`batch_delete_unused_btn_${folder.folderKey}`}
                          disabled={isBusy || isDeletingUnused}
                          onClick={() =>
                            setPendingDeleteUnused({
                              batchKey: folder.folderKey,
                              label: folder.displayName,
                              unusedCount: folder.unusedCount,
                            })
                          }
                          title={
                            lang === 'en'
                              ? `Delete ${folder.unusedCount} unused codes in ${folder.displayName}`
                              : `${folder.displayName} ના ${folder.unusedCount} ન વપરાયેલા કોડ ડિલીટ કરો`
                          }
                          className="min-h-[42px] px-3 rounded-xl border border-red-300 dark:border-red-800 bg-red-50/70 dark:bg-red-950/30 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/60 text-xs font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>
                            {lang === 'en'
                              ? `Unused (${folder.unusedCount})`
                              : `ન વપરાયેલા (${folder.unusedCount})`}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <LoadMoreButton
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={onLoadMore}
          />
        </div>
      )}

      {/* MODE B: INSIDE AN OPENED BATCH FOLDER OR ALL CODES VIEW */}
      {(viewMode === 'all' || activeFolder !== null) && (
        <div className="space-y-3.5">
          {/* Active Batch Folder Header Card */}
          {activeFolder && (
            <div
              data-testid="opened_batch_folder_header"
              className="rounded-2xl bg-white dark:bg-[#1E293B] border-2 border-[#1E3A8A]/25 dark:border-[#60A5FA]/35 p-4 space-y-3 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    data-testid="back_to_batch_folders_btn"
                    onClick={() => {
                      setSelectedFolderKey(null);
                      setSearchQuery('');
                      setStatusFilter('all');
                    }}
                    className="min-h-[40px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>{lang === 'en' ? 'All Folders' : 'બધા ફોલ્ડર્સ'}</span>
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <FolderOpen className="h-4.5 w-4.5 text-[#1E3A8A] dark:text-[#93C5FD] shrink-0" />
                      <h3 className="text-sm sm:text-base font-extrabold truncate">
                        {activeFolder.displayName}
                      </h3>
                    </div>
                    <p className="text-[11px] font-bold text-[#475569] dark:text-[#94A3B8]">
                      {getSubjectDisplayName(activeFolder.subjectId, lang)} •{' '}
                      {lang === 'en'
                        ? `Total ${activeFolder.totalCount} | Unused ${activeFolder.unusedCount} | Used ${activeFolder.usedCount}`
                        : `કુલ ${activeFolder.totalCount} | બાકી ${activeFolder.unusedCount} | વપરાયેલા ${activeFolder.usedCount}`}
                    </p>
                  </div>
                </div>
                {loadingFolderKey === activeFolder.folderKey && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[#1E3A8A] dark:text-[#93C5FD]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>{lang === 'en' ? 'Loading all codes...' : 'બધા કોડ લોડ થાય છે...'}</span>
                  </span>
                )}
              </div>

              {/* Batch Folder Primary Action Buttons */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="opened_folder_pdf_all_btn"
                  disabled={exportingPdfKey !== null || activeFolder.totalCount === 0}
                  onClick={() => void handleDownloadBatchPdf(activeFolder, false)}
                  className="min-h-[42px] px-3.5 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-xs font-extrabold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  {exportingPdfKey === `${activeFolder.folderKey}_all` ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                  <span>
                    {lang === 'en'
                      ? `Download Batch PDF (${activeFolder.totalCount})`
                      : `આ બેચની PDF ડાઉનલોડ (${activeFolder.totalCount})`}
                  </span>
                </button>

                {activeFolder.unusedCount > 0 && activeFolder.usedCount > 0 && (
                  <button
                    type="button"
                    data-testid="opened_folder_pdf_unused_btn"
                    disabled={exportingPdfKey !== null}
                    onClick={() => void handleDownloadBatchPdf(activeFolder, true)}
                    className="min-h-[42px] px-3.5 rounded-xl border border-[#047857] text-[#047857] dark:text-[#6EE7B7] bg-white dark:bg-[#0F172A] text-xs font-extrabold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {exportingPdfKey === `${activeFolder.folderKey}_unused` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    <span>
                      {lang === 'en'
                        ? `PDF Unused Only (${activeFolder.unusedCount})`
                        : `ફક્ત બાકીની PDF (${activeFolder.unusedCount})`}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={activeFolder.totalCount === 0}
                  onClick={() => {
                    exportAccessCodesToCsv(
                      activeFolder.codes,
                      activeFolder.displayName.replace(/[^a-zA-Z0-9_-]+/g, '_')
                    );
                    onNotify?.(`${t.exportCsvBtn} (${activeFolder.totalCount})`);
                  }}
                  className="min-h-[42px] px-3.5 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>{t.exportCsvBtn}</span>
                </button>

                <button
                  type="button"
                  disabled={activeFolder.unusedCount === 0}
                  onClick={() =>
                    void copyText(
                      activeFolder.unusedCodes.map((c) => c.code).join('\n'),
                      lang === 'en'
                        ? `Copied ${activeFolder.unusedCount} unused codes`
                        : `${activeFolder.unusedCount} ન વપરાયેલા કોડ કોપી થઈ ગયા`
                    )
                  }
                  className="min-h-[42px] px-3.5 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Copy className="h-4 w-4" />
                  <span>{lang === 'en' ? 'Copy Unused' : 'બાકી કોપી'}</span>
                </button>

                {onDeleteUnusedCodes && activeFolder.unusedCount > 0 && (
                  <button
                    type="button"
                    data-testid="opened_folder_delete_unused_btn"
                    disabled={isBusy || isDeletingUnused}
                    onClick={() =>
                      setPendingDeleteUnused({
                        batchKey: activeFolder.folderKey,
                        label: activeFolder.displayName,
                        unusedCount: activeFolder.unusedCount,
                      })
                    }
                    className="min-h-[42px] px-3.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-extrabold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>
                      {lang === 'en'
                        ? `Delete Unused in Batch (${activeFolder.unusedCount})`
                        : `આ બેચના ન વપરાયેલા ડિલીટ (${activeFolder.unusedCount})`}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Search + Export Controls (for All Codes view or within opened folder) */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="flex-1 flex items-center rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E293B] px-3.5 h-11">
              <Search className="h-4 w-4 text-slate-400 mr-2 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchCodesPlaceholder}
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>

            {!activeFolder && (
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  disabled={filteredCodes.length === 0}
                  onClick={() => {
                    exportAccessCodesToCsv(filteredCodes, `codes_${statusFilter}`);
                    onNotify?.(`${t.exportCsvBtn} (${filteredCodes.length})`);
                  }}
                  className="h-11 px-3.5 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>{t.exportCsvBtn}</span>
                </button>

                <button
                  type="button"
                  disabled={filteredCodes.length === 0}
                  onClick={async () => {
                    try {
                      const { exportAccessCodesA4Pdf } = await import('../services/pdfGenerator');
                      exportAccessCodesA4Pdf(filteredCodes, `All Codes ${statusFilter}`);
                      onNotify?.(`${t.exportPdfBtn} (${filteredCodes.length})`);
                    } catch (err) {
                      onNotify?.(err instanceof Error ? err.message : 'PDF error', true);
                    }
                  }}
                  className="h-11 px-3.5 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E293B] text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <FileText className="h-4 w-4" />
                  <span>{t.exportPdfBtn}</span>
                </button>
              </div>
            )}
          </div>

          {/* Status Filter Chips */}
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all' as const, label: `${t.filterAll} (${scopedCodes.length})` },
              { id: 'unused' as const, label: `${t.filterUnused} (${scopedUnusedCount})` },
              { id: 'used' as const, label: `${t.filterUsed} (${scopedUsedCount})` },
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setStatusFilter(chip.id)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition-colors cursor-pointer ${
                  statusFilter === chip.id
                    ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                    : 'bg-white dark:bg-[#1E293B] border-[#CBD5E1] dark:border-[#334155]'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {filteredCodes.length === 0 ? (
            <EmptyStateCard message={t.noCodesFound} />
          ) : (
            <>
              <div
                className={`grid grid-cols-1 md:grid-cols-2 ${isLargeScreen ? '2xl:grid-cols-3' : ''} gap-3`}
              >
                {visibleCodes.map((item) => {
                  const isUsed = isAccessCodeUsed(item);
                  const resolvedSub = resolveCodeSubjectId(item.code, item.batchName, item.subjectId);
                  return (
                    <div
                      key={item.code}
                      className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-4 space-y-2 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-base font-extrabold tracking-widest font-mono text-[#1E3A8A] dark:text-[#93C5FD]">
                            {item.code}
                          </p>
                          <p className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                            {formatTimestampLabel(item.createdAt, lang)}
                            {item.amountRupees > 0 ? ` • ₹${item.amountRupees}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                              isUsed
                                ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                                : 'bg-[#D1FAE5] text-[#064E3B] dark:bg-[#064E3B] dark:text-[#D1FAE5]'
                            }`}
                          >
                            {isUsed ? t.filterUsed : t.filterUnused}
                          </span>
                          <button
                            type="button"
                            onClick={() => void copyText(item.code, `${t.payUpiCopied}: ${item.code}`)}
                            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            aria-label={t.copyCode}
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onDeleteCode(item)}
                            title={t.deleteBtn}
                            aria-label={`${t.deleteBtn} ${item.code}`}
                            className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        <span className="rounded-md bg-[#DBEAFE] dark:bg-[#1E3A5F] text-[#1E3A8A] dark:text-[#DBEAFE] px-2 py-0.5 font-bold">
                          {getSubjectDisplayName(resolvedSub, lang)}
                        </span>
                        {item.batchName && (
                          <span className="rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 px-2 py-0.5 font-bold inline-flex items-center gap-1">
                            <Folder className="h-3 w-3" />
                            <span>{item.batchName}</span>
                          </span>
                        )}
                        {item.requestId && (
                          <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono">
                            {item.requestId}
                          </span>
                        )}
                      </div>

                      {item.userName && (
                        <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                          {t.buyerHeader}: <span className="font-bold">{item.userName}</span> (+91{' '}
                          {item.mobileNumber})
                        </p>
                      )}

                      {!isUsed &&
                        /^[0-9]{10}$/.test(item.mobileNumber.replace(/\D/g, '').slice(-10)) && (
                          <button
                            type="button"
                            onClick={() =>
                              launchExternalUrl(
                                buildDirectCodeWhatsAppHref(
                                  {
                                    code: item.code,
                                    mobileNumber: item.mobileNumber,
                                    userName: item.userName,
                                    subjectId: resolvedSub,
                                    amountRupees: item.amountRupees || getFixedPlanPrice(resolvedSub),
                                  },
                                  lang
                                )
                              )
                            }
                            className="w-full h-10 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Send className="h-3.5 w-3.5" />
                            <span>
                              {t.directCodeSendWhatsAppBtn} (+91{' '}
                              {item.mobileNumber.replace(/\D/g, '').slice(-10)})
                            </span>
                          </button>
                        )}

                      {isUsed && (
                        <div className="rounded-xl bg-[#EFF4FA] dark:bg-[#0F172A] p-2.5 text-xs space-y-0.5">
                          <p className="font-bold text-[#047857] dark:text-[#6EE7B7]">
                            {t.usedByHeader}: {item.usedBy?.name || item.usedByName} (+91{' '}
                            {item.usedBy?.mobile || item.usedByMobile})
                          </p>
                          <p className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                            {t.usedAtLabel}{' '}
                            {formatTimestampLabel(item.usedAt ?? item.updatedAt, lang)}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {visibleLimit < filteredCodes.length && (
                <div className="flex justify-center pt-1">
                  <button
                    type="button"
                    onClick={() => setVisibleLimit((prev) => prev + 100)}
                    className="min-h-[44px] px-5 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E293B] text-xs font-extrabold text-[#1E3A8A] dark:text-[#93C5FD] cursor-pointer"
                  >
                    {lang === 'en'
                      ? `Show More Codes (${visibleCodes.length} / ${filteredCodes.length})`
                      : `વધુ કોડ બતાવો (${visibleCodes.length} / ${filteredCodes.length})`}
                  </button>
                </div>
              )}
            </>
          )}

          {!activeFolder && (
            <LoadMoreButton
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              onLoadMore={onLoadMore}
            />
          )}
        </div>
      )}

      {/* 1-Click Delete Unused Codes Confirmation Modal */}
      {pendingDeleteUnused && (
        <div
          data-testid="confirm_delete_unused_modal"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-[#0F172A] dark:text-[#F8FAFC]">
                  {lang === 'en'
                    ? 'Delete All Unused Codes?'
                    : 'બધા ન વપરાયેલા કોડ ડિલીટ કરવા છે?'}
                </h3>
                <p className="text-xs font-semibold text-[#475569] dark:text-[#CBD5E1]">
                  {lang === 'en'
                    ? `Target: "${pendingDeleteUnused.label}" — ${pendingDeleteUnused.unusedCount} unused codes will be permanently deleted.`
                    : `ફોલ્ડર: "${pendingDeleteUnused.label}" ના કુલ ${pendingDeleteUnused.unusedCount} ન વપરાયેલા કોડ કાયમ માટે ડિલીટ થઈ જશે.`}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-[#ECFDF5] dark:bg-[#064E3B]/45 border border-[#10B981]/40 p-3 text-xs font-bold text-[#065F46] dark:text-[#A7F3D0]">
              {lang === 'en'
                ? 'Used codes are 100% safe and will NOT be deleted.'
                : 'વપરાયેલા કોડ (Used Codes) ૧૦૦% સુરક્ષિત રહેશે — ફક્ત ન વપરાયેલા કોડ જ ડિલીટ થશે.'}
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                disabled={isDeletingUnused}
                onClick={() => setPendingDeleteUnused(null)}
                className="flex-1 min-h-[44px] rounded-xl border border-[#CBD5E1] dark:border-[#334155] text-xs font-extrabold cursor-pointer disabled:opacity-50"
              >
                {t.cancelBtn}
              </button>
              <button
                type="button"
                data-testid="confirm_delete_unused_submit_btn"
                disabled={isDeletingUnused}
                onClick={() => void handleConfirmDeleteUnused()}
                className="flex-[1.5] min-h-[44px] rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {isDeletingUnused ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                <span>
                  {isDeletingUnused
                    ? lang === 'en'
                      ? 'Deleting...'
                      : 'ડિલીટ થઈ રહ્યું છે...'
                    : lang === 'en'
                      ? `Yes, Delete (${pendingDeleteUnused.unusedCount})`
                      : `હા, ડિલીટ કરો (${pendingDeleteUnused.unusedCount})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* --- Tab 3: Used Codes Live Audit Tab --- */
export const AdminUsedCodesTab: React.FC<{
  accessCodes: AccessCode[];
  isBusy: boolean;
  focusedTarget?: AdminFocusedTarget | null;
  onClearFocusedTarget?: () => void;
  onDeleteCode: (item: AccessCode) => void;
}> = ({ accessCodes, isBusy, focusedTarget = null, onClearFocusedTarget, onDeleteCode }) => {
  const { lang, t } = useTranslation();
  const { isLargeScreen } = useAdaptiveDisplay();

  const focusedCodeRef = focusedTarget?.referenceId?.trim().toUpperCase() ?? '';

  const usedCodes = useMemo(() => {
    return accessCodes
      .filter((c) => c.status === 'used' || c.isUsed)
      .sort((a, b) => {
        if (focusedCodeRef) {
          const aHit = a.code.toUpperCase() === focusedCodeRef || a.id.toUpperCase() === focusedCodeRef ? 1 : 0;
          const bHit = b.code.toUpperCase() === focusedCodeRef || b.id.toUpperCase() === focusedCodeRef ? 1 : 0;
          if (aHit !== bHit) return bHit - aHit;
        }
        const aSec = (a.usedAt ?? a.updatedAt)?.seconds ?? 0;
        const bSec = (b.usedAt ?? b.updatedAt)?.seconds ?? 0;
        return bSec - aSec;
      });
  }, [accessCodes, focusedCodeRef]);

  return (
    <div
      className={`p-3 sm:p-4 space-y-4 ${isLargeScreen ? 'max-w-[1600px]' : 'max-w-5xl'} mx-auto`}
    >
      <FocusedNotificationBanner target={focusedTarget} onClear={onClearFocusedTarget} />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-[#047857] dark:text-[#6EE7B7]" />
          <h2 className="text-base font-extrabold">
            {t.tabUsedCodes} ({usedCodes.length})
          </h2>
        </div>
        {usedCodes.length > 0 && (
          <button
            type="button"
            onClick={() => exportAccessCodesToCsv(usedCodes, 'used_codes_audit')}
            className="h-9 px-3 rounded-xl bg-[#047857] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{t.exportCsvBtn}</span>
          </button>
        )}
      </div>

      {usedCodes.length === 0 ? (
        <EmptyStateCard message={t.noUsedCodesYet} />
      ) : (
        <div
          className={`grid grid-cols-1 md:grid-cols-2 ${isLargeScreen ? '2xl:grid-cols-3' : ''} gap-3.5`}
        >
          {usedCodes.map((item) => {
            const resolvedSub = resolveCodeSubjectId(item.code, item.batchName, item.subjectId);
            const usedName = item.usedBy?.name || item.usedByName || '-';
            const usedMobile = item.usedBy?.mobile || item.usedByMobile || '-';
            const device = item.usedBy?.deviceInfo || 'Web Browser';
            const isHighlighted =
              Boolean(focusedCodeRef) &&
              (item.code.toUpperCase() === focusedCodeRef ||
                item.id.toUpperCase() === focusedCodeRef);

            return (
              <div
                key={item.code}
                className={`rounded-2xl bg-white dark:bg-[#1E293B] p-4 space-y-3 shadow-sm transition-all ${
                  isHighlighted
                    ? 'border-2 border-[#2563EB] dark:border-[#60A5FA] ring-4 ring-[#2563EB]/15'
                    : 'border border-[#E2E8F0] dark:border-[#334155]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-base font-extrabold tracking-widest font-mono text-[#1E3A8A] dark:text-[#93C5FD]">
                    {item.code}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-md bg-[#DBEAFE] dark:bg-[#1E3A5F] text-[#1E3A8A] dark:text-[#DBEAFE] px-2 py-0.5 text-[11px] font-bold">
                      {getSubjectDisplayName(resolvedSub, lang)}
                    </span>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onDeleteCode(item)}
                      title={t.deleteBtn}
                      aria-label={`${t.deleteBtn} ${item.code}`}
                      className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="rounded-xl bg-[#D1FAE5]/60 dark:bg-[#064E3B]/50 p-3 space-y-1 text-xs">
                  <p className="font-extrabold text-[#064E3B] dark:text-[#D1FAE5] flex items-center gap-1.5">
                    <Smartphone className="h-3.5 w-3.5" />
                    <span>
                      {usedName} (+91 {usedMobile})
                    </span>
                  </p>
                  <p className="text-[11px] text-[#065F46] dark:text-[#A7F3D0]">
                    {t.usedAtLabel} {formatTimestampLabel(item.usedAt ?? item.updatedAt, lang)}
                  </p>
                  <p className="text-[11px] text-[#065F46] dark:text-[#A7F3D0] break-words">
                    {t.deviceInfoLabel} {device}
                  </p>
                </div>

                {(item.userName || item.requestId) && (
                  <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] space-y-0.5">
                    {item.userName && (
                      <p>
                        {t.buyerHeader}: {item.userName} (+91 {item.mobileNumber}) • ₹
                        {item.amountRupees}
                      </p>
                    )}
                    {item.requestId && (
                      <p className="font-mono">
                        {t.requestIdLabel} {item.requestId}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* --- Tab 4: Live Students & Subject Access Management --- */
export const AdminStudentsTab: React.FC<{
  students: StudentProfile[];
  isBusy: boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  focusedTarget?: AdminFocusedTarget | null;
  onClearFocusedTarget?: () => void;
  onToggleStudentAccess: (student: StudentProfile, grantAccess: boolean) => void;
  onUpdateStudentSubjectAccess: (
    student: StudentProfile,
    subjectId: SubjectId,
    grantAccess: boolean
  ) => void;
  onDeleteStudent: (student: StudentProfile) => void;
}> = ({
  students,
  isBusy,
  hasMore,
  isLoadingMore,
  onLoadMore,
  focusedTarget = null,
  onClearFocusedTarget,
  onToggleStudentAccess,
  onUpdateStudentSubjectAccess,
  onDeleteStudent,
}) => {
  const { lang, t } = useTranslation();
  const { isLargeScreen } = useAdaptiveDisplay();
  const [searchQuery, setSearchQuery] = useState('');

  const focusedRefId = focusedTarget?.referenceId?.trim() ?? '';
  const focusedMobile = focusedTarget?.actorMobile?.replace(/\D/g, '').slice(-10) ?? '';
  const focusedNameLower = focusedTarget?.actorName?.trim().toLowerCase() ?? '';

  const isFocusedStudent = (st: StudentProfile): boolean => {
    if (!focusedTarget) return false;
    if (focusedRefId && (st.id === focusedRefId || st.userId === focusedRefId)) return true;
    const stMob = st.mobileNumber.replace(/\D/g, '').slice(-10);
    if (focusedMobile && stMob === focusedMobile) return true;
    if (!focusedRefId && !focusedMobile && focusedNameLower && st.fullName.trim().toLowerCase() === focusedNameLower) {
      return true;
    }
    return false;
  };

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = !q
      ? students
      : students.filter(
          (st) =>
            st.fullName.toLowerCase().includes(q) ||
            st.mobileNumber.includes(q) ||
            st.redeemedCode.toLowerCase().includes(q)
        );
    if (!focusedTarget) return base;
    return [...base].sort((a, b) => {
      const aHit =
        (focusedRefId && (a.id === focusedRefId || a.userId === focusedRefId)) ||
        (focusedMobile && a.mobileNumber.replace(/\D/g, '').slice(-10) === focusedMobile)
          ? 1
          : 0;
      const bHit =
        (focusedRefId && (b.id === focusedRefId || b.userId === focusedRefId)) ||
        (focusedMobile && b.mobileNumber.replace(/\D/g, '').slice(-10) === focusedMobile)
          ? 1
          : 0;
      return bHit - aHit;
    });
  }, [students, searchQuery, focusedMobile, focusedRefId, focusedTarget]);

  return (
    <div
      className={`p-3 sm:p-4 space-y-4 ${isLargeScreen ? 'max-w-[1600px]' : 'max-w-5xl'} mx-auto`}
    >
      <FocusedNotificationBanner target={focusedTarget} onClear={onClearFocusedTarget} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-[#1E3A8A] dark:text-[#93C5FD]" />
          <h2 className="text-base font-extrabold">
            {t.tabStudents} ({students.length})
          </h2>
        </div>

        <div className="sm:w-72 flex items-center rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E293B] px-3 h-10">
          <Search className="h-4 w-4 text-slate-400 mr-2 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.searchCodesPlaceholder}
            className="w-full bg-transparent text-xs outline-none"
          />
        </div>
      </div>

      {filteredStudents.length === 0 ? (
        <EmptyStateCard message={t.noStudentsYet} />
      ) : (
        <div
          className={`grid grid-cols-1 md:grid-cols-2 ${isLargeScreen ? '2xl:grid-cols-3' : ''} gap-3.5`}
        >
          {filteredStudents.map((st) => {
            const unlockedSet = new Set<string>(
              st.hasQuizAccess
                ? ALL_SUBJECT_IDS
                : (st.unlockedSubjects ?? []).filter((s) => s !== 'all')
            );
            const hasFull = st.hasQuizAccess || ALL_SUBJECT_IDS.every((s) => unlockedSet.has(s));
            const highlighted = isFocusedStudent(st);
            return (
              <div
                key={st.id || st.userId}
                data-testid={highlighted ? 'focused_student_card' : undefined}
                className={`rounded-2xl bg-white dark:bg-[#1E293B] p-4 space-y-3 shadow-sm transition-all ${
                  highlighted
                    ? 'border-2 border-[#047857] dark:border-[#34D399] ring-4 ring-[#047857]/15'
                    : 'border border-[#E2E8F0] dark:border-[#334155]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="text-sm sm:text-base font-extrabold truncate">{st.fullName}</h4>
                      {highlighted && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#D1FAE5] dark:bg-[#064E3B] text-[#065F46] dark:text-[#6EE7B7] px-2 py-0.5 text-[10px] font-extrabold shrink-0">
                          <BellRing className="h-3 w-3" />
                          <span>{focusedTarget?.category === 'registration' ? 'નવો યુઝર' : 'નોટિફિકેશન'}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8] tabular-nums">
                      +91 {st.mobileNumber} • {formatTimestampLabel(st.updatedAt ?? st.createdAt, lang)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                      hasFull
                        ? 'bg-[#D1FAE5] text-[#064E3B] dark:bg-[#064E3B] dark:text-[#D1FAE5]'
                        : unlockedSet.size > 0
                          ? 'bg-[#DBEAFE] text-[#1E3A8A] dark:bg-[#1E3A5F] dark:text-[#DBEAFE]'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {hasFull
                      ? t.unlockedBadge
                      : unlockedSet.size > 0
                        ? t.partialUnlockedBadge
                        : t.lockedBadge}
                  </span>
                </div>

                <div className="rounded-xl bg-[#EFF4FA] dark:bg-[#0F172A] p-2.5 text-xs flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {t.quizzesTakenLabel} <strong>{st.totalQuizzesTaken}</strong>
                  </span>
                  <span>
                    {t.bestScoreLabel} <strong>{st.bestScorePercent}%</strong>
                  </span>
                  {st.redeemedCode && (
                    <span className="font-mono font-bold text-[#047857] dark:text-[#6EE7B7]">
                      {st.redeemedCode}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {ALL_SUBJECT_IDS.map((subId) => {
                    const active = unlockedSet.has(subId);
                    return (
                      <button
                        key={subId}
                        type="button"
                        disabled={isBusy}
                        onClick={() => onUpdateStudentSubjectAccess(st, subId, !active)}
                        className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold border transition-colors cursor-pointer disabled:opacity-60 ${
                          active
                            ? 'bg-[#047857] text-white border-[#047857]'
                            : 'bg-[#FAF9F5] dark:bg-[#0F172A] border-[#CBD5E1] dark:border-[#334155]'
                        }`}
                      >
                        {active ? '✓ ' : ''}
                        {getSubjectDisplayName(subId, lang)}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onToggleStudentAccess(st, !hasFull)}
                    className={`flex-1 h-11 rounded-xl text-xs font-extrabold transition-colors cursor-pointer disabled:opacity-60 ${
                      hasFull
                        ? 'border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40'
                        : 'bg-[#1E3A8A] hover:bg-[#172554] text-white'
                    }`}
                  >
                    {hasFull ? t.revokeAccessBtn : t.grantAllAccessBtn}
                  </button>
                  {(hasFull || unlockedSet.size > 0) &&
                    /^[0-9]{10}$/.test(st.mobileNumber.replace(/\D/g, '').slice(-10)) && (
                      <button
                        type="button"
                        disabled={isBusy}
                        data-testid={`whatsapp_unlock_student_${st.mobileNumber.replace(/\D/g, '').slice(-10)}`}
                        onClick={() => {
                          const unlockedScope = hasFull
                            ? 'all'
                            : Array.from(unlockedSet)[0] || 'all';
                          launchExternalUrl(
                            buildQuizUnlockWhatsAppHref(
                              {
                                studentName: st.fullName,
                                mobileNumber: st.mobileNumber,
                                unlockedScope,
                              },
                              lang
                            )
                          );
                        }}
                        title={
                          lang === 'en'
                            ? 'Send WhatsApp Unlock Message'
                            : 'WhatsApp માં અનલૉક મેસેજ મોકલો'
                        }
                        aria-label={`Send WhatsApp unlock message to ${st.fullName}`}
                        className="h-11 px-3 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 disabled:opacity-60 cursor-pointer shrink-0"
                      >
                        <Send className="h-4 w-4" />
                        <span>WhatsApp</span>
                      </button>
                    )}
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onDeleteStudent(st)}
                    title={t.deleteBtn}
                    aria-label={`${t.deleteBtn} ${st.fullName}`}
                    className="h-11 w-11 rounded-xl border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-60 cursor-pointer shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <LoadMoreButton
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={onLoadMore}
      />
    </div>
  );
};

export { Wallet };
