import React, { useCallback, useMemo, useState } from 'react';
import {
  Award,
  Bell,
  BellRing,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Database,
  KeyRound,
  LogIn,
  MessageSquare,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { useTranslation } from '../i18n/translations';
import {
  DEFAULT_ADMIN_NOTIFICATION_PREFS,
  type AdminNotificationCategory,
  type AdminNotificationItem,
  type AdminNotificationPrefs,
  type AdminNotificationRoute,
} from '../types/models';

interface AdminNotificationsTabProps {
  notifications: AdminNotificationItem[];
  prefs: AdminNotificationPrefs | null;
  permissionStatus: 'granted' | 'denied' | 'default';
  currentAdminUid: string;
  isBusy: boolean;
  onRequestPermission: () => Promise<void> | void;
  onUpdatePrefs: (next: AdminNotificationPrefs) => Promise<void> | void;
  onMarkRead: (notifId: string) => Promise<void> | void;
  onMarkAllRead: () => Promise<void> | void;
  onDeleteNotif: (notifId: string) => Promise<void> | void;
  onOpenRoute: (targetRoute: AdminNotificationRoute) => void;
}

function formatNotifDateTime(ts: AdminNotificationItem['createdAt']): string {
  if (!ts) return '-';
  const date = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts.seconds * 1000);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CategoryIcon({ category }: { category: AdminNotificationCategory }) {
  switch (category) {
    case 'registration':
      return <UserPlus className="h-4 w-4 text-[#047857] dark:text-[#6EE7B7]" />;
    case 'login':
      return <LogIn className="h-4 w-4 text-[#0369A1] dark:text-[#7DD3FC]" />;
    case 'payment':
      return <Wallet className="h-4 w-4 text-[#B45309] dark:text-[#FCD34D]" />;
    case 'code_redeem':
      return <KeyRound className="h-4 w-4 text-[#6D28D9] dark:text-[#C4B5FD]" />;
    case 'quiz_activity':
      return <Award className="h-4 w-4 text-[#0F766E] dark:text-[#5EEAD4]" />;
    case 'admin_chat':
      return <MessageSquare className="h-4 w-4 text-[#047857] dark:text-[#6EE7B7]" />;
    default:
      return <Database className="h-4 w-4 text-[#1E3A8A] dark:text-[#93C5FD]" />;
  }
}

function getCategoryLabel(
  category: AdminNotificationCategory,
  t: ReturnType<typeof useTranslation>['t']
): string {
  switch (category) {
    case 'registration':
      return t.notifPrefRegistrations;
    case 'login':
      return t.notifPrefLogins;
    case 'payment':
      return t.notifPrefPayments;
    case 'code_redeem':
      return t.notifPrefCodes;
    case 'quiz_activity':
      return t.notifPrefQuiz;
    case 'admin_chat':
      return t.notifPrefChat;
    default:
      return t.notifPrefDataUpdates;
  }
}

export const AdminNotificationsTab: React.FC<AdminNotificationsTabProps> = ({
  notifications,
  prefs,
  permissionStatus,
  currentAdminUid,
  isBusy,
  onRequestPermission,
  onUpdatePrefs,
  onMarkRead,
  onMarkAllRead,
  onDeleteNotif,
  onOpenRoute,
}) => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [showPrefs, setShowPrefs] = useState(false);

  const effectivePrefs = prefs ?? DEFAULT_ADMIN_NOTIFICATION_PREFS;

  const isItemRead = useCallback(
    (item: AdminNotificationItem) =>
      item.isRead || (currentAdminUid ? item.readBy.includes(currentAdminUid) : false),
    [currentAdminUid]
  );

  const unreadCount = useMemo(
    () => notifications.filter((n) => !isItemRead(n)).length,
    [notifications, isItemRead]
  );

  const filteredList = useMemo(() => {
    if (filter === 'unread') {
      return notifications.filter((n) => !isItemRead(n));
    }
    return notifications;
  }, [notifications, filter, isItemRead]);

  const prefEntries: Array<{ key: keyof AdminNotificationPrefs; label: string }> = [
    { key: 'payments', label: t.notifPrefPayments },
    { key: 'registrations', label: t.notifPrefRegistrations },
    { key: 'logins', label: t.notifPrefLogins },
    { key: 'codeRedemptions', label: t.notifPrefCodes },
    { key: 'quizActivity', label: t.notifPrefQuiz },
    { key: 'dataUpdates', label: t.notifPrefDataUpdates },
    { key: 'adminChat', label: t.notifPrefChat },
  ];

  const handleTogglePref = (key: keyof AdminNotificationPrefs) => {
    const next: AdminNotificationPrefs = {
      ...effectivePrefs,
      [key]: !effectivePrefs[key],
    };
    void onUpdatePrefs(next);
  };

  return (
    <section className="px-3 sm:px-4 py-4 space-y-4">
      {/* Android 13+ / Push Notification Permission Card */}
      <div className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
              permissionStatus === 'granted'
                ? 'bg-[#D1FAE5] dark:bg-[#064E3B] text-[#047857] dark:text-[#6EE7B7]'
                : 'bg-[#DBEAFE] dark:bg-[#1E3A8A] text-[#1E3A8A] dark:text-[#93C5FD]'
            }`}
          >
            <BellRing className="h-5 w-5" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-extrabold">{t.pushPermissionEnableTitle}</h3>
              {permissionStatus === 'granted' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#D1FAE5] dark:bg-[#064E3B] text-[#047857] dark:text-[#6EE7B7] px-2 py-0.5 text-[10px] font-extrabold">
                  <Check className="h-3 w-3" />
                  <span>{t.pushPermissionActiveBadge}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
              {t.pushPermissionEnableDesc}
            </p>
          </div>
        </div>

        {permissionStatus !== 'granted' && (
          <button
            type="button"
            data-testid="enable_push_notifications_btn"
            onClick={() => void onRequestPermission()}
            className="min-h-[48px] px-4 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            <Bell className="h-4 w-4" />
            <span>{t.pushPermissionEnableBtn}</span>
          </button>
        )}
      </div>

      {/* Category Preferences Toggle Drawer */}
      <div className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] shadow-sm overflow-hidden">
        <button
          type="button"
          data-testid="toggle_notif_prefs_btn"
          onClick={() => setShowPrefs((prev) => !prev)}
          className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
        >
          <span className="flex items-center gap-2 text-xs sm:text-sm font-extrabold">
            <SlidersHorizontal className="h-4 w-4 text-[#1E3A8A] dark:text-[#93C5FD]" />
            <span>{t.notifPrefsTitle}</span>
          </span>
          {showPrefs ? (
            <ChevronUp className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          )}
        </button>

        {showPrefs && (
          <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {prefEntries.map(({ key, label }) => {
              const enabled = effectivePrefs[key];
              return (
                <button
                  key={key}
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  data-testid={`notif_pref_toggle_${key}`}
                  onClick={() => handleTogglePref(key)}
                  className={`min-h-[48px] rounded-xl border px-3.5 py-2 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                    enabled
                      ? 'border-[#047857]/40 bg-[#ECFDF5] dark:bg-[#064E3B]/40 text-[#065F46] dark:text-[#D1FAE5]'
                      : 'border-[#E2E8F0] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <span className="text-xs font-bold text-left">{label}</span>
                  <span
                    className={`w-10 h-6 rounded-full p-0.5 transition-colors flex items-center shrink-0 ${
                      enabled ? 'bg-[#047857] justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-white shadow" />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Filter Pills + Mark All Read */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="notif_filter_all"
            onClick={() => setFilter('all')}
            className={`min-h-[44px] px-3.5 rounded-xl text-xs font-extrabold cursor-pointer transition-colors ${
              filter === 'all'
                ? 'bg-[#1E3A8A] text-white dark:bg-[#2563EB]'
                : 'bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] text-slate-700 dark:text-slate-200'
            }`}
          >
            {t.notifFilterAll} ({notifications.length})
          </button>
          <button
            type="button"
            data-testid="notif_filter_unread"
            onClick={() => setFilter('unread')}
            className={`min-h-[44px] px-3.5 rounded-xl text-xs font-extrabold cursor-pointer transition-colors ${
              filter === 'unread'
                ? 'bg-[#1E3A8A] text-white dark:bg-[#2563EB]'
                : 'bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] text-slate-700 dark:text-slate-200'
            }`}
          >
            {t.notifFilterUnread} ({unreadCount})
          </button>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            data-testid="notif_mark_all_read_btn"
            disabled={isBusy}
            onClick={() => void onMarkAllRead()}
            className="min-h-[44px] px-3.5 rounded-xl bg-[#D1FAE5] hover:bg-[#A7F3D0] dark:bg-[#064E3B] dark:hover:bg-[#065F46] text-[#064E3B] dark:text-[#D1FAE5] text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <CheckCheck className="h-4 w-4" />
            <span>{t.notifMarkAllRead}</span>
          </button>
        )}
      </div>

      {/* Notification Feed */}
      {filteredList.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-8 text-center space-y-2">
          <Bell className="h-8 w-8 mx-auto text-slate-400" />
          <p className="text-sm font-bold text-[#475569] dark:text-[#94A3B8]">
            {t.notifNoItems}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredList.map((item) => {
            const read = isItemRead(item);
            return (
              <div
                key={item.id}
                data-testid={`notif_card_${item.id}`}
                className={`rounded-2xl border p-3.5 transition-colors shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  read
                    ? 'bg-white dark:bg-[#1E293B] border-[#E2E8F0] dark:border-[#334155]'
                    : 'bg-[#EFF6FF] dark:bg-[#172554]/55 border-[#3B82F6]/50'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="relative h-10 w-10 rounded-xl bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] flex items-center justify-center shrink-0">
                    <CategoryIcon category={item.category} />
                    {!read && (
                      <span
                        className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-[#2563EB] ring-2 ring-white dark:ring-[#1E293B]"
                        aria-label="Unread"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center flex-wrap gap-1.5">
                      <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-[#475569] dark:text-[#CBD5E1]">
                        {getCategoryLabel(item.category, t)}
                      </span>
                      <span className="text-[11px] font-semibold text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                        {formatNotifDateTime(item.createdAt)}
                      </span>
                    </div>

                    <p className="text-sm font-extrabold leading-snug break-words">
                      {item.title}
                    </p>
                    <p className="text-xs text-[#334155] dark:text-[#CBD5E1] break-words">
                      {item.body}
                    </p>

                    {(item.actorName || item.actorMobile) && (
                      <p className="text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                        {item.actorName}
                        {item.actorName && item.actorMobile ? ' • ' : ''}
                        {item.actorMobile ? `+91 ${item.actorMobile}` : ''}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {item.targetRoute && item.targetRoute !== 'admin_notifications' && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!read) void onMarkRead(item.id);
                        onOpenRoute(item.targetRoute);
                      }}
                      className="min-h-[44px] px-3 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] dark:bg-[#2563EB] text-white text-xs font-extrabold cursor-pointer"
                    >
                      {t.openNotifAction}
                    </button>
                  )}

                  {!read && (
                    <button
                      type="button"
                      data-testid={`notif_mark_read_${item.id}`}
                      onClick={() => void onMarkRead(item.id)}
                      className="min-h-[44px] px-3 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#0F172A] text-xs font-bold inline-flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Check className="h-3.5 w-3.5 text-[#047857] dark:text-[#6EE7B7]" />
                      <span>{t.notifMarkRead}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    data-testid={`notif_delete_${item.id}`}
                    aria-label={t.deleteBtn}
                    onClick={() => void onDeleteNotif(item.id)}
                    className="min-h-[44px] min-w-[44px] rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
