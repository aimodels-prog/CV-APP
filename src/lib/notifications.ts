export type NotificationTone = 'success' | 'error' | 'warning' | 'info';

export interface AppNotification {
  id: string;
  message: string;
  title: string;
  tone: NotificationTone;
  duration: number;
}

export interface ConfirmationOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

export interface ConfirmationRequest extends ConfirmationOptions {
  id: string;
  message: string;
  resolve: (confirmed: boolean) => void;
}

type NotificationListener = (notification: AppNotification) => void;
type ConfirmationListener = (request: ConfirmationRequest) => void;

const notificationListeners = new Set<NotificationListener>();
const confirmationListeners = new Set<ConfirmationListener>();
const pendingNotifications: AppNotification[] = [];
const pendingConfirmations: ConfirmationRequest[] = [];

const uniqueId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const inferTone = (message: string): NotificationTone => {
  if (/fail|error|unable|invalid|refused/i.test(message)) return 'error';
  if (/success|completed|saved|downloaded|updated/i.test(message)) return 'success';
  if (/select|missing|cannot|no data|no match|skipped|required/i.test(message)) return 'warning';
  return 'info';
};

const toneTitle = (tone: NotificationTone) => ({
  success: 'Success',
  error: 'Something went wrong',
  warning: 'Attention required',
  info: 'VIA CV Tool',
})[tone];

export function notify(
  message: unknown,
  options: { title?: string; tone?: NotificationTone; duration?: number } = {},
) {
  const text = String(message ?? '').trim() || 'The operation has completed.';
  const tone = options.tone || inferTone(text);
  const notification: AppNotification = {
    id: uniqueId('notice'),
    message: text,
    title: options.title || toneTitle(tone),
    tone,
    duration: options.duration ?? (tone === 'error' ? 7000 : 4500),
  };

  if (notificationListeners.size === 0) pendingNotifications.push(notification);
  else notificationListeners.forEach((listener) => listener(notification));
}

export function subscribeToNotifications(listener: NotificationListener) {
  notificationListeners.add(listener);
  pendingNotifications.splice(0).forEach(listener);
  return () => notificationListeners.delete(listener);
}

export function appConfirm(
  message: string,
  options: ConfirmationOptions = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    const request: ConfirmationRequest = {
      id: uniqueId('confirm'),
      message,
      title: options.title || 'Please confirm',
      confirmLabel: options.confirmLabel || 'Continue',
      cancelLabel: options.cancelLabel || 'Cancel',
      tone: options.tone || 'default',
      resolve,
    };
    if (confirmationListeners.size === 0) pendingConfirmations.push(request);
    else confirmationListeners.forEach((listener) => listener(request));
  });
}

export function subscribeToConfirmations(listener: ConfirmationListener) {
  confirmationListeners.add(listener);
  pendingConfirmations.splice(0).forEach(listener);
  return () => confirmationListeners.delete(listener);
}

export function installBrowserNotificationBridge() {
  if (typeof window === 'undefined') return;
  const bridgedWindow = window as typeof window & { __viaNotificationBridge?: boolean };
  if (bridgedWindow.__viaNotificationBridge) return;
  bridgedWindow.__viaNotificationBridge = true;
  window.alert = (message?: unknown) => notify(message);
}

