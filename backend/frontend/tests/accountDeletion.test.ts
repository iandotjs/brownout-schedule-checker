import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginDeletionReauthentication,
  consumeDeletionRedirect,
  createAccountOperationGate,
  permanentlyDeleteAccount,
  readDeletionIntent,
  verifyDeletionReadiness,
} from '../src/accountDeletion';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(), getClaims: vi.fn(), signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(), signOut: vi.fn(),
}));
vi.mock('../src/supabaseClient', () => ({
  supabase: { auth }, SUPABASE_STORAGE_KEY: 'sb-test-auth-token',
}));

function storage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); },
    clear: vi.fn(() => entries.clear()),
  };
}

let local: ReturnType<typeof storage>;
let temporary: ReturnType<typeof storage>;
let browserSubscribed: boolean;
let sessionUserId: string;
let amr: { method: string; timestamp: number }[];
const originalUser = { id: 'original-user', email: 'owner@example.test' };
const request = vi.fn();
const onDeleted = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-01T10:00:00Z'));
  local = storage();
  temporary = storage();
  browserSubscribed = true;
  sessionUserId = originalUser.id;
  amr = [];
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', temporary);
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
  vi.stubGlobal('navigator', { serviceWorker: {
    getRegistration: async () => ({ pushManager: {
      getSubscription: async () => browserSubscribed ? {
        unsubscribe: async () => { browserSubscribed = false; return true; },
      } : null,
    } }),
  } });
  vi.stubGlobal('fetch', request);
  auth.signInWithOAuth.mockResolvedValue({ error: null });
  auth.signInWithOtp.mockResolvedValue({ error: null });
  auth.signOut.mockResolvedValue({ error: null });
  auth.getSession.mockImplementation(async () => ({ data: { session: {
    access_token: 'verified-token', user: { id: sessionUserId },
  } }, error: null }));
  auth.getClaims.mockImplementation(async () => ({ data: { claims: {
    sub: sessionUserId, iat: Math.floor(Date.now() / 1000), amr,
  } }, error: null }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

async function reauthenticate() {
  await beginDeletionReauthentication(originalUser, 'email');
  vi.advanceTimersByTime(2000);
  amr = [{ method: 'otp', timestamp: Math.floor(Date.now() / 1000) }];
}

describe('account deletion intent and reauthentication', () => {
  it('pins only the original identity and time, and sends email without creating users', async () => {
    await beginDeletionReauthentication(originalUser, 'email');
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: originalUser.email,
      options: { shouldCreateUser: false, emailRedirectTo: 'https://app.example.test/?account=delete' },
    });
    expect(readDeletionIntent()).toEqual({ userId: originalUser.id, startedAt: Date.now() });
    expect(JSON.stringify([...Object.values(readDeletionIntent()!)])).not.toContain(originalUser.email);
    expect(local.clear).not.toHaveBeenCalled();
  });

  it('uses the home redirect and account selection for Google', async () => {
    await beginDeletionReauthentication(originalUser, 'google');
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: {
      redirectTo: 'https://app.example.test/?account=delete', queryParams: { prompt: 'select_account' },
    } });
  });

  it('consumes a redirect only as a request to open confirmation, never as deletion', async () => {
    await reauthenticate();
    const url = new URL('https://app.example.test/?account=delete&keep=yes#anchor');
    expect(consumeDeletionRedirect(url)).toBe(true);
    expect(url.searchParams.get('account')).toBeNull();
    expect(url.searchParams.get('keep')).toBe('yes');
    expect(url.hash).toBe('#anchor');
    expect(request).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('rejects a switched account without overwriting the original intent', async () => {
    await reauthenticate();
    sessionUserId = 'different-google-user';
    await expect(verifyDeletionReadiness(sessionUserId)).rejects.toThrow(/different account/i);
    await expect(beginDeletionReauthentication({ id: sessionUserId }, 'google')).rejects.toThrow(/different account/i);
    await expect(permanentlyDeleteAccount(originalUser.id, 'DELETE', onDeleted)).rejects.toThrow(/different account/i);
    expect(readDeletionIntent()?.userId).toBe(originalUser.id);
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects expired intent and cannot refresh it implicitly', async () => {
    await reauthenticate();
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    await expect(verifyDeletionReadiness(originalUser.id)).rejects.toThrow(/expired|start again/i);
    expect(readDeletionIntent()).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it('does not count a refreshed token or pre-intent AMR as reauthentication', async () => {
    await reauthenticate();
    amr = [{ method: 'oauth', timestamp: Math.floor(Date.now() / 1000) - 60 }];
    await expect(verifyDeletionReadiness(originalUser.id)).rejects.toThrow(/sign in again/i);
    amr = [{ method: 'token_refresh', timestamp: Math.floor(Date.now() / 1000) }];
    await expect(verifyDeletionReadiness(originalUser.id)).rejects.toThrow(/sign in again/i);
    amr = [{ method: 'oauth', timestamp: Math.floor(Date.now() / 1000) }];
    await expect(verifyDeletionReadiness(originalUser.id)).resolves.toBeDefined();
    vi.advanceTimersByTime(301_000);
    await expect(verifyDeletionReadiness(originalUser.id)).rejects.toThrow(/sign in again/i);
  });
});

describe('explicit permanent deletion', () => {
  it.each([401, 403, 502, 503, 200])('does not clean up or log out after HTTP %s', async (status) => {
    await reauthenticate();
    request.mockResolvedValue(new Response(JSON.stringify({ error: 'Deletion not verified' }), { status }));
    await expect(permanentlyDeleteAccount(originalUser.id, 'DELETE', onDeleted)).rejects.toThrow();
    expect(browserSubscribed).toBe(true);
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('requires the exact explicit confirmation', async () => {
    await reauthenticate();
    await expect(permanentlyDeleteAccount(originalUser.id, '', onDeleted)).rejects.toThrow(/DELETE/);
    expect(request).not.toHaveBeenCalled();
  });

  it('reports timeout as uncertain, aborts the request, and never retries or cleans up', async () => {
    await reauthenticate();
    request.mockImplementation(() => new Promise(() => {}));
    const outcome = permanentlyDeleteAccount(originalUser.id, 'DELETE', onDeleted).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await outcome).toBeInstanceOf(Error);
    expect((await outcome as Error).message).toMatch(/could not verify|uncertain/i);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1].signal.aborted).toBe(true);
    expect(browserSubscribed).toBe(true);
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('cleans the browser and known credentials only after verified 204, even if signout fails', async () => {
    await reauthenticate();
    local.setItem('sb-test-auth-token', 'credential');
    local.setItem('sb-test-auth-token-code-verifier', 'verifier');
    local.setItem('theme', 'light');
    local.setItem('public-schedules', 'retained');
    local.setItem('lastLocation', 'private location');
    request.mockResolvedValue(new Response(null, { status: 204 }));
    auth.signOut.mockRejectedValue(new Error('Auth unavailable'));
    const result = await permanentlyDeleteAccount(originalUser.id, 'DELETE', onDeleted);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toMatch(/\/api\/account$/);
    expect(request.mock.calls[0][1]).toMatchObject({ method: 'DELETE',
      headers: { Authorization: 'Bearer verified-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: 'DELETE' }),
    });
    expect(browserSubscribed).toBe(false);
    expect(onDeleted).toHaveBeenCalledOnce();
    expect(local.getItem('sb-test-auth-token')).toBeNull();
    expect(local.getItem('sb-test-auth-token-code-verifier')).toBeNull();
    expect(local.getItem('lastLocation')).toBeNull();
    expect(local.getItem('theme')).toBe('light');
    expect(local.getItem('public-schedules')).toBe('retained');
    expect(local.clear).not.toHaveBeenCalled();
    expect(temporary.clear).not.toHaveBeenCalled();
    expect(readDeletionIntent()).toBeNull();
    expect(result.warning).toMatch(/sign.?out/i);
  });

  it('reports browser cleanup failure as a warning while still removing local credentials', async () => {
    await reauthenticate();
    local.setItem('sb-test-auth-token', 'credential');
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => { throw new Error('Unavailable'); } } });
    request.mockResolvedValue(new Response(null, { status: 204 }));
    const result = await permanentlyDeleteAccount(originalUser.id, 'DELETE', onDeleted);
    expect(result.warning).toMatch(/browser|push/i);
    expect(onDeleted).toHaveBeenCalledOnce();
    expect(local.getItem('sb-test-auth-token')).toBeNull();
  });

  it('keeps verified deletion successful when browser storage becomes inaccessible during cleanup', async () => {
    await reauthenticate();
    request.mockImplementation(async () => {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('Storage blocked'); } });
      return new Response(null, { status: 204 });
    });
    const result = await permanentlyDeleteAccount(originalUser.id, 'DELETE', onDeleted);
    expect(onDeleted).toHaveBeenCalledOnce();
    expect(result.warning).toMatch(/storage|browser/i);
    expect(readDeletionIntent()).toBeNull();
  });

  it('does not send DELETE when verified claims belong to a different user', async () => {
    await reauthenticate();
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: 'other-user', amr } }, error: null });
    await expect(permanentlyDeleteAccount(originalUser.id, 'DELETE', onDeleted)).rejects.toThrow(/original account/i);
    expect(request).not.toHaveBeenCalled();
    expect(browserSubscribed).toBe(true);
  });

  it('rechecks identity after asynchronous claim verification', async () => {
    await reauthenticate();
    auth.getClaims.mockImplementation(async () => {
      sessionUserId = 'different-google-user';
      return { data: { claims: { sub: originalUser.id, amr } }, error: null };
    });
    await expect(permanentlyDeleteAccount(originalUser.id, 'DELETE', onDeleted)).rejects.toThrow(/different account/i);
    expect(request).not.toHaveBeenCalled();
  });
});

describe('account operation lifecycle', () => {
  it('invalidates earlier callbacks on deletion and never revives them after failure', () => {
    const gate = createAccountOperationGate();
    gate.setUser(originalUser.id);
    const earlier = gate.capture();
    expect(earlier()).toBe(true);
    gate.suspend();
    expect(earlier()).toBe(false);
    expect(gate.capture()()).toBe(false);
    gate.resume();
    expect(earlier()).toBe(false);
    expect(gate.capture()()).toBe(true);
  });

  it('rejects callbacks belonging to a signed-out or switched identity', () => {
    const gate = createAccountOperationGate();
    expect(gate.capture()()).toBe(false);
    gate.setUser(originalUser.id);
    const original = gate.capture();
    gate.setUser('different-google-user');
    expect(original()).toBe(false);
    const switched = gate.capture();
    gate.setUser(null);
    expect(switched()).toBe(false);
  });
});