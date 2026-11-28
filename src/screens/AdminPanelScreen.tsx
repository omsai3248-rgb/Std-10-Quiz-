import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  BookOpen,
  CheckCircle2,
  Clock,
  Cloud,
  Copy,
  Eye,
  EyeOff,
  FolderKanban,
  Languages,
  LogOut,
  MessageCircle,
  Monitor,
  Radio,
  RefreshCw,
  Send,
  Settings,
  Trash2,
  UserCheck,
  Users,
  Volume2,
  VolumeX,
  Wallet,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useAdaptiveDisplay } from '../context/AdaptiveDisplayContext';
import { useTranslation } from '../i18n/translations';
import { ADMIN_PASSCODE, type DirectMobileCodeResult } from '../services/quizRepository';
import {
  formatLastSyncDateTime,
  resetFailedOperationsForRetry,
  type SyncStatusSnapshot,
} from '../services/syncManager';
import {
  displayPaymentTransactionRef,
  getSubjectDisplayName,
  resolvePaymentSubjectId,
  type AccessCode,
  type AdminChatMessage,
  type AdminChatThread,
  type AdminFocusedTarget,
  type AdminInvite,
  type AdminNotificationItem,
  type AdminNotificationPrefs,
  type AdminNotificationRoute,
  type AdminUser,
  type AppReleaseConfig,
  type BookOrder,
  type BookOrderPaymentStatus,
  type BookStockInventory,
  type InstalledAppInfo,
  type PaymentRequest,
  type PublishAppUpdateInput,
  type PushBroadcastRecord,
  type SaveBookOrderInput,
  type SendPushBroadcastInput,
  type StudentProfile,
  type SubjectId,
  type UpdateNotificationRecord,
  DEFAULT_BOOK_STOCK,
} from '../types/models';
import {
  buildPaymentApprovalWhatsAppHref,
  launchExternalUrl,
} from '../utils/imageUtils';
import { AdminBookOrdersTab } from './AdminBookOrdersTab';
import { AdminChatTab } from './AdminChatTab';
import { AdminNotificationsTab } from './AdminNotificationsTab';
import {
  AdminAllCodesTab,
  AdminRequestsTab,
  AdminStudentsTab,
  AdminUsedCodesTab,
} from './AdminTabs';
import { AdminUpdateSettingsTab } from './AdminUpdateSettingsTab';

export type AdminTabId =
  | 'requests'
  | 'book_orders'
  | 'all_codes'
  | 'used_codes'
  | 'students'
  | 'notifications'
  | 'chat'
  | 'updates';

export interface AdminLiveAlert {
  id: string;
  kind: 'new_payment' | 'code_used';
  title: string;
  detail: string;
  timestampLabel: string;
}

interface AdminPanelScreenProps {
  payments: PaymentRequest[];
  accessCodes: AccessCode[];
  students: StudentProfile[];
  lastGeneratedBatch: string[];
  liveAlerts: AdminLiveAlert[];
  isSoundEnabled: boolean;
  releaseConfig: AppReleaseConfig | null;
  installedAppInfo?: InstalledAppInfo | null;
  updateNotifications?: UpdateNotificationRecord[];
  currentVersionName: string;
  currentVersionCode?: number;
  isBusy: boolean;
  isCheckingUpdate: boolean;
  syncStatus: SyncStatusSnapshot;
  hasMorePayments?: boolean;
  isLoadingMorePayments?: boolean;
  onLoadMorePayments?: () => void;
  hasMoreCodes?: boolean;
  isLoadingMoreCodes?: boolean;
  onLoadMoreCodes?: () => void;
  hasMoreStudents?: boolean;
  isLoadingMoreStudents?: boolean;
  onLoadMoreStudents?: () => void;
  approvedConfirmation?: PaymentRequest | null;
  onDismissApprovedConfirmation?: () => void;
  onBackToPublic: () => void;
  onForceSync: () => void;
  onSyncNow: () => void;
  onToggleSound: () => void;
  onClearAlerts: () => void;
  onSignOut: () => void;
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
  onApprovePayment: (req: PaymentRequest, adminNote: string, subjectId: string) => void;
  onRejectPayment: (req: PaymentRequest, reason: string) => void;
  onToggleStudentAccess: (student: StudentProfile, grantAccess: boolean) => void;
  onUpdateStudentSubjectAccess: (
    student: StudentProfile,
    subjectId: SubjectId,
    grantAccess: boolean
  ) => void;
  onPublishAppUpdate: (
    input: PublishAppUpdateInput
  ) => Promise<{ releaseId: string; apkDownloadUrl: string; versionName: string; versionCode: number }>;
  onDeleteReleaseHistory?: (releaseId: string) => Promise<void>;
  onSaveGithubRepo?: (repo: string) => Promise<void>;
  onTestUpdateCheck: () => void;
  onDeletePayment: (req: PaymentRequest) => Promise<void> | void;
  onDeleteCode: (code: AccessCode) => Promise<void> | void;
  onDeleteUnusedCodes?: (batchName?: string) => Promise<number>;
  onFetchBatchCodes?: (batchName: string) => Promise<AccessCode[]>;
  onDeleteStudent: (student: StudentProfile) => Promise<void> | void;
  onOpenDisplaySettings?: () => void;
  onNotify?: (message: string, isError?: boolean) => void;
  // Admin Notification Center & Personal Messaging Props
  currentAdminUid?: string;
  currentAdminEmail?: string;
  isSuperAdmin?: boolean;
  adminDirectory?: AdminUser[];
  adminInvites?: AdminInvite[];
  adminNotifications?: AdminNotificationItem[];
  adminChats?: AdminChatThread[];
  notificationPrefs?: AdminNotificationPrefs | null;
  notificationPermissionStatus?: 'granted' | 'denied' | 'default';
  activeChatId?: string;
  activeChatMessages?: AdminChatMessage[];
  controlledTab?: AdminTabId;
  onSelectTab?: (tab: AdminTabId) => void;
  onSelectChat?: (chatId: string) => void;
  onRequestNotificationPermission?: () => Promise<void> | void;
  onUpdateNotificationPrefs?: (prefs: AdminNotificationPrefs) => Promise<void> | void;
  onMarkNotificationRead?: (notifId: string) => Promise<void> | void;
  onMarkAllNotificationsRead?: () => Promise<void> | void;
  onDeleteNotification?: (notifId: string) => Promise<void> | void;
  onSendChatMessage?: (params: {
    recipientUid: string;
    recipientName: string;
    recipientPhotoUrl?: string;
    text: string;
  }) => Promise<void>;
  onMarkChatRead?: (chatId: string) => Promise<void> | void;
  onInviteAdmin?: (email: string, displayName: string) => Promise<void>;
  onRemoveAdminInvite?: (email: string) => Promise<void>;
  pushBroadcasts?: PushBroadcastRecord[];
  onOpenNotificationSettings?: () => void;
  onSendPushBroadcast?: (input: SendPushBroadcastInput) => Promise<void>;
  onDeletePushBroadcast?: (broadcastId: string) => Promise<void>;
  focusedTarget?: AdminFocusedTarget | null;
  onClearFocusedTarget?: () => void;
  onFocusNotificationTarget?: (target: AdminFocusedTarget | null) => void;
  // Book Order Management Props
  bookOrders?: BookOrder[];
  bookStock?: BookStockInventory;
  onSaveBookOrder?: (input: SaveBookOrderInput) => Promise<void>;
  onToggleBookOrderStatus?: (orderId: string, nextStatus: BookOrderPaymentStatus) => Promise<void>;
  onDeleteBookOrder?: (order: BookOrder) => Promise<void>;
  onUpdateBookStock?: (next: {
    maths: number;
    science: number;
    social_science: number;
  }) => Promise<void>;
}

type PendingDeleteTarget =
  | { kind: 'payment'; req: PaymentRequest; title: string; subtitle: string }
  | { kind: 'code'; code: AccessCode; title: string; subtitle: string }
  | { kind: 'student'; student: StudentProfile; title: string; subtitle: string };

export const AdminPanelScreen: React.FC<AdminPanelScreenProps> = ({
  payments,
  accessCodes,
  students,
  lastGeneratedBatch,
  liveAlerts,
  isSoundEnabled,
  releaseConfig,
  installedAppInfo = null,
  updateNotifications = [],
  currentVersionName,
  currentVersionCode = 1,
  isBusy,
  isCheckingUpdate,
  syncStatus,
  hasMorePayments = false,
  isLoadingMorePayments = false,
  onLoadMorePayments,
  hasMoreCodes = false,
  isLoadingMoreCodes = false,
  onLoadMoreCodes,
  hasMoreStudents = false,
  isLoadingMoreStudents = false,
  onLoadMoreStudents,
  approvedConfirmation = null,
  onDismissApprovedConfirmation,
  onBackToPublic,
  onForceSync,
  onSyncNow,
  onToggleSound,
  onClearAlerts,
  onSignOut,
  onGenerateBulkCodes,
  onGenerateDirectCode,
  onApprovePayment,
  onRejectPayment,
  onToggleStudentAccess,
  onUpdateStudentSubjectAccess,
  onPublishAppUpdate,
  onDeleteReleaseHistory,
  onSaveGithubRepo,
  onTestUpdateCheck,
  onDeletePayment,
  onDeleteCode,
  onDeleteUnusedCodes,
  onFetchBatchCodes,
  onDeleteStudent,
  onOpenDisplaySettings,
  onNotify,
  currentAdminUid = '',
  currentAdminEmail = '',
  isSuperAdmin = false,
  adminDirectory = [],
  adminInvites = [],
  adminNotifications = [],
  adminChats = [],
  notificationPrefs = null,
  notificationPermissionStatus = 'default',
  activeChatId = '',
  activeChatMessages = [],
  controlledTab,
  onSelectTab,
  onSelectChat,
  onRequestNotificationPermission,
  onUpdateNotificationPrefs,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onDeleteNotification,
  onSendChatMessage,
  onMarkChatRead,
  onInviteAdmin,
  onRemoveAdminInvite,
  pushBroadcasts = [],
  onOpenNotificationSettings,
  onSendPushBroadcast,
  onDeletePushBroadcast,
  focusedTarget = null,
  onClearFocusedTarget,
  onFocusNotificationTarget,
  bookOrders = [],
  bookStock = DEFAULT_BOOK_STOCK,
  onSaveBookOrder,
  onToggleBookOrderStatus,
  onDeleteBookOrder,
  onUpdateBookStock,
}) => {
  const { lang, toggleLang, t } = useTranslation();
  const { useNavigationRail, isLargeScreen, isTvOrSmartBoard } = useAdaptiveDisplay();
  const [internalTab, setInternalTab] = useState<AdminTabId>('requests');
  const selectedTab = controlledTab ?? internalTab;
  const selectTab = (tab: AdminTabId) => {
    setInternalTab(tab);
    onSelectTab?.(tab);
  };
  const [showAlertsDrawer, setShowAlertsDrawer] = useState(false);
  const [zoomedScreenshotUrl, setZoomedScreenshotUrl] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteTarget | null>(null);
  const [deletePasscodeInput, setDeletePasscodeInput] = useState('');
  const [showDeletePasscode, setShowDeletePasscode] = useState(false);
  const [deletePasscodeError, setDeletePasscodeError] = useState<string | null>(null);

  useEffect(() => {
    if (!zoomedScreenshotUrl && !pendingDelete) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setZoomedScreenshotUrl(null);
        setPendingDelete(null);
        setDeletePasscodeInput('');
        setDeletePasscodeError(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomedScreenshotUrl, pendingDelete]);

  const openDeleteModal = (target: PendingDeleteTarget) => {
    setDeletePasscodeInput('');
    setShowDeletePasscode(false);
    setDeletePasscodeError(null);
    setPendingDelete(target);
  };

  const handleConfirmPasswordDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingDelete) return;
    if (deletePasscodeInput !== ADMIN_PASSCODE) {
      setDeletePasscodeError(t.errWrongAdminPassword);
      return;
    }
    const target = pendingDelete;
    setDeletePasscodeError(null);
    setPendingDelete(null);
    setDeletePasscodeInput('');

    if (target.kind === 'payment') {
      await onDeletePayment(target.req);
    } else if (target.kind === 'code') {
      await onDeleteCode(target.code);
    } else {
      await onDeleteStudent(target.student);
    }
  };

  const pendingCount = payments.filter((p) => p.status === 'pending').length;
  const usedCodeCount = accessCodes.filter((c) => c.status === 'used' || c.isUsed).length;
  const unreadNotificationsCount = adminNotifications.filter(
    (n) => !n.isRead && (!currentAdminUid || !n.readBy.includes(currentAdminUid))
  ).length;
  const unreadChatCount = adminChats.reduce(
    (sum, c) => sum + (currentAdminUid ? Number(c.unreadCounts?.[currentAdminUid] ?? 0) : 0),
    0
  );

  const handleOpenNotificationRoute = (
    targetRoute: AdminNotificationRoute,
    item?: AdminNotificationItem
  ) => {
    let targetTab: AdminTabId = 'notifications';
    switch (targetRoute) {
      case 'admin_requests':
        targetTab = 'requests';
        break;
      case 'admin_codes':
        targetTab = 'used_codes';
        break;
      case 'admin_students':
        targetTab = 'students';
        break;
      case 'admin_updates':
        targetTab = 'updates';
        break;
      default:
        targetTab = 'notifications';
        break;
    }
    selectTab(targetTab);
    if (item && onFocusNotificationTarget) {
      onFocusNotificationTarget({
        tab: targetTab,
        referenceId: item.referenceId || item.actorId || undefined,
        actorName: item.actorName || undefined,
        actorMobile: item.actorMobile || undefined,
        category: item.category,
        title: item.title,
        body: item.body,
        notifId: item.id,
      });
    }
  };

  const adminTabs = [
    {
      id: 'requests' as const,
      label: `${t.tabRequests} (${pendingCount})`,
      Icon: Wallet,
      badge: pendingCount,
    },
    {
      id: 'book_orders' as const,
      label:
        lang === 'en'
          ? `Book Orders (${bookOrders.length})`
          : `બુક ઓર્ડર (${bookOrders.length})`,
      Icon: BookOpen,
      badge: bookOrders.filter((o) => o.paymentStatus === 'pending').length,
    },
    {
      id: 'notifications' as const,
      label: t.tabNotifications,
      Icon: Bell,
      badge: unreadNotificationsCount,
    },
    {
      id: 'chat' as const,
      label: t.tabAdminChat,
      Icon: MessageCircle,
      badge: unreadChatCount,
    },
    {
      id: 'all_codes' as const,
      label: `${t.tabAllCodes} (${accessCodes.length})`,
      Icon: FolderKanban,
      badge: 0,
    },
    {
      id: 'used_codes' as const,
      label: `${t.tabUsedCodes} (${usedCodeCount})`,
      Icon: UserCheck,
      badge: 0,
    },
    {
      id: 'students' as const,
      label: `${t.tabStudents} (${students.length})`,
      Icon: Users,
      badge: 0,
    },
    {
      id: 'updates' as const,
      label: t.tabUpdates,
      Icon: Settings,
      badge: 0,
    },
  ];

  const containerMaxWidth = isLargeScreen ? 'max-w-[1600px]' : 'max-w-6xl';

  return (
    <div className="min-h-screen bg-[#FAF9F5] dark:bg-[#0B1120] text-[#0F172A] dark:text-[#F8FAFC] flex flex-col">
      {/* Sticky Live Admin Header */}
      <header className="sticky top-0 z-30 pt-[env(safe-area-inset-top)] bg-white/95 dark:bg-[#1E293B]/95 backdrop-blur border-b border-[#E2E8F0] dark:border-[#334155]">
        <div className={`${containerMaxWidth} mx-auto px-3 sm:px-5 h-16 flex items-center justify-between gap-2`}>
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onBackToPublic}
              className="min-h-[48px] min-w-[48px] p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0 flex items-center justify-center"
              aria-label={t.backToPublic}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-extrabold truncate">
                  {t.adminPanelTitle}
                </h1>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold shrink-0 ${
                    syncStatus.liveSyncState === 'active'
                      ? 'bg-[#D1FAE5] dark:bg-[#064E3B] text-[#064E3B] dark:text-[#D1FAE5]'
                      : 'bg-[#FEF3C7] dark:bg-[#451A03] text-[#92400E] dark:text-[#FDE68A]'
                  }`}
                >
                  <Radio
                    className={`h-3 w-3 ${
                      syncStatus.liveSyncState === 'active' ? 'animate-pulse' : ''
                    }`}
                  />
                  <span>
                    {syncStatus.liveSyncState === 'active' ? t.liveBadge : t.syncLivePaused}
                  </span>
                </span>
              </div>
              <p className="text-[11px] text-[#475569] dark:text-[#94A3B8] truncate tabular-nums">
                +91 9099592283 • {t.pendingLabel}: {pendingCount} • {t.tabStudents}:{' '}
                {students.length}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenDisplaySettings && (
              <button
                type="button"
                data-testid="admin_display_settings_btn"
                onClick={onOpenDisplaySettings}
                title={t.displaySettingsBtn}
                aria-label={t.displaySettingsBtn}
                className={`${isTvOrSmartBoard ? 'min-h-[48px] px-3' : 'h-10 px-2.5'} rounded-xl border border-[#CBD5E1] dark:border-[#334155] flex items-center justify-center gap-1.5 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer`}
              >
                <Monitor className="h-4 w-4 text-[#1E3A8A] dark:text-[#93C5FD]" />
                {isLargeScreen && <span className="hidden lg:inline">{t.displaySettingsBtn}</span>}
              </button>
            )}

            {/* Live Notification Bell */}
            <button
              type="button"
              onClick={() => setShowAlertsDrawer((prev) => !prev)}
              aria-label={t.alertsLabel}
              className={`relative ${isTvOrSmartBoard ? 'min-h-[48px] min-w-[48px]' : 'h-10 w-10'} rounded-xl border border-[#CBD5E1] dark:border-[#334155] flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer`}
            >
              <Bell className="h-4 w-4" />
              {(liveAlerts.length > 0 || pendingCount > 0) && (
                <span className="absolute -top-1 -right-1 rounded-full bg-[#DC2626] text-white text-[10px] font-extrabold px-1.5 min-w-[18px] h-[18px] flex items-center justify-center tabular-nums">
                  {liveAlerts.length || pendingCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onToggleSound}
              title={isSoundEnabled ? t.soundOn : t.soundMuted}
              aria-label={isSoundEnabled ? t.soundOn : t.soundMuted}
              className={`${isTvOrSmartBoard ? 'min-h-[48px] min-w-[48px]' : 'h-10 w-10'} rounded-xl border border-[#CBD5E1] dark:border-[#334155] flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer`}
            >
              {isSoundEnabled ? (
                <Volume2 className="h-4 w-4 text-[#047857] dark:text-[#6EE7B7]" />
              ) : (
                <VolumeX className="h-4 w-4 text-slate-400" />
              )}
            </button>

            <button
              type="button"
              onClick={toggleLang}
              aria-label="Toggle language"
              className={`${isTvOrSmartBoard ? 'min-h-[48px] px-3' : 'h-10 px-2.5'} rounded-xl border border-[#CBD5E1] dark:border-[#334155] text-xs font-bold hidden sm:flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer`}
            >
              <Languages className="h-3.5 w-3.5" />
              <span>{lang === 'gu' ? 'EN' : 'GU'}</span>
            </button>

            <button
              type="button"
              onClick={onForceSync}
              className={`${isTvOrSmartBoard ? 'min-h-[48px] px-3' : 'h-10 px-2.5'} rounded-xl border border-[#CBD5E1] dark:border-[#334155] text-xs font-bold flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer`}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.syncBtn}</span>
            </button>

            <button
              type="button"
              onClick={onSignOut}
              title={t.signOutBtn}
              aria-label={t.signOutBtn}
              className={`${isTvOrSmartBoard ? 'min-h-[48px] min-w-[48px]' : 'h-10 w-10'} rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer`}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Live Alerts Dropdown */}
        {showAlertsDrawer && (
          <div className={`${containerMaxWidth} mx-auto px-3 sm:px-5 pb-3`}>
            <div className="rounded-2xl bg-[#EFF4FA] dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] p-3 space-y-2 shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold">{t.alertsLabel}</span>
                <div className="flex items-center gap-2">
                  {liveAlerts.length > 0 && (
                    <button
                      type="button"
                      onClick={onClearAlerts}
                      className="text-[11px] font-bold text-[#1E3A8A] dark:text-[#93C5FD] hover:underline cursor-pointer"
                    >
                      {t.clearAlertsBtn}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowAlertsDrawer(false)}
                    className="p-1 rounded-lg hover:bg-black/10 cursor-pointer"
                    aria-label={t.closeBtn}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {liveAlerts.length === 0 ? (
                <p className="text-xs text-[#475569] dark:text-[#94A3B8]">{t.noAlertsYet}</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {liveAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`rounded-xl px-3 py-2 text-xs flex items-center justify-between gap-2 ${
                        alert.kind === 'code_used'
                          ? 'bg-[#D1FAE5] dark:bg-[#064E3B] text-[#064E3B] dark:text-[#D1FAE5]'
                          : 'bg-[#FEF3C7] dark:bg-[#451A03] text-[#92400E] dark:text-[#FDE68A]'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-bold truncate">{alert.title}</p>
                        <p className="text-[11px] opacity-90 truncate">{alert.detail}</p>
                      </div>
                      <span className="text-[10px] font-semibold shrink-0">{alert.timestampLabel}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Horizontal Admin Tabs (compact / portrait screens) */}
        {!useNavigationRail && (
          <div className={`${containerMaxWidth} mx-auto px-2 sm:px-3 flex border-t border-slate-100 dark:border-slate-800 overflow-x-auto`}>
            {adminTabs.map(({ id, label, Icon, badge }) => {
              const active = selectedTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`admin_tab_${id}`}
                  onClick={() => selectTab(id)}
                  className={`flex-1 min-w-[100px] min-h-[44px] py-2.5 px-3 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'border-[#1E3A8A] text-[#1E3A8A] dark:border-[#93C5FD] dark:text-[#93C5FD]'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                  {badge > 0 && (id === 'notifications' || id === 'chat') && (
                    <span className="rounded-full bg-[#DC2626] text-white text-[10px] font-extrabold px-1.5 min-w-[18px] h-[18px] flex items-center justify-center tabular-nums">
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </header>

      <div className={`flex-1 ${containerMaxWidth} w-full mx-auto ${useNavigationRail ? 'flex items-start' : ''}`}>
        {useNavigationRail && (
          <aside
            aria-label={t.adminPanelTitle}
            className="w-64 shrink-0 sticky top-16 border-r border-[#E2E8F0] dark:border-[#334155] bg-white/75 dark:bg-[#1E293B]/65 p-3 space-y-1.5 min-h-[calc(100vh-4rem)]"
          >
            {adminTabs.map(({ id, label, Icon, badge }) => {
              const active = selectedTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`admin_tab_${id}`}
                  onClick={() => selectTab(id)}
                  className={`w-full min-h-[50px] px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-2.5 text-left text-xs sm:text-sm font-extrabold transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#1E3A8A] text-white shadow-sm'
                      : 'text-[#334155] dark:text-[#CBD5E1] hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{label}</span>
                  </span>
                  {badge > 0 && (id === 'notifications' || id === 'chat') && (
                    <span className="rounded-full bg-[#DC2626] text-white text-[10px] font-extrabold px-1.5 min-w-[20px] h-[20px] flex items-center justify-center tabular-nums shrink-0">
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </aside>
        )}

        <main className="flex-1 min-w-0 w-full">
        {/* Smart Live Sync Status Card (7 Telemetry Metrics + Sync Now) */}
        <section className="px-3 sm:px-4 pt-3 space-y-2.5">
          {(!syncStatus.isOnline || syncStatus.errorKind === 'quota') && (
            <div className="rounded-2xl bg-[#FEF3C7] dark:bg-[#451A03]/70 border border-[#F59E0B]/40 p-3 flex items-start gap-2.5 text-xs font-semibold text-[#92400E] dark:text-[#FDE68A]">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                {!syncStatus.isOnline ? t.offlineModeBanner : t.quotaCooldownBanner}
              </span>
            </div>
          )}

          <div
            data-testid="admin_sync_status_card"
            className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-3.5 shadow-sm space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Cloud className="h-4 w-4 text-[#1E3A8A] dark:text-[#93C5FD]" />
                <h2 className="text-xs sm:text-sm font-extrabold">{t.syncStatusTitle}</h2>
              </div>
              <button
                type="button"
                data-testid="admin_sync_now_button"
                disabled={syncStatus.isSyncing}
                onClick={() => {
                  resetFailedOperationsForRetry();
                  onSyncNow();
                }}
                className="min-h-[44px] px-3.5 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] dark:bg-[#2563EB] text-white text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors disabled:opacity-60 cursor-pointer"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${syncStatus.isSyncing ? 'animate-spin' : ''}`}
                />
                <span>{syncStatus.isSyncing ? t.syncingNowBtn : t.syncNowBtn}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
              {/* 1. Internet Status */}
              <div className="rounded-xl bg-[#EFF4FA] dark:bg-[#0F172A] px-2.5 py-2">
                <p className="text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8]">
                  {t.syncInternetLabel}
                </p>
                <p
                  className={`font-extrabold flex items-center gap-1 mt-0.5 ${
                    syncStatus.isOnline
                      ? 'text-[#047857] dark:text-[#6EE7B7]'
                      : 'text-[#DC2626] dark:text-[#FCA5A5]'
                  }`}
                >
                  {syncStatus.isOnline ? (
                    <Wifi className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>{syncStatus.isOnline ? t.syncInternetOnline : t.syncInternetOffline}</span>
                </p>
              </div>

              {/* 2. Server Connection */}
              <div className="rounded-xl bg-[#EFF4FA] dark:bg-[#0F172A] px-2.5 py-2">
                <p className="text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8]">
                  {t.syncServerLabel}
                </p>
                <p
                  className={`font-extrabold mt-0.5 ${
                    syncStatus.serverConnected
                      ? 'text-[#047857] dark:text-[#6EE7B7]'
                      : 'text-[#D97706] dark:text-[#FCD34D]'
                  }`}
                >
                  {syncStatus.serverConnected
                    ? t.syncServerConnected
                    : t.syncServerDisconnected}
                </p>
              </div>

              {/* 3. Live Sync */}
              <div className="rounded-xl bg-[#EFF4FA] dark:bg-[#0F172A] px-2.5 py-2">
                <p className="text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8]">
                  {t.syncLiveSyncLabel}
                </p>
                <p
                  className={`font-extrabold mt-0.5 ${
                    syncStatus.liveSyncState === 'active'
                      ? 'text-[#047857] dark:text-[#6EE7B7]'
                      : 'text-[#64748B] dark:text-[#CBD5E1]'
                  }`}
                >
                  {syncStatus.liveSyncState === 'active' ? t.syncLiveActive : t.syncLivePaused}
                </p>
              </div>

              {/* 4. Last Sync Date & Time */}
              <div className="rounded-xl bg-[#EFF4FA] dark:bg-[#0F172A] px-2.5 py-2">
                <p className="text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8]">
                  {t.syncLastSyncLabel}
                </p>
                <p className="font-bold text-[11px] mt-0.5 flex items-center gap-1 truncate">
                  <Clock className="h-3 w-3 shrink-0 text-[#1E3A8A] dark:text-[#93C5FD]" />
                  <span className="truncate">
                    {formatLastSyncDateTime(syncStatus.lastSyncAtMs, lang)}
                  </span>
                </p>
              </div>

              {/* 5. Pending Sync Records */}
              <div className="rounded-xl bg-[#EFF4FA] dark:bg-[#0F172A] px-2.5 py-2">
                <p className="text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8]">
                  {t.syncPendingLabel}
                </p>
                <p className="font-extrabold tabular-nums mt-0.5 text-[#1E3A8A] dark:text-[#93C5FD]">
                  {syncStatus.pendingSyncCount}
                </p>
              </div>

              {/* 6. Failed Sync Records */}
              <div className="rounded-xl bg-[#EFF4FA] dark:bg-[#0F172A] px-2.5 py-2">
                <p className="text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8]">
                  {t.syncFailedLabel}
                </p>
                <p
                  className={`font-extrabold tabular-nums mt-0.5 ${
                    syncStatus.failedSyncCount > 0
                      ? 'text-[#DC2626] dark:text-[#FCA5A5]'
                      : 'text-[#0F172A] dark:text-[#F8FAFC]'
                  }`}
                >
                  {syncStatus.failedSyncCount}
                </p>
              </div>
            </div>
          </div>
        </section>

        {selectedTab === 'requests' && (
          <AdminRequestsTab
            payments={payments}
            students={students}
            isBusy={isBusy}
            hasMore={hasMorePayments}
            isLoadingMore={isLoadingMorePayments}
            onLoadMore={onLoadMorePayments}
            focusedTarget={focusedTarget?.tab === 'requests' ? focusedTarget : null}
            onClearFocusedTarget={onClearFocusedTarget}
            onZoomScreenshot={setZoomedScreenshotUrl}
            onApprove={onApprovePayment}
            onReject={onRejectPayment}
            onGenerateDirectCode={onGenerateDirectCode}
            onDeleteRequest={(req) =>
              openDeleteModal({
                kind: 'payment',
                req,
                title: `${req.studentName} (₹${req.amountRupees})`,
                subtitle: `+91 ${req.mobileNumber} • UTR: ${displayPaymentTransactionRef(req) || req.id}`,
              })
            }
            onNotify={onNotify}
          />
        )}

        {selectedTab === 'book_orders' && (
          <AdminBookOrdersTab
            orders={bookOrders}
            stock={bookStock}
            isLiveSyncActive={syncStatus.liveSyncState === 'active' && syncStatus.isOnline}
            isBusy={isBusy}
            onSaveOrder={(input) =>
              onSaveBookOrder ? onSaveBookOrder(input) : Promise.resolve()
            }
            onToggleOrderStatus={(id, next) =>
              onToggleBookOrderStatus ? onToggleBookOrderStatus(id, next) : Promise.resolve()
            }
            onDeleteOrder={(order) =>
              onDeleteBookOrder ? onDeleteBookOrder(order) : Promise.resolve()
            }
            onUpdateStock={(next) =>
              onUpdateBookStock ? onUpdateBookStock(next) : Promise.resolve()
            }
            onNotify={onNotify}
          />
        )}

        {selectedTab === 'all_codes' && (
          <AdminAllCodesTab
            accessCodes={accessCodes}
            students={students}
            lastGeneratedBatch={lastGeneratedBatch}
            isBusy={isBusy}
            hasMore={hasMoreCodes}
            isLoadingMore={isLoadingMoreCodes}
            onLoadMore={onLoadMoreCodes}
            onGenerateBulkCodes={onGenerateBulkCodes}
            onGenerateDirectCode={onGenerateDirectCode}
            onDeleteCode={(item) =>
              openDeleteModal({
                kind: 'code',
                code: item,
                title: `Code: ${item.code}`,
                subtitle: item.userName
                  ? `${item.userName} (+91 ${item.mobileNumber})`
                  : item.batchName || item.id,
              })
            }
            onDeleteUnusedCodes={onDeleteUnusedCodes}
            onFetchBatchCodes={onFetchBatchCodes}
            onNotify={onNotify}
          />
        )}

        {selectedTab === 'used_codes' && (
          <AdminUsedCodesTab
            accessCodes={accessCodes}
            isBusy={isBusy}
            focusedTarget={focusedTarget?.tab === 'used_codes' ? focusedTarget : null}
            onClearFocusedTarget={onClearFocusedTarget}
            onDeleteCode={(item) =>
              openDeleteModal({
                kind: 'code',
                code: item,
                title: `Code: ${item.code}`,
                subtitle: `${item.usedBy?.name || item.usedByName || '-'} (+91 ${item.usedBy?.mobile || item.usedByMobile || '-'})`,
              })
            }
          />
        )}

        {selectedTab === 'students' && (
          <AdminStudentsTab
            students={students}
            isBusy={isBusy}
            hasMore={hasMoreStudents}
            isLoadingMore={isLoadingMoreStudents}
            onLoadMore={onLoadMoreStudents}
            focusedTarget={focusedTarget?.tab === 'students' ? focusedTarget : null}
            onClearFocusedTarget={onClearFocusedTarget}
            onToggleStudentAccess={onToggleStudentAccess}
            onUpdateStudentSubjectAccess={onUpdateStudentSubjectAccess}
            onDeleteStudent={(st) =>
              openDeleteModal({
                kind: 'student',
                student: st,
                title: st.fullName || st.mobileNumber,
                subtitle: `+91 ${st.mobileNumber} • ID: ${st.id || st.userId}`,
              })
            }
          />
        )}

        {selectedTab === 'notifications' && (
          <AdminNotificationsTab
            notifications={adminNotifications}
            pushBroadcasts={pushBroadcasts}
            prefs={notificationPrefs}
            permissionStatus={notificationPermissionStatus}
            currentAdminUid={currentAdminUid}
            isBusy={isBusy}
            onRequestPermission={() => onRequestNotificationPermission?.()}
            onOpenNotificationSettings={onOpenNotificationSettings}
            onSendPushBroadcast={onSendPushBroadcast}
            onDeletePushBroadcast={onDeletePushBroadcast}
            onUpdatePrefs={(next) => onUpdateNotificationPrefs?.(next)}
            onMarkRead={(id) => onMarkNotificationRead?.(id)}
            onMarkAllRead={() => onMarkAllNotificationsRead?.()}
            onDeleteNotif={(id) => onDeleteNotification?.(id)}
            onOpenRoute={handleOpenNotificationRoute}
          />
        )}

        {selectedTab === 'chat' && (
          <AdminChatTab
            currentAdminUid={currentAdminUid}
            currentAdminEmail={currentAdminEmail}
            isSuperAdmin={isSuperAdmin}
            adminDirectory={adminDirectory}
            adminInvites={adminInvites}
            adminChats={adminChats}
            activeChatId={activeChatId}
            activeMessages={activeChatMessages}
            isBusy={isBusy}
            onSelectChat={(cid) => onSelectChat?.(cid)}
            onSendMessage={(p) =>
              onSendChatMessage ? onSendChatMessage(p) : Promise.resolve()
            }
            onMarkChatRead={(cid) => onMarkChatRead?.(cid)}
            onInviteAdmin={(em, dn) =>
              onInviteAdmin ? onInviteAdmin(em, dn) : Promise.resolve()
            }
            onRemoveAdminInvite={(em) =>
              onRemoveAdminInvite ? onRemoveAdminInvite(em) : Promise.resolve()
            }
          />
        )}

        {selectedTab === 'updates' && (
          <AdminUpdateSettingsTab
            releaseConfig={releaseConfig}
            installedAppInfo={installedAppInfo}
            updateNotifications={updateNotifications}
            currentVersionName={currentVersionName}
            currentVersionCode={currentVersionCode}
            isBusy={isBusy}
            isCheckingUpdate={isCheckingUpdate}
            notificationPermissionStatus={notificationPermissionStatus}
            onPublishAppUpdate={onPublishAppUpdate}
            onDeleteReleaseHistory={onDeleteReleaseHistory}
            onSaveGithubRepo={onSaveGithubRepo}
            onTestUpdateCheck={onTestUpdateCheck}
            onRequestNotificationPermission={onRequestNotificationPermission}
            onNotify={onNotify}
          />
        )}
      </main>
      </div>

      {/* Screenshot Zoom Modal */}
      {zoomedScreenshotUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setZoomedScreenshotUrl(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#1E293B] p-4 space-y-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold">{t.zoomModalTitle}</h3>
            <div className="h-96 w-full bg-slate-100 dark:bg-slate-900 rounded-xl flex items-center justify-center overflow-hidden">
              <img
                src={zoomedScreenshotUrl}
                alt={t.zoomModalTitle}
                className="max-h-full max-w-full object-contain"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setZoomedScreenshotUrl(null)}
                className="px-4 py-2 text-sm font-bold text-[#1E3A8A] dark:text-[#93C5FD] cursor-pointer"
              >
                {t.closeBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approval Confirmation + WhatsApp Send Modal */}
      {approvedConfirmation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => onDismissApprovedConfirmation?.()}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 rounded-2xl bg-[#D1FAE5] dark:bg-[#064E3B] text-[#047857] dark:text-[#6EE7B7] flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-extrabold">{t.approvedModalTitle}</h3>
                <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                  {t.approvedModalDesc}
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-[#EFF4FA] dark:bg-[#0F172A] p-3.5 text-xs space-y-1">
              <p className="font-extrabold text-sm">{approvedConfirmation.studentName}</p>
              <p className="text-[#475569] dark:text-[#94A3B8] tabular-nums">
                +91 {approvedConfirmation.mobileNumber} • ₹{approvedConfirmation.amountRupees}
              </p>
              <p className="text-[#475569] dark:text-[#94A3B8]">
                {getSubjectDisplayName(resolvePaymentSubjectId(approvedConfirmation), lang)}
                {displayPaymentTransactionRef(approvedConfirmation)
                  ? ` • UTR: ${displayPaymentTransactionRef(approvedConfirmation)}`
                  : ''}
              </p>
            </div>

            <div className="rounded-2xl bg-[#D1FAE5] dark:bg-[#064E3B] p-3.5 flex items-center justify-between gap-2 text-[#064E3B] dark:text-[#D1FAE5]">
              <div>
                <p className="text-[11px] font-bold opacity-85">{t.generatedCodeLabel}</p>
                <p className="text-xl font-extrabold tracking-widest font-mono">
                  {approvedConfirmation.assignedCode}
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(approvedConfirmation.assignedCode);
                    onNotify?.(`${t.payUpiCopied}: ${approvedConfirmation.assignedCode}`);
                  } catch {
                    onNotify?.(approvedConfirmation.assignedCode);
                  }
                }}
                className="h-9 px-3 rounded-lg bg-white/80 dark:bg-black/30 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>{t.copyCode}</span>
              </button>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() =>
                  launchExternalUrl(
                    buildPaymentApprovalWhatsAppHref(approvedConfirmation, lang)
                  )
                }
                className="w-full h-11 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-sm font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Send className="h-4 w-4" />
                <span>{t.sendOnWhatsAppBtn}</span>
              </button>

              <button
                type="button"
                onClick={() => onDismissApprovedConfirmation?.()}
                className="w-full h-10 rounded-xl border border-[#CBD5E1] dark:border-[#334155] text-xs font-bold cursor-pointer"
              >
                {t.closeBtn}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Admin Password Protected Delete Confirmation Modal */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setPendingDelete(null)}
        >
          <form
            onSubmit={(e) => void handleConfirmPasswordDelete(e)}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 rounded-2xl bg-[#FEE2E2] dark:bg-[#7F1D1D] text-[#DC2626] dark:text-[#FECACA] flex items-center justify-center shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-extrabold text-[#7F1D1D] dark:text-[#FECACA]">
                  {t.deleteConfirmTitle}
                </h3>
                <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-0.5">
                  {t.deleteConfirmDesc}
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-[#EFF4FA] dark:bg-[#0F172A] p-3 text-xs space-y-0.5">
              <p className="font-extrabold text-sm break-words">{pendingDelete.title}</p>
              <p className="text-[#475569] dark:text-[#94A3B8] break-words">
                {pendingDelete.subtitle}
              </p>
            </div>

            <div>
              <label
                htmlFor="admin-delete-password-input"
                className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
              >
                {t.adminPasswordLabel}
              </label>
              <div className="relative flex items-center">
                <input
                  id="admin-delete-password-input"
                  type={showDeletePasscode ? 'text' : 'password'}
                  autoFocus
                  value={deletePasscodeInput}
                  onChange={(e) => {
                    setDeletePasscodeInput(e.target.value);
                    setDeletePasscodeError(null);
                  }}
                  placeholder={t.adminPasswordPlaceholder}
                  className="w-full h-11 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] pl-3.5 pr-11 text-sm font-semibold outline-none focus:border-[#DC2626]"
                />
                <button
                  type="button"
                  onClick={() => setShowDeletePasscode((prev) => !prev)}
                  aria-label="Toggle password visibility"
                  className="absolute right-1.5 h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  {showDeletePasscode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {deletePasscodeError && (
              <div
                role="alert"
                className="rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 p-3 text-xs font-semibold text-red-700 dark:text-red-300"
              >
                {deletePasscodeError}
              </div>
            )}

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="flex-1 h-11 rounded-xl border border-[#CBD5E1] dark:border-[#334155] text-xs font-bold cursor-pointer"
              >
                {t.cancelBtn}
              </button>
              <button
                type="submit"
                disabled={isBusy || !deletePasscodeInput}
                className="flex-1 h-11 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
                <span>{t.deleteBtn}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
