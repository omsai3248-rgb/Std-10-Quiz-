import type { Timestamp } from 'firebase/firestore';
import {
  displayPaymentTransactionRef,
  getSubjectDisplayName,
  resolveCodeSubjectId,
  resolvePaymentSubjectId,
  type AccessCode,
  type PaymentRequest,
} from '../types/models';
import { ADMIN_PHONE_TEN_DIGITS } from '../services/quizRepository';

export function formatTimestampLabel(
  timestamp: Timestamp | null | undefined,
  lang: 'gu' | 'en' = 'gu'
): string {
  if (!timestamp) return lang === 'en' ? 'Just now' : 'હમણાં જ';
  const date = new Date(timestamp.seconds * 1000);
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getDeviceBrowserInfo(): string {
  if (typeof navigator === 'undefined') return 'Unknown Device';
  const ua = navigator.userAgent || '';
  let browser = 'Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';

  let os = 'Web';
  if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  const screenSize =
    typeof window !== 'undefined' && window.screen
      ? `${window.screen.width}x${window.screen.height}`
      : '';

  return [browser, os, screenSize].filter(Boolean).join(' • ').slice(0, 180);
}

interface AndroidBridgeApi {
  saveExportedFile?: (suggestedName: string, dataUrl: string) => void;
  openUpiPayment?: (upiUrl: string, fallbackUpiUrl: string) => void;
  openExternalUrl?: (url: string) => void;
}

declare global {
  interface Window {
    AndroidBridge?: AndroidBridgeApi;
  }
}

export function buildUpiPaymentHref(
  upiId: string,
  payeeName: string,
  amountRupees: number,
  studentMobile: string
): string {
  const cleanAmount = Math.max(1, Number(amountRupees) || 24).toFixed(2);
  const cleanMob = studentMobile.replace(/\D/g, '').slice(-10);
  const note = cleanMob ? `Std10Quiz-${cleanMob}` : 'Std10QuizFee';
  const query = [
    `pa=${encodeURIComponent(upiId.trim())}`,
    `pn=${encodeURIComponent(payeeName.trim())}`,
    `am=${encodeURIComponent(cleanAmount)}`,
    'cu=INR',
    `tn=${encodeURIComponent(note)}`,
  ].join('&');

  return `upi://pay?${query}`;
}

export function launchUpiPayment(upiUrl: string): void {
  if (typeof window === 'undefined') return;
  if (window.AndroidBridge?.openUpiPayment) {
    window.AndroidBridge.openUpiPayment(upiUrl, upiUrl);
    return;
  }
  window.location.href = upiUrl;
}

export function launchExternalUrl(url: string): void {
  if (typeof window === 'undefined' || !url) return;
  if (window.AndroidBridge?.openExternalUrl) {
    window.AndroidBridge.openExternalUrl(url);
    return;
  }
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    window.location.href = url;
  }
}

export function normalizeIndianMobileInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) {
    return digits.slice(2, 12);
  }
  if (digits.length > 10 && digits.startsWith('0')) {
    return digits.slice(1, 11);
  }
  return digits.slice(0, 10);
}

export function formatIndianWhatsAppPhone(mobileNumber: string): string {
  const digits = mobileNumber.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
}

export function buildPaymentApprovalWhatsAppHref(
  req: PaymentRequest,
  lang: 'gu' | 'en' = 'gu'
): string {
  const subjectName = getSubjectDisplayName(resolvePaymentSubjectId(req), lang);
  const utr = displayPaymentTransactionRef(req);
  const lines =
    lang === 'en'
      ? [
          `Hello ${req.studentName},`,
          `Your payment of ₹${req.amountRupees} has been APPROVED ✅`,
          '',
          `🔑 Your 8-Character Access Code: *${req.assignedCode}*`,
          `• Subject: ${subjectName}`,
          `• Mobile: +91 ${req.mobileNumber}`,
          ...(utr ? [`• UTR ID: ${utr}`] : []),
          ...(req.adminNote ? [`• Note: ${req.adminNote}`] : []),
          '',
          'Open the "Use Code" page in the app and enter this code to unlock your content.',
        ]
      : [
          `નમસ્તે ${req.studentName},`,
          `તમારું ₹${req.amountRupees} નું પેમેન્ટ મંજૂર (Approved) થયું છે ✅`,
          '',
          `🔑 તમારો એક્સેસ કોડ: *${req.assignedCode}*`,
          `• વિષય: ${subjectName}`,
          `• મોબાઇલ: +91 ${req.mobileNumber}`,
          ...(utr ? [`• UTR નંબર: ${utr}`] : []),
          ...(req.adminNote ? [`• નોંધ: ${req.adminNote}`] : []),
          '',
          'એપમાં "કોડ વાપરો (Use Code)" પેજ પર જઈ આ કોડ નાખીને તરત અનલૉક કરો.',
        ];

  const phone = formatIndianWhatsAppPhone(req.mobileNumber);
  return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`;
}

export function buildStudentProofWhatsAppHref(params: {
  studentName: string;
  userId: string;
  mobileNumber: string;
  amountRupees?: number;
  subjectId: string;
  upiRef: string;
}): string {
  const subjectLabel = getSubjectDisplayName(params.subjectId, 'gu');
  const amt = params.amountRupees ?? 24;
  const lines = [
    `નમસ્તે એડમિન, મેં ₹${amt} નું પેમેન્ટ મોકલ્યું છે:`,
    `• નામ: ${params.studentName}`,
    `• મોબાઇલ: +91 ${params.mobileNumber}`,
    `• વિષય: ${subjectLabel}`,
    ...(params.upiRef ? [`• UTR નંબર: ${params.upiRef}`] : []),
    'કૃપા કરીને એપ્રુવ કરી કોડ આપશો.',
  ];
  return `https://wa.me/91${ADMIN_PHONE_TEN_DIGITS}?text=${encodeURIComponent(lines.join('\n'))}`;
}

export async function compressImageFileToBlobAndBase64(file: File): Promise<{
  blob: Blob;
  base64: string;
}> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Invalid image'));
    };
    image.src = objectUrl;
  });

  const maxBase64Chars = 140_000;
  let maxDim = 900;
  let bestEncoded = '';
  let bestBlob: Blob | null = null;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  while (maxDim >= 320) {
    const largest = Math.max(img.width, img.height);
    const scale = largest > maxDim ? maxDim / largest : 1;
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    for (const quality of [0.78, 0.65, 0.5, 0.38]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const base64 = dataUrl.split('base64,')[1] ?? '';
      bestEncoded = base64;
      if (base64.length > 0 && base64.length <= maxBase64Chars) {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
        );
        if (blob) {
          return { blob, base64 };
        }
      }
    }
    maxDim -= 160;
  }

  const fallbackUrl = canvas.toDataURL('image/jpeg', 0.38);
  const fallbackBase64 = fallbackUrl.split('base64,')[1] ?? bestEncoded;
  bestBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.38)
  );
  if (!fallbackBase64 || !bestBlob || fallbackBase64.length > 440_000) {
    throw new Error('સ્ક્રીનશોટ વાંચવામાં ભૂલ આવી.');
  }
  return { blob: bestBlob, base64: fallbackBase64 };
}

export function toImageDataUrl(base64OrDataUrl: string): string {
  if (!base64OrDataUrl) return '';
  if (base64OrDataUrl.startsWith('data:image/') || base64OrDataUrl.startsWith('http')) {
    return base64OrDataUrl;
  }
  return `data:image/jpeg;base64,${base64OrDataUrl.trim()}`;
}

export function resolvePaymentImageSrc(req: Pick<PaymentRequest, 'screenshotUrl' | 'screenshotBase64'>): string {
  if (req.screenshotUrl && req.screenshotUrl.trim().length > 0) {
    return req.screenshotUrl.trim();
  }
  if (req.screenshotBase64 && req.screenshotBase64.trim().length > 0) {
    return toImageDataUrl(req.screenshotBase64);
  }
  return '';
}

function escapeCsvCell(val: string | number | boolean | null | undefined): string {
  const s = String(val ?? '');
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportAccessCodesToCsv(codes: AccessCode[], filePrefix = 'access_codes'): void {
  const headers = [
    'code',
    'status',
    'subject',
    'requestId',
    'userName',
    'mobileNumber',
    'amountRupees',
    'createdAt',
    'usedAt',
    'usedByName',
    'usedByMobile',
    'usedByDevice',
  ];
  const rows = codes.map((c) => {
    const sub = resolveCodeSubjectId(c.code, c.batchName, c.subjectId);
    const createdStr = c.createdAt ? new Date(c.createdAt.seconds * 1000).toISOString() : '';
    const usedStr = c.usedAt ? new Date(c.usedAt.seconds * 1000).toISOString() : '';
    return [
      c.code,
      c.status || (c.isUsed ? 'used' : 'unused'),
      sub,
      c.requestId || '',
      c.userName || '',
      c.mobileNumber || '',
      c.amountRupees ?? 0,
      createdStr,
      usedStr,
      c.usedBy?.name || c.usedByName || '',
      c.usedBy?.mobile || c.usedByMobile || '',
      c.usedBy?.deviceInfo || '',
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  link.href = url;
  link.download = `${filePrefix}_${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
