import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  MessageCircle,
  Send,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useTranslation } from '../i18n/translations';
import { getAdminChatId } from '../services/quizRepository';
import type {
  AdminChatMessage,
  AdminChatThread,
  AdminInvite,
  AdminUser,
  ChatMessageStatus,
} from '../types/models';

interface AdminChatTabProps {
  currentAdminUid: string;
  currentAdminEmail: string;
  isSuperAdmin: boolean;
  adminDirectory: AdminUser[];
  adminInvites: AdminInvite[];
  adminChats: AdminChatThread[];
  activeChatId: string;
  activeMessages: AdminChatMessage[];
  isBusy: boolean;
  onSelectChat: (chatId: string) => void;
  onSendMessage: (params: {
    recipientUid: string;
    recipientName: string;
    recipientPhotoUrl?: string;
    text: string;
  }) => Promise<void>;
  onMarkChatRead: (chatId: string) => Promise<void> | void;
  onInviteAdmin: (email: string, displayName: string) => Promise<void>;
  onRemoveAdminInvite: (email: string) => Promise<void>;
}

function formatMessageTime(ts: AdminChatMessage['createdAt'] | AdminChatThread['lastMessageAt']): string {
  if (!ts) return '';
  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts.seconds * 1000);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'A';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function AvatarCircle({
  photoUrl,
  name,
  sizeClass = 'h-10 w-10',
}: {
  photoUrl?: string;
  name: string;
  sizeClass?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  if (photoUrl && !imgFailed) {
    return (
      <img
        src={photoUrl}
        alt={name}
        onError={() => setImgFailed(true)}
        className={`${sizeClass} rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0`}
      />
    );
  }
  return (
    <div
      className={`${sizeClass} rounded-full bg-[#075E54] text-white font-extrabold text-xs flex items-center justify-center shrink-0`}
      aria-hidden="true"
    >
      {getInitials(name)}
    </div>
  );
}

function MessageStatusTicks({
  status,
  t,
}: {
  status: ChatMessageStatus;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  if (status === 'read') {
    return (
      <span title={t.chatStatusRead} className="inline-flex items-center text-[#38BDF8]">
        <CheckCheck className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (status === 'delivered') {
    return (
      <span title={t.chatStatusDelivered} className="inline-flex items-center text-slate-400">
        <CheckCheck className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span title={t.chatStatusSent} className="inline-flex items-center text-slate-400">
      <Check className="h-3.5 w-3.5" />
    </span>
  );
}

export const AdminChatTab: React.FC<AdminChatTabProps> = ({
  currentAdminUid,
  isSuperAdmin,
  adminDirectory,
  adminInvites,
  adminChats,
  activeChatId,
  activeMessages,
  isBusy,
  onSelectChat,
  onSendMessage,
  onMarkChatRead,
  onInviteAdmin,
  onRemoveAdminInvite,
}) => {
  const { t } = useTranslation();
  const [composerText, setComposerText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const otherAdmins = useMemo(() => {
    const map = new Map<string, AdminUser>();
    adminDirectory.forEach((a) => {
      if (a.uid && a.uid !== currentAdminUid && a.isActive) {
        map.set(a.uid, a);
      }
    });
    // Also synthesize entries for any chat partner not yet loaded in directory
    adminChats.forEach((chat) => {
      const partnerUid = chat.participants.find((uid) => uid !== currentAdminUid);
      if (partnerUid && !map.has(partnerUid)) {
        const meta = chat.participantMeta?.[partnerUid];
        map.set(partnerUid, {
          uid: partnerUid,
          email: '',
          displayName: meta?.displayName || 'Admin',
          photoUrl: meta?.photoUrl || '',
          role: 'admin',
          isActive: true,
          notificationPrefs: {
            registrations: true,
            logins: true,
            payments: true,
            codeRedemptions: true,
            quizActivity: true,
            dataUpdates: true,
            adminChat: true,
          },
          createdAt: null,
          updatedAt: null,
        });
      }
    });
    return Array.from(map.values());
  }, [adminDirectory, adminChats, currentAdminUid]);

  const rosterWithChats = useMemo(() => {
    const chatById = new Map<string, AdminChatThread>();
    adminChats.forEach((c) => chatById.set(c.id, c));

    return otherAdmins
      .map((partner) => {
        const chatId = getAdminChatId(currentAdminUid, partner.uid);
        const thread = chatById.get(chatId) ?? null;
        const unread = thread?.unreadCounts?.[currentAdminUid] ?? 0;
        const sortMs = thread?.lastMessageAt?.seconds ?? 0;
        return { partner, chatId, thread, unread, sortMs };
      })
      .sort((a, b) => b.sortMs - a.sortMs);
  }, [otherAdmins, adminChats, currentAdminUid]);

  const activePartner = useMemo(() => {
    if (!activeChatId) return null;
    const found = rosterWithChats.find((r) => r.chatId === activeChatId);
    return found?.partner ?? null;
  }, [activeChatId, rosterWithChats]);

  // Mark messages read whenever active chat has incoming unread items
  useEffect(() => {
    if (!activeChatId || !currentAdminUid) return;
    const activeThread = adminChats.find((c) => c.id === activeChatId);
    const hasThreadUnread = (activeThread?.unreadCounts?.[currentAdminUid] ?? 0) > 0;
    const hasUnreadMsg = activeMessages.some(
      (m) => m.recipientUid === currentAdminUid && m.status !== 'read'
    );
    if (hasThreadUnread || hasUnreadMsg) {
      void onMarkChatRead(activeChatId);
    }
  }, [activeChatId, activeMessages, adminChats, currentAdminUid, onMarkChatRead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length, activeChatId]);

  const handleSubmitMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePartner || !composerText.trim() || isSending) return;
    const textToSend = composerText.trim();
    setComposerText('');
    setIsSending(true);
    try {
      await onSendMessage({
        recipientUid: activePartner.uid,
        recipientName: activePartner.displayName,
        recipientPhotoUrl: activePartner.photoUrl,
        text: textToSend,
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmitInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteFeedback(null);
    try {
      await onInviteAdmin(inviteEmail.trim(), inviteName.trim());
      setInviteEmail('');
      setInviteName('');
      setInviteFeedback(t.adminInviteSuccess);
    } catch (err) {
      setInviteFeedback(err instanceof Error ? err.message : 'Failed to invite admin');
    }
  };

  const isThreadOpen = Boolean(activeChatId && activePartner);

  return (
    <section className="px-3 sm:px-4 py-4 space-y-4">
      {/* Header + Super Admin Team Management */}
      <div className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-3.5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-[#075E54] text-white flex items-center justify-center shrink-0">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold">{t.adminChatTitle}</h2>
              <p className="text-xs text-[#475569] dark:text-[#94A3B8]">{t.adminChatSubtitle}</p>
            </div>
          </div>

          {isSuperAdmin && (
            <button
              type="button"
              data-testid="toggle_invite_admin_btn"
              onClick={() => setShowInviteForm((prev) => !prev)}
              className="min-h-[44px] px-3.5 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] dark:bg-[#2563EB] text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              <span>{t.adminInviteBtn}</span>
            </button>
          )}
        </div>

        {isSuperAdmin && showInviteForm && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <p className="text-xs font-extrabold text-[#1E3A8A] dark:text-[#93C5FD] flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" />
              <span>{t.adminInviteTitle}</span>
            </p>
            <form
              onSubmit={(e) => void handleSubmitInvite(e)}
              className="grid grid-cols-1 sm:grid-cols-3 gap-2"
            >
              <input
                type="email"
                required
                data-testid="invite_admin_email_input"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder={t.adminInviteEmailPlaceholder}
                className="min-h-[44px] rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] px-3 text-xs font-semibold outline-none focus:border-[#1E3A8A]"
              />
              <input
                type="text"
                data-testid="invite_admin_name_input"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder={t.adminInviteNamePlaceholder}
                className="min-h-[44px] rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] px-3 text-xs font-semibold outline-none focus:border-[#1E3A8A]"
              />
              <button
                type="submit"
                disabled={isBusy || !inviteEmail.trim()}
                data-testid="invite_admin_submit_btn"
                className="min-h-[44px] rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-xs font-extrabold cursor-pointer disabled:opacity-50"
              >
                {t.adminInviteBtn}
              </button>
            </form>

            {inviteFeedback && (
              <p className="text-xs font-bold text-[#047857] dark:text-[#6EE7B7]">
                {inviteFeedback}
              </p>
            )}

            {adminInvites.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {adminInvites.map((inv) => (
                  <div
                    key={inv.email}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#EFF4FA] dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] px-3 py-1.5 text-xs"
                  >
                    <span className="font-bold">{inv.displayName || inv.email}</span>
                    <span className="text-[#64748B] dark:text-[#94A3B8]">({inv.email})</span>
                    <button
                      type="button"
                      aria-label={t.deleteBtn}
                      onClick={() => void onRemoveAdminInvite(inv.email)}
                      className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-950/60 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* WhatsApp-Style Split Chat Layout */}
      <div className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-[310px_1fr] xl:grid-cols-[360px_1fr] min-h-[480px] xl:h-[calc(100vh-260px)]">
        {/* Left: Admin Conversations & Directory */}
        <div
          className={`border-r border-[#E2E8F0] dark:border-[#334155] flex flex-col min-h-0 ${
            isThreadOpen ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div className="px-3.5 py-2.5 bg-[#F8FAFC] dark:bg-[#0F172A] border-b border-[#E2E8F0] dark:border-[#334155] flex items-center justify-between shrink-0">
            <span className="text-xs font-extrabold text-[#475569] dark:text-[#CBD5E1] flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              <span>{t.adminDirectoryTitle} ({otherAdmins.length})</span>
            </span>
          </div>

          {rosterWithChats.length === 0 ? (
            <div className="p-6 text-center space-y-2 flex-1 flex flex-col items-center justify-center">
              <MessageCircle className="h-8 w-8 text-slate-400" />
              <p className="text-xs font-semibold text-[#475569] dark:text-[#94A3B8] max-w-xs">
                {t.adminChatEmptyDirectory}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto flex-1 max-h-[520px] xl:max-h-none">
              {rosterWithChats.map(({ partner, chatId, thread, unread }) => {
                const selected = activeChatId === chatId;
                const isLastMine = thread?.lastMessageSenderUid === currentAdminUid;
                return (
                  <button
                    key={partner.uid}
                    type="button"
                    data-testid={`admin_chat_row_${partner.uid}`}
                    onClick={() => onSelectChat(chatId)}
                    className={`w-full min-h-[64px] px-3.5 py-3 flex items-center gap-3 text-left transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[#ECFDF5] dark:bg-[#064E3B]/45'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <AvatarCircle photoUrl={partner.photoUrl} name={partner.displayName} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-extrabold truncate">{partner.displayName}</span>
                        <span className="text-[10px] font-semibold text-[#64748B] dark:text-[#94A3B8] shrink-0">
                          {thread?.lastMessageAt ? formatMessageTime(thread.lastMessageAt) : ''}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <div className="flex items-center gap-1 min-w-0">
                          {isLastMine && thread && (
                            <MessageStatusTicks status={thread.lastMessageStatus} t={t} />
                          )}
                          <p className="text-xs text-[#475569] dark:text-[#94A3B8] truncate">
                            {thread?.lastMessageText || partner.email || t.adminChatCoAdminBadge}
                          </p>
                        </div>
                        {unread > 0 && (
                          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#25D366] text-[#064E3B] text-[10px] font-extrabold flex items-center justify-center shrink-0 tabular-nums">
                            {unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: 1-to-1 Chat Thread */}
        <div
          className={`flex flex-col min-h-0 bg-[#EFEAE2] dark:bg-[#0B141A] ${
            isThreadOpen ? 'flex' : 'hidden md:flex'
          }`}
        >
          {!activePartner ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2">
              <div className="h-12 w-12 rounded-2xl bg-[#075E54]/15 text-[#075E54] dark:text-[#6EE7B7] flex items-center justify-center">
                <MessageCircle className="h-6 w-6" />
              </div>
              <p className="text-sm font-extrabold text-[#0F172A] dark:text-[#F8FAFC]">
                {t.adminChatTitle}
              </p>
              <p className="text-xs text-[#475569] dark:text-[#94A3B8] max-w-sm">
                {t.adminChatEmptyDirectory}
              </p>
            </div>
          ) : (
            <>
              {/* Thread Top Bar */}
              <div className="px-3 py-2.5 bg-[#075E54] text-white flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => onSelectChat('')}
                  aria-label={t.adminChatBackToList}
                  className="md:hidden p-2 rounded-xl hover:bg-white/10 cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <AvatarCircle photoUrl={activePartner.photoUrl} name={activePartner.displayName} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-extrabold truncate">{activePartner.displayName}</p>
                    <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold">
                      {activePartner.role === 'super_admin'
                        ? t.adminChatSuperBadge
                        : t.adminChatCoAdminBadge}
                    </span>
                  </div>
                  {activePartner.email && (
                    <p className="text-[11px] text-white/80 truncate">{activePartner.email}</p>
                  )}
                </div>
              </div>

              {/* Scrollable Messages */}
              <div className="flex-1 min-h-0 p-3 sm:p-4 space-y-2.5 overflow-y-auto max-h-[420px] xl:max-h-none">
                {activeMessages.length === 0 ? (
                  <div className="h-full flex items-center justify-center py-10">
                    <p className="rounded-xl bg-white/85 dark:bg-[#1E293B]/90 px-4 py-2 text-xs font-semibold text-[#475569] dark:text-[#CBD5E1] shadow-sm">
                      {t.adminChatNoMessages}
                    </p>
                  </div>
                ) : (
                  activeMessages.map((msg) => {
                    const isMine = msg.senderUid === currentAdminUid;
                    return (
                      <div
                        key={msg.id}
                        data-testid={`chat_bubble_${msg.id}`}
                        className={`flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}
                      >
                        {!isMine && (
                          <AvatarCircle
                            photoUrl={msg.senderPhotoUrl || activePartner.photoUrl}
                            name={msg.senderName}
                            sizeClass="h-7 w-7"
                          />
                        )}
                        <div
                          className={`max-w-[82%] rounded-2xl px-3.5 py-2 shadow-sm text-xs sm:text-sm space-y-1 ${
                            isMine
                              ? 'bg-[#D9FDD3] dark:bg-[#005C4B] text-[#0F172A] dark:text-[#F8FAFC] rounded-br-sm'
                              : 'bg-white dark:bg-[#202C33] text-[#0F172A] dark:text-[#F8FAFC] rounded-bl-sm'
                          }`}
                        >
                          {!isMine && (
                            <p className="text-[11px] font-extrabold text-[#075E54] dark:text-[#6EE7B7]">
                              {msg.senderName}
                            </p>
                          )}
                          <p className="whitespace-pre-wrap break-words leading-snug">{msg.text}</p>
                          <div className="flex items-center justify-end gap-1 text-[10px] text-slate-500 dark:text-slate-300/80">
                            <span className="tabular-nums">{formatMessageTime(msg.createdAt)}</span>
                            {isMine && <MessageStatusTicks status={msg.status} t={t} />}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Composer */}
              <form
                onSubmit={(e) => void handleSubmitMessage(e)}
                className="p-2.5 bg-[#F0F2F5] dark:bg-[#202C33] border-t border-black/10 dark:border-white/10 flex items-center gap-2 shrink-0"
              >
                <input
                  type="text"
                  data-testid="admin_chat_composer_input"
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  placeholder={t.adminChatComposerPlaceholder}
                  className="flex-1 min-h-[46px] rounded-2xl bg-white dark:bg-[#2A3942] px-4 text-sm font-medium outline-none border border-transparent focus:border-[#075E54]"
                />
                <button
                  type="submit"
                  data-testid="admin_chat_send_button"
                  disabled={isSending || !composerText.trim()}
                  aria-label={t.adminChatSendBtn}
                  className="min-h-[46px] px-4 rounded-2xl bg-[#075E54] hover:bg-[#064E3B] text-white text-xs sm:text-sm font-extrabold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0"
                >
                  <Send className="h-4 w-4" />
                  <span className="hidden sm:inline">{t.adminChatSendBtn}</span>
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
};
