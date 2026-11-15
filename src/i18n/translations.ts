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
  authSetupWarningTitle: string;
  authSetupWarningDesc: string;

  // Public Payment Page
  payHeaderTitle: string;
  payHeaderDesc: string;
  payUpiCardTitle: string;
  payUpiCopy: string;
  payUpiCopied: string;
  payUpiOpenApp: string;
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
  sendOtpBtn: string;
  sendingOtpBtn: string;
  enterOtpLabel: string;
  verifyOtpBtn: string;
  verifyingOtpBtn: string;
  changeNumberBtn: string;
  resendOtpBtn: string;
  otpSentBanner: string;
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
  tabSetup: string;
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
}

const GU: Translations = {
  appName: 'ધોરણ ૧૦ ક્વિઝ & પેમેન્ટ પોર્ટલ',
  appSubtitle: 'પેમેન્ટ વેરિફિકેશન • કાયમી કોડ • બોર્ડ ક્વિઝ',
  langToggleLabel: 'English',
  navSubmitPayment: 'પેમેન્ટ મોકલો',
  navUseCode: 'કોડ વાપરો',
  navAdmin: 'એડમિન',
  navAdminLive: 'એડમિન લાઇવ',
  loadingApp: 'એપ લોડ થઈ રહી છે...',
  authSetupWarningTitle: 'Firebase Anonymous Auth ચાલુ કરવું જરૂરી છે',
  authSetupWarningDesc:
    'પબ્લિક યુઝર્સ ફોર્મ સબમિટ કરી શકે તે માટે Firebase Console → Authentication → Sign-in method માં Anonymous અને Phone બંને ચાલુ કરો.',

  payHeaderTitle: 'પેમેન્ટ વિગતો અને સ્ક્રીનશોટ મોકલો',
  payHeaderDesc:
    'ફી ચૂકવીને તમારી વિગત, UTR નંબર અને સ્ક્રીનશોટ મોકલો. એડમિન એપ્રુવ કરતાં જ તમને અહીં લાઇવ 8-અક્ષરનો કોડ મળશે.',
  payUpiCardTitle: 'UPI દ્વારા પેમેન્ટ કરો',
  payUpiCopy: 'કોપી',
  payUpiCopied: 'કોપી થઈ ગયો',
  payUpiOpenApp: 'UPI એપમાં તરત ચૂકવો',
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
  unlockedContentTitle: 'ધોરણ ૧૦ બોર્ડ ક્વિઝ (સુરક્ષિત કન્ટેન્ટ)',
  unlockedContentSubtitle: 'કોઈ પણ વિષયના ફોલ્ડર ખોલી પ્રકરણ મુજબ MCQ ક્વિઝ રમો.',
  subjectsHeader: 'વિષય ફોલ્ડર્સ',
  lockedBadge: 'કોડ જરૂરી',
  unlockedBadge: 'બધા વિષયો અનલૉક',
  partialUnlockedBadge: 'અંશતઃ અનલૉક',
  chaptersAndQuestions: 'પ્રકરણ • પ્રશ્નો',
  recentAttemptsTitle: 'તાજેતરના ક્વિઝ પરિણામો',
  unlockAnotherSubject: 'બીજો કોડ નાખો',

  adminLoginTitle: 'એડમિન OTP લૉગિન',
  adminLoginSubtitle: 'સુરક્ષા માટે માત્ર અધિકૃત એડમિન નંબર +91 9099592283 જ લૉગિન કરી શકે છે.',
  adminOnlyNumberNote: 'અન્ય કોઈ પણ નંબરથી એડમિન પેનલ ખૂલી શકશે નહીં.',
  adminPhoneLabel: 'એડમિન મોબાઇલ નંબર',
  sendOtpBtn: 'OTP મોકલો',
  sendingOtpBtn: 'OTP મોકલાઈ રહ્યો છે...',
  enterOtpLabel: '૬ અંકનો OTP નાખો',
  verifyOtpBtn: 'OTP ચકાસી એડમિન પેનલ ખોલો',
  verifyingOtpBtn: 'ચકાસણી થઈ રહી છે...',
  changeNumberBtn: 'ફરી શરૂ કરો',
  resendOtpBtn: 'ફરી OTP મોકલો',
  otpSentBanner: '+91 9099592283 પર OTP મોકલવામાં આવ્યો છે.',
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
  tabSetup: 'સેટઅપ',
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
  permanentCodesNote: 'બધા જનરેટ થયેલા કોડ્સ કાયમ માટે સુરક્ષિત છે (ક્યારેય ડિલીટ થતા નથી).',
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
};

const EN: Translations = {
  appName: 'Std 10 Quiz & Payment Portal',
  appSubtitle: 'Payment Verification • Permanent Codes • Board Quiz',
  langToggleLabel: 'ગુજરાતી',
  navSubmitPayment: 'Submit Payment',
  navUseCode: 'Use Code',
  navAdmin: 'Admin',
  navAdminLive: 'Admin Live',
  loadingApp: 'Loading app...',
  authSetupWarningTitle: 'Enable Firebase Anonymous & Phone Auth',
  authSetupWarningDesc:
    'Enable Anonymous Auth (for public users) and Phone Auth (for admin 9099592283) in Firebase Console → Authentication → Sign-in method.',

  payHeaderTitle: 'Submit Payment Details & Screenshot',
  payHeaderDesc:
    'Enter your payment details, UTR ID, and screenshot. Once the admin approves, your 8-character code will appear right here live.',
  payUpiCardTitle: 'Pay via UPI',
  payUpiCopy: 'Copy',
  payUpiCopied: 'Copied',
  payUpiOpenApp: 'Pay via UPI App',
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
  codeSuccessDesc: 'You now have access to the Std 10 Quiz folders below.',
  unlockedContentTitle: 'Std 10 Board Quiz (Protected Content)',
  unlockedContentSubtitle: 'Open any subject folder to start chapter-wise MCQ practice.',
  subjectsHeader: 'Subject Folders',
  lockedBadge: 'Code Required',
  unlockedBadge: 'All Unlocked',
  partialUnlockedBadge: 'Partially Unlocked',
  chaptersAndQuestions: 'Chapters • Questions',
  recentAttemptsTitle: 'Recent Quiz Results',
  unlockAnotherSubject: 'Redeem Another Code',

  adminLoginTitle: 'Admin OTP Login',
  adminLoginSubtitle:
    'Only the authorized admin phone number +91 9099592283 can log into the Admin Panel.',
  adminOnlyNumberNote: 'All other phone numbers are strictly blocked.',
  adminPhoneLabel: 'Admin Mobile Number',
  sendOtpBtn: 'Send OTP',
  sendingOtpBtn: 'Sending OTP...',
  enterOtpLabel: 'Enter 6-Digit OTP',
  verifyOtpBtn: 'Verify OTP & Open Admin Panel',
  verifyingOtpBtn: 'Verifying...',
  changeNumberBtn: 'Reset',
  resendOtpBtn: 'Resend OTP',
  otpSentBanner: 'OTP sent to +91 9099592283.',
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
  tabSetup: 'Setup',
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
  permanentCodesNote: 'All generated codes are stored permanently in Firestore (never deleted).',
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
