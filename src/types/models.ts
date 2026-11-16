import type { Timestamp } from 'firebase/firestore';

export type SubjectId = 'maths' | 'science' | 'social_science';
export type AccessScopeId = SubjectId | 'all';

export interface StudentProfile {
  id: string;
  userId: string;
  fullName: string;
  mobileNumber: string;
  email: string;
  standard: string;
  hasQuizAccess: boolean;
  redeemedCode: string;
  paymentStatus: 'none' | 'pending' | 'approved' | 'rejected';
  totalQuizzesTaken: number;
  bestScorePercent: number;
  unlockedSubjects: string[];
  paymentRequestIds?: string[];
  activeDeviceId?: string;
  activeDeviceName?: string;
  isReturningUser?: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface AccessCodeUsedBy {
  uid: string;
  name: string;
  mobile: string;
  deviceInfo: string;
}

export interface AccessCode {
  id: string;
  code: string;
  requestId: string;
  userName: string;
  mobileNumber: string;
  amountRupees: number;
  batchName: string;
  status: 'unused' | 'used';
  isUsed: boolean;
  usedAt: Timestamp | null;
  usedBy: AccessCodeUsedBy | null;
  usedByUserId: string;
  usedByMobile: string;
  usedByName: string;
  source: 'book' | 'upi_payment';
  subjectId?: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface PaymentRequest {
  id: string;
  userId: string;
  studentName: string;
  mobileNumber: string;
  amountRupees: number;
  upiId: string;
  upiTransactionRef: string;
  utrNormalized: string;
  screenshotUrl: string;
  screenshotPath: string;
  screenshotBase64: string;
  status: 'pending' | 'approved' | 'rejected';
  assignedCode: string;
  adminNote: string;
  subjectId?: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface QuizAttempt {
  id: string;
  userId: string;
  subjectId: SubjectId;
  subjectTitle: string;
  chapterTitle: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  timeTakenSeconds: number;
  createdAt: Timestamp | null;
}

export type PolynomialGraphPattern =
  | 'Q01_X_EQ_PY_ONE_Y_TOUCH'
  | 'Q02_Y_EQ_PX_ONE_X_CROSS'
  | 'Q03_Y_EQ_PX_THREE_X_CROSS'
  | 'Q04_X_EQ_PY_ONE_Y_CROSS'
  | 'Q05_Y_EQ_PX_THREE_X_WAVE'
  | 'Q06_Y_EQ_PX_FOUR_X_WAVE'
  | 'Q07_Y_EQ_PX_TWO_X_PARABOLA'
  | 'Q08_X_EQ_PY_THREE_Y_WAVE'
  | 'Q09_Y_EQ_PX_ONE_X_TOUCH'
  | 'Q10_X_EQ_PY_ZERO_Y_LINE'
  | 'Q11_Y_EQ_PX_TWO_X_PARABOLA'
  | 'Q12_Y_EQ_PX_ONE_X_RIGHT_TOUCH';

export interface QuizQuestion {
  id: string;
  questionText: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  graphPattern?: PolynomialGraphPattern;
}

export interface QuizChapter {
  id: string;
  subjectId: SubjectId;
  chapterNumber: string;
  title: string;
  subtitle: string;
  questions: QuizQuestion[];
  questionTypeLabel: string;
  isFreeUnlocked?: boolean;
}

export interface QuizSubject {
  id: SubjectId;
  title: string;
  englishSubtitle: string;
  description: string;
  imageUrl: string;
  accentHex: string;
  chapters: QuizChapter[];
}

export interface AppReleaseConfig {
  id: string;
  githubOwnerRepo: string;
  releaseNotes: string;
  updatedAt: Timestamp | null;
}

export interface GitHubReleaseInfo {
  tagName: string;
  versionName: string;
  releaseTitle: string;
  releaseNotes: string;
  apkDownloadUrl: string;
  htmlUrl: string;
  apkSizeBytes: number;
  isUpdateAvailable: boolean;
}

export interface ActionBanner {
  isError: boolean;
  message: string;
}

export const ALL_SUBJECT_IDS: SubjectId[] = ['maths', 'science', 'social_science'];

export const PRICE_SINGLE_SUBJECT = 24;
export const PRICE_ALL_SUBJECTS = 49;

export function getFixedPlanPrice(subjectId: string): number {
  return subjectId === 'all' ? PRICE_ALL_SUBJECTS : PRICE_SINGLE_SUBJECT;
}

export function getSubjectDisplayName(subjectId: string, lang: 'gu' | 'en' = 'gu'): string {
  if (lang === 'en') {
    switch (subjectId) {
      case 'maths':
        return 'Mathematics';
      case 'science':
        return 'Science';
      case 'social_science':
        return 'Social Science';
      default:
        return 'All Subjects';
    }
  }
  switch (subjectId) {
    case 'maths':
      return 'ગણિત';
    case 'science':
      return 'વિજ્ઞાન';
    case 'social_science':
      return 'સામાજિક વિજ્ઞાન';
    default:
      return 'બધા વિષયો';
  }
}

export function getDefaultPrefix(subjectId: string): string {
  switch (subjectId) {
    case 'maths':
      return 'MATH';
    case 'science':
      return 'SCI';
    case 'social_science':
      return 'SOC';
    default:
      return 'STD10';
  }
}

export function resolveCodeSubjectId(
  code: string,
  batchName: string,
  explicitSubjectId = ''
): AccessScopeId {
  const normalizedExplicit = explicitSubjectId.trim().toLowerCase();
  if (normalizedExplicit === 'all') {
    return 'all';
  }
  if (
    normalizedExplicit === 'maths' ||
    normalizedExplicit === 'science' ||
    normalizedExplicit === 'social_science'
  ) {
    return normalizedExplicit;
  }
  const upperCode = code.trim().toUpperCase();
  if (upperCode.startsWith('MATH') || upperCode.startsWith('MTH')) return 'maths';
  if (upperCode.startsWith('SCI')) return 'science';
  if (upperCode.startsWith('SOC') || upperCode.startsWith('SS-')) return 'social_science';

  const cleanBatch = batchName.trim().toLowerCase();
  if (cleanBatch.includes('ગણિત') || cleanBatch.includes('maths') || cleanBatch.includes('math')) {
    return 'maths';
  }
  if (cleanBatch.includes('સામાજિક') || cleanBatch.includes('social')) {
    return 'social_science';
  }
  if (cleanBatch.includes('વિજ્ઞાન') || cleanBatch.includes('science')) {
    return 'science';
  }
  return 'all';
}

const PAYMENT_SUBJECT_TAG_REGEX = /^\[SUB:(maths|science|social_science|all)\]\s*\|?\s*/i;

export function encodePaymentRefWithSubject(rawUpiRef: string, subjectId: string): string {
  const cleanSub = ALL_SUBJECT_IDS.includes(subjectId as SubjectId) ? subjectId : 'all';
  const cleanRef = rawUpiRef.replace(PAYMENT_SUBJECT_TAG_REGEX, '').trim();
  const tagged = cleanRef.length > 0 ? `[SUB:${cleanSub}] ${cleanRef}` : `[SUB:${cleanSub}]`;
  return tagged.slice(0, 60);
}

export function resolvePaymentSubjectId(req: PaymentRequest): AccessScopeId {
  const normalizedExplicit = (req.subjectId || '').trim().toLowerCase();
  if (ALL_SUBJECT_IDS.includes(normalizedExplicit as SubjectId)) {
    return normalizedExplicit as SubjectId;
  }
  const match = req.upiTransactionRef.match(PAYMENT_SUBJECT_TAG_REGEX);
  if (match) {
    const tagged = match[1].toLowerCase();
    if (ALL_SUBJECT_IDS.includes(tagged as SubjectId)) return tagged as SubjectId;
    if (tagged === 'all') return 'all';
  }
  if (req.assignedCode.trim().length > 0) {
    return resolveCodeSubjectId(req.assignedCode, '', '');
  }
  return 'all';
}

export function displayPaymentTransactionRef(req: PaymentRequest): string {
  const cleaned = req.upiTransactionRef.replace(PAYMENT_SUBJECT_TAG_REGEX, '').trim();
  if (
    !cleaned ||
    cleaned.startsWith('SS-') ||
    cleaned === 'SCREENSHOT' ||
    cleaned === 'SCREENSHOT_ONLY'
  ) {
    return '';
  }
  return cleaned;
}

export function studentHasAccessToSubject(student: StudentProfile, subjectId: SubjectId): boolean {
  if (
    student.hasQuizAccess ||
    student.unlockedSubjects.includes('all') ||
    student.unlockedSubjects.includes(subjectId)
  ) {
    return true;
  }
  return false;
}
