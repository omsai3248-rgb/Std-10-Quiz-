import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Image as ImageIcon,
  IndianRupee,
  KeyRound,
  LockOpen,
  QrCode,
  Radio,
  Send,
  Share2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { useTranslation } from '../i18n/translations';
import { extractReadableErrorMessage } from '../services/firestoreErrorHandler';
import {
  ADMIN_UPI_ID,
  ADMIN_UPI_NAME,
} from '../services/quizRepository';
import {
  PRICE_ALL_SUBJECTS,
  PRICE_SINGLE_SUBJECT,
  displayPaymentTransactionRef,
  getFixedPlanPrice,
  getSubjectDisplayName,
  resolvePaymentSubjectId,
  type PaymentRequest,
  type SubjectId,
} from '../types/models';
import {
  buildUpiPaymentHref,
  compressImageFileToBlobAndBase64,
  downloadPngDataUrl,
  formatTimestampLabel,
  launchUpiPayment,
  launchWhatsAppPaymentWithScreenshot,
  resolvePaymentImageSrc,
  saveOrSharePngDataUrl,
  toImageDataUrl,
} from '../utils/imageUtils';
import { generateQrMatrix, renderQrToPngDataUrl } from '../utils/qrGenerator';

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
    upiTransactionRef?: string;
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
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [lastPreviewUrl, setLastPreviewUrl] = useState<string>('');
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

  const upiPaymentUrl = useMemo(
    () => buildUpiPaymentHref(ADMIN_UPI_ID, ADMIN_UPI_NAME, fixedAmount, studentMobile),
    [fixedAmount, studentMobile]
  );

  const qrMatrix = useMemo(() => generateQrMatrix(upiPaymentUrl), [upiPaymentUrl]);

  const relevantPayments = useMemo(() => {
    if (submittedRequestId) {
      const matched = myPayments.filter((p) => p.id === submittedRequestId);
      if (matched.length > 0) return matched;
    }
    return myPayments.slice(0, 3);
  }, [myPayments, submittedRequestId]);

  if (!isOpen) return null;

  const handleDownloadQr = () => {
    const pngDataUrl = renderQrToPngDataUrl(
      upiPaymentUrl,
      ADMIN_UPI_NAME,
      `₹${fixedAmount} • ${ADMIN_UPI_ID}`
    );
    if (pngDataUrl) {
      downloadPngDataUrl(`Std10Quiz_UPI_${fixedAmount}.png`, pngDataUrl);
      onNotify?.(t.payQrDownloadedMsg);
    }
  };

  const handleSaveShareQr = () => {
    const pngDataUrl = renderQrToPngDataUrl(
      upiPaymentUrl,
      ADMIN_UPI_NAME,
      `₹${fixedAmount} • ${ADMIN_UPI_ID}`
    );
    if (pngDataUrl) {
      saveOrSharePngDataUrl(`Std10Quiz_UPI_${fixedAmount}.png`, pngDataUrl);
      onNotify?.(t.payQrSavedMsg);
    }
  };

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
      setLastPreviewUrl(toImageDataUrl(base64));
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

    if (!imageBlob || !imageBase64) {
      setLocalError(t.errScreenshotRequired);
      return;
    }

    try {
      const reqId = await onSubmitPayment({
        studentName,
        mobileNumber: studentMobile,
        amountRupees: fixedAmount,
        upiTransactionRef: '',
        imageBlob,
        fallbackBase64: imageBase64,
        subjectId: selectedPlanSubject,
      });

      if (reqId) {
        setSubmittedRequestId(reqId);
        setImageBlob(null);
        setImageBase64(null);
      }
    } catch (err) {
      setLocalError(mapErrorMessage(err));
    }
  };

  const handleSendScreenshotWhatsApp = () => {
    setLocalError(null);
    const latestSubmittedThumb =
      relevantPayments.length > 0 ? resolvePaymentImageSrc(relevantPayments[0]) : '';
    const effectivePreviewUrl = previewDataUrl || lastPreviewUrl || latestSubmittedThumb;
    launchWhatsAppPaymentWithScreenshot({
      studentName,
      mobileNumber: studentMobile,
      amountRupees: fixedAmount,
      subjectId: selectedPlanSubject,
      imageDataUrl: effectivePreviewUrl || undefined,
    });
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
      className="fixed inset-0 z-50 overflow-y-auto bg-[#FAF9F5] dark:bg-[#0B1120] text-[#0F172A] dark:text-[#F8FAFC]"
      role="dialog"
      aria-modal="true"
    >
      {/* Sticky Full-Screen Header */}
      <header className="sticky top-0 z-10 bg-white/95 dark:bg-[#1E293B]/95 backdrop-blur border-b border-[#E2E8F0] dark:border-[#334155]">
        <div className="max-w-2xl mx-auto px-3 sm:px-5 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onClose}
              aria-label={t.closeBtn}
              className="h-11 w-11 rounded-xl border border-[#CBD5E1] dark:border-[#334155] flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold leading-snug break-words">
                {defaultSubjectId === 'all'
                  ? t.unlockAllBannerTitle
                  : `${getSubjectDisplayName(defaultSubjectId, lang)} • ${lang === 'en' ? 'Unlock Quiz' : 'ક્વિઝ અનલૉક કરો'}`}
              </h3>
              <p className="text-xs text-[#475569] dark:text-[#94A3B8] truncate">
                {studentName} • +91 {studentMobile}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t.closeBtn}
            className="h-11 w-11 rounded-xl border border-[#CBD5E1] dark:border-[#334155] flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Full-Width Scrollable Payment & Unlock Body */}
      <main className="max-w-2xl mx-auto px-3.5 sm:px-5 py-4 pb-24 space-y-4">
        {/* 2-Tab Switcher: UPI Payment vs Code */}
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-1.5 shadow-sm">
          <button
            type="button"
            onClick={() => {
              setActiveTab('pay');
              setLocalError(null);
            }}
            className={`min-h-[48px] py-2 px-2.5 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 text-center leading-tight transition-colors cursor-pointer ${
              activeTab === 'pay'
                ? 'bg-[#1E3A8A] text-white shadow-sm'
                : 'text-[#475569] dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <IndianRupee className="h-4 w-4 shrink-0" />
            <span>{t.payTabLabel}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('code');
              setLocalError(null);
            }}
            className={`min-h-[48px] py-2 px-2.5 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 text-center leading-tight transition-colors cursor-pointer ${
              activeTab === 'code'
                ? 'bg-[#1E3A8A] text-white shadow-sm'
                : 'text-[#475569] dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <KeyRound className="h-4 w-4 shrink-0" />
            <span>{t.codeTabLabel}</span>
          </button>
        </div>

        {activeTab === 'pay' ? (
          <div className="space-y-4">
            {/* Fixed Price Plan Selector Card */}
            <section className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-4 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs sm:text-sm font-extrabold text-slate-800 dark:text-slate-100">
                  {t.fieldSubject}
                </p>
                <span className="rounded-full bg-[#DBEAFE] dark:bg-[#1E3A5F] text-[#1E3A8A] dark:text-[#93C5FD] px-2.5 py-0.5 text-[11px] font-bold">
                  {t.fixedPriceBadge}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {defaultSubjectId !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setSelectedPlanSubject(singleSubjectOptionId)}
                    className={`rounded-xl p-3.5 border-2 text-left transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                      selectedPlanSubject === singleSubjectOptionId
                        ? 'bg-[#DBEAFE]/70 dark:bg-[#1E3A5F] border-[#1E3A8A] text-[#1E3A8A] dark:text-white'
                        : 'bg-[#FAF9F5] dark:bg-[#0F172A] border-[#CBD5E1] dark:border-[#334155]'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold">
                        {getSubjectDisplayName(singleSubjectOptionId, lang)}
                      </p>
                      <p className="text-[11px] font-semibold opacity-80 mt-0.5">
                        {t.unlockSingleSubjectLabel}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xl font-extrabold tabular-nums">
                        ₹{PRICE_SINGLE_SUBJECT}
                      </p>
                      <span className="text-[10px] font-bold uppercase opacity-75">Fix</span>
                    </div>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedPlanSubject('all')}
                  className={`rounded-xl p-3.5 border-2 text-left transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                    defaultSubjectId === 'all' ? 'sm:col-span-2' : ''
                  } ${
                    selectedPlanSubject === 'all'
                      ? 'bg-[#FEF3C7] dark:bg-[#451A03] border-[#D97706] text-[#92400E] dark:text-[#FDE68A]'
                      : 'bg-[#FAF9F5] dark:bg-[#0F172A] border-[#CBD5E1] dark:border-[#334155]'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold">{getSubjectDisplayName('all', lang)}</p>
                    <p className="text-[11px] font-semibold opacity-80 mt-0.5 leading-snug">
                      {t.unlockAllSubjectsLabel}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xl font-extrabold tabular-nums">₹{PRICE_ALL_SUBJECTS}</p>
                    <span className="text-[10px] font-bold uppercase opacity-75">Fix</span>
                  </div>
                </button>
              </div>
            </section>

            {/* Single Clean UPI Payment Card (QR + Copy UPI + Intent Fallback) */}
            <section className="rounded-2xl bg-[#FEF3C7] dark:bg-[#451A03] border border-[#F59E0B]/40 p-4 text-[#92400E] dark:text-[#FDE68A] space-y-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-extrabold break-words">
                  <QrCode className="h-4 w-4 shrink-0" />
                  <span>{t.payQrTitle}</span>
                </span>
                <span className="rounded-lg bg-white/85 dark:bg-black/30 px-3 py-1 text-sm font-extrabold tabular-nums">
                  ₹{fixedAmount}
                </span>
              </div>

              {/* Crisp Scannable UPI QR Code + Payee Name */}
              <div className="rounded-2xl bg-white p-3.5 flex flex-col items-center gap-2.5 text-[#0F172A] shadow-sm">
                <p className="text-[11px] sm:text-xs font-extrabold text-center text-[#1E3A8A] break-words">
                  {ADMIN_UPI_NAME}
                </p>
                <div className="p-2 rounded-xl border border-slate-200 bg-white">
                  <svg
                    viewBox={`0 0 ${qrMatrix.size + 8} ${qrMatrix.size + 8}`}
                    className="w-44 h-44 sm:w-48 sm:h-48"
                    shapeRendering="crispEdges"
                    role="img"
                    aria-label={`${t.payQrTitle} ₹${fixedAmount}`}
                  >
                    <rect
                      x={0}
                      y={0}
                      width={qrMatrix.size + 8}
                      height={qrMatrix.size + 8}
                      fill="#FFFFFF"
                    />
                    {qrMatrix.modules.map((row, r) =>
                      row.map((dark, c) =>
                        dark ? (
                          <rect
                            key={`${r}-${c}`}
                            x={c + 4}
                            y={r + 4}
                            width={1}
                            height={1}
                            fill="#000000"
                          />
                        ) : null
                      )
                    )}
                  </svg>
                </div>

                <div className="w-full flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="download_qr_button"
                    onClick={handleDownloadQr}
                    className="flex-1 min-h-[48px] px-4 py-2 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Download className="h-4 w-4 shrink-0" />
                    <span>{t.payQrDownload}</span>
                  </button>
                  <button
                    type="button"
                    data-testid="share_qr_button"
                    onClick={handleSaveShareQr}
                    className="min-h-[48px] px-3.5 py-2 rounded-xl border border-[#CBD5E1] bg-[#FAF9F5] hover:bg-slate-100 text-[#0F172A] text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
                  >
                    <Share2 className="h-4 w-4 shrink-0" />
                    <span>{t.payQrShareOnly}</span>
                  </button>
                </div>
              </div>

              {/* Manual Copy UPI ID + Copy Amount (Bypasses Bank Intent Limits) */}
              <div className="rounded-xl bg-white/85 dark:bg-black/25 p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold opacity-75">UPI ID</p>
                    <p className="text-sm sm:text-base font-extrabold break-all">{ADMIN_UPI_ID}</p>
                  </div>
                  <span className="text-sm font-extrabold tabular-nums shrink-0">
                    ₹{fixedAmount}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopy(ADMIN_UPI_ID)}
                    className="min-h-[44px] px-3 rounded-lg bg-[#92400E]/15 hover:bg-[#92400E]/25 dark:bg-white/15 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="h-3.5 w-3.5 shrink-0" />
                    <span>{t.payCopyUpiId}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopy(String(fixedAmount))}
                    className="min-h-[44px] px-3 rounded-lg bg-[#92400E]/15 hover:bg-[#92400E]/25 dark:bg-white/15 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {t.payCopyAmount} ({fixedAmount})
                    </span>
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => launchUpiPayment(upiPaymentUrl)}
                className="w-full min-h-[48px] py-2.5 px-4 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] text-white text-sm font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <ExternalLink className="h-4 w-4 shrink-0" />
                <span>
                  {t.payUpiOpenApp} (₹{fixedAmount})
                </span>
              </button>

              <div className="rounded-xl bg-white/75 dark:bg-black/25 p-3 text-xs font-semibold leading-relaxed space-y-1">
                <p>{t.payUpiBankLimitNote}</p>
                <p className="opacity-85">{t.payUpiQuickTip}</p>
              </div>
            </section>

            {/* Screenshot Upload Form + Side-by-Side Admin & WhatsApp Buttons */}
            <form
              onSubmit={(e) => void handlePaymentSubmit(e)}
              className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-4 space-y-3.5 shadow-sm"
            >
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {t.fieldScreenshot}
                </label>
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
                  className="w-full min-h-[52px] px-3 py-2.5 rounded-xl border-2 border-dashed border-[#CBD5E1] dark:border-[#334155] hover:border-[#1E3A8A] text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <ImageIcon className="h-4 w-4 text-[#1E3A8A] dark:text-[#93C5FD] shrink-0" />
                  <span>
                    {isProcessingImage
                      ? t.preparingImage
                      : previewDataUrl
                        ? t.changeScreenshot
                        : t.pickScreenshot}
                  </span>
                </button>

                {previewDataUrl && (
                  <div className="h-48 w-full rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] overflow-hidden flex items-center justify-center p-2">
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

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="submit"
                  data-testid="submit_payment_admin_button"
                  disabled={isBusy || isProcessingImage}
                  className="min-h-[52px] py-2.5 px-3 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 text-center leading-tight transition-colors disabled:opacity-60 cursor-pointer"
                >
                  <Upload className="h-4 w-4 shrink-0" />
                  <span>{isBusy ? t.submittingBtn : t.submitToAdminBtn}</span>
                </button>

                <button
                  type="button"
                  data-testid="send_whatsapp_screenshot_button"
                  disabled={isProcessingImage}
                  onClick={handleSendScreenshotWhatsApp}
                  className="min-h-[52px] py-2.5 px-3 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 text-center leading-tight transition-colors disabled:opacity-60 cursor-pointer"
                >
                  <Send className="h-4 w-4 shrink-0" />
                  <span>{t.sendWhatsAppScreenshotBtn}</span>
                </button>
              </div>
            </form>

            {/* Live Request Status */}
            {relevantPayments.length > 0 && (
              <section className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-4 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-extrabold">{t.myRequestsTitle}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#D1FAE5] dark:bg-[#064E3B] text-[#064E3B] dark:text-[#D1FAE5] px-2.5 py-0.5 text-[10px] font-bold">
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
                        <div className="flex items-center gap-2.5 min-w-0">
                          {thumb && (
                            <img
                              src={thumb}
                              alt={t.zoomModalTitle}
                              className="h-10 w-10 rounded-lg object-cover shrink-0 border border-slate-300 dark:border-slate-700"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="font-bold truncate">
                              ₹{req.amountRupees} •{' '}
                              {getSubjectDisplayName(resolvePaymentSubjectId(req), lang)}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {displayPaymentTransactionRef(req)
                                ? `UTR: ${displayPaymentTransactionRef(req)} • `
                                : ''}
                              {formatTimestampLabel(req.createdAt, lang)}
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
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#92400E] dark:text-[#FDE68A]">
                          <Clock className="h-3.5 w-3.5 shrink-0 animate-pulse" />
                          <span>{t.waitingApprovalLive}</span>
                        </div>
                      )}

                      {req.status === 'rejected' && (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#7F1D1D] dark:text-[#FEE2E2]">
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
                            className="min-h-[36px] px-3 rounded-lg bg-[#047857] text-white text-xs font-extrabold cursor-pointer"
                          >
                            {t.useThisCodeBtn}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            )}
          </div>
        ) : (
          <form
            onSubmit={(e) => void handleCodeSubmit(e)}
            className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-4 space-y-4 shadow-sm"
          >
            <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
              {t.useCodeSubtitle}
            </p>

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
              className="w-full min-h-[52px] rounded-xl bg-[#1E3A8A] hover:bg-[#172554] dark:bg-[#2563EB] text-white text-sm font-extrabold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
            >
              <LockOpen className="h-4 w-4" />
              <span>{isBusy ? t.redeemingBtn : t.redeemNowBtn}</span>
            </button>
          </form>
        )}
      </main>
    </div>
  );
};
