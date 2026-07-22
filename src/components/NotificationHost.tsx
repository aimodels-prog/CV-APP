import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import {
  type AppNotification,
  type ConfirmationRequest,
  subscribeToConfirmations,
  subscribeToNotifications,
} from '../lib/notifications';

const toneStyles = {
  success: {
    icon: CheckCircle2,
    iconClass: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    accent: 'bg-emerald-500',
  },
  error: {
    icon: XCircle,
    iconClass: 'bg-red-50 text-red-600 ring-red-100',
    accent: 'bg-red-500',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'bg-amber-50 text-amber-600 ring-amber-100',
    accent: 'bg-amber-500',
  },
  info: {
    icon: Info,
    iconClass: 'bg-blue-50 text-blue-600 ring-blue-100',
    accent: 'bg-blue-500',
  },
};

export default function NotificationHost() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [confirmations, setConfirmations] = useState<ConfirmationRequest[]>([]);
  const activeConfirmation = confirmations[0] || null;

  useEffect(() => subscribeToNotifications((notification) => {
    setNotifications((current) => [...current, notification].slice(-5));
    window.setTimeout(() => {
      setNotifications((current) => current.filter((item) => item.id !== notification.id));
    }, notification.duration);
  }), []);

  useEffect(() => subscribeToConfirmations((request) => {
    setConfirmations((current) => [...current, request]);
  }), []);

  const dismiss = (id: string) =>
    setNotifications((current) => current.filter((item) => item.id !== id));

  const resolveConfirmation = (confirmed: boolean) => {
    if (!activeConfirmation) return;
    activeConfirmation.resolve(confirmed);
    setConfirmations((current) => current.slice(1));
  };

  return (
    <>
      <div className="pointer-events-none fixed right-4 top-4 z-[120] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-3 sm:right-6 sm:top-6">
        <AnimatePresence initial={false}>
          {notifications.map((notification) => {
            const style = toneStyles[notification.tone];
            const Icon = style.icon;
            return (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, x: 40, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, scale: 0.96 }}
                className="pointer-events-auto relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 pr-11 shadow-[0_18px_55px_-20px_rgba(15,23,42,0.45)]"
              >
                <div className={`absolute inset-y-0 left-0 w-1 ${style.accent}`} />
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${style.iconClass}`}>
                    <Icon size={20} />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-sm font-bold text-slate-900">{notification.title}</p>
                    <p className="mt-1 whitespace-pre-line break-words text-sm leading-5 text-slate-600">
                      {notification.message}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => dismiss(notification.id)}
                  className="absolute right-3 top-3 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Dismiss notification"
                >
                  <X size={16} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {activeConfirmation && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
              onClick={() => resolveConfirmation(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.96 }}
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/30 bg-white shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="via-confirm-title"
            >
              <div className="p-6 sm:p-7">
                <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl ${activeConfirmation.tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                  <AlertTriangle size={24} />
                </div>
                <h3 id="via-confirm-title" className="text-xl font-bold text-slate-900">
                  {activeConfirmation.title}
                </h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
                  {activeConfirmation.message}
                </p>
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
                <button
                  onClick={() => resolveConfirmation(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-100"
                >
                  {activeConfirmation.cancelLabel}
                </button>
                <button
                  onClick={() => resolveConfirmation(true)}
                  autoFocus
                  className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors ${activeConfirmation.tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                  {activeConfirmation.confirmLabel}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
