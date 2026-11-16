import { auth } from '../firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) ?? [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function extractReadableErrorMessage(error: unknown, lang: 'gu' | 'en' = 'gu'): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  let inner = raw;
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as { error?: string };
      if (parsed.error) inner = parsed.error;
    } catch {
      // Not JSON
    }
  }
  const lower = inner.toLowerCase();
  if (inner.startsWith('DEVICE_ALREADY_LOGGED_IN:')) {
    const dev = inner.slice('DEVICE_ALREADY_LOGGED_IN:'.length).trim();
    const devSuffix = dev ? ` (${dev})` : '';
    return lang === 'en'
      ? `This mobile number is already logged in on another device${devSuffix}. Log out from the old device first or ask Admin to unlock it.`
      : `આ મોબાઇલ નંબર પહેલેથી બીજા ડિવાઇસ${devSuffix} પર લૉગિન છે! એક નંબરથી એક જ સમયે એક જ ડિવાઇસમાં લૉગિન થઈ શકે. પહેલાં જૂના ડિવાઇસમાંથી લૉગ આઉટ કરો અથવા એડમિન પાસેથી ડિવાઇસ અનલૉક કરાવો.`;
  }
  if (inner === 'NAME_REQUIRED_FOR_NEW_USER') {
    return lang === 'en'
      ? 'This mobile number is registering for the first time. Please enter your full name.'
      : 'આ નંબર પહેલી વાર રજિસ્ટર થઈ રહ્યો છે — કૃપા કરીને તમારું પૂરું નામ દાખલ કરો.';
  }
  if (inner === 'RESERVED_ADMIN_MOBILE') {
    return lang === 'en'
      ? 'This number is reserved for Admin login.'
      : 'આ નંબર માત્ર એડમિન લૉગિન માટે છે!';
  }
  if (
    inner === 'QUOTA_EXCEEDED' ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota limit exceeded') ||
    lower.includes('quota exceeded')
  ) {
    return lang === 'en'
      ? 'Server daily free-tier read limit has been reached. Offline cached data remains available, and live server sync resumes automatically after the daily quota resets.'
      : 'આજની સર્વર ફ્રી ડેટા મર્યાદા પૂરી થઈ છે — તમારો સેવ ડેટા ચાલુ રહેશે અને દૈનિક લિમિટ રિસેટ થતાં લાઇવ સિંક આપમેળે શરૂ થશે.';
  }
  if (lower.includes('permission') || lower.includes('insufficient permissions')) {
    return lang === 'en'
      ? 'Permission denied. Please sign in with an authorized account and try again.'
      : 'પરવાનગી મળી નથી. કૃપા કરીને માન્ય એકાઉન્ટથી લૉગિન કરી ફરી પ્રયાસ કરો.';
  }
  if (lower.includes('deadline-exceeded') || lower.includes('deadline_exceeded') || lower.includes('timed out')) {
    return lang === 'en'
      ? 'Server is taking longer than expected. Please try again in a moment.'
      : 'સર્વર જવાબ આપવામાં વધુ સમય લઈ રહ્યું છે. કૃપા કરીને થોડી ક્ષણોમાં ફરી પ્રયાસ કરો.';
  }
  if (lower.includes('offline') || lower.includes('unavailable') || lower.includes('network')) {
    return lang === 'en'
      ? 'Network unavailable. Please check your internet connection and retry.'
      : 'ઇન્ટરનેટ કનેક્શન ઉપલબ્ધ નથી. કૃપા કરીને નેટવર્ક તપાસી ફરી પ્રયાસ કરો.';
  }
  return inner || (lang === 'en' ? 'Unexpected error occurred.' : 'અણધારી ભૂલ આવી છે.');
}
