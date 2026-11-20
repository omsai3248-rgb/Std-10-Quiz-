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
  freeMockUsedSubjects?: string[];
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
  sourceLabel?: string;
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
  isMockTest?: boolean;
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
  latestVersionName?: string;
  latestVersionCode?: number;
  updateTitle?: string;
  apkDownloadUrl?: string;
  apkStoragePath?: string;
  apkFileName?: string;
  apkSizeBytes?: number;
  apkSha256?: string;
  signingCertSha256?: string;
  packageName?: string;
  isMandatory?: boolean;
  publishedByUid?: string;
  publishedAt?: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface GitHubReleaseInfo {
  tagName: string;
  versionName: string;
  versionCode?: number;
  releaseTitle: string;
  releaseNotes: string;
  apkDownloadUrl: string;
  htmlUrl: string;
  apkSizeBytes: number;
  apkSha256?: string;
  signingCertSha256?: string;
  packageName?: string;
  isMandatory?: boolean;
  source?: 'firebase' | 'github' | 'web_sw';
  isUpdateAvailable: boolean;
}

export interface AppReleaseRecord {
  id: string;
  versionName: string;
  versionCode: number;
  updateTitle: string;
  releaseNotes: string;
  apkDownloadUrl: string;
  apkStoragePath: string;
  apkFileName: string;
  apkSizeBytes: number;
  apkSha256: string;
  signingCertSha256: string;
  packageName: string;
  isMandatory: boolean;
  publishedByUid: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface UpdateNotificationRecord {
  id: string;
  releaseId: string;
  appName: string;
  versionName: string;
  versionCode: number;
  title: string;
  body: string;
  isMandatory: boolean;
  apkDownloadUrl: string;
  targetRoute: 'app_update';
  pushDispatched: boolean;
  recipientCount: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface InstalledAppInfo {
  packageName: string;
  versionName: string;
  versionCode: number;
  signingCertSha256: string;
  signingCertSha1: string;
  canRequestPackageInstalls: boolean;
}

export interface InspectedApkMetadata {
  fileName: string;
  stagedFilePath: string;
  fileSizeBytes: number;
  packageName: string;
  versionName: string;
  versionCode: number;
  apkSha256: string;
  signingCertSha256: string;
  signingCertSha1: string;
  packageMatches: boolean;
  signatureMatches: boolean;
  isUpgradeOverInstalled: boolean;
}

export interface AppUpdateProgressEvent {
  status:
    | 'idle'
    | 'uploading'
    | 'downloading'
    | 'verifying'
    | 'permission_required'
    | 'permission_denied'
    | 'installing'
    | 'error';
  progressPercent: number;
  bytesTransferred?: number;
  bytesDownloaded?: number;
  totalBytes: number;
  message?: string;
}

export interface PublishAppUpdateInput {
  stagedFilePath?: string;
  file?: File | null;
  versionName: string;
  versionCode: number;
  updateTitle: string;
  releaseNotes: string;
  isMandatory: boolean;
  apkDownloadUrl?: string;
  apkStoragePath?: string;
  apkFileName?: string;
  apkSizeBytes?: number;
  apkSha256?: string;
  signingCertSha256?: string;
  packageName?: string;
  githubOwnerRepo?: string;
  onUploadProgress?: (pct: number, transferred: number, total: number) => void;
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
  switch (subjectId.trim().toLowerCase()) {
    case 'maths':
      return 'MAT';
    case 'science':
      return 'SCI';
    case 'social_science':
      return 'SOC';
    default:
      return 'ALL';
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
  if (upperCode.startsWith('MAT') || upperCode.startsWith('MTH')) return 'maths';
  if (upperCode.startsWith('SCI')) return 'science';
  if (upperCode.startsWith('SOC') || upperCode.startsWith('SS-')) return 'social_science';
  if (upperCode.startsWith('ALL')) return 'all';

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

export type AdminNotificationCategory =
  | 'registration'
  | 'login'
  | 'payment'
  | 'code_redeem'
  | 'quiz_activity'
  | 'data_update'
  | 'admin_chat';

export type AdminNotificationRoute =
  | 'admin_requests'
  | 'admin_codes'
  | 'admin_students'
  | 'admin_updates'
  | 'admin_notifications';

export type PushBroadcastCategory = 'admin_message' | 'exam_notice' | 'app_update';

export type PushBroadcastTargetRoute =
  | 'home'
  | 'mock_test'
  | 'app_update'
  | 'subject_maths'
  | 'subject_science'
  | 'subject_social_science';

export interface PushBroadcastRecord {
  id: string;
  category: PushBroadcastCategory;
  title: string;
  body: string;
  targetRoute: PushBroadcastTargetRoute;
  referenceId: string;
  senderUid: string;
  senderName: string;
  pushDispatched: boolean;
  recipientCount: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface SendPushBroadcastInput {
  category: PushBroadcastCategory;
  title: string;
  body: string;
  targetRoute: PushBroadcastTargetRoute;
  referenceId?: string;
}

export type AdminDeepLinkRoute =
  | AdminNotificationRoute
  | 'admin_chat'
  | 'app_update'
  | PushBroadcastTargetRoute;

export interface AdminNotificationPrefs {
  registrations: boolean;
  logins: boolean;
  payments: boolean;
  codeRedemptions: boolean;
  quizActivity: boolean;
  dataUpdates: boolean;
  adminChat: boolean;
}

export const DEFAULT_ADMIN_NOTIFICATION_PREFS: AdminNotificationPrefs = {
  registrations: true,
  logins: true,
  payments: true,
  codeRedemptions: true,
  quizActivity: true,
  dataUpdates: true,
  adminChat: true,
};

export interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  photoUrl: string;
  role: 'super_admin' | 'admin';
  isActive: boolean;
  notificationPrefs: AdminNotificationPrefs;
  fcmTokenRegistered?: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface AdminInvite {
  email: string;
  displayName: string;
  addedByUid: string;
  createdAt: Timestamp | null;
}

export interface AdminNotificationItem {
  id: string;
  category: AdminNotificationCategory;
  title: string;
  body: string;
  actorName: string;
  actorMobile: string;
  actorId: string;
  targetRoute: AdminNotificationRoute;
  referenceId: string;
  isRead: boolean;
  readBy: string[];
  pushDispatched: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type ChatMessageStatus = 'sent' | 'delivered' | 'read';

export interface AdminChatParticipantMeta {
  displayName: string;
  photoUrl: string;
}

export interface AdminChatThread {
  id: string;
  participants: string[];
  participantMeta: Record<string, AdminChatParticipantMeta>;
  lastMessageText: string;
  lastMessageSenderUid: string;
  lastMessageSenderName: string;
  lastMessageStatus: ChatMessageStatus;
  lastMessageAt: Timestamp | null;
  unreadCounts: Record<string, number>;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface AdminChatMessage {
  id: string;
  chatId: string;
  senderUid: string;
  senderName: string;
  senderPhotoUrl: string;
  recipientUid: string;
  participantUids: string[];
  text: string;
  status: ChatMessageStatus;
  deliveredAt: Timestamp | null;
  readAt: Timestamp | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface AdminDeepLinkPayload {
  targetRoute: AdminDeepLinkRoute;
  category?: AdminNotificationCategory | string;
  actorName?: string;
  actorMobile?: string;
  chatId?: string;
  senderUid?: string;
  notifId?: string;
  referenceId?: string;
  broadcastId?: string;
  broadcastCategory?: PushBroadcastCategory | string;
  broadcastTitle?: string;
  broadcastBody?: string;
  versionName?: string;
  versionCode?: number;
  updateTitle?: string;
  releaseNotes?: string;
  apkDownloadUrl?: string;
  isMandatory?: boolean;
}

export interface AdminFocusedTarget {
  tab: 'requests' | 'all_codes' | 'used_codes' | 'students' | 'notifications' | 'chat' | 'updates';
  referenceId?: string;
  actorName?: string;
  actorMobile?: string;
  category?: string;
  title?: string;
  body?: string;
  notifId?: string;
}
