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
  if (lower.includes('permission') || lower.includes('insufficient permissions')) {
    return lang === 'en'
      ? 'Permission denied. Please check your sign-in session or Firebase rules.'
      : 'પરવાનગી મળી નથી. કૃપા કરીને લૉગિન અથવા Firebase નિયમો તપાસો.';
  }
  if (lower.includes('offline') || lower.includes('unavailable') || lower.includes('network')) {
    return lang === 'en'
      ? 'Network unavailable. Please check your internet connection and retry.'
      : 'ઇન્ટરનેટ કનેક્શન ઉપલબ્ધ નથી. કૃપા કરીને નેટવર્ક તપાસી ફરી પ્રયાસ કરો.';
  }
  return inner || (lang === 'en' ? 'Unexpected error occurred.' : 'અણધારી ભૂલ આવી છે.');
}
