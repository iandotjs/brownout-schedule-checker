import { supabase } from './supabaseClient';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
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
): Promise<{ error: string | null }> {
  if (!isPushSupported()) {
    return { error: 'Push notifications are not supported in this browser.' };
  }
  if (!VAPID_PUBLIC_KEY) {
    return { error: 'Push notifications are not configured.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { error: 'Notification permission was denied.' };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (existing && !usesCurrentKey(existing)) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', existing.endpoint);
      await existing.unsubscribe();
    }
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

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

export async function unsubscribeFromPush(): Promise<{ error: string | null }> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
    }
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to unsubscribe.' };
  }
}

export async function updatePushLocation(
  cityName: string,
  barangayName: string,
): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await supabase
        .from('push_subscriptions')
        .update({ city_name: cityName, barangay_name: barangayName })
        .eq('endpoint', subscription.endpoint);
    }
  } catch {
    // Non-critical — don't break the UX
  }
}
