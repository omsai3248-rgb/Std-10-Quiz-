import React from 'react';
import {
  ArrowRight,
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  Download,
  GraduationCap,
  Megaphone,
  Settings,
  X,
} from 'lucide-react';
import { hasNativeFirebaseBridge } from '../services/nativeFirebaseBridge';
import type {
  PushBroadcastCategory,
  PushBroadcastRecord,
  PushBroadcastTargetRoute,
} from '../types/models';

interface PushNotificationsModalProps {
  permissionStatus: 'granted' | 'denied' | 'default';
  broadcasts: PushBroadcastRecord[];
  onRequestPermission: () => Promise<void> | void;
  onOpenSettings: () => void;
  onSelectTargetRoute: (route: PushBroadcastTargetRoute, broadcast?: PushBroadcastRecord) => void;
  onClose: () => void;
}

function formatBroadcastTime(ts: PushBroadcastRecord['createdAt']): string {
  if (!ts) return 'હમણાં';
  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts.seconds * 1000);
  if (Number.isNaN(d.getTime())) return 'હમણાં';
  return d.toLocaleString('gu-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function categoryMeta(category: PushBroadcastCategory): {
  label: string;
  badgeClass: string;
  icon: React.ReactNode;
} {
  switch (category) {
    case 'exam_notice':
      return {
        label: 'પરીક્ષા સૂચના',
        badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
        icon: <GraduationCap className="h-4 w-4 text-amber-700 dark:text-amber-300" />,
      };
    case 'app_update':
      return {
        label: 'App Update',
        badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
        icon: <Download className="h-4 w-4 text-blue-700 dark:text-blue-300" />,
      };
    default:
      return {
        label: 'Admin સંદેશ',
        badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
        icon: <Megaphone className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />,
      };
  }
}

function targetRouteLabel(route: PushBroadcastTargetRoute): string {
  switch (route) {
    case 'mock_test':
      return 'બોર્ડ મોક ટેસ્ટ ખોલો';
    case 'app_update':
      return 'અપડેટ સ્ક્રીન ખોલો';
    case 'subject_maths':
      return 'ગણિત વિષય ખોલો';
    case 'subject_science':
      return 'વિજ્ઞાન વિષય ખોલો';
    case 'subject_social_science':
      return 'સામાજિક વિજ્ઞાન ખોલો';
    default:
      return 'હોમ સ્ક્રીન પર જાઓ';
  }
}

export const PushNotificationsModal: React.FC<PushNotificationsModalProps> = ({
  permissionStatus,
  broadcasts,
  onRequestPermission,
  onOpenSettings,
  onSelectTargetRoute,
  onClose,
}) => {
  const isNative = hasNativeFirebaseBridge();

  return (
    <div
      className="fixed inset-0 z-[88] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Quick Quiz Notifications"
      data-testid="student_push_notifications_modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-lg max-h-[88dvh] rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-[#FAF9F5] dark:bg-[#1E293B]">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/images/ic_app_logo.png"
              alt="Quick Quiz"
              className="h-9 w-9 rounded-xl object-contain bg-black border border-slate-200 dark:border-slate-700 shrink-0"
            />
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold truncate">
                Quick Quiz સૂચનાઓ
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                પરીક્ષાની સૂચનાઓ, Admin સંદેશા અને App Update
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="close_student_notifications_modal"
            onClick={onClose}
            aria-label="Close notifications"
            className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Permission Status Card */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A]">
          <div
            className={`rounded-2xl p-3.5 border flex flex-col gap-3 ${
              permissionStatus === 'granted'
                ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30'
                : 'border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/30'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                  permissionStatus === 'granted'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-amber-600 text-white'
                }`}
              >
                {permissionStatus === 'granted' ? (
                  <BellRing className="h-5 w-5" />
                ) : (
                  <BellOff className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                    {permissionStatus === 'granted'
                      ? 'Real-Time Push Notifications ચાલુ છે'
                      : 'Push Notifications બંધ છે'}
                  </p>
                  {permissionStatus === 'granted' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-extrabold">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Active</span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {permissionStatus === 'granted'
                    ? 'એપ બંધ હોય કે બીજી એપ ચાલુ હોય ત્યારે પણ પરીક્ષા સૂચના, Admin સંદેશા અને નવા અપડેટ તરત મળશે.'
                    : 'પરીક્ષાની સૂચનાઓ, Admin સંદેશા અને App Update સમયસર મેળવવા માટે Notification Permission ચાલુ કરો.'}
                </p>
              </div>
            </div>

            {permissionStatus !== 'granted' && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="student_enable_push_btn"
                  onClick={() => void onRequestPermission()}
                  className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Bell className="h-4 w-4" />
                  <span>Notification ચાલુ કરો</span>
                </button>
                {isNative && permissionStatus === 'denied' && (
                  <button
                    type="button"
                    data-testid="open_android_notif_settings_btn"
                    onClick={onOpenSettings}
                    className="min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Settings className="h-4 w-4" />
                    <span>Settings</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Recent Broadcast Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {broadcasts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center space-y-1.5">
              <Bell className="h-7 w-7 mx-auto text-slate-400" />
              <p className="text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300">
                હાલમાં કોઈ નવી સૂચના નથી.
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Admin દ્વારા નવી પરીક્ષા સૂચના કે અપડેટ મોકલાતાં જ અહીં અને તમારા ફોન પર તરત દેખાશે.
              </p>
            </div>
          ) : (
            broadcasts.map((item) => {
              const meta = categoryMeta(item.category);
              return (
                <div
                  key={item.id}
                  data-testid={`student_broadcast_card_${item.id}`}
                  className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-[#FAF9F5] dark:bg-[#1E293B] p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${meta.badgeClass}`}
                    >
                      {meta.icon}
                      <span>{meta.label}</span>
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                      {formatBroadcastTime(item.createdAt)}
                    </span>
                  </div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white leading-snug break-words">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line break-words">
                    {item.body}
                  </p>
                  <div className="pt-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      Quick Quiz • {item.senderName || 'Admin'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectTargetRoute(item.targetRoute, item)}
                      className="min-h-[40px] px-3 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] dark:bg-[#2563EB] text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>{targetRouteLabel(item.targetRoute)}</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
