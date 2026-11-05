'use client';

import clsx from 'clsx';
import { BellRing, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSWRConfig } from 'swr';
import type { ActivityItem, LiveEvent, NotificationRow } from '@/lib/types';

interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info' | 'alert';
  title: string;
  body?: string;
  href?: string;
}

interface LiveCtx {
  connected: boolean;
  activity: ActivityItem[];
  toast: (t: Omit<Toast, 'id'>) => void;
  notificationPermission: NotificationPermission | 'unsupported';
  requestNotificationPermission: () => Promise<void>;
}

const Ctx = createContext<LiveCtx | null>(null);

export function useLive() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useLive must be used inside <LiveProvider>');
  return c;
}

export function useToast() {
  return useLive().toast;
}

/**
 * Holds the SSE connection for the whole app: keeps a rolling activity feed, revalidates SWR caches
 * when tasks/products change, and raises toasts + browser notifications for alerts.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const { mutate } = useSWRConfig();
  const [connected, setConnected] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const pending = useRef(new Set<string>());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastId = useRef(0);

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++toastId.current;
    setToasts((ts) => [...ts.slice(-4), { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.kind === 'alert' ? 9000 : 4500);
  }, []);

  // Batch cache revalidation so a burst of events triggers one refetch per resource.
  const invalidate = useCallback(
    (...prefixes: string[]) => {
      prefixes.forEach((p) => pending.current.add(p));
      if (flushTimer.current) return;
      flushTimer.current = setTimeout(() => {
        const keys = [...pending.current];
        pending.current.clear();
        flushTimer.current = null;
        void mutate((key) => typeof key === 'string' && keys.some((p) => key.startsWith(p)));
      }, 1200);
    },
    [mutate],
  );

  useEffect(() => {
    setPermission(typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported');
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) return;
    setPermission(await Notification.requestPermission());
  }, []);

  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false); // EventSource reconnects automatically (retry: 3000)

    const onActivity = (ev: MessageEvent) => {
      const e = JSON.parse(ev.data) as Extract<LiveEvent, { type: 'activity' }>;
      setActivity((a) => [e.event, ...a.filter((x) => x.id !== e.event.id)].slice(0, 60));
      invalidate('/api/dashboard', '/api/products', '/api/purchase', '/api/retailers');
    };
    const onTask = () => invalidate('/api/tasks', '/api/dashboard', '/api/purchase');
    const onLog = () => invalidate('/api/logs');
    const onNotification = (ev: MessageEvent) => {
      const { notification: n } = JSON.parse(ev.data) as { notification: NotificationRow };
      invalidate('/api/notifications');
      if (n.channel !== 'browser' || n.status !== 'sent') return;
      const url = typeof n.payload?.url === 'string' ? n.payload.url : undefined;
      toast({ kind: 'alert', title: n.title, body: n.body.split('\n').slice(1, 4).join(' · '), href: url });
      if ('Notification' in window && Notification.permission === 'granted') {
        const native = new Notification(n.title, { body: n.body.split('\n').slice(1, 4).join('\n'), tag: n.id });
        native.onclick = () => url && window.open(url, '_blank', 'noopener');
      }
    };
    es.addEventListener('activity', onActivity);
    es.addEventListener('task', onTask);
    es.addEventListener('log', onLog);
    es.addEventListener('notification', onNotification);
    es.addEventListener('heartbeat', () => setConnected(true));
    return () => es.close();
  }, [invalidate, toast]);

  return (
    <Ctx.Provider value={{ connected, activity, toast, notificationPermission: permission, requestNotificationPermission }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[380px] max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              'pointer-events-auto flex animate-slideIn gap-3 rounded-xl border bg-ink-850/95 p-3.5 shadow-2xl backdrop-blur',
              t.kind === 'alert' && 'border-emerald-500/40 shadow-emerald-500/10',
              t.kind === 'success' && 'border-ink-600',
              t.kind === 'error' && 'border-red-500/40',
              t.kind === 'info' && 'border-ink-600',
            )}
          >
            <div className="mt-0.5">
              {t.kind === 'alert' && <BellRing className="h-4 w-4 text-emerald-300" />}
              {t.kind === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-300" />}
              {t.kind === 'error' && <XCircle className="h-4 w-4 text-red-300" />}
              {t.kind === 'info' && <Info className="h-4 w-4 text-surge-300" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white">{t.title}</div>
              {t.body && <div className="mt-0.5 text-xs text-ink-300">{t.body}</div>}
              {t.href && (
                <a href={t.href} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-block text-xs font-medium text-volt-300 hover:text-volt-200">
                  Open product page →
                </a>
              )}
            </div>
            <button onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))} className="text-ink-400 hover:text-ink-100" aria-label="Dismiss">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
