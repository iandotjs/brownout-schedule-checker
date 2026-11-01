import { afterEach, describe, expect, it, vi } from 'vitest';
import { subscribeToPush, unsubscribeBrowserPush, unsubscribeFromPush, syncPushSubscription, updatePushLocation } from '../src/pushManager';

const database = vi.hoisted(() => {
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'AQID');
  return { from: vi.fn() };
});

vi.mock('../src/supabaseClient', () => ({ supabase: database }));

function setupSubscription(initiallySubscribed = true) {
  const endpoint = 'https://push.example.test/device';
  const rows = new Set(initiallySubscribed ? [endpoint] : []);
  let browserSubscribed = initiallySubscribed;
  let databaseError: string | null = null;
  let browserError: string | null = null;

  const unsubscribe = vi.fn(async () => {
    if (browserError) throw new Error(browserError);
    browserSubscribed = false;
    return true;
  });
  const subscription = { endpoint, unsubscribe };
  const removeEndpoint = vi.fn(async (column: string, value: string) => {
    if (column !== 'endpoint' || value !== endpoint) {
      throw new Error('Deletion must target this device endpoint.');
    }
    if (databaseError) return { error: { message: databaseError } };
    rows.delete(value);
    return { error: null };
  });

  database.from.mockImplementation((table: string) => {
    if (table !== 'push_subscriptions') throw new Error('Unexpected table.');
    return { delete: () => ({ eq: removeEndpoint }) };
  });
  vi.stubGlobal('navigator', {
    serviceWorker: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: async () => browserSubscribed ? subscription : null,
        },
      }),
    },
  });

  return {
    rows,
    endpoint,
    unsubscribe,
    isBrowserSubscribed: () => browserSubscribed,
    setDatabaseError: (message: string | null) => { databaseError = message; },
    setBrowserError: (message: string | null) => { browserError = message; },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('unsubscribeFromPush', () => {
  it('reports server deletion failure without losing the browser endpoint', async () => {
    const device = setupSubscription();
    device.setDatabaseError('Database unavailable');

    expect(await unsubscribeFromPush()).toEqual({ error: 'Database unavailable' });
    expect(device.isBrowserSubscribed()).toBe(true);
    expect(device.rows.has(device.endpoint)).toBe(true);
  });

  it('can retry server deletion after a temporary failure', async () => {
    const device = setupSubscription();
    device.setDatabaseError('Database unavailable');
    await unsubscribeFromPush();
    device.setDatabaseError(null);

    expect(await unsubscribeFromPush()).toEqual({ error: null });
    expect(device.rows.size).toBe(0);
    expect(device.isBrowserSubscribed()).toBe(false);
  });

  it('removes only this device from the server and browser', async () => {
    const device = setupSubscription();
    device.rows.add('https://push.example.test/other-device');

    expect(await unsubscribeFromPush()).toEqual({ error: null });
    expect([...device.rows]).toEqual(['https://push.example.test/other-device']);
    expect(device.isBrowserSubscribed()).toBe(false);
  });

  it('removes the server record even when browser unsubscription fails', async () => {
    const device = setupSubscription();
    device.setBrowserError('Browser unavailable');

    expect(await unsubscribeFromPush()).toEqual({ error: 'Browser unavailable' });
    expect(device.rows.size).toBe(0);
    expect(device.isBrowserSubscribed()).toBe(true);
  });

  it('can retry browser unsubscription after the server record is already removed', async () => {
    const device = setupSubscription();
    device.setBrowserError('Browser unavailable');
    await unsubscribeFromPush();
    device.setBrowserError(null);

    expect(await unsubscribeFromPush()).toEqual({ error: null });
    expect(device.rows.size).toBe(0);
    expect(device.isBrowserSubscribed()).toBe(false);
  });

  it('succeeds without database changes when this browser has no subscription', async () => {
    setupSubscription(false);

    expect(await unsubscribeFromPush()).toEqual({ error: null });
    expect(database.from).not.toHaveBeenCalled();
  });
});

describe('post-deletion browser cleanup', () => {
  it('unsubscribes only the browser without accessing Supabase or serviceWorker.ready', async () => {
    let subscribed = true;
    vi.stubGlobal('navigator', { serviceWorker: {
      get ready() { throw new Error('Must not wait for ready'); },
      getRegistration: async () => ({ pushManager: { getSubscription: async () => ({
        unsubscribe: async () => { subscribed = false; return true; },
      }) } }),
    } });
    expect(await unsubscribeBrowserPush()).toEqual({ error: null });
    expect(subscribed).toBe(false);
    expect(database.from).not.toHaveBeenCalled();
  });

  it('succeeds on unsupported browsers', async () => {
    vi.stubGlobal('navigator', {});
    expect(await unsubscribeBrowserPush()).toEqual({ error: null });
    expect(database.from).not.toHaveBeenCalled();
  });

  it('bounds time waiting for an existing registration', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: () => new Promise(() => {}) } });
    const outcome = unsubscribeBrowserPush();
    await vi.advanceTimersByTimeAsync(6000);
    expect((await outcome).error).toMatch(/browser|timed out/i);
    expect(database.from).not.toHaveBeenCalled();
  });

  it('reports an unsuccessful browser unsubscribe', async () => {
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => ({ pushManager: {
      getSubscription: async () => ({ unsubscribe: async () => false }),
    } }) } });
    expect((await unsubscribeBrowserPush()).error).toMatch(/browser|push/i);
  });

  it('stops stale sync and location callbacks before any database write', async () => {
    let allowed = true;
    vi.stubGlobal('window', { PushManager: {}, Notification: {}, atob });
    const registration = { pushManager: { getSubscription: async () => {
      allowed = false;
      return { endpoint: 'endpoint', options: { applicationServerKey: new Uint8Array([1, 2, 3]).buffer },
        toJSON: () => ({ endpoint: 'endpoint', keys: { auth: 'auth', p256dh: 'public' } }),
      };
    } } };
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve(registration) } });
    const canContinue = () => allowed;
    await syncPushSubscription('original', 'City', 'Barangay', canContinue);
    allowed = true;
    await updatePushLocation('City', 'Barangay', canContinue);
    expect(database.from).not.toHaveBeenCalled();
  });

  it('discards a newly created browser subscription when deletion started during subscribe', async () => {
    let allowed = true;
    let subscribed = false;
    vi.stubGlobal('window', { PushManager: {}, Notification: {}, atob });
    vi.stubGlobal('Notification', { requestPermission: async () => 'granted' });
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({ pushManager: {
      getSubscription: async () => null,
      subscribe: async () => {
        subscribed = true;
        allowed = false;
        return { unsubscribe: async () => { subscribed = false; return true; } };
      },
    } }) } });
    expect((await subscribeToPush('original', 'City', 'Barangay', () => allowed)).error).toMatch(/cancelled/i);
    expect(subscribed).toBe(false);
    expect(database.from).not.toHaveBeenCalled();
  });

  it('does not unsubscribe a later registration after browser cleanup timed out', async () => {
    vi.useFakeTimers();
    let finishRegistration!: (value: unknown) => void;
    let subscribed = true;
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: () => new Promise((resolve) => {
      finishRegistration = resolve;
    }) } });
    const outcome = unsubscribeBrowserPush();
    await vi.advanceTimersByTimeAsync(6000);
    expect((await outcome).error).toMatch(/timed out/i);
    finishRegistration({ pushManager: { getSubscription: async () => ({
      unsubscribe: async () => { subscribed = false; return true; },
    }) } });
    await vi.advanceTimersByTimeAsync(1);
    expect(subscribed).toBe(true);
    expect(database.from).not.toHaveBeenCalled();
  });
});