import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

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

function isIos() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

function isStandaloneDisplay() {
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
  return navigator.standalone === true;
}

function getPushSupportState() {
  if (typeof window === 'undefined') {
    return { supported: false, reason: 'Unsupported environment.' };
  }

  if (!window.isSecureContext) {
    return { supported: false, reason: 'Notifications require HTTPS.' };
  }

  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { supported: false, reason: 'This browser does not support web push notifications.' };
  }

  if (isIos() && !isStandaloneDisplay()) {
    return {
      supported: false,
      reason: 'On iPhone, install this app to Home Screen first to enable notifications.',
    };
  }

  return { supported: true, reason: '' };
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
  const support = useMemo(getPushSupportState, []);
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [message, setMessage] = useState('');

  const syncSubscription = useCallback(async () => {
    const result = await upsertPushSubscription(isAuthenticated);
    setIsSubscribed(result.subscribed);

    if (result.reason === 'login_required') {
      setMessage('Notification permission is granted. Log in to finish enabling alerts.');
    } else if (result.reason === 'permission_not_granted') {
      setMessage('Tap Enable Notifications below to get alerts.');
    } else if (result.subscribed) {
      setMessage('Notifications are enabled for this device.');
    }

    return result;
  }, [isAuthenticated]);

  const requestPermissionAndSubscribe = useCallback(async () => {
    if (!support.supported) {
      setMessage(support.reason);
      return { subscribed: false, reason: 'unsupported' };
    }

    if (permission === 'denied') {
      setMessage('Notifications are blocked for this site. Enable them from browser site settings.');
      return { subscribed: false, reason: 'denied' };
    }

    const nextPermission =
      permission === 'granted' ? 'granted' : await Notification.requestPermission();
    setPermission(nextPermission);

    if (nextPermission !== 'granted') {
      setMessage('Notification permission was not granted.');
      return { subscribed: false, reason: 'permission_not_granted' };
    }

    return syncSubscription();
  }, [permission, support, syncSubscription]);

  useEffect(() => {
    if (!support.supported) {
      setMessage(support.reason);
      return;
    }

    const currentPermission = Notification.permission;
    setPermission(currentPermission);

    if (currentPermission === 'granted') {
      syncSubscription().catch((err) => {
        console.warn('Push subscription sync error:', err.message);
      });
    } else if (currentPermission === 'denied') {
      setMessage('Notifications are blocked for this site. Enable them from browser site settings.');
    } else {
      setMessage('Tap Enable Notifications below to receive hourly alerts.');
      setIsSubscribed(false);
    }
  }, [isAuthenticated, support, syncSubscription]);

  return {
    supported: support.supported,
    supportReason: support.reason,
    permission,
    isSubscribed,
    message,
    requestPermissionAndSubscribe,
  };
}
