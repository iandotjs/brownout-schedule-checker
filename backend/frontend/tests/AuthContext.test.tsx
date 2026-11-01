// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../src/AuthContext';

const boundary = vi.hoisted(() => ({
  getSession: vi.fn(), getClaims: vi.fn(), onAuthStateChange: vi.fn(),
  signOut: vi.fn(), stopAutoRefresh: vi.fn(), from: vi.fn(),
}));
vi.mock('../src/supabaseClient', () => ({
  supabase: { auth: boundary, from: boundary.from }, SUPABASE_STORAGE_KEY: 'sb-provider-test',
}));

function makeSession(id: string): Session {
  return {
    access_token: `${id}-token`, refresh_token: `${id}-refresh`, expires_in: 3600,
    token_type: 'bearer', user: {
      id, email: `${id}@example.test`, app_metadata: {}, user_metadata: {},
      aud: 'authenticated', created_at: '2026-11-01T10:00:00Z',
    },
  };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((finish) => { resolve = finish; });
  return { promise, resolve };
}

const original = makeSession('original-user');
const switched = makeSession('switched-user');
let sdkSession: Session | null;
let authListener: (event: AuthChangeEvent, session: Session | null) => void;
let current: ReturnType<typeof useAuth>;
let deletionResponse: ReturnType<typeof deferred<Response>>;
let deletionStarted: ReturnType<typeof deferred<void>>;

function Consumer() {
  current = useAuth();
  return <output>{current.user?.id ?? 'signed-out'}</output>;
}

beforeEach(() => {
  sdkSession = original;
  deletionResponse = deferred<Response>();
  deletionStarted = deferred<void>();
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem('account-deletion-intent-v1', JSON.stringify({
    userId: original.user.id, startedAt: Date.now() - 2000,
  }));
  boundary.getSession.mockImplementation(async () => ({ data: { session: sdkSession }, error: null }));
  boundary.getClaims.mockImplementation(async () => ({ data: { claims: {
    sub: original.user.id, amr: [{ method: 'otp', timestamp: Math.floor(Date.now() / 1000) }],
  } }, error: null }));
  boundary.onAuthStateChange.mockImplementation((listener: typeof authListener) => {
    authListener = listener;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  boundary.from.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({
    data: { default_city: null, default_barangay: null, notifications_enabled: false }, error: null,
  }) }) }) });
  boundary.signOut.mockImplementation(async () => {
    sdkSession = null;
    authListener('SIGNED_OUT', null);
    return { error: null };
  });
  vi.stubGlobal('fetch', vi.fn((_url: string, options?: RequestInit) => {
    if (options?.method === 'DELETE') {
      deletionStarted.resolve();
      return deletionResponse.promise;
    }
    return Promise.resolve(new Response(null, { status: 403 }));
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

async function startDeletion() {
  render(<AuthProvider><Consumer /></AuthProvider>);
  await waitFor(() => expect(current.loading).toBe(false));
  expect(current.session).toEqual(original);
  const oldOperation = current.captureAccountOperation();
  expect(oldOperation()).toBe(true);
  let result!: ReturnType<typeof current.deleteAccount>;
  await act(async () => {
    result = current.deleteAccount('DELETE');
    await deletionStarted.promise;
  });
  expect(current.isDeletingAccount).toBe(true);
  expect(oldOperation()).toBe(false);
  return { result, oldOperation, pendingOperation: current.captureAccountOperation() };
}

describe('AuthProvider deletion session reconciliation', () => {
  it.each([
    { event: 'SIGNED_OUT' as const, nextSession: null },
    { event: 'SIGNED_IN' as const, nextSession: switched },
  ])('reconciles $event before reopening operations after rejected deletion', async ({ event, nextSession }) => {
    const pending = await startDeletion();
    act(() => {
      sdkSession = nextSession;
      authListener(event, sdkSession);
    });
    let result: Awaited<typeof pending.result> | undefined;
    await act(async () => {
      deletionResponse.resolve(new Response(null, { status: 503 }));
      result = await pending.result;
    });
    expect(result?.error).toMatch(/unavailable/i);
    expect(current.user).toEqual(sdkSession?.user ?? null);
    expect(current.session).toEqual(sdkSession);
    expect(current.isDeletingAccount).toBe(false);
    expect(pending.oldOperation()).toBe(false);
    expect(pending.pendingOperation()).toBe(false);
    expect(current.captureAccountOperation()()).toBe(nextSession !== null);
  });

  it('reads the actual SDK session even when no auth event was delivered', async () => {
    const pending = await startDeletion();
    sdkSession = switched;
    await act(async () => {
      deletionResponse.resolve(new Response(null, { status: 503 }));
      await pending.result;
    });
    expect(current.user).toEqual(switched.user);
    expect(current.session).toEqual(switched);
    expect(pending.oldOperation()).toBe(false);
    expect(current.captureAccountOperation()()).toBe(true);
  });

  it.each([
    { event: 'SIGNED_OUT' as const, nextSession: null },
    { event: 'SIGNED_IN' as const, nextSession: switched },
  ])('prefers a newer $event event over an in-flight SDK snapshot', async ({ event, nextSession }) => {
    const pending = await startDeletion();
    const reconciliation = deferred<{ data: { session: Session | null }; error: null }>();
    const reconciliationStarted = deferred<void>();
    boundary.getSession.mockImplementationOnce(() => {
      reconciliationStarted.resolve();
      return reconciliation.promise;
    });
    await act(async () => {
      deletionResponse.resolve(new Response(null, { status: 503 }));
      await reconciliationStarted.promise;
    });
    expect(current.isDeletingAccount).toBe(true);
    expect(current.captureAccountOperation()()).toBe(false);
    await act(async () => {
      sdkSession = nextSession;
      authListener(event, sdkSession);
      reconciliation.resolve({ data: { session: original }, error: null });
      await pending.result;
    });
    expect(current.user).toEqual(nextSession?.user ?? null);
    expect(current.session).toEqual(nextSession);
    expect(pending.oldOperation()).toBe(false);
    expect(pending.pendingOperation()).toBe(false);
    expect(current.captureAccountOperation()()).toBe(nextSession !== null);
  });

  it.each(['reject', 'error'] as const)('uses the latest pending event when the SDK read returns %s', async (failure) => {
    const pending = await startDeletion();
    act(() => {
      sdkSession = switched;
      authListener('SIGNED_IN', switched);
    });
    if (failure === 'reject') boundary.getSession.mockRejectedValueOnce(new Error('SDK unavailable'));
    else boundary.getSession.mockResolvedValueOnce({ data: { session: original }, error: new Error('SDK unavailable') });
    await act(async () => {
      deletionResponse.resolve(new Response(null, { status: 503 }));
      await pending.result;
    });
    expect(current.user).toEqual(switched.user);
    expect(current.session).toEqual(switched);
    expect(pending.oldOperation()).toBe(false);
    expect(current.captureAccountOperation()()).toBe(true);
  });

  it('fails closed when no session or event can be recovered', async () => {
    const pending = await startDeletion();
    boundary.getSession.mockRejectedValueOnce(new Error('SDK unavailable'));
    await act(async () => {
      deletionResponse.resolve(new Response(null, { status: 503 }));
      await pending.result;
    });
    expect(current.user).toBeNull();
    expect(current.session).toBeNull();
    expect(current.captureAccountOperation()()).toBe(false);
  });

  it('restores the unchanged SDK identity but never revalidates old callbacks', async () => {
    const pending = await startDeletion();
    await act(async () => {
      deletionResponse.resolve(new Response(null, { status: 503 }));
      await pending.result;
    });
    expect(current.user).toEqual(original.user);
    expect(current.session).toEqual(original);
    expect(pending.oldOperation()).toBe(false);
    expect(pending.pendingOperation()).toBe(false);
    expect(current.captureAccountOperation()()).toBe(true);
  });

  it('never revives the deleted identity after 204 even when local sign-out fails', async () => {
    boundary.signOut.mockResolvedValue({ error: { message: 'Local sign-out failed' } });
    const pending = await startDeletion();
    act(() => { authListener('TOKEN_REFRESHED', original); });
    await act(async () => {
      deletionResponse.resolve(new Response(null, { status: 204 }));
      expect(await pending.result).toEqual({ error: null });
    });
    act(() => { authListener('TOKEN_REFRESHED', original); });
    expect(current.user).toBeNull();
    expect(current.session).toBeNull();
    expect(current.isDeletingAccount).toBe(false);
    expect(current.captureAccountOperation()()).toBe(false);
    expect(pending.oldOperation()).toBe(false);
    expect(pending.pendingOperation()).toBe(false);
  });
});