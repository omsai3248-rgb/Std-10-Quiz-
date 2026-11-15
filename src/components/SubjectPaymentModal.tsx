import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  IndianRupee,
  KeyRound,
  LockOpen,
  Radio,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { useTranslation } from '../i18n/translations';
import { extractReadableErrorMessage } from '../services/firestoreErrorHandler';
import {
  ADMIN_UPI_ID,
  ADMIN_UPI_NAME,
  normalizeUtrId,
} from '../services/quizRepository';
import {
  PRICE_ALL_SUBJECTS,
  PRICE_SINGLE_SUBJECT,
  getFixedPlanPrice,
  getSubjectDisplayName,
  resolvePaymentSubjectId,
  type PaymentRequest,
  type SubjectId,
} from '../types/models';
import {
  buildUpiPaymentHref,
  compressImageFileToBlobAndBase64,
  formatTimestampLabel,
  launchUpiPayment,
  resolvePaymentImageSrc,
  toImageDataUrl,
} from '../utils/imageUtils';

interface SubjectPaymentModalProps {
  isOpen: boolean;
  defaultSubjectId: SubjectId | 'all';
  initialMode?: 'pay' | 'code';
  initialCode?: string;
  studentName: string;
  studentMobile: string;
  myPayments: PaymentRequest[];
  isBusy: boolean;
  onClose: () => void;
  onSubmitPayment: (params: {
    studentName: string;
    mobileNumber: string;
    amountRupees: number;
    upiTransactionRef: string;
    imageBlob: Blob;
    fallbackBase64: string;
    subjectId: string;
  }) => Promise<string | undefined>;
  onRedeemCode: (params: {
    code: string;
    name: string;
    mobile: string;
    expectedSubjectId?: string;
  }) => Promise<{ code: string; subjectId: string } | undefined>;
  onNotify?: (message: string, isError?: boolean) => void;
}

export const SubjectPaymentModal: React.FC<SubjectPaymentModalProps> = ({
  isOpen,
  defaultSubjectId,
  initialMode = 'pay',
  initialCode = '',
  studentName,
  studentMobile,
  myPayments,
  isBusy,
  onClose,
  onSubmitPayment,
  onRedeemCode,
  onNotify,
}) => {
  const { lang, t } = useTranslation();

  const [activeTab, setActiveTab] = useState<'pay' | 'code'>(initialMode);
  const [selectedPlanSubject, setSelectedPlanSubject] = useState<string>(defaultSubjectId);
  const [utrInput, setUtrInput] = useState('');
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [codeInput, setCodeInput] = useState(initialCode);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submittedRequestId, setSubmittedRequestId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialMode);
    setSelectedPlanSubject(defaultSubjectId);
    setCodeInput(initialCode);
    setLocalError(null);
  }, [isOpen, initialMode, defaultSubjectId, initialCode]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const previewDataUrl = useMemo(
    () => (imageBase64 ? toImageDataUrl(imageBase64) : ''),
    [imageBase64]
  );

  const singleSubjectOptionId: SubjectId =
    defaultSubjectId === 'all' ? 'maths' : defaultSubjectId;

  const fixedAmount = getFixedPlanPrice(selectedPlanSubject);

  const relevantPayments = useMemo(() => {
    if (submittedRequestId) {
      const matched = myPayments.filter((p) => p.id === submittedRequestId);
      if (matched.length > 0) return matched;
    }
    return myPayments.slice(0, 2);
  }, [myPayments, submittedRequestId]);

  if (!isOpen) return null;

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      onNotify?.(`${t.payUpiCopied}: ${value}`);
    } catch {
      onNotify?.(value);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsProcessingImage(true);
    setLocalError(null);
    try {
      const { blob, base64 } = await compressImageFileToBlobAndBase64(file);
      setImageBlob(blob);
      setImageBase64(base64);
    } catch {
      setLocalError(t.errScreenshotRequired);
    } finally {
      setIsProcessingImage(false);
    }
  };

  const mapErrorMessage = (err: unknown): string => {
    const msg = err instanceof Error ? err.message : '';
    switch (msg) {
      case 'INVALID_NAME':
        return t.errInvalidName;
      case 'INVALID_MOBILE':
        return t.errInvalidMobile;
      case 'INVALID_AMOUNT':
        return t.errInvalidAmount;
      case 'INVALID_UTR':
        return t.errInvalidUtr;
      case 'SCREENSHOT_REQUIRED':
        return t.errScreenshotRequired;
      case 'DUPLICATE_UTR':
        return t.errDuplicateUtr;
      case 'INVALID_CODE_FORMAT':
        return t.errInvalidCodeFormat;
      case 'CODE_NOT_FOUND':
        return t.errCodeNotFound;
      case 'CODE_ALREADY_USED':
        return t.errCodeAlreadyUsed;
      default:
        if (msg.startsWith('SUBJECT_MISMATCH:')) {
          const codeSub = msg.split(':')[1] ?? 'all';
          const subName = getSubjectDisplayName(codeSub, lang);
          return lang === 'en'
            ? `This code is valid for ${subName}.`
            : `આ કોડ ${subName} માટે છે.`;
        }
        return extractReadableErrorMessage(err, lang);
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const utrNorm = normalizeUtrId(utrInput);
    if (utrNorm.length < 4) {
      setLocalError(t.errInvalidUtr);
      return;
    }
    if (!imageBlob || !imageBase64) {
      setLocalError(t.errScreenshotRequired);
      return;
    }

    try {
      const reqId = await onSubmitPayment({
        studentName,
        mobileNumber: studentMobile,
        amountRupees: fixedAmount,
        upiTransactionRef: utrInput.trim(),
        imageBlob,
        fallbackBase64: imageBase64,
        subjectId: selectedPlanSubject,
      });

      if (reqId) {
        setSubmittedRequestId(reqId);
        setUtrInput('');
        setImageBlob(null);
        setImageBase64(null);
      }
    } catch (err) {
      setLocalError(mapErrorMessage(err));
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const cleaned = codeInput.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{4,32}$/.test(cleaned)) {
      setLocalError(t.errInvalidCodeFormat);
      return;
    }
    try {
      const res = await onRedeemCode({
        code: cleaned,
        name: studentName,
        mobile: studentMobile,
        expectedSubjectId: defaultSubjectId === 'all' ? undefined : defaultSubjectId,
      });
      if (res) {
        setCodeInput('');
        onClose();
      }
    } catch (err) {
      setLocalError(mapErrorMessage(err));
    }
  };

  const handleQuickUnlockWithApprovedCode = async (req: PaymentRequest) => {
    setLocalError(null);
    try {
      const res = await onRedeemCode({
        code: req.assignedCode,
        name: studentName,
        mobile: studentMobile,
        expectedSubjectId: defaultSubjectId === 'all' ? undefined : defaultSubjectId,
      });
      if (res) onClose();
    } catch (err) {
      setLocalError(mapErrorMessage(err));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] shadow-2xl p-4 sm:p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base sm:text-lg font-extrabold">
              {defaultSubjectId === 'all'
                ? t.unlockAllBannerTitle
                : `${getSubjectDisplayName(defaultSubjectId, lang)} • ${lang === 'en' ? 'Unlock Quiz' : 'ક્વિઝ અનલૉક કરો'}`}
            </h3>
            <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
              {studentName} • +91 {studentMobile}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.closeBtn}
            className="h-9 w-9 rounded-xl border border-[#CBD5E1] dark:border-[#334155] flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 2-Tab Switcher: UPI Payment vs Code */}
        <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#EFF4FA] dark:bg-[#0F172A] p-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab('pay');
              setLocalError(null);
            }}
            className={`h-10 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'pay'
                ? 'bg-[#1E3A8A] text-white shadow-sm'
                : 'text-[#475569] dark:text-[#94A3B8]'
            }`}
          >
            <IndianRupee className="h-3.5 w-3.5" />
            <span>{t.payTabLabel}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('code');
              setLocalError(null);
            }}
            className={`h-10 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'code'
                ? 'bg-[#1E3A8A] text-white shadow-sm'
                : 'text-[#475569] dark:text-[#94A3B8]'
            }`}
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span>{t.codeTabLabel}</span>
          </button>
        </div>

        {activeTab === 'pay' ? (
          <div className="space-y-4">
            {/* Fixed Price Plan Selector: Single Subject ₹24 vs All Subjects ₹49 */}
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {t.fieldSubject} ({t.fixedPriceBadge})
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {defaultSubjectId !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setSelectedPlanSubject(singleSubjectOptionId)}
                    className={`rounded-xl p-3 border text-left transition-colors cursor-pointer ${
                      selectedPlanSubject === singleSubjectOptionId
                        ? 'bg-[#DBEAFE] dark:bg-[#1E3A5F] border-[#1E3A8A] text-[#1E3A8A] dark:text-white'
                        : 'bg-[#FAF9F5] dark:bg-[#0F172A] border-[#CBD5E1] dark:border-[#334155]'
                    }`}
                  >
                    <p className="text-[11px] font-bold opacity-85">
                      {getSubjectDisplayName(singleSubjectOptionId, lang)}
                    </p>
                    <p className="text-lg font-extrabold tabular-nums">₹{PRICE_SINGLE_SUBJECT}</p>
                    <p className="text-[10px] font-semibold opacity-75">
                      {t.unlockSingleSubjectLabel}
                    </p>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedPlanSubject('all')}
                  className={`rounded-xl p-3 border text-left transition-colors cursor-pointer ${
                    defaultSubjectId === 'all' ? 'col-span-2' : ''
                  } ${
                    selectedPlanSubject === 'all'
                      ? 'bg-[#FEF3C7] dark:bg-[#451A03] border-[#D97706] text-[#92400E] dark:text-[#FDE68A]'
                      : 'bg-[#FAF9F5] dark:bg-[#0F172A] border-[#CBD5E1] dark:border-[#334155]'
                  }`}
                >
                  <p className="text-[11px] font-bold opacity-85">
                    {getSubjectDisplayName('all', lang)}
                  </p>
                  <p className="text-lg font-extrabold tabular-nums">₹{PRICE_ALL_SUBJECTS}</p>
                  <p className="text-[10px] font-semibold opacity-75">
                    {t.unlockAllSubjectsLabel}
                  </p>
                </button>
              </div>
            </div>

            {/* Single Clean UPI Payment Card (Only UPI) */}
            <div className="rounded-2xl bg-[#FEF3C7] dark:bg-[#451A03] border border-[#F59E0B]/35 p-3.5 text-[#92400E] dark:text-[#FDE68A] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold">{ADMIN_UPI_NAME}</span>
                <span className="rounded-lg bg-white/80 dark:bg-black/30 px-2.5 py-0.5 text-xs font-extrabold tabular-nums">
                  ₹{fixedAmount}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 rounded-xl bg-white/80 dark:bg-black/25 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[10px] opacity-75">UPI ID</p>
                  <p className="text-sm font-extrabold truncate">{ADMIN_UPI_ID}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopy(ADMIN_UPI_ID)}
                  className="h-8 px-2.5 rounded-lg bg-[#92400E]/10 hover:bg-[#92400E]/20 dark:bg-white/10 text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{t.payUpiCopy}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  const upiUrl = buildUpiPaymentHref(
                    ADMIN_UPI_ID,
                    ADMIN_UPI_NAME,
                    fixedAmount,
                    studentMobile
                  );
                  launchUpiPayment(upiUrl);
                }}
                className="w-full h-11 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <ExternalLink className="h-4 w-4" />
                <span>
                  {t.payUpiOpenApp} (₹{fixedAmount})
                </span>
              </button>

              <p className="text-[11px] font-medium opacity-85">{t.payUpiQuickTip}</p>
            </div>

            {/* UTR & Screenshot Form */}
            <form onSubmit={(e) => void handlePaymentSubmit(e)} className="space-y-3">
              <div>
                <label
                  htmlFor="modal-utr-input"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
                >
                  {t.fieldUtr}
                </label>
                <input
                  id="modal-utr-input"
                  type="text"
                  maxLength={60}
                  value={utrInput}
                  onChange={(e) => {
                    setUtrInput(e.target.value.slice(0, 60));
                    setLocalError(null);
                  }}
                  placeholder={t.fieldUtrPlaceholder}
                  className="w-full h-11 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] px-3 text-sm font-semibold tracking-wide outline-none focus:border-[#1E3A8A]"
                />
              </div>

              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handleFileChange(e)}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={isProcessingImage || isBusy}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-11 rounded-xl border-2 border-dashed border-[#CBD5E1] dark:border-[#334155] hover:border-[#1E3A8A] text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <ImageIcon className="h-4 w-4 text-[#1E3A8A] dark:text-[#93C5FD]" />
                  <span>
                    {isProcessingImage
                      ? t.preparingImage
                      : previewDataUrl
                        ? t.changeScreenshot
                        : t.pickScreenshot}
                  </span>
                </button>

                {previewDataUrl && (
                  <div className="h-40 w-full rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] overflow-hidden flex items-center justify-center p-1.5">
                    <img
                      src={previewDataUrl}
                      alt={t.fieldScreenshot}
                      className="max-h-full max-w-full object-contain rounded-lg"
                    />
                  </div>
                )}
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
                disabled={isBusy || isProcessingImage}
                className="w-full h-12 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white text-sm font-extrabold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
              >
                <Upload className="h-4 w-4" />
                <span>{isBusy ? t.submittingBtn : t.submitToAdminBtn}</span>
              </button>
            </form>

            {/* Live Request Status inside Modal */}
            {relevantPayments.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold">{t.myRequestsTitle}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#D1FAE5] dark:bg-[#064E3B] text-[#064E3B] dark:text-[#D1FAE5] px-2 py-0.5 text-[10px] font-bold">
                    <Radio className="h-3 w-3 animate-pulse" />
                    <span>{t.liveBadge}</span>
                  </span>
                </div>

                {relevantPayments.map((req) => {
                  const thumb = resolvePaymentImageSrc(req);
                  return (
                    <div
                      key={req.id}
                      className="rounded-xl bg-[#EFF4FA] dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          {thumb && (
                            <img
                              src={thumb}
                              alt={t.zoomModalTitle}
                              className="h-9 w-9 rounded-lg object-cover shrink-0 border border-slate-300 dark:border-slate-700"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="font-bold truncate">
                              ₹{req.amountRupees} • {getSubjectDisplayName(resolvePaymentSubjectId(req), lang)}
                            </p>
                            <p className="text-[10px] text-slate-500 truncate">
                              UTR: {req.upiTransactionRef} • {formatTimestampLabel(req.createdAt, lang)}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-extrabold ${
                            req.status === 'approved'
                              ? 'bg-[#D1FAE5] text-[#064E3B]'
                              : req.status === 'rejected'
                                ? 'bg-[#FEE2E2] text-[#7F1D1D]'
                                : 'bg-[#FEF3C7] text-[#92400E]'
                          }`}
                        >
                          {req.status === 'approved'
                            ? t.statusApproved
                            : req.status === 'rejected'
                              ? t.statusRejected
                              : t.statusPending}
                        </span>
                      </div>

                      {req.status === 'pending' && (
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#92400E] dark:text-[#FDE68A]">
                          <Clock className="h-3.5 w-3.5 shrink-0 animate-pulse" />
                          <span>{t.waitingApprovalLive}</span>
                        </div>
                      )}

                      {req.status === 'rejected' && (
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#7F1D1D] dark:text-[#FEE2E2]">
                          <XCircle className="h-3.5 w-3.5 shrink-0" />
                          <span>{req.adminNote || t.statusRejected}</span>
                        </div>
                      )}

                      {req.status === 'approved' && req.assignedCode && (
                        <div className="rounded-lg bg-[#D1FAE5] dark:bg-[#064E3B] p-2.5 flex items-center justify-between gap-2 text-[#064E3B] dark:text-[#D1FAE5]">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span className="text-sm font-extrabold font-mono tracking-widest">
                              {req.assignedCode}
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleQuickUnlockWithApprovedCode(req)}
                            className="h-8 px-3 rounded-lg bg-[#047857] text-white text-xs font-extrabold cursor-pointer"
                          >
                            {t.useThisCodeBtn}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={(e) => void handleCodeSubmit(e)} className="space-y-3.5">
            <p className="text-xs text-[#475569] dark:text-[#94A3B8]">{t.useCodeSubtitle}</p>

            <div>
              <label
                htmlFor="modal-code-input"
                className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
              >
                {t.fieldCodeLabel}
              </label>
              <input
                id="modal-code-input"
                type="text"
                maxLength={32}
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(
                    e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32)
                  );
                  setLocalError(null);
                }}
                placeholder={t.fieldCodePlaceholder}
                className="w-full h-12 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] px-3.5 text-base font-extrabold font-mono tracking-widest outline-none focus:border-[#1E3A8A]"
              />
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
              disabled={isBusy}
              className="w-full h-12 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] dark:bg-[#2563EB] text-white text-sm font-extrabold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
            >
              <LockOpen className="h-4 w-4" />
              <span>{isBusy ? t.redeemingBtn : t.redeemNowBtn}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
