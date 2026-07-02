import { useEffect } from 'react';
import api from '../services/api';

const PUSH_PROMPT_FLAG = 'push_permission_prompted_v1';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function getVapidPublicKey() {
  // Use env var if available (avoids extra request)
  if (process.env.REACT_APP_VAPID_PUBLIC_KEY) {
    return process.env.REACT_APP_VAPID_PUBLIC_KEY;
  }
  const res = await api.get('/push/vapid-key');
  return res.data.publicKey;
}

async function upsertPushSubscription(isAuthenticated) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { subscribed: false, reason: 'unsupported' };
  }

  if (Notification.permission !== 'granted') {
    return { subscribed: false, reason: 'permission_not_granted' };
  }

  if (!isAuthenticated) {
    return { subscribed: false, reason: 'login_required' };
  }

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await api.post('/push/subscribe', existing.toJSON());
    return { subscribed: true, reason: 'already_subscribed' };
  }

  const vapidKey = await getVapidPublicKey();
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });

  await api.post('/push/subscribe', subscription.toJSON());
  return { subscribed: true, reason: 'subscribed' };
}

export function usePushNotifications(isAuthenticated) {
  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return;
    }

    if (Notification.permission === 'granted') {
      upsertPushSubscription(isAuthenticated).catch((err) => {
        console.warn('Push subscription sync error:', err.message);
      });
      return;
    }

    if (Notification.permission === 'denied') {
      return;
    }

    if (!sessionStorage.getItem(PUSH_PROMPT_FLAG)) {
      let requested = false;
      const requestFromGesture = () => {
        if (requested) return;
        requested = true;
        sessionStorage.setItem(PUSH_PROMPT_FLAG, '1');

        window.removeEventListener('click', requestFromGesture, true);
        window.removeEventListener('touchstart', requestFromGesture, true);
        window.removeEventListener('keydown', requestFromGesture, true);

        Notification.requestPermission()
          .then((permission) => {
            if (permission === 'granted') {
              return upsertPushSubscription(isAuthenticated);
            }
            return null;
          })
          .catch((err) => {
            console.warn('Push permission prompt error:', err.message);
          });
      };

      window.addEventListener('click', requestFromGesture, true);
      window.addEventListener('touchstart', requestFromGesture, true);
      window.addEventListener('keydown', requestFromGesture, true);

      return () => {
        window.removeEventListener('click', requestFromGesture, true);
        window.removeEventListener('touchstart', requestFromGesture, true);
        window.removeEventListener('keydown', requestFromGesture, true);
      };
    }
  }, [isAuthenticated]);
}
