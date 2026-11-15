import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  IndianRupee,
  KeyRound,
  Radio,
  Send,
  Smartphone,
  Upload,
  User,
  XCircle,
} from 'lucide-react';
import { useTranslation } from '../i18n/translations';
import { extractReadableErrorMessage } from '../services/firestoreErrorHandler';
import { ADMIN_UPI_ID, ADMIN_UPI_NAME, normalizeUtrId } from '../services/quizRepository';
import {
  getSubjectDisplayName,
  resolvePaymentSubjectId,
  type PaymentRequest,
} from '../types/models';
import {
  buildStudentProofWhatsAppHref,
  buildUpiPaymentHref,
  compressImageFileToBlobAndBase64,
  formatTimestampLabel,
  normalizeIndianMobileInput,
  resolvePaymentImageSrc,
  toImageDataUrl,
} from '../utils/imageUtils';

interface PublicPaymentScreenProps {
  userId: string;
  myPayments: PaymentRequest[];
  isAuthReady: boolean;
  isBusy: boolean;
  initialName?: string;
  initialMobile?: string;
  onSubmitPayment: (params: {
    studentName: string;
    mobileNumber: string;
    amountRupees: number;
    upiTransactionRef: string;
    imageBlob: Blob;
    fallbackBase64: string;
    subjectId: string;
  }) => Promise<string | undefined>;
  onUseCodeClick: (code: string, name: string, mobile: string) => void;
  onNotify?: (message: string, isError?: boolean) => void;
}

const SUBJECT_OPTIONS = ['all', 'maths', 'science', 'social_science'] as const;

export const PublicPaymentScreen: React.FC<PublicPaymentScreenProps> = ({
  userId,
  myPayments,
  isAuthReady,
  isBusy,
  initialName = '',
  initialMobile = '',
  onSubmitPayment,
  onUseCodeClick,
  onNotify,
}) => {
  const { lang, t } = useTranslation();

  const [fullName, setFullName] = useState(initialName);
  const [mobileNumber, setMobileNumber] = useState(initialMobile);
  const [amountInput, setAmountInput] = useState('24');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');
  const [utrInput, setUtrInput] = useState('');
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [justSubmittedInfo, setJustSubmittedInfo] = useState<{
    requestId: string;
    name: string;
    mobile: string;
    amount: number;
    utr: string;
    subjectId: string;
  } | null>(null);
  const [zoomedDataUrl, setZoomedDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!zoomedDataUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomedDataUrl(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomedDataUrl]);

  const previewDataUrl = useMemo(
    () => (imageBase64 ? toImageDataUrl(imageBase64) : ''),
    [imageBase64]
  );

  const parsedAmount = Math.max(1, Number.parseInt(amountInput, 10) || 24);

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
      default:
        return extractReadableErrorMessage(err, lang);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const cleanName = fullName.trim();
    const cleanMobile = mobileNumber.replace(/\D/g, '');
    const amt = Number.parseInt(amountInput, 10);
    const utrNorm = normalizeUtrId(utrInput);

    if (!cleanName) {
      setLocalError(t.errInvalidName);
      return;
    }
    if (!/^[0-9]{10}$/.test(cleanMobile)) {
      setLocalError(t.errInvalidMobile);
      return;
    }
    if (!Number.isFinite(amt) || amt < 1 || amt > 100000) {
      setLocalError(t.errInvalidAmount);
      return;
    }
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
        studentName: cleanName,
        mobileNumber: cleanMobile,
        amountRupees: amt,
        upiTransactionRef: utrInput.trim(),
        imageBlob,
        fallbackBase64: imageBase64,
        subjectId: selectedSubjectId,
      });

      if (reqId) {
        setJustSubmittedInfo({
          requestId: reqId,
          name: cleanName,
          mobile: cleanMobile,
          amount: amt,
          utr: utrInput.trim(),
          subjectId: selectedSubjectId,
        });
        setUtrInput('');
        setImageBlob(null);
        setImageBase64(null);
      }
    } catch (err) {
      setLocalError(mapErrorMessage(err));
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-5 space-y-5">
      {/* UPI Pay Quick Info Card */}
      <section className="rounded-2xl bg-[#FEF3C7] dark:bg-[#451A03] border border-[#F59E0B]/30 p-4 sm:p-5 text-[#92400E] dark:text-[#FDE68A] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <IndianRupee className="h-5 w-5 shrink-0" />
            <h2 className="text-base font-extrabold">{t.payUpiCardTitle}</h2>
          </div>
          <span className="rounded-lg bg-white/70 dark:bg-black/30 px-2.5 py-1 text-xs font-extrabold tabular-nums">
            ₹{parsedAmount}
          </span>
        </div>

        <p className="text-xs font-semibold opacity-90">{ADMIN_UPI_NAME}</p>

        <div className="flex items-center justify-between gap-2 rounded-xl bg-white/75 dark:bg-black/25 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[11px] opacity-75">UPI ID</p>
            <p className="text-sm sm:text-base font-extrabold truncate">{ADMIN_UPI_ID}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleCopy(ADMIN_UPI_ID)}
            className="h-9 px-3 rounded-lg bg-[#92400E]/10 hover:bg-[#92400E]/20 dark:bg-white/10 text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Copy className="h-3.5 w-3.5" />
            <span>{t.payUpiCopy}</span>
          </button>
        </div>

        <a
          href={buildUpiPaymentHref(ADMIN_UPI_ID, ADMIN_UPI_NAME, parsedAmount, mobileNumber)}
          className="w-full h-11 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          <span>
            {t.payUpiOpenApp} (₹{parsedAmount})
          </span>
        </a>
      </section>

      {/* Live Request Submission Form */}
      <section className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] shadow-sm p-4 sm:p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-extrabold text-[#0F172A] dark:text-[#F8FAFC]">
            {t.payHeaderTitle}
          </h2>
          <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
            {t.payHeaderDesc}
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3.5">
          {/* Name */}
          <div>
            <label
              htmlFor="pub-name-input"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
            >
              {t.fieldFullName}
            </label>
            <div className="flex items-center rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] px-3 h-12 focus-within:border-[#1E3A8A]">
              <User className="h-4 w-4 text-slate-400 mr-2 shrink-0" />
              <input
                id="pub-name-input"
                type="text"
                maxLength={60}
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setLocalError(null);
                }}
                placeholder={t.fieldFullNamePlaceholder}
                className="w-full bg-transparent text-sm font-medium outline-none"
              />
            </div>
          </div>

          {/* Mobile & Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-8">
              <label
                htmlFor="pub-mobile-input"
                className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
              >
                {t.fieldMobile}
              </label>
              <div className="flex items-center rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] px-3 h-12 focus-within:border-[#1E3A8A]">
                <Smartphone className="h-4 w-4 text-slate-400 mr-2 shrink-0" />
                <span className="text-xs font-bold text-slate-500 mr-1.5">+91</span>
                <input
                  id="pub-mobile-input"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={mobileNumber}
                  onChange={(e) => {
                    setMobileNumber(normalizeIndianMobileInput(e.target.value));
                    setLocalError(null);
                  }}
                  placeholder={t.fieldMobilePlaceholder}
                  className="w-full bg-transparent text-sm font-semibold tabular-nums outline-none"
                />
              </div>
            </div>

            <div className="sm:col-span-4">
              <label
                htmlFor="pub-amount-input"
                className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
              >
                {t.fieldAmount}
              </label>
              <div className="flex items-center rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] px-3 h-12 focus-within:border-[#1E3A8A]">
                <IndianRupee className="h-4 w-4 text-slate-400 mr-1 shrink-0" />
                <input
                  id="pub-amount-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={amountInput}
                  onChange={(e) => {
                    setAmountInput(e.target.value.replace(/\D/g, '').slice(0, 6));
                    setLocalError(null);
                  }}
                  placeholder={t.fieldAmountPlaceholder}
                  className="w-full bg-transparent text-sm font-bold tabular-nums outline-none"
                />
              </div>
            </div>
          </div>

          {/* Subject / Package */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {t.fieldSubject}
            </p>
            <div className="flex flex-wrap gap-2">
              {SUBJECT_OPTIONS.map((subId) => {
                const selected = selectedSubjectId === subId;
                return (
                  <button
                    key={subId}
                    type="button"
                    onClick={() => setSelectedSubjectId(subId)}
                    className={`rounded-xl px-3 py-2 text-xs font-bold border transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                        : 'bg-[#FAF9F5] dark:bg-[#0F172A] text-slate-700 dark:text-slate-300 border-[#CBD5E1] dark:border-[#334155]'
                    }`}
                  >
                    {getSubjectDisplayName(subId, lang)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Transaction / UTR ID */}
          <div>
            <label
              htmlFor="pub-utr-input"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
            >
              {t.fieldUtr}
            </label>
            <input
              id="pub-utr-input"
              type="text"
              maxLength={60}
              value={utrInput}
              onChange={(e) => {
                setUtrInput(e.target.value.slice(0, 60));
                setLocalError(null);
              }}
              placeholder={t.fieldUtrPlaceholder}
              className="w-full h-12 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] px-3.5 text-sm font-semibold tracking-wide outline-none focus:border-[#1E3A8A]"
            />
          </div>

          {/* Screenshot Picker */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {t.fieldScreenshot}
            </p>
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
              className="w-full h-12 rounded-xl border-2 border-dashed border-[#CBD5E1] dark:border-[#334155] hover:border-[#1E3A8A] text-sm font-semibold flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <ImageIcon className="h-4.5 w-4.5 text-[#1E3A8A] dark:text-[#93C5FD]" />
              <span>
                {isProcessingImage
                  ? t.preparingImage
                  : previewDataUrl
                    ? t.changeScreenshot
                    : t.pickScreenshot}
              </span>
            </button>

            {previewDataUrl && (
              <div className="h-52 w-full rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] overflow-hidden flex items-center justify-center p-2">
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
            disabled={isBusy || isProcessingImage || !isAuthReady}
            className="w-full h-12 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white text-sm font-extrabold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
          >
            <Upload className="h-4.5 w-4.5" />
            <span>{isBusy ? t.submittingBtn : t.submitPaymentBtn}</span>
          </button>
        </form>

        {/* Live Confirmation Banner after submission */}
        {justSubmittedInfo && (
          <div className="rounded-2xl bg-[#D1FAE5] dark:bg-[#064E3B] border border-[#10B981]/30 p-4 space-y-2.5 text-[#064E3B] dark:text-[#D1FAE5]">
            <div className="flex items-start gap-2.5">
              <Clock className="h-5 w-5 shrink-0 mt-0.5 animate-pulse" />
              <div className="space-y-1">
                <h3 className="text-sm font-extrabold">{t.requestSentTitle}</h3>
                <p className="text-xs opacity-90">{t.requestSentSubtitle}</p>
              </div>
            </div>
            <a
              href={buildStudentProofWhatsAppHref({
                studentName: justSubmittedInfo.name,
                userId,
                mobileNumber: justSubmittedInfo.mobile,
                amountRupees: justSubmittedInfo.amount,
                subjectId: justSubmittedInfo.subjectId,
                upiRef: justSubmittedInfo.utr,
              })}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-11 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors"
            >
              <Send className="h-4 w-4" />
              <span>{t.sendWhatsAppOptional}</span>
            </a>
          </div>
        )}
      </section>

      {/* Live Status Tracker via onSnapshot */}
      {myPayments.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-extrabold">{t.myRequestsTitle}</h3>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#D1FAE5] dark:bg-[#064E3B] text-[#064E3B] dark:text-[#D1FAE5] px-2.5 py-0.5 text-[11px] font-bold">
              <Radio className="h-3 w-3 animate-pulse" />
              <span>{t.liveBadge}</span>
            </span>
          </div>

          <div className="space-y-3">
            {myPayments.map((req) => {
              const thumbUrl = resolvePaymentImageSrc(req);
              const subjectName = getSubjectDisplayName(resolvePaymentSubjectId(req), lang);

              return (
                <div
                  key={req.id}
                  className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-4 space-y-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {thumbUrl && (
                        <button
                          type="button"
                          onClick={() => setZoomedDataUrl(thumbUrl)}
                          aria-label={t.tapToZoom}
                          className="h-14 w-14 rounded-xl border border-slate-300 dark:border-slate-700 overflow-hidden shrink-0 cursor-pointer bg-slate-100 dark:bg-slate-900"
                        >
                          <img
                            src={thumbUrl}
                            alt={t.zoomModalTitle}
                            className="h-full w-full object-cover"
                          />
                        </button>
                      )}
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm font-extrabold truncate">
                          {req.studentName} • ₹{req.amountRupees}
                        </p>
                        <p className="text-xs text-[#475569] dark:text-[#94A3B8] truncate tabular-nums">
                          +91 {req.mobileNumber} • {subjectName}
                        </p>
                        <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                          UTR: {req.upiTransactionRef} • {formatTimestampLabel(req.createdAt, lang)}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-extrabold ${
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
                  </div>

                  {req.status === 'pending' && (
                    <div className="rounded-xl bg-[#FEF3C7]/60 dark:bg-[#451A03]/60 px-3 py-2 flex items-center gap-2 text-xs font-semibold text-[#92400E] dark:text-[#FDE68A]">
                      <Clock className="h-4 w-4 shrink-0 animate-pulse" />
                      <span>{t.waitingApprovalLive}</span>
                    </div>
                  )}

                  {req.status === 'rejected' && (
                    <div className="rounded-xl bg-[#FEE2E2]/70 dark:bg-[#7F1D1D]/50 px-3 py-2 flex items-start gap-2 text-xs font-semibold text-[#7F1D1D] dark:text-[#FEE2E2]">
                      <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        {t.adminNoteLabel} {req.adminNote || t.statusRejected}
                      </span>
                    </div>
                  )}

                  {req.status === 'approved' && req.assignedCode && (
                    <div className="rounded-xl bg-[#D1FAE5] dark:bg-[#064E3B] p-3.5 space-y-2.5 text-[#064E3B] dark:text-[#D1FAE5]">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="h-5 w-5 shrink-0" />
                          <div>
                            <p className="text-[11px] font-bold opacity-85">{t.yourCodeLabel}</p>
                            <p className="text-lg font-extrabold tracking-widest font-mono">
                              {req.assignedCode}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleCopy(req.assignedCode)}
                          className="h-9 px-3 rounded-lg bg-white/80 dark:bg-black/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          <span>{t.copyCode}</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          onUseCodeClick(req.assignedCode, req.studentName, req.mobileNumber)
                        }
                        className="w-full h-11 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <KeyRound className="h-4 w-4" />
                        <span>{t.useThisCodeBtn}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Screenshot Zoom Modal */}
      {zoomedDataUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setZoomedDataUrl(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1E293B] p-4 space-y-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold">{t.zoomModalTitle}</h3>
            <div className="h-80 w-full flex items-center justify-center bg-slate-100 dark:bg-slate-900 rounded-xl overflow-hidden">
              <img
                src={zoomedDataUrl}
                alt={t.zoomModalTitle}
                className="max-h-full max-w-full object-contain"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setZoomedDataUrl(null)}
                className="px-4 py-2 text-sm font-bold text-[#1E3A8A] dark:text-[#93C5FD] cursor-pointer"
              >
                {t.closeBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
