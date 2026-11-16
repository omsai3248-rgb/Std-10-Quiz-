import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Image as ImageIcon,
  KeyRound,
  PlusCircle,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  Unlock,
  UserCheck,
  Wallet,
  X,
} from 'lucide-react';
import { useTranslation } from '../i18n/translations';
import type { DirectMobileCodeResult } from '../services/quizRepository';
import {
  ALL_SUBJECT_IDS,
  displayPaymentTransactionRef,
  getFixedPlanPrice,
  getSubjectDisplayName,
  resolveCodeSubjectId,
  resolvePaymentSubjectId,
  type AccessCode,
  type PaymentRequest,
  type StudentProfile,
  type SubjectId,
} from '../types/models';
import {
  buildDirectCodeWhatsAppHref,
  buildPaymentApprovalWhatsAppHref,
  exportAccessCodesToCsv,
  formatTimestampLabel,
  launchExternalUrl,
  normalizeIndianMobileInput,
  resolvePaymentImageSrc,
} from '../utils/imageUtils';

const SUBJECT_LIST = ['all', 'maths', 'science', 'social_science'] as const;

const DirectMobileCodeCard: React.FC<{
  students: StudentProfile[];
  isBusy: boolean;
  onGenerateDirectCode: (params: {
    mobileNumber: string;
    userName?: string;
    subjectId: string;
  }) => Promise<DirectMobileCodeResult>;
  onNotify?: (message: string) => void;
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
      onNotify?.(t.errInvalidMobile);
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

/* --- Tab 1: Live Payment Requests --- */
export const AdminRequestsTab: React.FC<{
  payments: PaymentRequest[];
  students: StudentProfile[];
  isBusy: boolean;
  onZoomScreenshot: (url: string) => void;
  onApprove: (req: PaymentRequest, adminNote: string, subjectId: string) => void;
  onReject: (req: PaymentRequest, reason: string) => void;
  onGenerateDirectCode: (params: {
    mobileNumber: string;
    userName?: string;
    subjectId: string;
  }) => Promise<DirectMobileCodeResult>;
  onDeleteRequest: (req: PaymentRequest) => void;
  onNotify?: (message: string) => void;
}> = ({
  payments,
  students,
  isBusy,
  onZoomScreenshot,
  onApprove,
  onReject,
  onGenerateDirectCode,
  onDeleteRequest,
  onNotify,
}) => {
  const { lang, t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [showQuickCodeGen, setShowQuickCodeGen] = useState(false);

  const pendingPayments = useMemo(() => payments.filter((p) => p.status === 'pending'), [payments]);
  const approvedPayments = useMemo(() => payments.filter((p) => p.status === 'approved'), [payments]);
  const rejectedPayments = useMemo(() => payments.filter((p) => p.status === 'rejected'), [payments]);

  const list =
    statusFilter === 'pending'
      ? pendingPayments
      : statusFilter === 'approved'
        ? approvedPayments
        : statusFilter === 'rejected'
          ? rejectedPayments
          : payments;

  return (
    <div className="p-3 sm:p-4 space-y-4">
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {list.map((req) => (
            <PaymentRequestCard
              key={req.id}
              req={req}
              lang={lang}
              isBusy={isBusy}
              onZoomScreenshot={onZoomScreenshot}
              onApprove={onApprove}
              onReject={onReject}
              onDeleteRequest={onDeleteRequest}
              onNotify={onNotify}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const PaymentRequestCard: React.FC<{
  req: PaymentRequest;
  lang: 'gu' | 'en';
  isBusy: boolean;
  onZoomScreenshot: (url: string) => void;
  onApprove: (req: PaymentRequest, adminNote: string, subjectId: string) => void;
  onReject: (req: PaymentRequest, reason: string) => void;
  onDeleteRequest: (req: PaymentRequest) => void;
  onNotify?: (message: string) => void;
}> = ({ req, lang, isBusy, onZoomScreenshot, onApprove, onReject, onDeleteRequest, onNotify }) => {
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
    <div className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] shadow-sm p-4 space-y-3">
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

/* --- Tab 2: Permanent All Codes Tab --- */
export const AdminAllCodesTab: React.FC<{
  accessCodes: AccessCode[];
  students: StudentProfile[];
  lastGeneratedBatch: string[];
  isBusy: boolean;
  onGenerateBulkCodes: (count: number, batchName: string, subjectId: string) => void;
  onGenerateDirectCode: (params: {
    mobileNumber: string;
    userName?: string;
    subjectId: string;
  }) => Promise<DirectMobileCodeResult>;
  onDeleteCode: (item: AccessCode) => void;
  onNotify?: (message: string) => void;
}> = ({
  accessCodes,
  students,
  lastGeneratedBatch,
  isBusy,
  onGenerateBulkCodes,
  onGenerateDirectCode,
  onDeleteCode,
  onNotify,
}) => {
  const { lang, t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unused' | 'used'>('all');
  const [showGenerator, setShowGenerator] = useState(false);

  const [genSubjectId, setGenSubjectId] = useState('all');
  const [countInputText, setCountInputText] = useState('10');
  const [batchName, setBatchName] = useState('Book Batch 1');

  const filteredCodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return accessCodes.filter((item) => {
      const isUsed = item.status === 'used' || item.isUsed;
      const matchesStatus =
        statusFilter === 'unused' ? !isUsed : statusFilter === 'used' ? isUsed : true;
      if (!matchesStatus) return false;
      if (!q) return true;
      return (
        item.code.toLowerCase().includes(q) ||
        item.userName.toLowerCase().includes(q) ||
        item.mobileNumber.includes(q) ||
        item.requestId.toLowerCase().includes(q) ||
        item.usedByName.toLowerCase().includes(q) ||
        item.usedByMobile.includes(q)
      );
    });
  }, [accessCodes, searchQuery, statusFilter]);

  const unusedCount = useMemo(
    () => accessCodes.filter((c) => c.status !== 'used' && !c.isUsed).length,
    [accessCodes]
  );
  const usedCount = accessCodes.length - unusedCount;

  const copyText = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotify?.(msg);
    } catch {
      onNotify?.(text);
    }
  };

  return (
    <div className="p-3 sm:p-4 space-y-4 max-w-5xl mx-auto">
      <DirectMobileCodeCard
        students={students}
        isBusy={isBusy}
        onGenerateDirectCode={onGenerateDirectCode}
        onNotify={onNotify}
      />

      <div className="rounded-2xl bg-[#DBEAFE] dark:bg-[#1E3A5F] p-3.5 flex flex-wrap items-center justify-between gap-2 text-[#1E3A8A] dark:text-[#DBEAFE]">
        <div className="flex items-center gap-2 text-xs font-bold">
          <ShieldCheck className="h-4.5 w-4.5 shrink-0" />
          <span>{t.permanentCodesNote}</span>
        </div>
        <button
          type="button"
          onClick={() => setShowGenerator((prev) => !prev)}
          className="rounded-xl bg-[#1E3A8A] text-white px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <PlusCircle className="h-3.5 w-3.5" />
          <span>Bulk Generate</span>
        </button>
      </div>

      {showGenerator && (
        <div className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {SUBJECT_LIST.map((subId) => (
              <button
                key={subId}
                type="button"
                onClick={() => setGenSubjectId(subId)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold border cursor-pointer ${
                  genSubjectId === subId
                    ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                    : 'bg-[#FAF9F5] dark:bg-[#0F172A] border-[#CBD5E1] dark:border-[#334155]'
                }`}
              >
                {getSubjectDisplayName(subId, lang)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="text"
              inputMode="numeric"
              maxLength={3}
              value={countInputText}
              onChange={(e) => setCountInputText(e.target.value.replace(/\D/g, '').slice(0, 3))}
              placeholder="Count (1-500)"
              className="h-10 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] px-3 text-sm font-bold outline-none"
            />
            <input
              type="text"
              maxLength={40}
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="Batch Name"
              className="h-10 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] px-3 text-sm outline-none"
            />
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              const cnt = Number.parseInt(countInputText, 10) || 10;
              onGenerateBulkCodes(Math.min(500, Math.max(1, cnt)), batchName, genSubjectId);
            }}
            className="w-full h-10 rounded-xl bg-[#1E3A8A] text-white text-xs font-bold cursor-pointer"
          >
            Generate {Number.parseInt(countInputText, 10) || 10} Permanent 8-Char Codes
          </button>
          {lastGeneratedBatch.length > 0 && (
            <button
              type="button"
              onClick={() =>
                void copyText(lastGeneratedBatch.join('\n'), `Copied ${lastGeneratedBatch.length} codes`)
              }
              className="w-full h-9 rounded-xl border border-[#1E3A8A] text-xs font-bold cursor-pointer"
            >
              Copy Last Generated ({lastGeneratedBatch.length})
            </button>
          )}
        </div>
      )}

      {/* Search + Export Controls */}
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
                exportAccessCodesA4Pdf(filteredCodes, statusFilter);
                onNotify?.(`${t.exportPdfBtn} (${filteredCodes.length})`);
              } catch (err) {
                onNotify?.(err instanceof Error ? err.message : 'PDF error');
              }
            }}
            className="h-11 px-3.5 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E293B] text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <FileText className="h-4 w-4" />
            <span>{t.exportPdfBtn}</span>
          </button>
        </div>
      </div>

      {/* Status Filter Chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'all' as const, label: `${t.filterAll} (${accessCodes.length})` },
          { id: 'unused' as const, label: `${t.filterUnused} (${unusedCount})` },
          { id: 'used' as const, label: `${t.filterUsed} (${usedCount})` },
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredCodes.map((item) => {
            const isUsed = item.status === 'used' || item.isUsed;
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

                {!isUsed && /^[0-9]{10}$/.test(item.mobileNumber.replace(/\D/g, '').slice(-10)) && (
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
                      {t.usedAtLabel} {formatTimestampLabel(item.usedAt ?? item.updatedAt, lang)}
                    </p>
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

/* --- Tab 3: Used Codes Live Audit Tab --- */
export const AdminUsedCodesTab: React.FC<{
  accessCodes: AccessCode[];
  isBusy: boolean;
  onDeleteCode: (item: AccessCode) => void;
}> = ({ accessCodes, isBusy, onDeleteCode }) => {
  const { lang, t } = useTranslation();

  const usedCodes = useMemo(() => {
    return accessCodes
      .filter((c) => c.status === 'used' || c.isUsed)
      .sort((a, b) => {
        const aSec = (a.usedAt ?? a.updatedAt)?.seconds ?? 0;
        const bSec = (b.usedAt ?? b.updatedAt)?.seconds ?? 0;
        return bSec - aSec;
      });
  }, [accessCodes]);

  return (
    <div className="p-3 sm:p-4 space-y-4 max-w-5xl mx-auto">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {usedCodes.map((item) => {
            const resolvedSub = resolveCodeSubjectId(item.code, item.batchName, item.subjectId);
            const usedName = item.usedBy?.name || item.usedByName || '-';
            const usedMobile = item.usedBy?.mobile || item.usedByMobile || '-';
            const device = item.usedBy?.deviceInfo || 'Web Browser';

            return (
              <div
                key={item.code}
                className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-4 space-y-3 shadow-sm"
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
  onToggleStudentAccess: (student: StudentProfile, grantAccess: boolean) => void;
  onUpdateStudentSubjectAccess: (
    student: StudentProfile,
    subjectId: SubjectId,
    grantAccess: boolean
  ) => void;
  onUnlockStudentDevice: (student: StudentProfile) => void;
  onDeleteStudent: (student: StudentProfile) => void;
}> = ({
  students,
  isBusy,
  onToggleStudentAccess,
  onUpdateStudentSubjectAccess,
  onUnlockStudentDevice,
  onDeleteStudent,
}) => {
  const { lang, t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (st) =>
        st.fullName.toLowerCase().includes(q) ||
        st.mobileNumber.includes(q) ||
        st.redeemedCode.toLowerCase().includes(q)
    );
  }, [students, searchQuery]);

  return (
    <div className="p-3 sm:p-4 space-y-4 max-w-5xl mx-auto">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredStudents.map((st) => {
            const unlockedSet = new Set<string>(
              st.hasQuizAccess
                ? ALL_SUBJECT_IDS
                : (st.unlockedSubjects ?? []).filter((s) => s !== 'all')
            );
            const hasFull = st.hasQuizAccess || ALL_SUBJECT_IDS.every((s) => unlockedSet.has(s));
            return (
              <div
                key={st.id || st.userId}
                className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-4 space-y-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-sm sm:text-base font-extrabold truncate">{st.fullName}</h4>
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

                {/* Single-Device Lock Info + Force Unlock */}
                <div className="rounded-xl border border-[#E2E8F0] dark:border-[#334155] px-2.5 py-2 text-[11px] flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-1.5">
                    <Smartphone className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                    <span className="truncate font-semibold text-[#475569] dark:text-[#94A3B8]">
                      {st.activeDeviceId
                        ? st.activeDeviceName || t.deviceActiveBadge
                        : t.deviceFreeBadge}
                    </span>
                  </div>
                  {st.activeDeviceId && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onUnlockStudentDevice(st)}
                      className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 px-2.5 py-1 text-[11px] font-bold hover:bg-amber-200 dark:hover:bg-amber-900/60 disabled:opacity-60 cursor-pointer"
                    >
                      <Unlock className="h-3 w-3" />
                      <span>{t.unlockDeviceBtn}</span>
                    </button>
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
    </div>
  );
};

export { Wallet };
