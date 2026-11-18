import React, { createContext, useContext, useEffect, useState } from 'react';

export type Language = 'gu' | 'en';

export interface Translations {
  appName: string;
  appSubtitle: string;
  langToggleLabel: string;
  navSubmitPayment: string;
  navUseCode: string;
  navAdmin: string;
  navAdminLive: string;
  loadingApp: string;
  voiceOnLabel: string;
  voiceOffLabel: string;
  voicePauseBtn: string;
  voiceResumeBtn: string;
  voiceStopBtn: string;
  voiceReplayBtn: string;
  voiceReadingFeedback: string;
  voiceReadingExplanation: string;
  voicePausedLabel: string;
  voiceUnavailableNote: string;
  voiceGenderFemale: string;
  voiceGenderMale: string;
  voicePreparingLabel: string;
  voiceAiHumanBadge: string;
  voiceOfflineFallbackBadge: string;
  voiceReplayExplanationBtn: string;

  // Public Payment Page
  payHeaderTitle: string;
  payHeaderDesc: string;
  payUpiCardTitle: string;
  payUpiCopy: string;
  payUpiCopied: string;
  payUpiOpenApp: string;
  payUpiQuickTip: string;
  payQrTitle: string;
  payQrDownload: string;
  payQrShareOnly: string;
  payQrSaveShare: string;
  payQrDownloadedMsg: string;
  payQrSavedMsg: string;
  payCopyAmount: string;
  payCopyUpiId: string;
  payUpiBankLimitNote: string;
  loginTitle: string;
  loginSubtitle: string;
  loginBtn: string;
  switchAccountBtn: string;
  adminNumberLoginHint: string;
  returningAccountTitle: string;
  returningAccountLoaded: string;
  checkingAccountLabel: string;
  returningWelcomeMsg: string;
  unlockSingleSubjectLabel: string;
  unlockAllSubjectsLabel: string;
  fixedPriceBadge: string;
  payTabLabel: string;
  codeTabLabel: string;
  submitToAdminBtn: string;
  sendWhatsAppScreenshotBtn: string;
  unlockAllBannerTitle: string;
  unlockAllBannerDesc: string;
  approvedModalTitle: string;
  approvedModalDesc: string;
  fieldFullName: string;
  fieldFullNamePlaceholder: string;
  fieldMobile: string;
  fieldMobilePlaceholder: string;
  fieldAmount: string;
  fieldAmountPlaceholder: string;
  fieldSubject: string;
  fieldUtr: string;
  fieldUtrPlaceholder: string;
  fieldScreenshot: string;
  pickScreenshot: string;
  changeScreenshot: string;
  preparingImage: string;
  uploadingImage: string;
  submitPaymentBtn: string;
  submittingBtn: string;
  requestSentTitle: string;
  requestSentSubtitle: string;
  sendWhatsAppOptional: string;
  myRequestsTitle: string;
  waitingApprovalLive: string;
  statusPending: string;
  statusApproved: string;
  statusRejected: string;
  yourCodeLabel: string;
  copyCode: string;
  useThisCodeBtn: string;
  tapToZoom: string;
  zoomModalTitle: string;
  closeBtn: string;
  adminNoteLabel: string;

  // Use Code & Protected Content Page
  useCodeTitle: string;
  useCodeSubtitle: string;
  fieldCodeLabel: string;
  fieldCodePlaceholder: string;
  redeemNowBtn: string;
  redeemingBtn: string;
  codeSuccessTitle: string;
  codeSuccessDesc: string;
  unlockedContentTitle: string;
  unlockedContentSubtitle: string;
  subjectsHeader: string;
  lockedBadge: string;
  unlockedBadge: string;
  partialUnlockedBadge: string;
  chaptersAndQuestions: string;
  recentAttemptsTitle: string;
  unlockAnotherSubject: string;

  // Admin Phone Auth Screen
  adminLoginTitle: string;
  adminLoginSubtitle: string;
  adminOnlyNumberNote: string;
  adminPhoneLabel: string;
  adminPasswordLabel: string;
  adminPasswordPlaceholder: string;
  adminLoginBtn: string;
  loggingInBtn: string;
  errWrongAdminPassword: string;
  errWrongAdminGoogleAccount: string;
  errAdminGoogleCancelled: string;
  errAdminNoGoogleAccount: string;
  errAdminGoogleConfig: string;
  errAdminNativeMissing: string;
  errAdminSha1Mismatch: string;
  onlyAdminAllowedError: string;
  signOutBtn: string;

  // Admin Panel
  adminPanelTitle: string;
  liveBadge: string;
  soundOn: string;
  soundMuted: string;
  syncBtn: string;
  backToPublic: string;
  tabRequests: string;
  tabAllCodes: string;
  tabUsedCodes: string;
  tabStudents: string;
  tabUpdates: string;
  noStudentsYet: string;
  quizzesTakenLabel: string;
  bestScoreLabel: string;
  grantAllAccessBtn: string;
  revokeAccessBtn: string;
  pendingLabel: string;
  approvedLabel: string;
  rejectedLabel: string;
  allLabel: string;
  approveAndGenerateBtn: string;
  rejectBtn: string;
  rejectReasonPlaceholder: string;
  confirmRejectBtn: string;
  cancelBtn: string;
  generatedCodeLabel: string;
  sendOnWhatsAppBtn: string;
  noRequestsFound: string;
  searchCodesPlaceholder: string;
  filterAll: string;
  filterUnused: string;
  filterUsed: string;
  exportCsvBtn: string;
  exportPdfBtn: string;
  permanentCodesNote: string;
  noCodesFound: string;
  noUsedCodesYet: string;
  usedByHeader: string;
  buyerHeader: string;
  deviceInfoLabel: string;
  usedAtLabel: string;
  createdAtLabel: string;
  requestIdLabel: string;
  alertsLabel: string;
  clearAlertsBtn: string;
  noAlertsYet: string;
  deleteBtn: string;
  deleteConfirmTitle: string;
  deleteConfirmDesc: string;
  deleteSuccessMsg: string;
  directCodeSectionTitle: string;
  directCodeSectionSubtitle: string;
  directCodeMobilePlaceholder: string;
  directCodeNamePlaceholder: string;
  directCodeGenerateBtn: string;
  directCodeGeneratingBtn: string;
  directCodeReadyLabel: string;
  directCodeSendWhatsAppBtn: string;
  directCodeStudentMatched: string;

  // Validation & Errors
  errInvalidName: string;
  errInvalidMobile: string;
  errInvalidAmount: string;
  errInvalidUtr: string;
  errScreenshotRequired: string;
  errDuplicateUtr: string;
  errInvalidCodeFormat: string;
  errCodeNotFound: string;
  errCodeAlreadyUsed: string;
  errAlreadyApproved: string;

  // Smart Live Sync & Quota/Offline
  syncStatusTitle: string;
  syncInternetLabel: string;
  syncInternetOnline: string;
  syncInternetOffline: string;
  syncServerLabel: string;
  syncServerConnected: string;
  syncServerDisconnected: string;
  syncLiveSyncLabel: string;
  syncLiveActive: string;
  syncLivePaused: string;
  syncLastSyncLabel: string;
  syncPendingLabel: string;
  syncFailedLabel: string;
  syncNowBtn: string;
  syncingNowBtn: string;
  loadMoreBtn: string;
  loadingMoreBtn: string;
  quotaCooldownBanner: string;
  offlineModeBanner: string;
  pendingSyncSavedNote: string;

  // Admin Notifications Center & Personal Messaging
  tabNotifications: string;
  tabAdminChat: string;
  notifCenterTitle: string;
  notifFilterAll: string;
  notifFilterUnread: string;
  notifMarkAllRead: string;
  notifMarkRead: string;
  notifNoItems: string;
  notifPrefsTitle: string;
  notifPrefRegistrations: string;
  notifPrefLogins: string;
  notifPrefPayments: string;
  notifPrefCodes: string;
  notifPrefQuiz: string;
  notifPrefDataUpdates: string;
  notifPrefChat: string;
  pushPermissionEnableTitle: string;
  pushPermissionEnableDesc: string;
  pushPermissionEnableBtn: string;
  pushPermissionActiveBadge: string;
  adminChatTitle: string;
  adminChatSubtitle: string;
  adminDirectoryTitle: string;
  adminInviteTitle: string;
  adminInviteEmailPlaceholder: string;
  adminInviteNamePlaceholder: string;
  adminInviteBtn: string;
  adminInviteSuccess: string;
  adminChatEmptyDirectory: string;
  adminChatNoMessages: string;
  adminChatComposerPlaceholder: string;
  adminChatSendBtn: string;
  adminChatBackToList: string;
  adminChatSuperBadge: string;
  adminChatCoAdminBadge: string;
  chatStatusSent: string;
  chatStatusDelivered: string;
  chatStatusRead: string;
  openNotifAction: string;

  // Display Settings & Adaptive UI
  displaySettingsBtn: string;
  displaySettingsTitle: string;
  displaySettingsSubtitle: string;
  displayModeAutoTitle: string;
  displayModeAutoDesc: string;
  displayModePortraitTitle: string;
  displayModePortraitDesc: string;
  displayModeLandscapeTitle: string;
  displayModeLandscapeDesc: string;
  displayModeFullScreenTitle: string;
  displayModeFullScreenDesc: string;
  displayDetectedDeviceLabel: string;
  displayWindowClassLabel: string;
  displayOrientationLabel: string;
  displayResolutionLabel: string;
  displayResetDefaultBtn: string;
  orientationPortraitLabel: string;
  orientationLandscapeLabel: string;
  deviceTypeMobile: string;
  deviceTypeTablet: string;
  deviceTypeSmartBoard: string;
  deviceTypeAndroidTv: string;
  deviceTypeLargeTouchscreen: string;
  deviceTypeLandscapeMonitor: string;
  deviceTypeFoldable: string;

  // In-App App Updates & Push Notifications
  appUpdateAvailableTitle: string;
  appUpdateMandatoryTitle: string;
  appUpdateMandatoryDesc: string;
  appUpdateOptionalBadge: string;
  appUpdateMandatoryBadge: string;
  appUpdateCurrentVersionLabel: string;
  appUpdateNewVersionLabel: string;
  appUpdateNowBtn: string;
  appUpdateDownloadingBtn: string;
  appUpdateVerifyingLabel: string;
  appUpdateInstallingLabel: string;
  appUpdateLaterBtn: string;
  appUpdateRetryBtn: string;
  appUpdatePermissionRequiredDesc: string;
  appUpdateGrantInstallPermBtn: string;
  appUpdateUpToDateMsg: string;
  appUpdateCheckNowBtn: string;
  appUpdateCheckingBtn: string;
  appUpdateHistoryTitle: string;
  appUpdateNoHistory: string;
  adminUpdateControlTitle: string;
  adminUpdateUploadApkBtn: string;
  adminUpdateChangeApkBtn: string;
  adminUpdateInspectingApk: string;
  adminUpdateVerifiedPkg: string;
  adminUpdateVerifiedSig: string;
  adminUpdateMismatchPkg: string;
  adminUpdateMismatchSig: string;
  adminUpdateVersionNameLabel: string;
  adminUpdateVersionCodeLabel: string;
  adminUpdateTitleLabel: string;
  adminUpdateNotesLabel: string;
  adminUpdateTypeLabel: string;
  adminUpdateOptionalOption: string;
  adminUpdateMandatoryOption: string;
  adminUpdatePublishBtn: string;
  adminUpdatePublishingBtn: string;
  adminUpdatePublishedSuccess: string;
  adminUpdateUploadingProgress: string;
  adminUpdateActiveReleaseTitle: string;
  adminUpdateNoActiveRelease: string;
  adminUpdatePushSentCount: string;
}

const GU: Translations = {
  appName: 'Quick Quiz',
  appSubtitle: 'ધોરણ ૧૦ બોર્ડ ક્વિઝ • ગુજરાતી વોઇસ ફીડબેક',
  langToggleLabel: 'English',
  navSubmitPayment: 'પેમેન્ટ મોકલો',
  navUseCode: 'કોડ વાપરો',
  navAdmin: 'એડમિન',
  navAdminLive: 'એડમિન લાઇવ',
  loadingApp: 'Quick Quiz લોડ થઈ રહ્યું છે...',
  voiceOnLabel: 'Voice ચાલુ',
  voiceOffLabel: 'Voice બંધ',
  voicePauseBtn: 'Pause',
  voiceResumeBtn: 'Resume',
  voiceStopBtn: 'Stop',
  voiceReplayBtn: 'ફરી સાંભળો',
  voiceReadingFeedback: 'ગુજરાતી પ્રોત્સાહન બોલાઈ રહ્યું છે...',
  voiceReadingExplanation: 'સમજૂતી ગુજરાતી અવાજમાં વંચાઈ રહી છે...',
  voicePausedLabel: 'અવાજ અસ્થાયી રૂપે રોકેલ છે',
  voiceUnavailableNote: 'આ ડિવાઇસમાં ગુજરાતી અવાજ ઉપલબ્ધ નથી — લિખિત સમજૂતી વાંચી શકાય છે.',
  voiceGenderFemale: 'સ્ત્રી અવાજ',
  voiceGenderMale: 'પુરુષ અવાજ',
  voicePreparingLabel: 'કુદરતી અવાજ તૈયાર થાય છે...',
  voiceAiHumanBadge: 'AI માનવ અવાજ',
  voiceOfflineFallbackBadge: 'ઓફલાઇન અવાજ',
  voiceReplayExplanationBtn: 'સમજૂતી ફરી સાંભળો',

  payHeaderTitle: 'પેમેન્ટ સ્ક્રીનશોટ મોકલો',
  payHeaderDesc:
    'ફી ચૂકવીને તમારો પેમેન્ટ સ્ક્રીનશોટ એડમિન પેનલમાં અથવા WhatsApp (9099592283) પર મોકલો. એડમિન એપ્રુવ કરતાં જ તમને અહીં લાઇવ 8-અક્ષરનો કોડ મળશે.',
  payUpiCardTitle: 'UPI દ્વારા પેમેન્ટ કરો',
  payUpiCopy: 'કોપી',
  payUpiCopied: 'કોપી થઈ ગયો',
  payUpiOpenApp: 'ડાયરેક્ટ UPI એપ ખોલો',
  payUpiQuickTip: 'પેમેન્ટ કર્યા બાદ નીચે માત્ર પેમેન્ટનો સ્ક્રીનશોટ અપલોડ કરી એડમિન પેનલમાં અથવા WhatsApp (9099592283) પર મોકલો.',
  payQrTitle: 'UPI QR કોડ સ્કેન કરો (Bank Limit Error વગર)',
  payQrDownload: 'QR ડાઉનલોડ કરો (Gallery)',
  payQrShareOnly: 'શેર',
  payQrSaveShare: 'QR સેવ / શેર કરો (Gallery થી સ્કેન કરો)',
  payQrDownloadedMsg: 'QR કોડ Gallery માં ડાઉનલોડ થઈ ગયો છે — GPay / PhonePe માં "Scan from gallery" વડે પેમેન્ટ કરો.',
  payQrSavedMsg: 'QR ફોટો તૈયાર છે — GPay / PhonePe માં "Scan from gallery" વડે પેમેન્ટ કરો.',
  payCopyAmount: 'રકમ કોપી',
  payCopyUpiId: 'UPI ID કોપી',
  payUpiBankLimitNote:
    'જો "ડાયરેક્ટ UPI એપ" બટનમાં HDFC/Bank Limit Error આવે, તો ઉપરનો QR કોડ સેવ કરી GPay/PhonePe માં "Scan from Gallery" કરો અથવા UPI ID કોપી કરી સીધું પેમેન્ટ કરો.',
  loginTitle: 'મોબાઇલ નંબરથી લૉગિન કરો',
  loginSubtitle: 'તમારું નામ અને ૧૦ અંકનો મોબાઇલ નંબર દાખલ કરી Quick Quiz પ્લેટફોર્મ ખોલો.',
  loginBtn: 'લૉગિન કરી ક્વિઝ શરૂ કરો',
  switchAccountBtn: 'લૉગ આઉટ',
  adminNumberLoginHint: 'આ એડમિન નંબર છે — કૃપા કરીને પાસવર્ડથી એડમિન પેનલમાં લૉગિન કરો.',
  returningAccountTitle: 'તમારું જૂનું એકાઉન્ટ મળી ગયું!',
  returningAccountLoaded: 'અનલૉક વિષયો અને ક્વિઝ વિગતો આપમેળે લોડ થઈ જશે.',
  checkingAccountLabel: 'એકાઉન્ટ વિગત તપાસાઈ રહી છે...',
  returningWelcomeMsg: 'ફરી સ્વાગત છે! તમારી જૂની વિગતો અને અનલૉક વિષયો લોડ થઈ ગયા છે.',
  unlockSingleSubjectLabel: 'માત્ર આ વિષય',
  unlockAllSubjectsLabel: 'બધા વિષયો (ગણિત + વિજ્ઞાન + સા.વિ.)',
  fixedPriceBadge: 'ફિક્સ ફી',
  payTabLabel: 'UPI પેમેન્ટ અને સ્ક્રીનશોટ',
  codeTabLabel: 'મારી પાસે કોડ છે',
  submitToAdminBtn: 'એડમિન પેનલમાં મોકલો',
  sendWhatsAppScreenshotBtn: 'WhatsApp (9099592283)',
  unlockAllBannerTitle: 'બધા જ વિષયો ફક્ત ₹49 માં અનલૉક કરો',
  unlockAllBannerDesc: 'કોઈ એક વિષય ₹24 (Fix) અથવા બધા વિષયો ₹49 (Fix) — વિષયની અંદર જ UPI પેમેન્ટ કરો.',
  approvedModalTitle: 'પેમેન્ટ મંજૂર અને કોડ તૈયાર છે!',
  approvedModalDesc: 'વિદ્યાર્થીને WhatsApp પર પેમેન્ટ વિગત અને 8-અક્ષરનો કોડ તરત મોકલો.',
  fieldFullName: 'તમારું પૂરું નામ *',
  fieldFullNamePlaceholder: 'દા.ત. આરવ પટેલ',
  fieldMobile: 'મોબાઇલ નંબર (૧૦ અંક) *',
  fieldMobilePlaceholder: '9876543210',
  fieldAmount: 'ચૂકવેલ રકમ (₹) *',
  fieldAmountPlaceholder: '24',
  fieldSubject: 'વિષય / એક્સેસ પસંદ કરો',
  fieldUtr: 'Transaction / UTR ID *',
  fieldUtrPlaceholder: 'દા.ત. 412345678901',
  fieldScreenshot: 'પેમેન્ટ સ્ક્રીનશોટ (ફોટો) *',
  pickScreenshot: 'પેમેન્ટ સ્ક્રીનશોટ પસંદ કરો',
  changeScreenshot: 'બીજો ફોટો પસંદ કરો',
  preparingImage: 'ફોટો તૈયાર થઈ રહ્યો છે...',
  uploadingImage: 'ફોટો અપલોડ થઈ રહ્યો છે...',
  submitPaymentBtn: 'પેમેન્ટ વિગત મોકલો',
  submittingBtn: 'મોકલાઈ રહ્યું છે...',
  requestSentTitle: 'વિનંતી મોકલાઈ ગઈ છે, એડમિન મંજૂરીની રાહ જુએ છે',
  requestSentSubtitle:
    'પેજ રિફ્રેશ કરવાની જરૂર નથી — એડમિન મંજૂર કરશે એટલે તમારો 8-અક્ષરનો કોડ અહીં તરત દેખાશે.',
  sendWhatsAppOptional: 'WhatsApp પર એડમિનને જાણ કરો (વૈકલ્પિક)',
  myRequestsTitle: 'તમારી મોકલેલ વિનંતીઓ (લાઇવ સ્ટેટસ)',
  waitingApprovalLive: 'એડમિન મંજૂરીની રાહ જુએ છે (લાઇવ અપડેટ ચાલુ)...',
  statusPending: 'બાકી (Pending)',
  statusApproved: 'મંજૂર (Approved)',
  statusRejected: 'નામંજૂર (Rejected)',
  yourCodeLabel: 'તમારો એક્સેસ કોડ:',
  copyCode: 'કોપી',
  useThisCodeBtn: 'આ કોડ હમણાં વાપરો',
  tapToZoom: 'મોટું જોવા ટચ કરો',
  zoomModalTitle: 'પેમેન્ટ સ્ક્રીનશોટ',
  closeBtn: 'બંધ કરો',
  adminNoteLabel: 'એડમિન નોંધ:',

  useCodeTitle: 'એક્સેસ કોડ નાખીને ક્વિઝ અનલૉક કરો',
  useCodeSubtitle:
    'એડમિન તરફથી WhatsApp પર મળેલ અથવા સ્ક્રીન પર દેખાયેલ 8-અક્ષરનો કોડ અને તમારી વિગત દાખલ કરો.',
  fieldCodeLabel: '8-અક્ષરનો કોડ *',
  fieldCodePlaceholder: 'દા.ત. K7M9P2X4',
  redeemNowBtn: 'કોડ ચકાસી અનલૉક કરો',
  redeemingBtn: 'ચકાસણી થાય છે...',
  codeSuccessTitle: 'કોડ માન્ય! ક્વિઝ એક્સેસ અનલૉક થઈ ગયું છે',
  codeSuccessDesc: 'તમે હવે નીચેના વિષયોની બોર્ડ ક્વિઝ રમી શકો છો.',
  unlockedContentTitle: 'Quick Quiz — ધોરણ ૧૦ બોર્ડ ક્વિઝ',
  unlockedContentSubtitle: 'કોઈ પણ વિષયના ફોલ્ડર ખોલી પ્રકરણ મુજબ MCQ ક્વિઝ રમો.',
  subjectsHeader: 'વિષય ફોલ્ડર્સ',
  lockedBadge: 'કોડ જરૂરી',
  unlockedBadge: 'બધા વિષયો અનલૉક',
  partialUnlockedBadge: 'અંશતઃ અનલૉક',
  chaptersAndQuestions: 'પ્રકરણ • પ્રશ્નો',
  recentAttemptsTitle: 'તાજેતરના ક્વિઝ પરિણામો',
  unlockAnotherSubject: 'બીજો કોડ નાખો',

  adminLoginTitle: 'એડમિન લૉગિન',
  adminLoginSubtitle: 'સુરક્ષા માટે માત્ર અધિકૃત એડમિન નંબર +91 9099592283 નાખવાથી જ પાસવર્ડનું બોક્સ ખુલશે.',
  adminOnlyNumberNote: 'અન્ય કોઈ પણ નંબરથી એડમિન પેનલ ખૂલી શકશે નહીં.',
  adminPhoneLabel: 'મોબાઇલ નંબર (૧૦ અંક)',
  adminPasswordLabel: 'એડમિન પાસવર્ડ *',
  adminPasswordPlaceholder: 'પાસવર્ડ દાખલ કરો',
  adminLoginBtn: 'પાસવર્ડ ચકાસી એડમિન પેનલ ખોલો',
  loggingInBtn: 'લૉગિન થઈ રહ્યું છે...',
  errWrongAdminPassword: 'ખોટો પાસવર્ડ! કૃપા કરીને સાચો એડમિન પાસવર્ડ દાખલ કરો.',
  errWrongAdminGoogleAccount: 'માત્ર અધિકૃત એડમિન Google એકાઉન્ટ (omsai3248@gmail.com) જ માન્ય છે!',
  errAdminGoogleCancelled: 'Google વેરિફિકેશન રદ થયું. કૃપા કરીને omsai3248@gmail.com પસંદ કરી ફરી પ્રયાસ કરો.',
  errAdminNoGoogleAccount: 'ફોનમાં omsai3248@gmail.com Google એકાઉન્ટ ઉમેરેલું હોવું જરૂરી છે.',
  errAdminGoogleConfig: 'Google Sign-In ચકાસણી પૂર્ણ થઈ શકી નથી. કૃપા કરીને GitHub માં GOOGLE_SERVICES_JSON અને DEBUG_KEYSTORE_BASE64 Secrets ઉમેરો અથવા AI Studio APK વાપરો.',
  errAdminNativeMissing: 'આ APK માં Firebase google-services.json જોડાયેલ નથી. GitHub માં GOOGLE_SERVICES_JSON Secret ઉમેરી નવું APK બનાવો.',
  errAdminSha1Mismatch: 'આ APK ની સાઇનિંગ કી (SHA-1: {sha1}) Firebase સાથે મેચ થતી નથી. GitHub Secrets માં DEBUG_KEYSTORE_BASE64 ઉમેરી નવું APK બનાવો અથવા AI Studio માંથી APK ડાઉનલોડ કરો.',
  onlyAdminAllowedError: 'માત્ર 9099592283 નંબર જ એડમિન લૉગિન માટે માન્ય છે!',
  signOutBtn: 'એડમિન લૉગ આઉટ',

  adminPanelTitle: 'એડમિન કંટ્રોલ પેનલ',
  liveBadge: 'લાઇવ',
  soundOn: 'અવાજ ચાલુ',
  soundMuted: 'મ્યૂટ',
  syncBtn: 'સિંક',
  backToPublic: 'પબ્લિક પેજ',
  tabRequests: 'વિનંતીઓ',
  tabAllCodes: 'બધા કોડ્સ',
  tabUsedCodes: 'વપરાયેલ કોડ',
  tabStudents: 'વિદ્યાર્થીઓ',
  tabUpdates: 'અપડેટ્સ',
  noStudentsYet: 'હજી કોઈ વિદ્યાર્થી લૉગિન થયો નથી.',
  quizzesTakenLabel: 'રમેલી ક્વિઝ:',
  bestScoreLabel: 'શ્રેષ્ઠ સ્કોર:',
  grantAllAccessBtn: 'બધા વિષયો અનલૉક કરો',
  revokeAccessBtn: 'એક્સેસ બંધ કરો',
  pendingLabel: 'બાકી',
  approvedLabel: 'મંજૂર',
  rejectedLabel: 'નામંજૂર',
  allLabel: 'બધા',
  approveAndGenerateBtn: 'એપ્રુવ અને કોડ બનાવો',
  rejectBtn: 'નામંજૂર',
  rejectReasonPlaceholder: 'નામંજૂર કરવાનું કારણ લખો (વૈકલ્પિક)...',
  confirmRejectBtn: 'નામંજૂર કન્ફર્મ કરો',
  cancelBtn: 'રદ કરો',
  generatedCodeLabel: 'જનરેટ થયેલ 8-અક્ષર કોડ',
  sendOnWhatsAppBtn: 'WhatsApp પર મોકલો',
  noRequestsFound: 'આ વિભાગમાં કોઈ પેમેન્ટ વિનંતી નથી.',
  searchCodesPlaceholder: 'કોડ, નામ, મોબાઇલ અથવા Request ID થી શોધો...',
  filterAll: 'બધા',
  filterUnused: 'વણવપરાયેલ (Unused)',
  filterUsed: 'વપરાયેલ (Used)',
  exportCsvBtn: 'CSV ડાઉનલોડ',
  exportPdfBtn: 'A4 PDF',
  permanentCodesNote: 'એડમિન પાસવર્ડ વડે જરૂર મુજબ કોડ્સ મેનેજ અથવા ડિલીટ કરી શકાય છે.',
  noCodesFound: 'કોઈ કોડ મળ્યો નથી.',
  noUsedCodesYet: 'હજી સુધી કોઈ કોડ વપરાયો નથી.',
  usedByHeader: 'કોણે વાપર્યો (Live Detail)',
  buyerHeader: 'મૂળ પેમેન્ટ વિગત',
  deviceInfoLabel: 'ડિવાઇસ / બ્રાઉઝર:',
  usedAtLabel: 'વપરાયાનો સમય:',
  createdAtLabel: 'બન્યાનો સમય:',
  requestIdLabel: 'Request ID:',
  alertsLabel: 'લાઇવ એલર્ટ્સ',
  clearAlertsBtn: 'બધા સાફ કરો',
  noAlertsYet: 'હજી કોઈ નવું લાઇવ એલર્ટ નથી.',
  deleteBtn: 'ડિલીટ',
  deleteConfirmTitle: 'એડમિન ડિલીટ કન્ફર્મેશન',
  deleteConfirmDesc: 'આ વિગત કાયમ માટે ડિલીટ કરવા માટે એડમિન પાસવર્ડ દાખલ કરો:',
  deleteSuccessMsg: 'સફળતાપૂર્વક ડિલીટ થઈ ગયું.',
  directCodeSectionTitle: 'મોબાઇલ નંબર પરથી ડાયરેક્ટ કોડ બનાવો અને WhatsApp મોકલો',
  directCodeSectionSubtitle: 'વિદ્યાર્થીનો ૧૦ અંકનો નંબર નાખી કોડ બનાવો અને તરત WhatsApp પર મોકલો.',
  directCodeMobilePlaceholder: 'મોબાઇલ નંબર (દા.ત. 9876543210)',
  directCodeNamePlaceholder: 'વિદ્યાર્થીનું નામ (વૈકલ્પિક)',
  directCodeGenerateBtn: 'કોડ બનાવો',
  directCodeGeneratingBtn: 'કોડ બની રહ્યો છે...',
  directCodeReadyLabel: 'કોડ તૈયાર છે (WhatsApp મોકલો):',
  directCodeSendWhatsAppBtn: 'WhatsApp પર કોડ મોકલો',
  directCodeStudentMatched: 'રજિસ્ટર્ડ વિદ્યાર્થી:',

  errInvalidName: 'કૃપા કરીને માન્ય પૂરું નામ લખો.',
  errInvalidMobile: 'કૃપા કરીને ૧૦ અંકનો માન્ય મોબાઇલ નંબર લખો.',
  errInvalidAmount: 'કૃપા કરીને માન્ય રકમ (₹1 અથવા વધુ) લખો.',
  errInvalidUtr: 'કૃપા કરીને માન્ય Transaction / UTR ID (ઓછામાં ઓછા ૪ અક્ષર) લખો.',
  errScreenshotRequired: 'કૃપા કરીને પેમેન્ટનો સ્ક્રીનશોટ ફોટો પસંદ કરો.',
  errDuplicateUtr: 'આ UTR / Transaction ID પહેલેથી વપરાયેલ છે! ડુપ્લીકેટ UTR માન્ય નથી.',
  errInvalidCodeFormat: 'કૃપા કરીને માન્ય કોડ દાખલ કરો.',
  errCodeNotFound: 'આ કોડ ખોટો છે અથવા અસ્તિત્વમાં નથી.',
  errCodeAlreadyUsed: 'આ કોડ પહેલેથી વપરાઈ ચૂક્યો છે! એક કોડ ફક્ત એક જ વાર વાપરી શકાય છે.',
  errAlreadyApproved: 'આ વિનંતી પહેલેથી પ્રોસેસ થઈ ચૂકી છે.',

  syncStatusTitle: 'સ્માર્ટ લાઇવ સિંક સ્ટેટસ',
  syncInternetLabel: 'ઇન્ટરનેટ સ્ટેટસ',
  syncInternetOnline: 'Online',
  syncInternetOffline: 'Offline',
  syncServerLabel: 'સર્વર કનેક્શન',
  syncServerConnected: 'Connected',
  syncServerDisconnected: 'Disconnected',
  syncLiveSyncLabel: 'લાઇવ સિંક',
  syncLiveActive: 'Active',
  syncLivePaused: 'Paused',
  syncLastSyncLabel: 'છેલ્લો સિંક સમય',
  syncPendingLabel: 'બાકી સિંક રેકોર્ડ્સ',
  syncFailedLabel: 'નિષ્ફળ સિંક રેકોર્ડ્સ',
  syncNowBtn: 'હમણાં સિંક કરો (Sync Now)',
  syncingNowBtn: 'સિંક થઈ રહ્યું છે...',
  loadMoreBtn: 'વધુ લોડ કરો (+25)',
  loadingMoreBtn: 'લોડ થઈ રહ્યું છે...',
  quotaCooldownBanner:
    'સર્વરની દૈનિક ફ્રી લિમિટ (Quota) પૂરી થવા આવી છે — લોકલ કેશમાંથી ડેટા બતાવવામાં આવે છે અને ફેરફારો સુરક્ષિત ક્યુમાં સેવ થયા છે.',
  offlineModeBanner:
    'ઇન્ટરનેટ બંધ છે — તમારો ડેટા સ્થાનિક સ્ટોરેજમાં સુરક્ષિત છે અને ઇન્ટરનેટ આવતા જ આપમેળે સિંક થઈ જશે.',
  pendingSyncSavedNote: 'સ્થાનિક સ્ટોરેજમાં સુરક્ષિત (ઓનલાઇન થતા આપમેળે સિંક થશે)',

  tabNotifications: 'સૂચનાઓ',
  tabAdminChat: 'ચેટ',
  notifCenterTitle: 'એડમિન નોટિફિકેશન સેન્ટર',
  notifFilterAll: 'બધી સૂચનાઓ',
  notifFilterUnread: 'ન વાંચેલી',
  notifMarkAllRead: 'બધી વંચાયેલી માર્ક કરો',
  notifMarkRead: 'વંચાયેલું',
  notifNoItems: 'કોઈ નવી સૂચના નથી.',
  notifPrefsTitle: 'નોટિફિકેશન કેટેગરી સેટિંગ્સ',
  notifPrefRegistrations: 'નવું રજિસ્ટ્રેશન',
  notifPrefLogins: 'વિદ્યાર્થી લૉગિન',
  notifPrefPayments: 'નવું પેમેન્ટ અને મંજૂરી',
  notifPrefCodes: 'કોડ વપરાશ (Redeem)',
  notifPrefQuiz: 'ક્વિઝ પ્રવૃત્તિ',
  notifPrefDataUpdates: 'ડેટા અપડેટ્સ',
  notifPrefChat: 'એડમિન ચેટ મેસેજ',
  pushPermissionEnableTitle: 'WhatsApp જેવી Push નોટિફિકેશન ચાલુ કરો',
  pushPermissionEnableDesc: 'એપ બંધ હોય કે બેકગ્રાઉન્ડમાં હોય ત્યારે પણ અવાજ અને વાઇબ્રેશન સાથે તરત નોટિફિકેશન મેળવો.',
  pushPermissionEnableBtn: 'નોટિફિકેશન પરવાનગી આપો',
  pushPermissionActiveBadge: 'Push ચાલુ છે',
  adminChatTitle: 'એડમિન પર્સનલ ચેટ (1-to-1)',
  adminChatSubtitle: 'સાથી એડમિન્સ સાથે રીઅલ-ટાઇમ સુરક્ષિત ચેટ અને ડબલ-ટિક સ્ટેટસ',
  adminDirectoryTitle: 'અધિકૃત એડમિન્સ',
  adminInviteTitle: 'નવો કો-એડમિન ઉમેરો (Super Admin)',
  adminInviteEmailPlaceholder: 'કો-એડમિન Gmail ID (દા.ત. name@gmail.com)',
  adminInviteNamePlaceholder: 'એડમિનનું નામ',
  adminInviteBtn: 'એડમિન આમંત્રિત કરો',
  adminInviteSuccess: 'કો-એડમિન સફળતાપૂર્વક ઉમેરાયા! તેઓ તેમના Google એકાઉન્ટથી લૉગિન કરી શકશે.',
  adminChatEmptyDirectory: 'ચેટ શરૂ કરવા માટે Super Admin દ્વારા અન્ય કો-એડમિન Gmail ઉમેરો અથવા બીજા ડિવાઇસથી લૉગિન કરો.',
  adminChatNoMessages: 'હજી કોઈ મેસેજ નથી. વાતચીત શરૂ કરવા નીચે મેસેજ લખો.',
  adminChatComposerPlaceholder: 'મેસેજ લખો...',
  adminChatSendBtn: 'મોકલો',
  adminChatBackToList: 'બધી ચેટ્સ',
  adminChatSuperBadge: 'Super Admin',
  adminChatCoAdminBadge: 'Admin',
  chatStatusSent: 'મોકલાયું',
  chatStatusDelivered: 'પહોંચ્યું',
  chatStatusRead: 'વંચાયું',
  openNotifAction: 'વિગત ખોલો',

  displaySettingsBtn: 'ડિસ્પ્લે',
  displaySettingsTitle: 'ડિસ્પ્લે અને સ્ક્રીન સેટિંગ્સ',
  displaySettingsSubtitle: 'મોબાઇલ, ટેબ્લેટ, Smart TV અને Smart Board મુજબ આપમેળે UI સેટ કરો.',
  displayModeAutoTitle: '૧. Auto Adaptive Mode (ડિફોલ્ટ)',
  displayModeAutoDesc: 'ડિવાઇસના કદ અને દિશા મુજબ આપમેળે સેટ થાય (TV/Smart Board પર આપમેળે Landscape).',
  displayModePortraitTitle: '૨. Portrait Mode',
  displayModePortraitDesc: 'ઊભી સ્ક્રીન (Vertical / Handheld) લેઆઉટ લોક રાખો.',
  displayModeLandscapeTitle: '૩. Landscape Mode',
  displayModeLandscapeDesc: 'આડી વાઇડ સ્ક્રીન (Split-Pane & Navigation Rail) લેઆઉટ રાખો.',
  displayModeFullScreenTitle: '૪. Full Screen Mode',
  displayModeFullScreenDesc: 'સ્ટેટસ બાર અને નેવિગેશન બાર છુપાવીને સંપૂર્ણ ફુલ સ્ક્રીન મોડ ચાલુ કરો.',
  displayDetectedDeviceLabel: 'ઓળખાયેલ ડિવાઇસ',
  displayWindowClassLabel: 'વિન્ડો સાઇઝ',
  displayOrientationLabel: 'દિશા (Orientation)',
  displayResolutionLabel: 'સ્ક્રીન માપ',
  displayResetDefaultBtn: 'ડિફોલ્ટ Auto મોડ પર જાઓ',
  orientationPortraitLabel: 'Portrait (ઊભું)',
  orientationLandscapeLabel: 'Landscape (આડું)',
  deviceTypeMobile: 'Android મોબાઇલ',
  deviceTypeTablet: 'Android ટેબ્લેટ',
  deviceTypeSmartBoard: 'ઇન્ટરેક્ટિવ Smart Board',
  deviceTypeAndroidTv: 'Android Smart TV',
  deviceTypeLargeTouchscreen: 'મોટી ટચસ્ક્રીન ડિસ્પ્લે',
  deviceTypeLandscapeMonitor: 'લેન્ડસ્કેપ મોનિટર',
  deviceTypeFoldable: 'ફોલ્ડેબલ ડિવાઇસ',

  appUpdateAvailableTitle: 'નવું એપ અપડેટ ઉપલબ્ધ છે!',
  appUpdateMandatoryTitle: 'જરૂરી એપ અપડેટ ઉપલબ્ધ છે',
  appUpdateMandatoryDesc: 'આગળ વધવા માટે આ અપડેટ ઇન્સ્ટોલ કરવું જરૂરી છે. તમારો બધો ડેટા અને લૉગિન સુરક્ષિત રહેશે.',
  appUpdateOptionalBadge: 'વૈકલ્પિક અપડેટ',
  appUpdateMandatoryBadge: 'જરૂરી (Mandatory)',
  appUpdateCurrentVersionLabel: 'હાલનું વર્ઝન',
  appUpdateNewVersionLabel: 'નવું વર્ઝન',
  appUpdateNowBtn: 'હમણાં અપડેટ કરો (Update Now)',
  appUpdateDownloadingBtn: 'ડાઉનલોડ થઈ રહ્યું છે...',
  appUpdateVerifyingLabel: 'APK સુરક્ષા ચકાસણી થઈ રહી છે...',
  appUpdateInstallingLabel: 'Android ઇન્સ્ટોલર ખુલી રહ્યું છે...',
  appUpdateLaterBtn: 'પછીથી',
  appUpdateRetryBtn: 'ફરી પ્રયાસ કરો (Retry)',
  appUpdatePermissionRequiredDesc: 'સીધું એપ અપડેટ ઇન્સ્ટોલ કરવા માટે "Install unknown apps" પરવાનગી ચાલુ કરો. પરવાનગી પછી તરત ઇન્સ્ટોલ થશે.',
  appUpdateGrantInstallPermBtn: 'પરવાનગી આપી ઇન્સ્ટોલ કરો',
  appUpdateUpToDateMsg: 'તમારી એપ સંપૂર્ણપણે અપ-ટુ-ડેટ છે.',
  appUpdateCheckNowBtn: 'અપડેટ ચેક કરો',
  appUpdateCheckingBtn: 'ચેક થાય છે...',
  appUpdateHistoryTitle: 'તાજેતરના એપ અપડેટ નોટિફિકેશન્સ',
  appUpdateNoHistory: 'હજી કોઈ એપ અપડેટ પબ્લિશ થયું નથી.',
  adminUpdateControlTitle: 'Firebase એપ અપડેટ અને Push નિયંત્રણ',
  adminUpdateUploadApkBtn: 'નવું APK અપલોડ કરો (.apk)',
  adminUpdateChangeApkBtn: 'બીજું APK પસંદ કરો',
  adminUpdateInspectingApk: 'APK પેકેજ અને સર્ટિફિકેટ ચકાસણી થાય છે...',
  adminUpdateVerifiedPkg: 'પેકેજ નામ મેચ થયું',
  adminUpdateVerifiedSig: 'સાઇનિંગ સર્ટિફિકેટ મેચ થયું (જૂનો ડેટા સુરક્ષિત રહેશે)',
  adminUpdateMismatchPkg: 'ચેતવણી: APK પેકેજ નામ આ એપ સાથે મેચ થતું નથી!',
  adminUpdateMismatchSig: 'ચેતવણી: સાઇનિંગ સર્ટિફિકેટ મેચ થતું નથી — એપ અપડેટ થશે નહીં.',
  adminUpdateVersionNameLabel: 'વર્ઝન નંબર (દા.ત. 1.0.2) *',
  adminUpdateVersionCodeLabel: 'વર્ઝન કોડ (પૂર્ણાંક) *',
  adminUpdateTitleLabel: 'અપડેટ શીર્ષક (Title) *',
  adminUpdateNotesLabel: 'અપડેટ વિગત / વર્ણન (Release Description) *',
  adminUpdateTypeLabel: 'અપડેટ પ્રકાર (Update Type)',
  adminUpdateOptionalOption: 'વૈકલ્પિક (Optional)',
  adminUpdateMandatoryOption: 'જરૂરી (Mandatory)',
  adminUpdatePublishBtn: 'અપડેટ પબ્લિશ કરો અને બધાને Push મોકલો',
  adminUpdatePublishingBtn: 'APK અપલોડ અને પબ્લિશ થાય છે...',
  adminUpdatePublishedSuccess: 'નવું અપડેટ પબ્લિશ થયું અને બધા ડિવાઇસ પર Push નોટિફિકેશન મોકલાયું!',
  adminUpdateUploadingProgress: 'Firebase Storage માં APK અપલોડ થઈ રહ્યું છે...',
  adminUpdateActiveReleaseTitle: 'હાલનું લાઇવ Firebase અપડેટ',
  adminUpdateNoActiveRelease: 'હજી સુધી કોઈ Firebase APK અપડેટ પબ્લિશ કરવામાં આવ્યું નથી.',
  adminUpdatePushSentCount: 'પબ્લિશ અને Push નોટિફિકેશન મોકલાયું',
};

const EN: Translations = {
  appName: 'Quick Quiz',
  appSubtitle: 'Std 10 Board Quiz • Gujarati Voice Feedback',
  langToggleLabel: 'ગુજરાતી',
  navSubmitPayment: 'Submit Payment',
  navUseCode: 'Use Code',
  navAdmin: 'Admin',
  navAdminLive: 'Admin Live',
  loadingApp: 'Loading Quick Quiz...',
  voiceOnLabel: 'Voice ON',
  voiceOffLabel: 'Voice OFF',
  voicePauseBtn: 'Pause',
  voiceResumeBtn: 'Resume',
  voiceStopBtn: 'Stop',
  voiceReplayBtn: 'Listen Again',
  voiceReadingFeedback: 'Speaking Gujarati encouragement...',
  voiceReadingExplanation: 'Reading full explanation in Gujarati...',
  voicePausedLabel: 'Voice paused',
  voiceUnavailableNote: 'Gujarati voice is unavailable on this device — text explanation is shown below.',
  voiceGenderFemale: 'Female Voice',
  voiceGenderMale: 'Male Voice',
  voicePreparingLabel: 'Preparing human voice...',
  voiceAiHumanBadge: 'AI Human Voice',
  voiceOfflineFallbackBadge: 'Offline Voice',
  voiceReplayExplanationBtn: 'Listen Explanation Again',

  payHeaderTitle: 'Submit Payment Screenshot',
  payHeaderDesc:
    'Upload your payment screenshot to the Admin Panel or send directly on WhatsApp (9099592283). Once approved, your 8-character code will appear right here live.',
  payUpiCardTitle: 'Pay via UPI',
  payUpiCopy: 'Copy',
  payUpiCopied: 'Copied',
  payUpiOpenApp: 'Open UPI App Directly',
  payUpiQuickTip: 'After paying, upload the payment screenshot below to send to Admin or WhatsApp (9099592283).',
  payQrTitle: 'Scan UPI QR Code (No Intent Limit)',
  payQrDownload: 'Download QR (Gallery)',
  payQrShareOnly: 'Share',
  payQrSaveShare: 'Save / Share QR (Scan from Gallery)',
  payQrDownloadedMsg: 'QR code downloaded to Gallery — open GPay / PhonePe and select "Scan from gallery".',
  payQrSavedMsg: 'QR image ready — open GPay / PhonePe and select "Scan from gallery".',
  payCopyAmount: 'Copy ₹',
  payCopyUpiId: 'Copy UPI ID',
  payUpiBankLimitNote:
    'If direct UPI intent shows a Bank Limit error (common in HDFC/GPay), save/scan this QR from Gallery or copy the UPI ID and pay directly inside GPay/PhonePe.',
  loginTitle: 'Login with Mobile Number',
  loginSubtitle: 'Enter your name and 10-digit mobile number to open the Quick Quiz platform.',
  loginBtn: 'Login & Open Quiz Platform',
  switchAccountBtn: 'Log Out',
  adminNumberLoginHint: 'This is the Admin number — please sign in with your Admin password.',
  returningAccountTitle: 'Existing Account Found!',
  returningAccountLoaded: 'Your saved details and unlocked subjects will be restored automatically.',
  checkingAccountLabel: 'Checking saved account...',
  returningWelcomeMsg: 'Welcome back! Your saved profile and unlocked subjects have been restored.',
  unlockSingleSubjectLabel: 'Single Subject Only',
  unlockAllSubjectsLabel: 'All Subjects (Maths + Science + SS)',
  fixedPriceBadge: 'Fixed Price',
  payTabLabel: 'Pay via UPI & Screenshot',
  codeTabLabel: 'I Have a Code',
  submitToAdminBtn: 'Send to Admin Panel',
  sendWhatsAppScreenshotBtn: 'WhatsApp (9099592283)',
  unlockAllBannerTitle: 'Unlock All Subjects for Just ₹49',
  unlockAllBannerDesc: 'Fixed ₹24 per subject or ₹49 for all subjects — pay via UPI inside any quiz.',
  approvedModalTitle: 'Approved & Code Ready!',
  approvedModalDesc: 'Send the payment details and 8-character access code to the student on WhatsApp.',
  fieldFullName: 'Full Name *',
  fieldFullNamePlaceholder: 'e.g. Aarav Patel',
  fieldMobile: 'Mobile Number (10 digits) *',
  fieldMobilePlaceholder: '9876543210',
  fieldAmount: 'Amount Paid (₹) *',
  fieldAmountPlaceholder: '24',
  fieldSubject: 'Select Subject / Content',
  fieldUtr: 'Transaction / UTR ID *',
  fieldUtrPlaceholder: 'e.g. 412345678901',
  fieldScreenshot: 'Payment Screenshot (Image) *',
  pickScreenshot: 'Select Payment Screenshot',
  changeScreenshot: 'Choose Another Screenshot',
  preparingImage: 'Preparing image...',
  uploadingImage: 'Uploading screenshot...',
  submitPaymentBtn: 'Submit Payment Request',
  submittingBtn: 'Submitting...',
  requestSentTitle: 'Request sent, waiting for admin approval',
  requestSentSubtitle:
    'No need to refresh — this page updates live as soon as the admin approves and displays your 8-character code.',
  sendWhatsAppOptional: 'Ping Admin on WhatsApp (Optional)',
  myRequestsTitle: 'Your Submitted Requests (Live Status)',
  waitingApprovalLive: 'Waiting for admin approval (live listener active)...',
  statusPending: 'Pending',
  statusApproved: 'Approved',
  statusRejected: 'Rejected',
  yourCodeLabel: 'Your Access Code:',
  copyCode: 'Copy',
  useThisCodeBtn: 'Use This Code Now',
  tapToZoom: 'Tap to zoom',
  zoomModalTitle: 'Payment Screenshot',
  closeBtn: 'Close',
  adminNoteLabel: 'Admin Note:',

  useCodeTitle: 'Enter Access Code to Unlock Content',
  useCodeSubtitle:
    'Enter the 8-character code received on WhatsApp or shown on screen along with your details.',
  fieldCodeLabel: '8-Character Code *',
  fieldCodePlaceholder: 'e.g. K7M9P2X4',
  redeemNowBtn: 'Validate & Unlock Content',
  redeemingBtn: 'Validating...',
  codeSuccessTitle: 'Code verified! Protected content unlocked',
  codeSuccessDesc: 'You now have access to the Quick Quiz folders below.',
  unlockedContentTitle: 'Quick Quiz — Std 10 Board Quiz',
  unlockedContentSubtitle: 'Open any subject folder to start chapter-wise MCQ practice.',
  subjectsHeader: 'Subject Folders',
  lockedBadge: 'Code Required',
  unlockedBadge: 'All Unlocked',
  partialUnlockedBadge: 'Partially Unlocked',
  chaptersAndQuestions: 'Chapters • Questions',
  recentAttemptsTitle: 'Recent Quiz Results',
  unlockAnotherSubject: 'Redeem Another Code',

  adminLoginTitle: 'Admin Login',
  adminLoginSubtitle:
    'Enter authorized number 9099592283 to reveal the Admin password field.',
  adminOnlyNumberNote: 'All other phone numbers are strictly blocked.',
  adminPhoneLabel: 'Mobile Number (10 digits)',
  adminPasswordLabel: 'Admin Password *',
  adminPasswordPlaceholder: 'Enter admin password',
  adminLoginBtn: 'Verify Password & Open Admin Panel',
  loggingInBtn: 'Signing in...',
  errWrongAdminPassword: 'Incorrect admin password. Please try again.',
  errWrongAdminGoogleAccount: 'Only authorized owner Google account (omsai3248@gmail.com) is allowed!',
  errAdminGoogleCancelled: 'Google verification was cancelled. Please select omsai3248@gmail.com and retry.',
  errAdminNoGoogleAccount: 'No Google account found on device. Please add omsai3248@gmail.com in Settings.',
  errAdminGoogleConfig: 'Google Sign-In verification could not complete for this APK signature. Add GOOGLE_SERVICES_JSON and DEBUG_KEYSTORE_BASE64 secrets in GitHub or use the AI Studio APK.',
  errAdminNativeMissing: 'Firebase google-services.json is missing from this APK build. Add GOOGLE_SERVICES_JSON secret in GitHub and rebuild the APK.',
  errAdminSha1Mismatch: 'This APK signing SHA-1 ({sha1}) does not match Firebase. Add DEBUG_KEYSTORE_BASE64 in GitHub Secrets and rebuild, or download the APK from AI Studio.',
  onlyAdminAllowedError: 'Only 9099592283 is allowed for Admin Login!',
  signOutBtn: 'Admin Sign Out',

  adminPanelTitle: 'Admin Control Panel',
  liveBadge: 'LIVE',
  soundOn: 'Sound On',
  soundMuted: 'Muted',
  syncBtn: 'Sync',
  backToPublic: 'Public View',
  tabRequests: 'Requests',
  tabAllCodes: 'All Codes',
  tabUsedCodes: 'Used Codes',
  tabStudents: 'Students',
  tabUpdates: 'Updates',
  noStudentsYet: 'No students logged in yet.',
  quizzesTakenLabel: 'Quizzes Taken:',
  bestScoreLabel: 'Best Score:',
  grantAllAccessBtn: 'Unlock All Subjects',
  revokeAccessBtn: 'Revoke Access',
  pendingLabel: 'Pending',
  approvedLabel: 'Approved',
  rejectedLabel: 'Rejected',
  allLabel: 'All',
  approveAndGenerateBtn: 'Approve & Generate Code',
  rejectBtn: 'Reject',
  rejectReasonPlaceholder: 'Reason for rejection (optional)...',
  confirmRejectBtn: 'Confirm Reject',
  cancelBtn: 'Cancel',
  generatedCodeLabel: 'Generated 8-Char Code',
  sendOnWhatsAppBtn: 'Send on WhatsApp',
  noRequestsFound: 'No payment requests in this category.',
  searchCodesPlaceholder: 'Search by code, name, mobile, or Request ID...',
  filterAll: 'All',
  filterUnused: 'Unused',
  filterUsed: 'Used',
  exportCsvBtn: 'Export CSV',
  exportPdfBtn: 'A4 PDF',
  permanentCodesNote: 'Admin can manage or permanently delete codes using the Admin password.',
  noCodesFound: 'No matching codes found.',
  noUsedCodesYet: 'No codes have been used yet.',
  usedByHeader: 'Used By (Live Audit)',
  buyerHeader: 'Original Request Info',
  deviceInfoLabel: 'Device / Browser:',
  usedAtLabel: 'Used At:',
  createdAtLabel: 'Created At:',
  requestIdLabel: 'Request ID:',
  alertsLabel: 'Live Alerts',
  clearAlertsBtn: 'Clear All',
  noAlertsYet: 'No live alerts yet.',
  deleteBtn: 'Delete',
  deleteConfirmTitle: 'Confirm Admin Delete',
  deleteConfirmDesc: 'Enter Admin Password to permanently delete this record:',
  deleteSuccessMsg: 'Deleted successfully.',
  directCodeSectionTitle: 'Generate Direct Code by Mobile & Send on WhatsApp',
  directCodeSectionSubtitle: 'Enter a 10-digit mobile number to create a code and send it straight via WhatsApp.',
  directCodeMobilePlaceholder: 'Mobile Number (e.g. 9876543210)',
  directCodeNamePlaceholder: 'Student Name (optional)',
  directCodeGenerateBtn: 'Generate Code',
  directCodeGeneratingBtn: 'Generating...',
  directCodeReadyLabel: 'Code Ready (Send via WhatsApp):',
  directCodeSendWhatsAppBtn: 'Send Code on WhatsApp',
  directCodeStudentMatched: 'Matched Student:',

  errInvalidName: 'Please enter a valid full name.',
  errInvalidMobile: 'Please enter a valid 10-digit mobile number.',
  errInvalidAmount: 'Please enter a valid amount (₹1 or more).',
  errInvalidUtr: 'Please enter a valid Transaction / UTR ID (minimum 4 characters).',
  errScreenshotRequired: 'Please select a payment screenshot image.',
  errDuplicateUtr: 'This UTR / Transaction ID has already been submitted. Duplicate UTRs are blocked.',
  errInvalidCodeFormat: 'Please enter a valid access code.',
  errCodeNotFound: 'This access code is invalid or does not exist.',
  errCodeAlreadyUsed: 'This access code has already been used and cannot be reused.',
  errAlreadyApproved: 'This request has already been processed.',

  syncStatusTitle: 'Smart Live Sync Status',
  syncInternetLabel: 'Internet Status',
  syncInternetOnline: 'Online',
  syncInternetOffline: 'Offline',
  syncServerLabel: 'Server Connection',
  syncServerConnected: 'Connected',
  syncServerDisconnected: 'Disconnected',
  syncLiveSyncLabel: 'Live Sync',
  syncLiveActive: 'Active',
  syncLivePaused: 'Paused',
  syncLastSyncLabel: 'Last Sync Time',
  syncPendingLabel: 'Pending Sync Records',
  syncFailedLabel: 'Failed Sync Records',
  syncNowBtn: 'Sync Now',
  syncingNowBtn: 'Syncing...',
  loadMoreBtn: 'Load More (+25)',
  loadingMoreBtn: 'Loading...',
  quotaCooldownBanner:
    'Server free daily quota reached — serving cached data safely and queueing updates until quota resets.',
  offlineModeBanner:
    'Internet is offline — your data is safely stored locally and will sync automatically when online.',
  pendingSyncSavedNote: 'Saved locally (will auto-sync when online)',

  tabNotifications: 'Notifications',
  tabAdminChat: 'Chat',
  notifCenterTitle: 'Admin Notification Center',
  notifFilterAll: 'All',
  notifFilterUnread: 'Unread',
  notifMarkAllRead: 'Mark All Read',
  notifMarkRead: 'Mark Read',
  notifNoItems: 'No notifications yet.',
  notifPrefsTitle: 'Notification Category Settings',
  notifPrefRegistrations: 'New Registrations',
  notifPrefLogins: 'User Logins',
  notifPrefPayments: 'Payments & Approvals',
  notifPrefCodes: 'Code Redemptions',
  notifPrefQuiz: 'Quiz Activity',
  notifPrefDataUpdates: 'Data Updates',
  notifPrefChat: 'Admin Chat Messages',
  pushPermissionEnableTitle: 'Enable WhatsApp-Style Push Notifications',
  pushPermissionEnableDesc: 'Receive instant heads-up alerts with sound & vibration even when the app is closed or in the background.',
  pushPermissionEnableBtn: 'Allow Push Notifications',
  pushPermissionActiveBadge: 'Push Active',
  adminChatTitle: 'Admin Personal Chat (1-to-1)',
  adminChatSubtitle: 'Real-time encrypted Firestore chat with Sent / Delivered / Read ticks',
  adminDirectoryTitle: 'Authorized Admins',
  adminInviteTitle: 'Add Co-Admin (Super Admin)',
  adminInviteEmailPlaceholder: 'Co-Admin Gmail ID (e.g. name@gmail.com)',
  adminInviteNamePlaceholder: 'Admin Display Name',
  adminInviteBtn: 'Invite Admin',
  adminInviteSuccess: 'Co-Admin added! They can now sign in with their verified Google account.',
  adminChatEmptyDirectory: 'Add a Co-Admin Gmail above (Super Admin) or sign in as another Admin to start 1-to-1 messaging.',
  adminChatNoMessages: 'No messages yet. Type below to start chatting.',
  adminChatComposerPlaceholder: 'Type a message...',
  adminChatSendBtn: 'Send',
  adminChatBackToList: 'All Chats',
  adminChatSuperBadge: 'Super Admin',
  adminChatCoAdminBadge: 'Admin',
  chatStatusSent: 'Sent',
  chatStatusDelivered: 'Delivered',
  chatStatusRead: 'Read',
  openNotifAction: 'Open',

  displaySettingsBtn: 'Display',
  displaySettingsTitle: 'Display & Adaptive Screen Settings',
  displaySettingsSubtitle: 'Automatically adapts layout across Phones, Tablets, Smart TVs & Smart Boards.',
  displayModeAutoTitle: '1. Auto Adaptive Mode (Default)',
  displayModeAutoDesc: 'Automatically adapts to screen size & rotation (auto Landscape on TV & Smart Board).',
  displayModePortraitTitle: '2. Portrait Mode',
  displayModePortraitDesc: 'Lock layout to vertical portrait screen orientation.',
  displayModeLandscapeTitle: '3. Landscape Mode',
  displayModeLandscapeDesc: 'Lock layout to wide landscape split-pane orientation.',
  displayModeFullScreenTitle: '4. Full Screen Mode',
  displayModeFullScreenDesc: 'Hide system bars for an immersive edge-to-edge classroom & quiz view.',
  displayDetectedDeviceLabel: 'Detected Device',
  displayWindowClassLabel: 'Window Class',
  displayOrientationLabel: 'Orientation',
  displayResolutionLabel: 'Screen Size',
  displayResetDefaultBtn: 'Reset to Auto Default',
  orientationPortraitLabel: 'Portrait',
  orientationLandscapeLabel: 'Landscape',
  deviceTypeMobile: 'Android Mobile Phone',
  deviceTypeTablet: 'Android Tablet',
  deviceTypeSmartBoard: 'Interactive Smart Board',
  deviceTypeAndroidTv: 'Android Smart TV',
  deviceTypeLargeTouchscreen: 'Large Touchscreen Display',
  deviceTypeLandscapeMonitor: 'Landscape Monitor',
  deviceTypeFoldable: 'Foldable Device',

  appUpdateAvailableTitle: 'New App Update Available!',
  appUpdateMandatoryTitle: 'Mandatory App Update Available',
  appUpdateMandatoryDesc: 'This update is required to continue using the app. All your data, unlocks, and login sessions remain safe.',
  appUpdateOptionalBadge: 'Optional Update',
  appUpdateMandatoryBadge: 'Mandatory Update',
  appUpdateCurrentVersionLabel: 'Installed Version',
  appUpdateNewVersionLabel: 'New Version',
  appUpdateNowBtn: 'Update Now',
  appUpdateDownloadingBtn: 'Downloading Update...',
  appUpdateVerifyingLabel: 'Verifying APK security & signature...',
  appUpdateInstallingLabel: 'Launching Android System Installer...',
  appUpdateLaterBtn: 'Later',
  appUpdateRetryBtn: 'Retry Download',
  appUpdatePermissionRequiredDesc: 'Please enable "Install unknown apps" permission for this app so the update can install directly.',
  appUpdateGrantInstallPermBtn: 'Grant Permission & Install',
  appUpdateUpToDateMsg: 'Your app is up to date.',
  appUpdateCheckNowBtn: 'Check for Updates',
  appUpdateCheckingBtn: 'Checking...',
  appUpdateHistoryTitle: 'App Update Notification History',
  appUpdateNoHistory: 'No app updates published yet.',
  adminUpdateControlTitle: 'Firebase App Update & Push Control',
  adminUpdateUploadApkBtn: 'Upload New APK (.apk)',
  adminUpdateChangeApkBtn: 'Select Another APK',
  adminUpdateInspectingApk: 'Verifying APK package and signing certificate...',
  adminUpdateVerifiedPkg: 'Package name verified',
  adminUpdateVerifiedSig: 'Signing certificate matched (existing user data preserved)',
  adminUpdateMismatchPkg: 'Error: APK package name does not match this app!',
  adminUpdateMismatchSig: 'Error: Signing certificate mismatch — cannot install over current app.',
  adminUpdateVersionNameLabel: 'Version Number (e.g. 1.0.2) *',
  adminUpdateVersionCodeLabel: 'Version Code (integer) *',
  adminUpdateTitleLabel: 'Update Title *',
  adminUpdateNotesLabel: 'Update Description / Release Notes *',
  adminUpdateTypeLabel: 'Update Mode',
  adminUpdateOptionalOption: 'Optional Update',
  adminUpdateMandatoryOption: 'Mandatory Update',
  adminUpdatePublishBtn: 'Publish Update & Notify All Devices',
  adminUpdatePublishingBtn: 'Uploading APK & Publishing...',
  adminUpdatePublishedSuccess: 'App update published and push notifications dispatched to all devices!',
  adminUpdateUploadingProgress: 'Uploading APK to Firebase Storage...',
  adminUpdateActiveReleaseTitle: 'Active Firebase Release',
  adminUpdateNoActiveRelease: 'No Firebase APK release has been published yet.',
  adminUpdatePushSentCount: 'Published & Push Dispatched',
};

interface LanguageContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'gu',
  setLang: () => {},
  toggleLang: () => {},
  t: GU,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('app_lang');
      return saved === 'en' ? 'en' : 'gu';
    } catch {
      return 'gu';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('app_lang', lang);
    } catch {
      // Ignore storage error
    }
    document.documentElement.lang = lang === 'gu' ? 'gu' : 'en';
  }, [lang]);

  const setLang = (next: Language) => setLangState(next);
  const toggleLang = () => setLangState((prev) => (prev === 'gu' ? 'en' : 'gu'));

  return React.createElement(
    LanguageContext.Provider,
    {
      value: {
        lang,
        setLang,
        toggleLang,
        t: lang === 'gu' ? GU : EN,
      },
    },
    children
  );
};

export function useTranslation(): LanguageContextValue {
  return useContext(LanguageContext);
}
