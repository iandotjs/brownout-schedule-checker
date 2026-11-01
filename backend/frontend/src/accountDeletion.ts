import { supabase, SUPABASE_STORAGE_KEY } from './supabaseClient';
import { unsubscribeBrowserPush } from './pushManager';

const INTENT_KEY = 'account-deletion-intent-v1';
const INTENT_LIFETIME = 10 * 60 * 1000;
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
let deletionPending = false;

export interface DeletionIntent {
  userId: string;
  startedAt: number;
}

export function createAccountOperationGate() {
  let userId: string | null = null;
  let version = 0;
  let suspended = false;
  return {
    setUser(nextId: string | null) {
      if (userId !== nextId) version++;
      userId = nextId;
    },
    suspend() { suspended = true; version++; },
    resume() { suspended = false; version++; },
    capture() {
      const capturedVersion = version;
      return () => userId !== null && !suspended && capturedVersion === version;
    },
  };
}

export async function withDeletionTimeout<Result>(
  operation: (signal: AbortSignal) => Promise<Result>,
  message: string,
  milliseconds = 10_000,
): Promise<Result> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(message));
        }, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function clearDeletionIntent(): void {
  sessionStorage.removeItem(INTENT_KEY);
}

export function readDeletionIntent(): DeletionIntent | null {
  try {
    const raw = sessionStorage.getItem(INTENT_KEY);
    if (!raw) return null;
    const value: unknown = raw.length <= 256 ? JSON.parse(raw) : null;
    if (value && typeof value === 'object' && 'userId' in value && 'startedAt' in value &&
        typeof value.userId === 'string' && value.userId.length > 0 && value.userId.length <= 128 &&
        typeof value.startedAt === 'number' && Number.isFinite(value.startedAt) &&
        value.startedAt <= Date.now() && Date.now() - value.startedAt <= INTENT_LIFETIME) {
      return { userId: value.userId, startedAt: value.startedAt };
    }
    clearDeletionIntent();
  } catch {
    return null;
  }
  return null;
}

function requireIntent(userId: string): DeletionIntent {
  const intent = readDeletionIntent();
  if (!intent) throw new Error('Deletion request expired or missing. Cancel and start again.');
  if (intent.userId !== userId) {
    throw new Error('A different account is signed in. Sign in to the original account before continuing.');
  }
  return intent;
}

export async function beginDeletionReauthentication(
  user: { id: string; email?: string }, method: 'google' | 'email',
): Promise<void> {
  const previous = readDeletionIntent();
  if (previous && previous.userId !== user.id) requireIntent(user.id);
  if (method === 'email' && !user.email) throw new Error('This account has no email address. Use Google to sign in again.');
  if (!user.id || user.id.length > 128) throw new Error('Invalid account identity.');
  sessionStorage.setItem(INTENT_KEY, JSON.stringify({ userId: user.id, startedAt: Date.now() }));
  const redirectTo = `${window.location.origin}/?account=delete`;
  const result = await withDeletionTimeout(async () => method === 'google'
    ? supabase.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo, queryParams: { prompt: 'select_account' } },
    })
    : supabase.auth.signInWithOtp({
      email: user.email!, options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
    }), 'Sign-in request timed out. Check your email before requesting another link.');
  if (result.error) throw new Error(result.error.message);
}

export function consumeDeletionRedirect(url: URL): boolean {
  if (url.searchParams.get('account') !== 'delete') return false;
  url.searchParams.delete('account');
  return true;
}

export async function verifyDeletionReadiness(userId: string) {
  const intent = requireIntent(userId);
  return withDeletionTimeout(async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) throw new Error('Your session is unavailable. Sign in again to continue.');
    requireIntent(session.user.id);
    const { data, error: claimsError } = await supabase.auth.getClaims(session.access_token);
    if (claimsError || data?.claims.sub !== intent.userId) {
      throw new Error('Could not verify the original account. Sign in again to continue.');
    }
    const amr: unknown = data.claims.amr;
    const fresh = Array.isArray(amr) && amr.some((entry: unknown) => {
      if (!entry || typeof entry !== 'object' || !('method' in entry) || !('timestamp' in entry)) return false;
      return (entry.method === 'oauth' || entry.method === 'otp') &&
        typeof entry.timestamp === 'number' && Number.isFinite(entry.timestamp) &&
        entry.timestamp > Math.floor(intent.startedAt / 1000) &&
        entry.timestamp <= Date.now() / 1000 && Date.now() / 1000 - entry.timestamp <= 300;
    });
    if (!fresh) throw new Error('Please sign in again with Google or your email link before deleting.');
    const currentIntent = requireIntent(userId);
    const { data: current, error: currentError } = await supabase.auth.getSession();
    if (currentError || current.session?.user.id !== intent.userId) {
      throw new Error('A different account is signed in. Return to the original account.');
    }
    if (currentIntent.startedAt !== intent.startedAt || current.session.access_token !== session.access_token) {
      throw new Error('Your session changed. Verify your sign-in again before deleting.');
    }
    return session;
  }, 'Sign-in verification timed out. No deletion request was sent.');
}

export async function permanentlyDeleteAccount(
  userId: string, confirmation: string, onDeleted: () => void,
): Promise<{ warning: string | null }> {
  if (confirmation !== 'DELETE') throw new Error('Type DELETE to confirm permanent deletion.');
  if (deletionPending) throw new Error('An account deletion is already pending.');
  deletionPending = true;
  try {
    const session = await verifyDeletionReadiness(userId);
    await withDeletionTimeout(async (signal) => {
      let response: Response;
      try {
        response = await fetch(`${API_BASE_URL}/api/account`, {
          method: 'DELETE', signal,
          headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmation: 'DELETE' }),
        });
      } catch {
        throw new Error('Could not verify account deletion. The outcome is uncertain; check your account before trying again.');
      }
      if (response.status === 204) return;
      const messages: Record<number, string> = {
        401: 'Your session was not authorized. Sign in again; deletion was not verified.',
        403: 'Please sign in again with Google or your email link before deleting.',
        503: 'Account deletion is currently unavailable. Your account has not been deleted.',
        502: 'Could not verify account deletion. The outcome is uncertain; check your account before trying again.',
      };
      throw new Error(messages[response.status] ?? 'Could not verify account deletion. Check your account before trying again.');
    }, 'Could not verify account deletion before the request timed out. The outcome is uncertain; check your account before trying again.');

    onDeleted();
    const warnings: string[] = [];
    const browser = await unsubscribeBrowserPush();
    if (browser.error) warnings.push(browser.error);
    try {
      const result = await withDeletionTimeout(() => supabase.auth.signOut({ scope: 'local' }),
        'Local sign-out timed out.', 5000);
      if (result.error) warnings.push('Sign-out could not complete normally.');
    } catch {
      warnings.push('Sign-out could not complete normally.');
    } finally {
      for (const storageName of ['localStorage', 'sessionStorage'] as const) {
        for (const key of [SUPABASE_STORAGE_KEY, `${SUPABASE_STORAGE_KEY}-code-verifier`, `${SUPABASE_STORAGE_KEY}-user`]) {
          try { globalThis[storageName].removeItem(key); } catch { warnings.push('Browser storage could not be cleared. Close this tab.'); }
        }
      }
      try {
        localStorage.removeItem('lastLocation');
      } catch {
        warnings.push('Some account preferences could not be cleared in this browser.');
      }
      try { clearDeletionIntent(); } catch { warnings.push('The browser deletion intent could not be cleared. Close this tab.'); }
    }
    return { warning: warnings.length ? warnings.join(' ') : null };
  } finally {
    deletionPending = false;
  }
}