import { supabase } from './supabaseClient';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// A subscription made with a previous VAPID key can't receive pushes signed with the current one
function usesCurrentKey(subscription: PushSubscription): boolean {
  const key = subscription.options?.applicationServerKey;
  if (!key || !VAPID_PUBLIC_KEY) return false;
  const current = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  const existing = new Uint8Array(key);
  return existing.length === current.length && existing.every((b, i) => b === current[i]);
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription && usesCurrentKey(subscription);
  } catch {
    return false;
  }
}

export async function subscribeToPush(
  userId: string,
  cityName: string,
  barangayName: string,
  canContinue: () => boolean = () => true,
): Promise<{ error: string | null }> {
  if (!canContinue()) return { error: 'Account operation cancelled.' };
  if (!isPushSupported()) {
    return { error: 'Push notifications are not supported in this browser.' };
  }
  if (!VAPID_PUBLIC_KEY) {
    return { error: 'Push notifications are not configured.' };
  }

  const permission = await Notification.requestPermission();
  if (!canContinue()) return { error: 'Account operation cancelled.' };
  if (permission !== 'granted') {
    return { error: 'Notification permission was denied.' };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    if (!canContinue()) return { error: 'Account operation cancelled.' };
    const existing = await registration.pushManager.getSubscription();
    if (!canContinue()) return { error: 'Account operation cancelled.' };
    if (existing && !usesCurrentKey(existing)) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', existing.endpoint);
      if (!canContinue()) return { error: 'Account operation cancelled.' };
      await existing.unsubscribe();
    }
    if (!canContinue()) return { error: 'Account operation cancelled.' };
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    if (!canContinue()) {
      await subscription.unsubscribe();
      return { error: 'Account operation cancelled.' };
    }
    const json = subscription.toJSON();
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        city_name: cityName,
        barangay_name: barangayName,
      },
      { onConflict: 'endpoint' },
    );

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to subscribe.' };
  }
}

// Re-save this device's subscription for the signed-in user (e.g. if the server row was lost)
export async function syncPushSubscription(
  userId: string,
  cityName: string,
  barangayName: string,
  canContinue: () => boolean = () => true,
): Promise<boolean> {
  if (!canContinue() || !isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    if (!canContinue()) return false;
    const subscription = await registration.pushManager.getSubscription();
    if (!canContinue()) return false;
    if (!subscription || !usesCurrentKey(subscription)) return false;
    const json = subscription.toJSON();
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        city_name: cityName,
        barangay_name: barangayName,
      },
      { onConflict: 'endpoint' },
    );
    return !error;
  } catch {
    return false;
  }
}

export async function unsubscribeFromPush(canContinue: () => boolean = () => true): Promise<{ error: string | null }> {
  try {
    if (!canContinue()) return { error: 'Account operation cancelled.' };
    const registration = await navigator.serviceWorker.ready;
    if (!canContinue()) return { error: 'Account operation cancelled.' };
    const subscription = await registration.pushManager.getSubscription();
    if (!canContinue()) return { error: 'Account operation cancelled.' };
    if (subscription) {
      const endpoint = subscription.endpoint;
      const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
      if (error) return { error: error.message };
      if (!canContinue()) return { error: 'Account operation cancelled.' };
      await subscription.unsubscribe();
    }
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to unsubscribe.' };
  }
}

export async function updatePushLocation(
  cityName: string,
  barangayName: string,
  canContinue: () => boolean = () => true,
): Promise<void> {
  if (!canContinue() || !isPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    if (!canContinue()) return;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription && canContinue()) {
      await supabase
        .from('push_subscriptions')
        .update({ city_name: cityName, barangay_name: barangayName })
        .eq('endpoint', subscription.endpoint);
    }
  } catch {
    // Non-critical — don't break the UX
  }
}

export async function unsubscribeBrowserPush(): Promise<{ error: string | null }> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return { error: null };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finished = false;
  try {
    await Promise.race([
      (async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        if (finished) return;
        const subscription = await registration?.pushManager?.getSubscription();
        if (finished) return;
        if (subscription && !await subscription.unsubscribe()) {
          throw new Error('Browser push cleanup could not complete. Disable this site\'s notifications in browser settings.');
        }
      })(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Browser push cleanup timed out. Disable this site\'s notifications in browser settings.')), 5000);
      }),
    ]);
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? `Browser push cleanup: ${error.message}` : 'Browser push cleanup could not complete.' };
  } finally {
    finished = true;
    clearTimeout(timer);
  }
}
